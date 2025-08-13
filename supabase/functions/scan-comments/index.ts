import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  console.log('Edge function called with method:', req.method);
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Parsing request body...');
    const requestBody = await req.json();
    console.log('Request body parsed:', { 
      commentsCount: requestBody.comments?.length, 
      defaultMode: requestBody.defaultMode,
      batchStart: requestBody.batchStart,
      batchSize: requestBody.batchSize
    });
    
    const { 
      comments, 
      defaultMode = 'redact',
      batchStart = 0,
      batchSize = 5
    } = requestBody;
    
    if (!comments || !Array.isArray(comments)) {
      throw new Error('Invalid comments data');
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch all scanner configurations
    const { data: configs, error: configError } = await supabase
      .from('ai_configurations')
      .select('*');

    if (configError) {
      console.error('Failed to fetch AI configurations:', configError);
      throw new Error('Failed to load AI configurations');
    }

    if (!configs || configs.length === 0) {
      throw new Error('No AI configurations found');
    }

    const scanA = configs.find(c => c.scanner_type === 'scan_a');
    const scanB = configs.find(c => c.scanner_type === 'scan_b');
    const adjudicator = configs.find(c => c.scanner_type === 'adjudicator');

    if (!scanA || !scanB || !adjudicator) {
      throw new Error('Missing required scanner configurations');
    }

    // Validate API keys based on providers
    const providers = [scanA.provider, scanB.provider, adjudicator.provider];
    for (const provider of providers) {
      if (provider === 'openai' && !Deno.env.get('OPENAI_API_KEY')) {
        throw new Error('OpenAI API key is required');
      }
      if (provider === 'azure') {
        if (!Deno.env.get('AZURE_OPENAI_API_KEY') || !Deno.env.get('AZURE_OPENAI_ENDPOINT')) {
          throw new Error('Azure OpenAI API key and endpoint are required');
        }
      }
      if (provider === 'bedrock') {
        if (!Deno.env.get('AWS_ACCESS_KEY_ID') || !Deno.env.get('AWS_SECRET_ACCESS_KEY') || !Deno.env.get('AWS_REGION')) {
          throw new Error('AWS credentials are required for Bedrock');
        }
      }
    }

    // Process only the specified batch
    const batch = comments.slice(batchStart, batchStart + batchSize);
    const scannedComments = [];
    let summary = { total: batch.length, concerning: 0, identifiable: 0, needsAdjudication: 0 };

    console.log(`Processing batch: comments ${batchStart + 1}-${Math.min(batchStart + batchSize, comments.length)} of ${comments.length}`);

    if (batch.length === 0) {
      throw new Error('No comments in specified batch range');
    }

    // Rate limiting setup
    const rateLimiters = new Map<string, any>();

    // Per-scanner limiters (as configured in admin dashboard)
    configs.forEach(config => {
      // Apply conservative defaults only when no limits are configured
      let defaultRpm = 10;
      let defaultTpm = 50000;
      
      if (config.provider === 'bedrock' && !config.rpm_limit && !config.tpm_limit) {
        // Only apply Bedrock defaults when user hasn't configured limits
        if (config.model.includes('haiku')) {
          defaultRpm = 3; // Conservative default for Haiku
          defaultTpm = 10000;
        } else if (config.model.includes('claude')) {
          defaultRpm = 5; // Conservative default for other Claude models
          defaultTpm = 20000;
        } else {
          defaultRpm = 6; // Conservative default for other Bedrock models
          defaultTpm = 30000;
        }
        console.log(`Using conservative defaults for ${config.provider}:${config.model} - RPM: ${defaultRpm}, TPM: ${defaultTpm}`);
      }
      
      const finalRpm = config.rpm_limit || defaultRpm;
      const finalTpm = config.tpm_limit || defaultTpm;
      
      // Warn if user has set potentially aggressive limits for Bedrock
      if (config.provider === 'bedrock' && config.rpm_limit && config.rpm_limit > 10) {
        console.warn(`High RPM limit (${config.rpm_limit}) set for Bedrock model ${config.model}. You may encounter rate limiting.`);
      }
      
      rateLimiters.set(config.scanner_type, {
        rpmLimit: finalRpm,
        tpmLimit: finalTpm,
        requestsThisMinute: 0,
        tokensThisMinute: 0,
        lastMinuteReset: Date.now(),
        queuePromise: Promise.resolve(),
      });
    });

    // Global sequential queue for very low RPM models (1-2 RPM) to prevent concurrent calls
    const sequentialQueue = new Map<string, { 
      queue: Array<() => Promise<any>>, 
      processing: boolean,
      lastCall: number 
    }>();

    // Provider+Model level limiter to coordinate shared capacity across scanners using the same model
    const providerModelAggregates = new Map<string, { rpm: number[]; tpm: number[] }>();
    configs.forEach(c => {
      const key = `${c.provider}:${c.model}`;
      if (!providerModelAggregates.has(key)) {
        providerModelAggregates.set(key, { rpm: [], tpm: [] });
      }
      providerModelAggregates.get(key)!.rpm.push(c.rpm_limit || 10);
      providerModelAggregates.get(key)!.tpm.push(c.tpm_limit || 50000);
    });
    providerModelAggregates.forEach((agg, key) => {
      // Use the most conservative limits across scanners sharing the same provider+model
      // This respects user-configured limits from the dashboard
      const minRpm = Math.min(...agg.rpm);
      const minTpm = Math.min(...agg.tpm);
      
      rateLimiters.set(`provider:${key}`, {
        rpmLimit: minRpm,
        tpmLimit: minTpm,
        requestsThisMinute: 0,
        tokensThisMinute: 0,
        lastMinuteReset: Date.now(),
        queuePromise: Promise.resolve(),
      });
      
      console.log(`Provider limiter for ${key}: RPM=${minRpm}, TPM=${minTpm}`);
    });
    try {
      // Prepare batch input for AI models
      const batchTexts = batch.map(comment => comment.text);
      const batchInput = `Comments to analyze:\n${batchTexts.map((text, idx) => `${idx + 1}. ${text}`).join('\n')}`;

      console.log(`Sending ${batch.length} comments to AI models for batch analysis`);

        // Run Scan A and Scan B in parallel on the entire batch
      let scanAResults, scanBResults, scanARawResponse, scanBRawResponse;
      try {
        const [scanAResponse, scanBResponse] = await Promise.all([
          callAI(scanA.provider, scanA.model, scanA.analysis_prompt, batchInput, 'batch_analysis', 'scan_a', rateLimiters, sequentialQueue).catch(e => {
            console.error(`Scan A (${scanA.provider}/${scanA.model}) failed for batch:`, e);
            throw new Error(`Scan A (${scanA.provider}/${scanA.model}) failed: ${e.message}`);
          }),
          callAI(scanB.provider, scanB.model, scanB.analysis_prompt, batchInput, 'batch_analysis', 'scan_b', rateLimiters, sequentialQueue).catch(e => {
            console.error(`Scan B (${scanB.provider}/${scanB.model}) failed for batch:`, e);
            throw new Error(`Scan B (${scanB.provider}/${scanB.model}) failed: ${e.message}`);
          })
        ]);
          
          // Extract results and raw responses for debugging
          scanAResults = scanAResponse?.results || scanAResponse;
          scanBResults = scanBResponse?.results || scanBResponse;
          scanARawResponse = scanAResponse?.rawResponse;
          scanBRawResponse = scanBResponse?.rawResponse;
          
          // If either scan returned a single object instead of array, convert it
          if (scanAResults && !Array.isArray(scanAResults) && typeof scanAResults === 'object') {
            console.log(`Scan A (${scanA.provider}/${scanA.model}) returned single object, converting to array for batch of ${batch.length}`);
            scanAResults = Array(batch.length).fill(scanAResults);
          }
          if (scanBResults && !Array.isArray(scanBResults) && typeof scanBResults === 'object') {
            console.log(`Scan B (${scanB.provider}/${scanB.model}) returned single object, converting to array for batch of ${batch.length}`);
            scanBResults = Array(batch.length).fill(scanBResults);
          }
      } catch (error) {
        console.error(`Parallel batch scanning failed:`, error);
        throw error;
      }

        console.log(`Received Scan A (${scanA.provider}/${scanA.model}) results:`, typeof scanAResults, Array.isArray(scanAResults) ? scanAResults.length : 'not array');
        console.log(`Received Scan B (${scanB.provider}/${scanB.model}) results:`, typeof scanBResults, Array.isArray(scanBResults) ? scanBResults.length : 'not array');

        // Ensure we have results for all comments in the batch
      const scanAValid = Array.isArray(scanAResults) && scanAResults.length === batch.length;
      const scanBValid = Array.isArray(scanBResults) && scanBResults.length === batch.length;
      
      if (!scanAValid || !scanBValid) {
        console.warn(`Invalid batch results - Scan A (${scanA.provider}/${scanA.model}): ${scanAValid ? 'valid' : `invalid (${Array.isArray(scanAResults) ? `got ${scanAResults.length} results for ${batch.length} comments` : 'not array'})`}, Scan B (${scanB.provider}/${scanB.model}): ${scanBValid ? 'valid' : `invalid (${Array.isArray(scanBResults) ? `got ${scanBResults.length} results for ${batch.length} comments` : 'not array'})`} - falling back to individual processing`);
        
        // Fallback to individual processing - process sequentially to maintain order
        for (let j = 0; j < batch.length; j++) {
          const comment = batch[j];
          console.log(`Processing comment ${comment.id} individually (index ${j}) with Scan A (${scanA.provider}/${scanA.model}) and Scan B (${scanB.provider}/${scanB.model})...`);

          try {
            // Process one at a time to maintain strict order and avoid sync issues
            const scanAResponse = await callAI(scanA.provider, scanA.model, scanA.analysis_prompt.replace('list of comments', 'comment').replace('parallel list of JSON objects', 'single JSON object'), comment.text, 'analysis', 'scan_a', rateLimiters, sequentialQueue);
            const scanBResponse = await callAI(scanB.provider, scanB.model, scanB.analysis_prompt.replace('list of comments', 'comment').replace('parallel list of JSON objects', 'single JSON object'), comment.text, 'analysis', 'scan_b', rateLimiters, sequentialQueue);

            // Deep clone the results to avoid mutation issues
            const scanAResult = JSON.parse(JSON.stringify(scanAResponse?.results || scanAResponse));
            const scanBResult = JSON.parse(JSON.stringify(scanBResponse?.results || scanBResponse));
            
            console.log(`Individual processing for comment ${comment.id} (index ${j}) - Scan A result:`, scanAResult);
            console.log(`Individual processing for comment ${comment.id} (index ${j}) - Scan B result:`, scanBResult);
            
            await processIndividualComment(comment, scanAResult, scanBResult, scanA, adjudicator, defaultMode, summary, scannedComments, rateLimiters, sequentialQueue, scanAResponse?.rawResponse, scanBResponse?.rawResponse);
          } catch (error) {
            console.error(`Individual processing failed for comment ${comment.id} (index ${j}) with Scan A (${scanA.provider}/${scanA.model}) and Scan B (${scanB.provider}/${scanB.model}):`, error);
            scannedComments.push({
              ...comment,
              text: comment.originalText || comment.text,
              concerning: false,
              identifiable: false,
              aiReasoning: `Error processing: ${error.message}`,
              mode: 'original',
              approved: false,
              hideAiResponse: false,
              debugInfo: { 
                error: error.message,
                batchIndex: j,
                processingMode: 'individual_fallback'
              }
            });
          }
        }
      } else {

        // Process each comment in the batch
        for (let j = 0; j < batch.length; j++) {
          const comment = batch[j];
          const scanAResult = scanAResults[j];
          const scanBResult = scanBResults[j];

          // Heuristic safety net - only use when AI completely fails
          const heur = heuristicAnalyze(comment.text);
          const patchResult = (r: any) => {
            // If no result at all, use heuristic
            if (!r) return { concerning: heur.concerning, identifiable: heur.identifiable, reasoning: 'Heuristic fallback: ' + heur.reasoning };
            
            // If boolean values are missing, use false (conservative approach)
            if (typeof r.concerning !== 'boolean') r.concerning = false;
            if (typeof r.identifiable !== 'boolean') r.identifiable = false;
            
            // Only override with heuristic if AI result is completely invalid and heuristic detects clear violations
            if (r.concerning === false && r.identifiable === false && (!r.reasoning || r.reasoning.trim() === '')) {
              // Only apply heuristic if it finds clear violations AND AI gave no reasoning
              if (heur.concerning || heur.identifiable) {
                r.concerning = heur.concerning;
                r.identifiable = heur.identifiable;
                r.reasoning = 'AI provided no analysis, heuristic fallback: ' + heur.reasoning;
              } else {
                r.reasoning = r.reasoning || 'No concerning content or identifiable information detected.';
              }
            }
            return r;
          };
          patchResult(scanAResult);
          patchResult(scanBResult);

          let finalResult = null;
          let adjudicationResult = null;
          let needsAdjudication = false;

          // Check if Scan A and Scan B results differ
          if (scanAResult.concerning !== scanBResult.concerning || 
              scanAResult.identifiable !== scanBResult.identifiable) {
            needsAdjudication = true;

            // For adjudication, we need to process individually since it requires conflict analysis
            const adjudicatorPrompt = `${adjudicator.analysis_prompt.replace('these comments', 'this comment').replace('parallel list', 'single JSON object')}

Original comment: "${comment.text}"

Scan A Result: ${JSON.stringify(scanAResult)}
Scan B Result: ${JSON.stringify(scanBResult)}`;

            try {
              const adjudicationResponse = await callAI(
                adjudicator.provider, 
                adjudicator.model, 
                adjudicatorPrompt, 
                '', 
                'analysis',
                'adjudicator',
                rateLimiters,
                sequentialQueue
              );
              adjudicationResult = adjudicationResponse?.results || adjudicationResponse;
            } catch (error) {
              console.error(`Adjudicator failed for comment ${comment.id}:`, error);
              throw new Error(`Adjudicator (${adjudicator.provider}/${adjudicator.model}) failed: ${error.message}`);
            }

            finalResult = adjudicationResult;
          } else {
            // Scan A and Scan B agree, use Scan A result
            finalResult = scanAResult;
          }

          // Track flagged comments for batch redaction/rephrasing
          if (finalResult.concerning || finalResult.identifiable) {
            summary.concerning += finalResult.concerning ? 1 : 0;
            summary.identifiable += finalResult.identifiable ? 1 : 0;
          }
          if (needsAdjudication) summary.needsAdjudication++;

          // Store intermediate results
          const finalMode = (finalResult.concerning || finalResult.identifiable) ? defaultMode : 'original';
          const processedComment = {
            ...comment,
            text: finalMode === 'original' ? (comment.originalText || comment.text) : comment.text,
            concerning: finalResult.concerning,
            identifiable: finalResult.identifiable,
            aiReasoning: finalResult.reasoning,
            redactedText: null,
            rephrasedText: null,
            mode: finalMode,
            approved: false,
            hideAiResponse: false,
            debugInfo: {
              scanAResult: { ...scanAResult, model: `${scanA.provider}/${scanA.model}` },
              scanBResult: { ...scanBResult, model: `${scanB.provider}/${scanB.model}` },
              adjudicationResult: adjudicationResult ? { ...adjudicationResult, model: `${adjudicator.provider}/${adjudicator.model}` } : null,
              needsAdjudication,
              finalDecision: finalResult,
              rawResponses: {
                scanAResponse: scanARawResponse,
                scanBResponse: scanBRawResponse,
                adjudicationResponse: adjudicationResult?.rawResponse
              }
            }
          };

          scannedComments.push(processedComment);
        }

        // Batch process redaction and rephrasing for flagged comments
        const flaggedComments = scannedComments.filter(c => c.concerning || c.identifiable);
        if (flaggedComments.length > 0) {
          const flaggedTexts = flaggedComments.map(c => c.originalText || c.text);
          const activeConfig = scanA; // Use scan_a config for batch operations

          try {
            // For Bedrock Mistral, prefer per-item processing for higher reliability
            if (activeConfig.provider === 'bedrock' && activeConfig.model.startsWith('mistral.')) {
              for (let k = 0; k < scannedComments.length; k++) {
                if (scannedComments[k].concerning || scannedComments[k].identifiable) {
                  try {
                    const [red, reph] = await Promise.all([
                      callAI(activeConfig.provider, activeConfig.model, activeConfig.redact_prompt.replace('these comments', 'this comment').replace('parallel list', 'single'), scannedComments[k].originalText || scannedComments[k].text, 'text', 'scan_a', rateLimiters),
                      callAI(activeConfig.provider, activeConfig.model, activeConfig.rephrase_prompt.replace('these comments', 'this comment').replace('parallel list', 'single'), scannedComments[k].originalText || scannedComments[k].text, 'text', 'scan_a', rateLimiters)
                    ]);
                    scannedComments[k].redactedText = red;
                    scannedComments[k].rephrasedText = reph;

                    if (scannedComments[k].mode === 'redact' && red) {
                      scannedComments[k].text = red;
                    } else if (scannedComments[k].mode === 'rephrase' && reph) {
                      scannedComments[k].text = reph;
                    }
                  } catch (perItemErr) {
                    console.warn(`Per-item redaction/rephrasing failed for comment index ${k}:`, perItemErr);
                  }
                }
              }
            } else {
              const [redactedTexts, rephrasedTexts] = await Promise.all([
                callAI(activeConfig.provider, activeConfig.model, activeConfig.redact_prompt, JSON.stringify(flaggedTexts), 'batch_text', 'scan_a', rateLimiters),
                callAI(activeConfig.provider, activeConfig.model, activeConfig.rephrase_prompt, JSON.stringify(flaggedTexts), 'batch_text', 'scan_a', rateLimiters)
              ]);

              // Apply redacted and rephrased texts
              let flaggedIndex = 0;
              for (let k = 0; k < scannedComments.length; k++) {
                if (scannedComments[k].concerning || scannedComments[k].identifiable) {
                  scannedComments[k].redactedText = redactedTexts[flaggedIndex];
                  scannedComments[k].rephrasedText = rephrasedTexts[flaggedIndex];
                  
                  // Set final text based on mode
                  if (scannedComments[k].mode === 'redact' && redactedTexts[flaggedIndex]) {
                    scannedComments[k].text = redactedTexts[flaggedIndex];
                  } else if (scannedComments[k].mode === 'rephrase' && rephrasedTexts[flaggedIndex]) {
                    scannedComments[k].text = rephrasedTexts[flaggedIndex];
                  }
                  
                  flaggedIndex++;
                }
              }
            }
          } catch (error) {
            console.warn(`Batch redaction/rephrasing failed:`, error);
            // Continue without redaction/rephrasing
          }
        }
      }

    } catch (error) {
      console.error(`Error processing batch:`, error);
      // Include the original comments with error info
      for (const comment of batch) {
        scannedComments.push({
          ...comment,
          text: comment.originalText || comment.text,
          concerning: false,
          identifiable: false,
          aiReasoning: `Error processing: ${error.message}`,
          mode: 'original',
          approved: false,
          hideAiResponse: false,
          debugInfo: {
            error: error.message
          }
        });
      }
    }

    console.log(`Successfully scanned ${scannedComments.length} comments in batch`);
    
    const response = { 
      comments: scannedComments,
      batchStart,
      batchSize: scannedComments.length,
      hasMore: batchStart + scannedComments.length < comments.length,
      totalComments: comments.length,
      summary: {
        total: scannedComments.length,
        concerning: scannedComments.filter(c => c.concerning).length,
        identifiable: scannedComments.filter(c => c.identifiable).length
      }
    };
    
    console.log('Returning response with comments count:', response.comments.length);
    console.log('Response summary:', response.summary);

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in scan-comments function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Helper function to process individual comments
async function processIndividualComment(comment, scanAResult, scanBResult, scanA, adjudicator, defaultMode, summary, scannedComments, rateLimiters, sequentialQueue, scanARawResponse?, scanBRawResponse?) {
  let finalResult = null;
  let adjudicationResult = null;
  let needsAdjudication = false;

  // Heuristic safety net - only use when AI completely fails
  const heur = heuristicAnalyze(comment.text);
  const patchResult = (r: any) => {
    // If no result at all, use heuristic
    if (!r) return { concerning: heur.concerning, identifiable: heur.identifiable, reasoning: 'Heuristic fallback: ' + heur.reasoning };
    
    // If boolean values are missing, use false (conservative approach)
    if (typeof r.concerning !== 'boolean') r.concerning = false;
    if (typeof r.identifiable !== 'boolean') r.identifiable = false;
    
    // Only override with heuristic if AI result is completely invalid and heuristic detects clear violations
    if (r.concerning === false && r.identifiable === false && (!r.reasoning || r.reasoning.trim() === '')) {
      // Only apply heuristic if it finds clear violations AND AI gave no reasoning
      if (heur.concerning || heur.identifiable) {
        r.concerning = heur.concerning;
        r.identifiable = heur.identifiable;
        r.reasoning = 'AI provided no analysis, heuristic fallback: ' + heur.reasoning;
      } else {
        r.reasoning = r.reasoning || 'No concerning content or identifiable information detected.';
      }
    }
    return r;
  };
  scanAResult = patchResult(scanAResult);
  scanBResult = patchResult(scanBResult);

  // Check if Scan A and Scan B results differ
  if (scanAResult.concerning !== scanBResult.concerning || 
      scanAResult.identifiable !== scanBResult.identifiable) {
    needsAdjudication = true;

    // Call adjudicator
    // First check if adjudication is actually needed - if both agree, use their result
    const bothAgreeConcerning = scanAResult.concerning === scanBResult.concerning;
    const bothAgreeIdentifiable = scanAResult.identifiable === scanBResult.identifiable;
    
    if (bothAgreeConcerning && bothAgreeIdentifiable) {
      console.log(`Both scans agree for comment ${comment.id} - skipping adjudication`);
      adjudicationResult = {
        concerning: scanAResult.concerning,
        identifiable: scanAResult.identifiable,
        reasoning: "Both scans agreed on all fields"
      };
    } else {
      // Handle partial agreements - preserve agreed values, only adjudicate disagreements
      console.log(`Partial agreement for comment ${comment.id}: concerning=${bothAgreeConcerning}, identifiable=${bothAgreeIdentifiable}`);
      
      // Build result with preserved agreements
      const preservedResult = {
        concerning: bothAgreeConcerning ? scanAResult.concerning : null,
        identifiable: bothAgreeIdentifiable ? scanAResult.identifiable : null,
        reasoning: []
      };
      
      if (bothAgreeConcerning) {
        preservedResult.reasoning.push(`Preserved agreed concerning=${scanAResult.concerning}`);
      }
      
      if (bothAgreeIdentifiable) {
        preservedResult.reasoning.push(`Preserved agreed identifiable=${scanAResult.identifiable}`);
      }
      
      // Call adjudicator but force preservation of agreements in the result
      const adjudicatorPrompt = `CRITICAL: Preserve agreements, only decide disagreements.

Comment: "${comment.text}"

Scan A: concerning=${scanAResult.concerning}, identifiable=${scanAResult.identifiable}
Scan B: concerning=${scanBResult.concerning}, identifiable=${scanBResult.identifiable}

${bothAgreeConcerning ? `BOTH AGREED: concerning MUST be ${scanAResult.concerning}` : `DISAGREEMENT: concerning needs adjudication`}
${bothAgreeIdentifiable ? `BOTH AGREED: identifiable MUST be ${scanAResult.identifiable}` : `DISAGREEMENT: identifiable needs adjudication`}

JSON with EXACT values for agreements:
{
  "concerning": ${bothAgreeConcerning ? scanAResult.concerning : 'true_or_false'},
  "identifiable": ${bothAgreeIdentifiable ? scanAResult.identifiable : 'true_or_false'},
  "reasoning": "explanation"
}`;

      console.log(`Adjudicator needed for comment ${comment.id}:`, {
        commentText: comment.text.substring(0, 100) + '...',
        scanAResult,
        scanBResult,
        agreements: { concerning: bothAgreeConcerning, identifiable: bothAgreeIdentifiable }
      });

      try {
        const adjudicationResponse = await callAI(
          adjudicator.provider, 
          adjudicator.model, 
          adjudicatorPrompt, 
          '', 
          'analysis',
          'adjudicator',
          rateLimiters,
          sequentialQueue
        );
        let rawResult = adjudicationResponse?.results || adjudicationResponse;
        console.log(`Raw adjudicator response for comment ${comment.id}:`, rawResult);
        
        // Force preservation of agreements regardless of adjudicator response
        adjudicationResult = {
          concerning: bothAgreeConcerning ? scanAResult.concerning : rawResult.concerning,
          identifiable: bothAgreeIdentifiable ? scanAResult.identifiable : rawResult.identifiable,
          reasoning: rawResult.reasoning || 'Adjudication with preserved agreements'
        };
        
        console.log(`Final adjudicator result for comment ${comment.id}:`, adjudicationResult);
      } catch (error) {
        console.error(`Adjudicator failed for comment ${comment.id}:`, error);
        throw new Error(`Adjudicator (${adjudicator.provider}/${adjudicator.model}) failed: ${error.message}`);
      }
    }

    finalResult = adjudicationResult;
  } else {
    // Scan A and Scan B agree, use Scan A result
    finalResult = scanAResult;
  }

  // Update summary
  if (finalResult.concerning) summary.concerning++;
  if (finalResult.identifiable) summary.identifiable++;
  if (needsAdjudication) summary.needsAdjudication++;

  let redactedText = null;
  let rephrasedText = null;

  // If flagged, run redaction and rephrase prompts
  if (finalResult.concerning || finalResult.identifiable) {
    const activeConfig = needsAdjudication ? adjudicator : scanA;
    
    try {
      [redactedText, rephrasedText] = await Promise.all([
        callAI(activeConfig.provider, activeConfig.model, activeConfig.redact_prompt.replace('these comments', 'this comment').replace('parallel list', 'single'), comment.text, 'text', needsAdjudication ? 'adjudicator' : 'scan_a', rateLimiters),
        callAI(activeConfig.provider, activeConfig.model, activeConfig.rephrase_prompt.replace('these comments', 'this comment').replace('parallel list', 'single'), comment.text, 'text', needsAdjudication ? 'adjudicator' : 'scan_a', rateLimiters)
      ]);
    } catch (error) {
      console.warn(`Redaction/rephrasing failed for comment ${comment.id}:`, error);
      // Continue without redaction/rephrasing
    }
  }

  const processedComment = {
    ...comment,
    concerning: finalResult.concerning,
    identifiable: finalResult.identifiable,
    aiReasoning: finalResult.reasoning,
    redactedText,
    rephrasedText,
    mode: finalResult.concerning || finalResult.identifiable ? defaultMode : 'original',
    approved: false,
    hideAiResponse: false,
    debugInfo: {
      scanAResult: { ...scanAResult, model: `${scanA.provider}/${scanA.model}` },
      scanBResult: { ...scanBResult, model: `${scanA.provider}/${scanA.model}` },
      adjudicationResult: adjudicationResult ? { ...adjudicationResult, model: `${adjudicator.provider}/${adjudicator.model}` } : null,
      needsAdjudication,
      finalDecision: finalResult,
      rawResponses: {
        scanAResponse: scanARawResponse,
        scanBResponse: scanBRawResponse,
        adjudicationResponse: adjudicationResult?.rawResponse
      }
    }
  };

  // Set final text based on mode
  if (processedComment.mode === 'redact' && redactedText) {
    processedComment.text = redactedText;
  } else if (processedComment.mode === 'rephrase' && rephrasedText) {
    processedComment.text = rephrasedText;
  }

  scannedComments.push(processedComment);
}

// Rate limiting helper function with per-key serialized queue
async function enforceRateLimit(key: string, estimatedTokens: number, rateLimiters: Map<string, any>) {
  const limiter = rateLimiters.get(key);
  if (!limiter) return;

  // Chain onto a per-limiter promise to serialize checks/updates
  limiter.queuePromise = (limiter.queuePromise || Promise.resolve()).then(async () => {
    const now = Date.now();

    // Reset counters if a minute has passed
    if (now - limiter.lastMinuteReset >= 60000) {
      limiter.requestsThisMinute = 0;
      limiter.tokensThisMinute = 0;
      limiter.lastMinuteReset = now;
    }

    // If limits would be exceeded, wait until the next window + small buffer
    const wouldExceedRpm = limiter.requestsThisMinute >= limiter.rpmLimit;
    const wouldExceedTpm = limiter.tokensThisMinute + estimatedTokens > limiter.tpmLimit;
    if (wouldExceedRpm || wouldExceedTpm) {
      const timeToWait = Math.max(0, 60000 - (now - limiter.lastMinuteReset));
      console.log(`Rate limit reached for ${key}. Waiting ${Math.ceil(timeToWait / 1000)}s...`);
      await new Promise(resolve => setTimeout(resolve, timeToWait + 1000)); // +1s buffer
      // Reset after waiting
      limiter.requestsThisMinute = 0;
      limiter.tokensThisMinute = 0;
      limiter.lastMinuteReset = Date.now();
    }

    // Update counters for this request
    limiter.requestsThisMinute++;
    limiter.tokensThisMinute += estimatedTokens;
  });

  // Wait until our turn in the queue is processed
  await limiter.queuePromise;
}

// Helper function to estimate tokens (rough approximation: 1 token ≈ 4 characters)
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// Heuristic analyzer used when the model response is unusable
function heuristicAnalyze(text: string): { concerning: boolean; identifiable: boolean; reasoning: string } {
  const t = text.replace(/[\r\n\t]/g, ' ').trim();

  // Concerning content indicators
  const concerningIndicators = [
    /harass|inappropriate|threat|violence|unsafe|violation|illegal|discriminat|bully|steal|theft|drug/i,
  ];

  // PII indicators
  const piiPatterns = [
    /\b\d{3}-\d{2}-\d{4}\b/i, // SSN
    /(?:\+?\d{1,2}\s*)?(?:\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})/i, // Phone
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i, // Email
    /(employee\s*id|badge\s*#?\s*\d+)/i, // Employee ID / Badge
  ];

  let concerning = concerningIndicators.some(rx => rx.test(t));
  let identifiable = piiPatterns.some(rx => rx.test(t));

  // Simple two-capitalized-words name heuristic (only if context suggests workplace)
  if (!identifiable) {
    const hasFullName = /\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/.test(t);
    const hasContext = /(HR|manager|supervisor|accounting|customer service|warehouse)/i.test(t);
    if (hasFullName && hasContext) identifiable = true;
  }

  const reasons: string[] = [];
  if (concerning) reasons.push('Concerning content indicators present');
  if (identifiable) reasons.push('Personally identifiable information indicators present');

  return {
    concerning,
    identifiable,
    reasoning: reasons.length ? reasons.join('; ') : 'No concerning content or PII detected by heuristic fallback.'
  };
}

// Helper function to call AI services with rate limiting
async function callAI(provider: string, model: string, prompt: string, commentText: string, responseType: 'analysis' | 'text' | 'batch_analysis' | 'batch_text', scannerType?: string, rateLimiters?: Map<string, any>, sequentialQueue?: Map<string, any>) {
  // Estimate tokens for this request
  const estimatedTokens = estimateTokens(prompt + commentText);
  
  // Check if this is a very low RPM model that needs sequential processing
  const modelKey = `${provider}:${model}`;
  const isLowRpmModel = (provider === 'bedrock' && (model.includes('sonnet') || model.includes('opus'))) || 
                       (rateLimiters?.has(`provider:${modelKey}`) && rateLimiters.get(`provider:${modelKey}`).rpmLimit <= 2);
  
  if (isLowRpmModel && sequentialQueue) {
    // Use sequential queue for very low RPM models - this prevents ALL concurrent calls
    console.log(`Forcing sequential processing for ${modelKey} due to 1 RPM limit`);
    return await processSequentially(modelKey, async () => {
      return await performAICall(provider, model, prompt, commentText, responseType, scannerType, rateLimiters, estimatedTokens);
    }, sequentialQueue);
  }
  
  // Enforce both provider+model and per-scanner limits if available
  if (rateLimiters) {
    const providerKey = `provider:${provider}:${model}`;
    if (rateLimiters.has(providerKey)) {
      await enforceRateLimit(providerKey, estimatedTokens, rateLimiters);
    }
  }
  
  return await performAICall(provider, model, prompt, commentText, responseType, scannerType, rateLimiters, estimatedTokens);
}

// Helper function to process requests sequentially for very low RPM models
async function processSequentially<T>(modelKey: string, task: () => Promise<T>, sequentialQueue: Map<string, any>): Promise<T> {
  if (!sequentialQueue.has(modelKey)) {
    sequentialQueue.set(modelKey, {
      queue: [],
      processing: false,
      lastCall: 0
    });
  }
  
  const queueData = sequentialQueue.get(modelKey);
  
  return new Promise((resolve, reject) => {
    queueData.queue.push(async () => {
      try {
        // Ensure at least 75 seconds between calls for Sonnet/Opus (extra buffer for 1 RPM)
        const timeSinceLastCall = Date.now() - queueData.lastCall;
        const minDelay = 75000; // 75 seconds for 1 RPM limit with extra buffer
        
        if (timeSinceLastCall < minDelay) {
          const waitTime = minDelay - timeSinceLastCall;
          console.log(`Sequential queue: waiting ${Math.ceil(waitTime / 1000)}s before next ${modelKey} call`);
          await new Promise(r => setTimeout(r, waitTime));
        }
        
        queueData.lastCall = Date.now();
        const result = await task();
        resolve(result);
      } catch (error) {
        reject(error);
      }
    });
    
    // Process queue if not already processing
    if (!queueData.processing) {
      processQueue(queueData);
    }
  });
}

// Helper function to process the sequential queue
async function processQueue(queueData: any) {
  if (queueData.processing || queueData.queue.length === 0) {
    return;
  }
  
  queueData.processing = true;
  
  while (queueData.queue.length > 0) {
    const task = queueData.queue.shift();
    try {
      await task();
    } catch (error) {
      console.error('Error in sequential queue task:', error);
    }
  }
  
  queueData.processing = false;
}

// Helper function to perform the actual AI call
async function performAICall(provider: string, model: string, prompt: string, commentText: string, responseType: 'analysis' | 'text' | 'batch_analysis' | 'batch_text', scannerType?: string, rateLimiters?: Map<string, any>, estimatedTokens?: number) {
  // Enforce per-scanner limits if available
  if (scannerType && rateLimiters && rateLimiters.has(scannerType)) {
    await enforceRateLimit(scannerType, estimatedTokens || 0, rateLimiters);
  }

  // Call the appropriate AI provider
  if (provider === 'openai') {
    return await callOpenAI(model, prompt, commentText, responseType);
  } else if (provider === 'azure') {
    return await callAzureOpenAI(model, prompt, commentText, responseType);
  } else if (provider === 'bedrock') {
    return await callBedrock(model, prompt, commentText, responseType);
  } else {
    throw new Error(`Unsupported AI provider: ${provider}`);
  }
}

  // OpenAI API call
  async function callOpenAI(model: string, prompt: string, commentText: string, responseType: 'analysis' | 'text' | 'batch_analysis' | 'batch_text') {
    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    
    const messages = [
      { role: 'system', content: prompt },
      { role: 'user', content: commentText }
    ];

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;

    if (responseType === 'analysis' || responseType === 'batch_analysis') {
      try {
        // Extract JSON from response if it contains explanatory text
        let jsonContent = content.trim();
        
        // First try to parse as-is
        try {
          const parsed = JSON.parse(jsonContent);
          return {
            results: parsed,
            rawResponse: null // No raw response needed for successful parsing
          };
        } catch (initialError) {
          // If that fails, try to extract JSON from response
          if (!jsonContent.startsWith('[') && !jsonContent.startsWith('{')) {
            // Look for JSON array or object in the response
            const jsonArrayMatch = jsonContent.match(/\[[\s\S]*?\]/);
            const jsonObjectMatch = jsonContent.match(/\{[\s\S]*?\}/);
            
            if (jsonArrayMatch) {
              jsonContent = jsonArrayMatch[0];
            } else if (jsonObjectMatch) {
              jsonContent = jsonObjectMatch[0];
            } else {
              // Handle numbered list responses for both single and batch analysis
              if (jsonContent.match(/^\s*\d+\./m)) {
                console.log(`Converting numbered list to ${responseType === 'analysis' ? 'single object' : 'JSON array'}`);
                
                if (responseType === 'analysis') {
                  // Handle single analysis numbered response
                  const concerningMatch = jsonContent.match(/1\.\s*(.+)/);
                  const identifiableMatch = jsonContent.match(/2\.\s*(.+)/);
                  
                  if (concerningMatch && identifiableMatch) {
                    const concerning = !/not concerning/i.test(concerningMatch[1]);
                    const identifiable = !/not identifiable/i.test(identifiableMatch[1]);
                    
                    // Extract reasoning section if present
                    const reasoningMatch = jsonContent.match(/reasoning[:\s]*([\s\S]*)/i);
                    let reasoning = reasoningMatch ? reasoningMatch[1].trim() : jsonContent;
                    
                    return {
                      results: {
                        concerning,
                        identifiable,
                        reasoning: reasoning.replace(/[\r\n\t]/g, ' ').trim()
                      },
                      rawResponse: null
                    };
                  }
                } else if (responseType === 'batch_analysis') {
                  // Handle batch analysis numbered response
                  const lines = jsonContent.split('\n').filter(line => line.trim());
                  const results = [];
                  
                  for (const line of lines) {
                    const trimmed = line.trim();
                    if (trimmed.match(/^\d+\./)) {
                      // Extract boolean values from numbered responses
                      const concerning = /concerning[:\s]*(?:true|yes)/i.test(trimmed);
                      const identifiable = /identifiable[:\s]*(?:true|yes)/i.test(trimmed);
                      results.push({
                        concerning,
                        identifiable,
                        reasoning: trimmed
                      });
                    }
                  }
                  
                  if (results.length > 0) {
                    return {
                      results: results,
                      rawResponse: null
                    };
                  }
                }
              }
              
              throw initialError; // Re-throw original error if we can't extract
            }
          }
          
          return JSON.parse(jsonContent);
        }
      } catch (parseError) {
        console.error(`JSON parsing failed for ${responseType}:`, parseError, 'Content:', content);
        // Enhanced fallback parsing
        if (responseType === 'analysis') {
          // Look for explicit "no" statements in text-based responses
          const concerningExplicitNo = /concerning[:\s]*no/i.test(content);
          const identifiableExplicitNo = /identifiable[:\s]*no/i.test(content);
          
          // Look for positive indicators only if there's no explicit "no"
          const concerningPositive = !concerningExplicitNo && /concerning[:\s]*(?:true|yes)|harassment|threat|illegal|violation|unsafe|inappropriate|discrimination|ageist|safety violation/i.test(content);
          const identifiablePositive = !identifiableExplicitNo && /identifiable[:\s]*(?:true|yes)|contains.*(?:name|email|phone|id)|specific names|personal information present/i.test(content);
          
          const concerning = concerningPositive;
          const identifiable = identifiablePositive;
          
          const base = { concerning, identifiable, reasoning: content.substring(0, 300).replace(/[\r\n\t]/g, ' ').trim() };
          const results = model.startsWith('amazon.titan') ? normalizeTitanAnalysis(base, true) : base;
          return { results, rawResponse: content };
        } else if (responseType === 'batch_analysis') {
          // For batch analysis, apply same logic but return array
          const concerningExplicitNo = /concerning[:\s]*no/i.test(content);
          const identifiableExplicitNo = /identifiable[:\s]*no/i.test(content);
          
          const concerningPositive = !concerningExplicitNo && /concerning[:\s]*(?:true|yes)|harassment|threat|illegal|violation|unsafe|inappropriate|discrimination|ageist|safety violation/i.test(content);
          const identifiablePositive = !identifiableExplicitNo && /identifiable[:\s]*(?:true|yes)|contains.*(?:name|email|phone|id)|specific names|personal information present/i.test(content);
          
          const concerning = concerningPositive;
          const identifiable = identifiablePositive;
          
          const base = [{ concerning, identifiable, reasoning: content.substring(0, 300).replace(/[\r\n\t]/g, ' ').trim() }];
          const results = model.startsWith('amazon.titan') ? normalizeTitanAnalysis(base) : base;
          return { results, rawResponse: content };
        }
        
        // For other cases fallback to heuristic
        const heur = heuristicAnalyze(commentText);
        return { results: heur, rawResponse: content };
      }
    } else if (responseType === 'batch_text') {
      try {
        return JSON.parse(content);
      } catch (parseError) {
        console.warn(`JSON parsing failed for batch_text:`, parseError, 'Content:', content);
        // If not valid JSON, split by lines or return array with single item
        return content.split('\n').filter(line => line.trim().length > 0);
      }
    } else {
      return content;
    }
  }

  // Azure OpenAI API call
  async function callAzureOpenAI(model: string, prompt: string, commentText: string, responseType: 'analysis' | 'text' | 'batch_analysis' | 'batch_text') {
    const azureApiKey = Deno.env.get('AZURE_OPENAI_API_KEY');
    const azureEndpoint = Deno.env.get('AZURE_OPENAI_ENDPOINT');
    const apiVersion = Deno.env.get('AZURE_OPENAI_API_VERSION') || '2024-02-01';
    
    if (!azureApiKey || !azureEndpoint) {
      throw new Error('Azure OpenAI API key and endpoint not configured');
    }

    // Clean endpoint URL (remove trailing slash if present)
    const cleanEndpoint = azureEndpoint.replace(/\/$/, '');
    
    const messages = [
      { role: 'system', content: prompt },
      { role: 'user', content: commentText }
    ];

    // Azure OpenAI uses deployment name, which should match the model name
    const url = `${cleanEndpoint}/openai/deployments/${model}/chat/completions?api-version=${apiVersion}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'api-key': azureApiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: messages,
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Azure OpenAI API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;

    // Use the same parsing logic as regular OpenAI
    if (responseType === 'analysis' || responseType === 'batch_analysis') {
      try {
        // Extract JSON from response if it contains explanatory text
        let jsonContent = content.trim();
        
        // First try to parse as-is
        try {
          const parsed = JSON.parse(jsonContent);
          return {
            results: parsed,
            rawResponse: null // No raw response needed for successful parsing
          };
        } catch (initialError) {
          // If that fails, try to extract JSON from response
          if (!jsonContent.startsWith('[') && !jsonContent.startsWith('{')) {
            // Look for JSON array or object in the response
            const jsonArrayMatch = jsonContent.match(/\[[\s\S]*?\]/);
            const jsonObjectMatch = jsonContent.match(/\{[\s\S]*?\}/);
            
            if (jsonArrayMatch) {
              jsonContent = jsonArrayMatch[0];
            } else if (jsonObjectMatch) {
              jsonContent = jsonObjectMatch[0];
            } else {
              // Handle numbered list responses for both single and batch analysis
              if (jsonContent.match(/^\s*\d+\./m)) {
        console.log(`Converting numbered list to ${responseType === 'analysis' ? 'single object' : 'JSON array'} for model ${model}`);
                
                if (responseType === 'analysis') {
                  // Handle single analysis numbered response
                  const concerningMatch = jsonContent.match(/1\.\s*(.+)/);
                  const identifiableMatch = jsonContent.match(/2\.\s*(.+)/);
                  
                  if (concerningMatch && identifiableMatch) {
                    const concerning = !/not concerning/i.test(concerningMatch[1]);
                    const identifiable = !/not identifiable/i.test(identifiableMatch[1]);
                    
                    // Extract reasoning section if present
                    const reasoningMatch = jsonContent.match(/reasoning[:\s]*([\s\S]*)/i);
                    let reasoning = reasoningMatch ? reasoningMatch[1].trim() : jsonContent;
                    
                    return {
                      results: {
                        concerning,
                        identifiable,
                        reasoning: reasoning.replace(/[\r\n\t]/g, ' ').trim()
                      },
                      rawResponse: null
                    };
                  }
                } else if (responseType === 'batch_analysis') {
                  // Handle batch analysis numbered response
                  const lines = jsonContent.split('\n').filter(line => line.trim());
                  const results = [];
                  
                  for (const line of lines) {
                    const trimmed = line.trim();
                    if (trimmed.match(/^\d+\./)) {
                      // Extract boolean values from numbered responses
                      const concerning = /concerning[:\s]*(?:true|yes)/i.test(trimmed);
                      const identifiable = /identifiable[:\s]*(?:true|yes)/i.test(trimmed);
                      results.push({
                        concerning,
                        identifiable,
                        reasoning: trimmed
                      });
                    }
                  }
                  
                  if (results.length > 0) {
                    return {
                      results: results,
                      rawResponse: null
                    };
                  }
                }
              }
              
              // For other cases fallback to heuristic
              const heur = heuristicAnalyze(commentText);
              return { results: heur, rawResponse: content };
            }
          }
          
          // Try to parse the extracted content
          const parsed = JSON.parse(jsonContent);
          return {
            results: parsed,
            rawResponse: null
          };
        }
      } catch (parseError) {
        console.warn(`Azure OpenAI JSON parsing failed for ${responseType}:`, parseError, 'Content:', content);
        
        // For other cases fallback to heuristic
        const heur = heuristicAnalyze(commentText);
        return { results: heur, rawResponse: content };
      }
    } else if (responseType === 'batch_text') {
      try {
        return JSON.parse(content);
      } catch (parseError) {
        console.warn(`JSON parsing failed for batch_text:`, parseError, 'Content:', content);
        // If not valid JSON, split by lines or return array with single item
        return content.split('\n').filter(line => line.trim().length > 0);
      }
    } else {
      return content;
    }
  }

  // AWS Bedrock API call with retry logic
  async function callBedrock(model: string, prompt: string, commentText: string, responseType: 'analysis' | 'text' | 'batch_analysis' | 'batch_text') {
    const awsAccessKey = Deno.env.get('AWS_ACCESS_KEY_ID');
    const awsSecretKey = Deno.env.get('AWS_SECRET_ACCESS_KEY');
    const awsRegion = Deno.env.get('AWS_REGION') || 'us-west-2';

    console.log(`Bedrock call - Model: ${model}, Region: ${awsRegion}, AccessKey: ${awsAccessKey ? 'present' : 'missing'}`);

    if (!awsAccessKey || !awsSecretKey) {
      throw new Error('AWS credentials not configured');
    }

    return await retryWithBackoff(async () => {
      return await makeBedrockRequest(model, prompt, commentText, responseType, awsAccessKey, awsSecretKey, awsRegion);
    }, 4, 2000, model); // Increased retries and base delay for Bedrock
  }

  // Retry function with exponential backoff - enhanced for Bedrock
  async function retryWithBackoff<T>(fn: () => Promise<T>, maxRetries: number, baseDelay: number, modelName?: string): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        
        // Check if it's a rate limit error
        if (error.message.includes('429') || error.message.includes('Too many requests')) {
          if (attempt < maxRetries) {
            // More aggressive backoff for Bedrock rate limits
            let delay = baseDelay * Math.pow(2, attempt) + Math.random() * 2000; // Increased jitter
            
            // Special handling for Bedrock - longer delays
            if (error.message.includes('bedrock') || (modelName && (modelName.includes('claude') || modelName.includes('titan')))) {
              // For very low RPM models (1-2 RPM), use much longer delays
              if (modelName && (modelName.includes('sonnet') || modelName.includes('opus'))) {
                // For Sonnet/Opus models that typically have 1 RPM limits, wait at least 65 seconds
                delay = Math.max(delay, 65000 + attempt * 30000); // 65s base, +30s per retry
              } else {
                delay = Math.max(delay, 5000 + attempt * 5000); // Minimum 5s, increasing by 5s per attempt
              }
            }
            
            console.log(`Rate limited, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries + 1})`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
        }
        
        // For non-rate-limit errors, don't retry
        throw error;
      }
    }
    
    throw lastError!;
  }

// Separate function for making the actual Bedrock request
  async function makeBedrockRequest(model: string, prompt: string, commentText: string, responseType: 'analysis' | 'text' | 'batch_analysis' | 'batch_text', awsAccessKey: string, awsSecretKey: string, awsRegion: string, titanStrictRetry: boolean = false) {

    // Use AWS SDK v3 style endpoint for Bedrock
    const endpoint = `https://bedrock-runtime.${awsRegion}.amazonaws.com/model/${model}/invoke`;

    // For Titan analysis requests, enforce strict JSON envelope and deterministic output
    let effectivePrompt = prompt;
    if (model.startsWith('amazon.titan') && (responseType === 'analysis' || responseType === 'batch_analysis')) {
      const schema = responseType === 'batch_analysis'
        ? '[{ "concerning": boolean, "identifiable": boolean, "reasoning": string }]'
        : '{ "concerning": boolean, "identifiable": boolean, "reasoning": string }';
      let strictHeader = `You must respond ONLY with ${schema} wrapped inside <json> and </json> tags. Do not include any prose, explanations, or code fences. No markdown. No preface. Output exactly and only the JSON.`;
      if (titanStrictRetry) {
        strictHeader = `STRICT MODE: Return ONLY the JSON payload wrapped in <json>...</json>. Absolutely no extra text before or after. If unsure, output default booleans and concise reasoning.\n\n` + strictHeader;
      }
      effectivePrompt = `${strictHeader}\n\n${prompt}`;
    }

    let requestBody;
    if (model.startsWith('anthropic.claude')) {
      // For Claude 3.5+ models, use the messages API format
      if (model.includes('claude-3') || model.includes('sonnet-4') || model.includes('haiku-3') || model.includes('opus-3')) {
        requestBody = JSON.stringify({
          anthropic_version: "bedrock-2023-05-31",
          max_tokens: 1000,
          temperature: 0.1,
          messages: [
            {
              role: "user",
              content: `${prompt}\n\n${commentText}`
            }
          ]
        });
      } else {
        // Legacy Claude models
        requestBody = JSON.stringify({
          prompt: `\n\nHuman: ${prompt}\n\n${commentText}\n\nAssistant:`,
          max_tokens_to_sample: 1000,
          temperature: 0.1,
        });
      }
    } else if (model.startsWith('amazon.titan')) {
      requestBody = JSON.stringify({
        inputText: `${effectivePrompt}\n\n${commentText}`,
        textGenerationConfig: {
          maxTokenCount: 1000,
          temperature: 0.1,
          topP: 0.1
        }
      });
    } else if (model.startsWith('mistral.')) {
      // Mistral models on Bedrock use a simple prompt-based schema
      requestBody = JSON.stringify({
        prompt: `${prompt}\n\n${commentText}`,
        max_tokens: 1000,
        temperature: 0.1,
        top_p: 0.9
      });
    } else {
      throw new Error(`Unsupported Bedrock model: ${model}`);
    }

    // Create proper AWS v4 signature
    const host = `bedrock-runtime.${awsRegion}.amazonaws.com`;
    const service = 'bedrock'; // Fixed: AWS expects 'bedrock' not 'bedrock-runtime'
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:\-]|\.\d{3}/g, '');
    const dateStamp = amzDate.substr(0, 8);
    
    const canonicalUri = `/model/${encodeURIComponent(model)}/invoke`;
    const canonicalQuerystring = '';
    const canonicalHeaders = `host:${host}\nx-amz-date:${amzDate}\n`;
    const signedHeaders = 'host;x-amz-date';
    
    // Hash the payload
    const payloadHash = await sha256(requestBody);
    
    // Create canonical request
    const canonicalRequest = `POST\n${canonicalUri}\n${canonicalQuerystring}\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
    
    // Create string to sign
    const algorithm = 'AWS4-HMAC-SHA256';
    const credentialScope = `${dateStamp}/${awsRegion}/${service}/aws4_request`;
    const stringToSign = `${algorithm}\n${amzDate}\n${credentialScope}\n${await sha256(canonicalRequest)}`;
    
    // Calculate signature
    const signingKey = await getSignatureKey(awsSecretKey, dateStamp, awsRegion, service);
    const signature = await hmacSha256(signingKey, stringToSign);
    
    // Debug logging
    console.log(`AWS Debug - Model: ${model}`);
    console.log(`AWS Debug - Region: ${awsRegion}`);
    console.log(`AWS Debug - Service: ${service}`);
    console.log(`AWS Debug - Host: ${host}`);
    console.log(`AWS Debug - CanonicalUri: ${canonicalUri}`);
    console.log(`AWS Debug - PayloadHash: ${payloadHash}`);
    console.log(`AWS Debug - StringToSign: ${stringToSign}`);
    console.log(`AWS Debug - Signature: ${signature}`);
    console.log(`AWS Debug - RequestBody: ${requestBody}`);
    
    // Create authorization header
    const authorizationHeader = `${algorithm} Credential=${awsAccessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    
    console.log(`Bedrock request to: ${endpoint}`);
    console.log(`Authorization: ${authorizationHeader}`);
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': authorizationHeader,
        'Content-Type': 'application/json',
        'X-Amz-Date': amzDate
      },
      body: requestBody
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Bedrock API error: ${response.status} - ${errorText}`);
      console.error(`Bedrock request details:`, {
        endpoint,
        model,
        region: awsRegion,
        authHeader: authorizationHeader.substring(0, 50) + '...',
        requestBodyLength: requestBody.length
      });
      throw new Error(`Bedrock API request failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    
    let content;
    if (model.startsWith('anthropic.claude')) {
      // For Claude 3.5+ models, use the new response format
      if (model.includes('claude-3') || model.includes('sonnet-4') || model.includes('haiku-3') || model.includes('opus-3')) {
        content = data.content?.[0]?.text || data.completion;
      } else {
        // Legacy Claude models
        content = data.completion;
      }
    } else if (model.startsWith('amazon.titan')) {
      content = data.results?.[0]?.outputText || data.outputText || data.completion;
    } else if (model.startsWith('mistral.')) {
      // Mistral on Bedrock commonly returns { outputs: [{ text }] }
      content = data.outputs?.[0]?.text || data.output_text || data.completion || data.generation || data.result;
      
      // Log the full Mistral response structure for debugging
      console.log('Mistral response structure:', JSON.stringify(data, null, 2));
      console.log('Extracted content:', content);
      
      // If we don't find content in expected places, use the whole response
      if (!content) {
        console.warn('No content found in expected Mistral response fields, using full response');
        content = JSON.stringify(data);
      }
    }

    if (responseType === 'analysis' || responseType === 'batch_analysis') {
      try {
        // Extract JSON from response if it contains explanatory text
        let jsonContent = content.trim();

        // Titan: prefer sentinel-extracted JSON first
        if (model.startsWith('amazon.titan')) {
          const sentinel = /<json>([\s\S]*?)<\/json>/i.exec(jsonContent);
          if (sentinel && sentinel[1]) {
            jsonContent = sentinel[1].trim();
          }
        }
        
        // Clean up common issues in JSON responses
        jsonContent = jsonContent.replace(/```json\s*/g, '').replace(/```\s*/g, '');
        
        // For Mistral models, try additional cleanup
        if (model.startsWith('mistral.')) {
          console.log(`Mistral raw content before cleanup: ${jsonContent.substring(0, 300)}`);
          
          // Try to extract JSON from common Mistral response patterns
          const jsonPatterns = [
            /```json\s*([\s\S]*?)\s*```/,  // JSON in code blocks
            /\[[\s\S]*\]/,                  // Direct array
            /\{[\s\S]*\}/,                  // Direct object
            /(?:Here is|Here's|The response is|Response:)\s*(\[[\s\S]*\])/i,  // After introduction
            /(?:Here is|Here's|The response is|Response:)\s*(\{[\s\S]*\})/i   // After introduction
          ];
          
          let foundJson = false;
          for (const pattern of jsonPatterns) {
            const match = jsonContent.match(pattern);
            if (match) {
              jsonContent = match[1] || match[0];
              foundJson = true;
              console.log(`Mistral: Found JSON using pattern, extracted: ${jsonContent.substring(0, 100)}`);
              break;
            }
          }
          
          if (!foundJson) {
            // Remove any leading/trailing explanatory text and focus on JSON
            const jsonMatch = jsonContent.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
            if (jsonMatch) {
              jsonContent = jsonMatch[0];
            }
          }
          
          // Clean up common Mistral formatting issues
          jsonContent = jsonContent
            .replace(/,\s*}/g, '}')  // Remove trailing commas
            .replace(/,\s*]/g, ']')  // Remove trailing commas in arrays
            .replace(/\n/g, ' ')      // Replace newlines with spaces
            .replace(/\s+/g, ' ')     // Normalize whitespace
            .trim();
            
          console.log(`Mistral cleaned content: ${jsonContent.substring(0, 200)}`);
        }
        
        // First try to parse as-is
        try {
          let parsed = JSON.parse(jsonContent);
          if (model.startsWith('amazon.titan')) {
            parsed = normalizeTitanAnalysis(parsed, responseType === 'analysis');
          }
          console.log(`Successfully parsed JSON on first attempt for ${model}`);
          return {
            results: parsed,
            rawResponse: null
          };
        } catch (initialError) {
          console.log(`Initial JSON parse failed for ${model}, trying extraction. Error: ${initialError.message}`);
          console.log(`Content preview: ${jsonContent.substring(0, 200)}`);
          
          // Try multiple extraction strategies
          let extractedJson: any = null;
          
          // Strategy 1: Extract from explicit <json> ... </json>
          if (model.startsWith('amazon.titan')) {
            const m = /<json>([\s\S]*?)<\/json>/i.exec(content);
            if (m && m[1]) {
              try {
                extractedJson = JSON.parse(m[1].trim());
              } catch {}
            }
          }
          
          // Strategy 2: Extract complete JSON arrays or objects
          if (extractedJson == null) {
            // For Mistral, be more aggressive in JSON extraction
            if (model.startsWith('mistral.')) {
              // Try to find JSON within the response using improved patterns
              const patterns = [
                /\[[\s\S]*?\]/g,  // Arrays
                /\{[\s\S]*?\}/g,  // Objects
                /(?:```json\s*)?\[[\s\S]*?\](?:\s*```)?/g,  // Arrays with possible markdown
                /(?:```json\s*)?\{[\s\S]*?\}(?:\s*```)?/g   // Objects with possible markdown
              ];
              
              for (const pattern of patterns) {
                const matches = content.match(pattern);
                if (matches) {
                  for (const match of matches.sort((a, b) => b.length - a.length)) {
                    try { 
                      let cleanMatch = match.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
                      extractedJson = JSON.parse(cleanMatch); 
                      console.log(`Successfully extracted JSON using Mistral pattern for ${model}`);
                      break; 
                    } catch (e) {
                      console.log(`Failed to parse match: ${match.substring(0, 50)}...`);
                    }
                  }
                  if (extractedJson) break;
                }
              }
            } else {
              // Original logic for other models
              const jsonArrayMatches = jsonContent.match(/\[[\s\S]*?\]/g);
              const jsonObjectMatches = jsonContent.match(/\{[\s\S]*?\}/g);
              if (jsonArrayMatches) {
                for (const match of jsonArrayMatches.sort((a, b) => b.length - a.length)) {
                  try { extractedJson = JSON.parse(match); break; } catch {}
                }
              }
              if (extractedJson == null && jsonObjectMatches) {
                for (const match of jsonObjectMatches.sort((a, b) => b.length - a.length)) {
                  try { extractedJson = JSON.parse(match); break; } catch {}
                }
              }
            }
          }
          
          if (extractedJson != null) {
            if (model.startsWith('amazon.titan')) {
              extractedJson = normalizeTitanAnalysis(extractedJson, responseType === 'analysis');
            }
            console.log(`Successfully extracted JSON for ${model}: ${JSON.stringify(extractedJson).substring(0, 100)}...`);
            return { results: extractedJson, rawResponse: null };
          }
          
          // Log the failure for debugging
          console.error(`All JSON extraction strategies failed for ${model}. Raw content: ${content.substring(0, 500)}`);
          console.error(`Cleaned content: ${jsonContent.substring(0, 500)}`);
          
          // Strategy 3: Handle numbered list responses
          if (jsonContent.match(/^\s*\d+\./m)) {
            console.log(`Converting numbered list to ${responseType === 'analysis' ? 'single object' : 'JSON array'}`);
            if (responseType === 'analysis') {
              const concerningMatch = jsonContent.match(/1\.\s*(.+)/);
              const identifiableMatch = jsonContent.match(/2\.\s*(.+)/);
              if (concerningMatch && identifiableMatch) {
                const concerning = !/not concerning/i.test(concerningMatch[1]);
                const identifiable = !/not identifiable/i.test(identifiableMatch[1]);
                const reasoningMatch = jsonContent.match(/reasoning[:\s]*([\s\S]*)/i);
                let reasoning = reasoningMatch ? reasoningMatch[1].trim() : jsonContent;
                let result: any = { concerning, identifiable, reasoning: reasoning.replace(/[\r\n\t]/g, ' ').trim() };
                if (model.startsWith('amazon.titan')) result = normalizeTitanAnalysis(result, true);
                return { results: result, rawResponse: null };
              }
            } else if (responseType === 'batch_analysis') {
              const lines = jsonContent.split('\n').filter(line => line.trim());
              const results = [] as any[];
              for (const line of lines) {
                const trimmed = line.trim();
                if (/^\d+\./.test(trimmed)) {
                  const concerning = /concerning[:\s]*(?:true|yes)/i.test(trimmed);
                  const identifiable = /identifiable[:\s]*(?:true|yes)/i.test(trimmed);
                  results.push({ concerning, identifiable, reasoning: trimmed });
                }
              }
              if (results.length > 0) {
                const finalResults = model.startsWith('amazon.titan') ? normalizeTitanAnalysis(results) : results;
                return { results: finalResults, rawResponse: null };
              }
            }
          }

          // Titan-only: one strict retry if parsing failed
          if (model.startsWith('amazon.titan') && !titanStrictRetry) {
            console.log('Titan parse failed — performing single strict retry');
            return await makeBedrockRequest(model, prompt, commentText, responseType, awsAccessKey, awsSecretKey, awsRegion, true);
          }
          
          // Strategy 4: Enhanced text analysis for better detection - FIXED VERSION
          console.log(`Creating enhanced fallback response for: ${jsonContent.substring(0, 200)}`);
          if (responseType === 'analysis') {
            // Look for explicit "no" statements in text-based responses
            const concerningExplicitNo = /concerning[:\s]*no/i.test(jsonContent);
            const identifiableExplicitNo = /identifiable[:\s]*no/i.test(jsonContent);
            
            // Look for positive indicators only if there's no explicit "no"
            const concerningPositive = !concerningExplicitNo && /concerning[:\s]*(?:true|yes)|harassment|threat|illegal|violation|unsafe|inappropriate|discrimination|ageist|safety violation/i.test(jsonContent);
            const identifiablePositive = !identifiableExplicitNo && /identifiable[:\s]*(?:true|yes)|contains.*(?:name|email|phone|id)|specific names|personal information present/i.test(jsonContent);
            
            const concerning = concerningPositive;
            const identifiable = identifiablePositive;
            
            const base = { concerning, identifiable, reasoning: jsonContent.substring(0, 300).replace(/[\r\n\t]/g, ' ').trim() };
            const results = model.startsWith('amazon.titan') ? normalizeTitanAnalysis(base, true) : base;
            return { results, rawResponse: jsonContent };
          } else if (responseType === 'batch_analysis') {
            // For batch analysis, apply same logic but return array
            const concerningExplicitNo = /concerning[:\s]*no/i.test(jsonContent);
            const identifiableExplicitNo = /identifiable[:\s]*no/i.test(jsonContent);
            
            const concerningPositive = !concerningExplicitNo && /concerning[:\s]*(?:true|yes)|harassment|threat|illegal|violation|unsafe|inappropriate|discrimination|ageist|safety violation/i.test(jsonContent);
            const identifiablePositive = !identifiableExplicitNo && /identifiable[:\s]*(?:true|yes)|contains.*(?:name|email|phone|id)|specific names|personal information present/i.test(jsonContent);
            
            const concerning = concerningPositive;
            const identifiable = identifiablePositive;
            
            const base = [{ concerning, identifiable, reasoning: jsonContent.substring(0, 300).replace(/[\r\n\t]/g, ' ').trim() }];
            const results = model.startsWith('amazon.titan') ? normalizeTitanAnalysis(base) : base;
            return { results, rawResponse: jsonContent };
          }
          
          throw initialError; // Re-throw original error if we can't handle it
        }
      } catch (parseError) {
        console.error(`JSON parsing failed for ${responseType}:`, parseError, 'Content:', content);
        // Titan-only: one strict retry in outer catch as a last attempt
        if (model.startsWith('amazon.titan') && !titanStrictRetry) {
          console.log('Titan parse failed in outer catch — performing single strict retry');
          return await makeBedrockRequest(model, prompt, commentText, responseType, awsAccessKey, awsSecretKey, awsRegion, true);
        }
        // Enhanced fallback parsing
        if (responseType === 'analysis') {
          const heur = heuristicAnalyze(commentText);
          return { results: heur, rawResponse: content };
        } else {
          // For batch_analysis, return empty array to trigger fallback to individual processing
          console.warn('Batch analysis JSON parsing failed, returning empty array for fallback');
          return [];
        }
      }
    } else if (responseType === 'batch_text') {
      try {
        return JSON.parse(content);
      } catch (parseError) {
        console.warn(`JSON parsing failed for batch_text:`, parseError, 'Content:', content);
        // If not valid JSON, split by lines or return array with single item
        return content.split('\n').filter(line => line.trim().length > 0);
      }
    } else {
      return content;
    }
  }

  // Titan-specific normalizer to coerce fields and clean outputs
  function normalizeTitanAnalysis(data: any, flattenSingle: boolean = false) {
    const toBool = (v: any) => {
      if (typeof v === 'boolean') return v;
      if (typeof v === 'string') {
        const s = v.trim().toLowerCase();
        if (['true', 'yes', 'y', '1'].includes(s)) return true;
        if (['false', 'no', 'n', '0'].includes(s)) return false;
      }
      if (typeof v === 'number') return v !== 0;
      return !!v;
    };
    const normalizeOne = (o: any) => ({
      concerning: toBool(o?.concerning),
      identifiable: toBool(o?.identifiable),
      reasoning: typeof o?.reasoning === 'string' ? o.reasoning.trim() : JSON.stringify(o?.reasoning ?? '')
    });
    const aggregate = (arr: any[]) => {
      const normalized = arr.map(normalizeOne);
      return {
        concerning: normalized.some(n => n.concerning),
        identifiable: normalized.some(n => n.identifiable),
        reasoning: normalized.map(n => n.reasoning).filter(Boolean).join(' | ')
      };
    };
    if (Array.isArray(data)) {
      // If expecting a single object, aggregate. Otherwise, normalize per item and
      // flatten any nested arrays by aggregating them individually.
      if (flattenSingle) return aggregate(data);
      return data.map((item: any) => Array.isArray(item) ? aggregate(item) : normalizeOne(item));
    }
    return normalizeOne(data);
  }

  // Basic AWS signature creation
  async function createAWSSignature(accessKey: string, secretKey: string, region: string, service: string, host: string, method: string, uri: string, querystring: string, payload: string, amzDate: string, dateStamp: string) {
    const algorithm = 'AWS4-HMAC-SHA256';
    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;

    const canonicalHeaders = `host:${host}\nx-amz-date:${amzDate}\n`;
    const signedHeaders = 'host;x-amz-date';

    // Create payload hash
    const payloadHash = await sha256(payload);
    
    const canonicalRequest = `${method}\n${uri}\n${querystring}\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
    
    const stringToSign = `${algorithm}\n${amzDate}\n${credentialScope}\n${await sha256(canonicalRequest)}`;
    
    const signingKey = await getSignatureKey(secretKey, dateStamp, region, service);
    const signature = await hmacSha256(signingKey, stringToSign);
    
    return `${algorithm} Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  }

  async function sha256(message: string): Promise<string> {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async function hmacSha256(key: Uint8Array, message: string): Promise<string> {
    const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const msgBuffer = new TextEncoder().encode(message);
    const signature = await crypto.subtle.sign('HMAC', cryptoKey, msgBuffer);
    const signatureArray = Array.from(new Uint8Array(signature));
    return signatureArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async function getSignatureKey(key: string, dateStamp: string, regionName: string, serviceName: string): Promise<Uint8Array> {
    const kDate = await hmacSha256Raw(new TextEncoder().encode(`AWS4${key}`), dateStamp);
    const kRegion = await hmacSha256Raw(kDate, regionName);
    const kService = await hmacSha256Raw(kRegion, serviceName);
    const kSigning = await hmacSha256Raw(kService, 'aws4_request');
    return kSigning;
  }

  async function hmacSha256Raw(key: Uint8Array, message: string): Promise<Uint8Array> {
    const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const msgBuffer = new TextEncoder().encode(message);
    const signature = await crypto.subtle.sign('HMAC', cryptoKey, msgBuffer);
    return new Uint8Array(signature);
  }
