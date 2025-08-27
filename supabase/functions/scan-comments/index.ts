import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { AILogger } from './ai-logger.ts';

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

  const overallStartTime = Date.now(); // Track overall process time

  try {
    const requestBody = await req.json();
    // Generate a per-request scanRunId for log correlation
    const scanRunId = requestBody.scanRunId || String(Math.floor(1000 + Math.random() * 9000));
    (globalThis as any).__scanRunId = scanRunId;

    // Authenticate user first
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header provided');
    }

    const token = authHeader.replace('Bearer ', '');
    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_ANON_KEY') || ''
    );

    const { data: userData, error: userError } = await supabaseAuth.auth.getUser(token);
    if (userError || !userData.user) {
      throw new Error('User not authenticated');
    }

    const user = userData.user;
    console.log(`Processing request for user: ${user.email}`);
    
    // Global run-guards to prevent duplicate analysis batches for the same run id
    const gAny: any = globalThis as any;
    gAny.__runInProgress = gAny.__runInProgress || new Set<string>();
    gAny.__runCompleted = gAny.__runCompleted || new Set<string>();
    gAny.__analysisStarted = gAny.__analysisStarted || new Set<string>();
    
    // Prefix all logs for this request with the run id.
    const __root = globalThis as any;
    if (!__root.__baseLog) {
      __root.__baseLog = console.log;
      __root.__baseWarn = console.warn;
      __root.__baseError = console.error;
    }
    console.log = (...args: any[]) => __root.__baseLog(`[RUN ${scanRunId}]`, ...args);
    console.warn = (...args: any[]) => __root.__baseWarn(`[RUN ${scanRunId}]`, ...args);
    console.error = (...args: any[]) => __root.__baseError(`[RUN ${scanRunId}]`, ...args);
    
    console.log(`[REQUEST] comments=${requestBody.comments?.length} defaultMode=${requestBody.defaultMode} batchStart=${requestBody.batchStart}`);

    // If a second initial analysis request arrives for the same scanRunId, ignore it.
    const isCached = Boolean(requestBody.useCachedAnalysis);
    if (!isCached) {
      if (gAny.__analysisStarted.has(scanRunId)) {
        console.log(`[DUPLICATE ANALYSIS] scanRunId=${scanRunId} received a second initial analysis request. Ignoring.`);
        return new Response(JSON.stringify({
          comments: [],
          batchStart: requestBody.batchStart || 0,
          batchSize: 0,
          hasMore: false,
          totalComments: requestBody.comments?.length || 0,
          summary: { total: 0, concerning: 0, identifiable: 0, needsAdjudication: 0 }
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      gAny.__analysisStarted.add(scanRunId);
    }

    // If this run id has already completed, short-circuit to avoid duplicate model calls
    if (gAny.__runCompleted.has(scanRunId)) {
      console.log(`[DUPLICATE RUN] scanRunId=${scanRunId} already completed. Skipping.`);
      return new Response(JSON.stringify({
        comments: [],
        batchStart: requestBody.batchStart || 0,
        batchSize: 0,
        hasMore: false,
        totalComments: requestBody.comments?.length || 0,
        summary: { total: 0, concerning: 0, identifiable: 0, needsAdjudication: 0 }
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // If a run is already in progress, ignore any subsequent batch slices to prevent multi-batch analysis
    if (gAny.__runInProgress.has(scanRunId) && (Number.isFinite(requestBody.batchStart) && (requestBody.batchStart as number) > 0)) {
      console.log(`[RUN IN PROGRESS] scanRunId=${scanRunId} received batchStart=${requestBody.batchStart}. Ignoring to prevent duplicate analysis calls.`);
      return new Response(JSON.stringify({
        comments: [],
        batchStart: requestBody.batchStart || 0,
        batchSize: 0,
        hasMore: false,
        totalComments: requestBody.comments?.length || 0,
        summary: { total: 0, concerning: 0, identifiable: 0, needsAdjudication: 0 }
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    
    // Mark run as in progress
    gAny.__runInProgress.add(scanRunId);
    
    const { 
      comments: inputComments, 
      defaultMode = 'redact',
      batchStart = 0,
      useCachedAnalysis = false,
      isDemoScan = false
    } = requestBody;

    console.log(`[REQUEST] Received request body:`, {
      commentsCount: inputComments?.length,
      defaultMode,
      batchStart,
      useCachedAnalysis,
      isDemoScan
    });

    console.log(`[REQUEST_DETAILS] phase=${useCachedAnalysis ? 'followup' : 'initial'} cached=${useCachedAnalysis} comments=${inputComments?.length} batchStart=${batchStart}`);

    if (!inputComments || !Array.isArray(inputComments) || inputComments.length === 0) {
      return new Response(JSON.stringify({ error: 'No comments provided' }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
        status: 400 
      });
    }

    // Get AI configurations from database
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    );

    const { data: configs, error: configError } = await supabase
      .from('ai_configurations')
      .select('*');

    if (configError) {
      console.error('Database error fetching AI configurations:', configError);
      throw new Error(`Database error: ${configError.message || JSON.stringify(configError)}`);
    }

    if (!configs || configs.length === 0) {
      console.error('No active AI configurations found');
      throw new Error('No active AI configurations found in database');
    }

    console.log(`[CONFIG] Found ${configs.length} active configurations:`, configs.map(c => `${c.scanner_type}:${c.provider}/${c.model}`));

    const scanA = configs.find(c => c.scanner_type === 'scan_a');
    const scanB = configs.find(c => c.scanner_type === 'scan_b');

    if (!scanA || !scanB) {
      throw new Error('Missing required AI configurations: scan_a and scan_b');
    }

    console.log(`[CONFIG] Scan A: ${scanA.provider}/${scanA.model}, Scan B: ${scanB.provider}/${scanB.model}`);

    // Check user credits before processing (only for Scan A, unless it's a demo scan)
    const creditsPerComment = 1; // 1 credit per comment for Scan A
    
    // Always fetch user credits for display purposes (even for demo scans)
    let userCredits: any = null;
    try {
      console.log(`[CREDITS] Fetching credits for user: ${user.id}`);
      const { data: creditsData, error: creditsError } = await supabase
        .from('user_credits')
        .select('available_credits, total_credits_used')
        .eq('user_id', user.id)
        .single();
      
      console.log(`[CREDITS] Raw credits query result:`, { creditsData, creditsError });
      
      if (creditsError && creditsError.code !== 'PGRST116') { // PGRST116 = no rows returned
        console.error('Error fetching user credits:', creditsError);
        // Don't fail for demo scans, just log the error
        if (!isDemoScan) {
          throw new Error(`Failed to check user credits: ${creditsError.message}`);
        }
      } else {
        userCredits = creditsData;
        console.log(`[CREDITS] Successfully fetched user credits:`, userCredits);
      }
    } catch (error) {
      if (!isDemoScan) {
        throw error;
      }
      console.warn('[CREDITS] Could not fetch user credits for demo scan:', error);
    }
    
    if (isDemoScan) {
      console.log(`[CREDITS] Demo scan detected - no credits required`);
    } else {
      console.log(`[CREDITS] Checking credits for user: ${user.id} (Scan A only)`);
      
      // Calculate credits needed for Scan A only (1 credit per comment)
      const totalCreditsNeeded = inputComments.length * creditsPerComment;
      
      const availableCredits = userCredits?.available_credits || 100; // Default 100 if no record exists
      
      if (availableCredits < totalCreditsNeeded) {
        console.warn(`[CREDITS] Insufficient credits for Scan A: ${availableCredits} available, ${totalCreditsNeeded} needed`);
        const errorResponse = { 
          error: `Insufficient credits. You have ${availableCredits} credits available, but need ${totalCreditsNeeded} credits to scan ${inputComments.length} comments with Scan A.`,
          insufficientCredits: true,
          availableCredits,
          requiredCredits: totalCreditsNeeded,
          commentsCount: inputComments.length,
          status: 402,
          success: false
        };
        
        console.log(`[CREDITS] Returning insufficient credits response:`, errorResponse);
        
        // Return 200 status but include error info in body for better Supabase compatibility
        return new Response(JSON.stringify(errorResponse), { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
          status: 200
        });
      }
      
      console.log(`[CREDITS] Sufficient credits available for Scan A: ${availableCredits} >= ${totalCreditsNeeded}`);
    }

    // Process comments in batches - adjust batch size based on model capabilities
    let batchSize = 100; // Default batch size
    
    // Reduce batch size for models with lower token limits
    if (scanA.model.includes('claude-3-haiku') || scanB.model.includes('claude-3-haiku')) {
      batchSize = 20; // Claude 3 Haiku has lower token limits
    } else if (scanA.model.includes('gpt-4o-mini') || scanB.model.includes('gpt-4o-mini')) {
      batchSize = 50; // GPT-4o-mini can handle more
    }
    
    // Use the smaller of the two models' preferred batch sizes
    const preferredA = scanA.preferred_batch_size || batchSize;
    const preferredB = scanB.preferred_batch_size || batchSize;
    batchSize = Math.min(preferredA, preferredB, batchSize);
    
    console.log(`[BATCH] Model-based batch size: ${batchSize} (Scan A: ${scanA.model}, Scan B: ${scanB.model})`);
    
    // Process ALL comments in batches
    let allScannedComments: any[] = [];
    let totalSummary = { total: 0, concerning: 0, identifiable: 0, needsAdjudication: 0 };
    
    // Initialize AI logger for this scan run
    const aiLogger = new AILogger();
    
    for (let currentBatchStart = 0; currentBatchStart < inputComments.length; currentBatchStart += batchSize) {
      const batch = inputComments.slice(currentBatchStart, currentBatchStart + batchSize);
      const batchEnd = Math.min(currentBatchStart + batchSize, inputComments.length);
      
      console.log(`[PROCESS] Batch ${currentBatchStart + 1}-${batchEnd} of ${inputComments.length} (preferredA=${scanA.preferred_batch_size || 100}, preferredB=${scanB.preferred_batch_size || 100}, chosen=${batchSize})`);

      // Process batch with Scan A and Scan B in parallel
              const [scanAResults, scanBResults] = await Promise.all([
          callAI(scanA.provider, scanA.model, scanA.analysis_prompt, buildBatchInput(batch), 'batch_analysis', user.id, scanRunId, 'scan_a', aiLogger),
          callAI(scanB.provider, scanB.model, scanB.analysis_prompt, buildBatchInput(batch), 'batch_analysis', user.id, scanRunId, 'scan_b', aiLogger)
        ]);

      console.log(`[RESULT] Scan A ${scanA.provider}/${scanA.model}: type=${typeof scanAResults} len=${Array.isArray(scanAResults) ? scanAResults.length : 'n/a'}`);
      console.log(`[RESULT] Scan B ${scanB.provider}/${scanB.model}: type=${typeof scanBResults} len=${Array.isArray(scanBResults) ? scanBResults.length : 'n/a'}`);

      // Parse and validate results
      const scanAResultsArray = parseBatchResults(scanAResults, batch.length, 'Scan A');
      const scanBResultsArray = parseBatchResults(scanBResults, batch.length, 'Scan B');

      // Process each comment in this batch
      for (let i = 0; i < batch.length; i++) {
        const comment = batch[i];
        const scanAResult = scanAResultsArray[i];
        const scanBResult = scanBResultsArray[i];

        if (!scanAResult || !scanBResult) {
          console.warn(`Missing scan results for comment ${currentBatchStart + i + 1}, skipping`);
          continue;
        }

        // Determine if adjudication is needed
        const concerningDisagreement = scanAResult.concerning !== scanBResult.concerning;
        const identifiableDisagreement = scanAResult.identifiable !== scanBResult.identifiable;
        const needsAdjudication = concerningDisagreement || identifiableDisagreement;

        if (needsAdjudication) {
          totalSummary.needsAdjudication++;
        }

        // Set flags based on scan results (will be resolved by adjudicator later)
        const concerning = scanAResult.concerning; // Use Scan A as default, will be updated by adjudicator
        const identifiable = scanAResult.identifiable;

        if (concerning) totalSummary.concerning++;
        if (identifiable) totalSummary.identifiable++;

        // Determine the mode based on content type
        let mode: 'redact' | 'rephrase' | 'original';
        if (concerning) {
          mode = 'redact';
        } else if (identifiable) {
          mode = 'rephrase';
        } else {
          mode = 'original';
        }

        // Create comment result with adjudication flags
        const processedComment = {
          ...comment,
          text: comment.originalText || comment.text,
          concerning,
          identifiable,
          mode, // Add the mode field
          aiReasoning: scanAResult.reasoning,
          needsAdjudication,
          adjudicationData: {
            scanAResult: { ...scanAResult, model: `${scanA.provider}/${scanA.model}` },
            scanBResult: { ...scanBResult, model: `${scanB.provider}/${scanB.model}` },
            agreements: {
              concerning: !concerningDisagreement ? scanAResult.concerning : null,
              identifiable: !identifiableDisagreement ? scanBResult.identifiable : null
            }
          },
          debugInfo: {
            scanAResult: { ...scanAResult, model: `${scanA.provider}/${scanA.model}` },
            scanBResult: { ...scanBResult, model: `${scanB.provider}/${scanB.model}` },
            needsAdjudication,
            scanRunId
          }
        };

        allScannedComments.push(processedComment);
      }
      
      console.log(`[BATCH] Completed batch ${currentBatchStart + 1}-${batchEnd}, processed ${batch.length} comments`);
    }
    
    totalSummary.total = allScannedComments.length;
    console.log(`Successfully scanned ALL ${allScannedComments.length} comments across ${Math.ceil(inputComments.length / batchSize)} batches`);
    
    const totalRunTimeMs = Date.now() - overallStartTime;
    
    const response = { 
      comments: allScannedComments,
      batchStart: 0, // Always start from 0 since we process all
      batchSize: allScannedComments.length, // Total processed
      hasMore: false, // No more batches since we processed all
      totalComments: inputComments.length,
      summary: totalSummary,
      totalRunTimeMs: totalRunTimeMs
    };
    
    console.log('Returning response with comments count:', response.comments.length);
    console.log('Response summary:', response.summary);
    console.log(`[FINAL] Processed ${response.comments.length}/${inputComments.length} comments in ${Math.ceil(inputComments.length / batchSize)} batches`);
    console.log(`[TIMING] Total run time: ${totalRunTimeMs}ms (${(totalRunTimeMs / 1000).toFixed(1)}s)`);
    
    // Deduct credits after successful scan completion (only for Scan A, unless it's a demo scan)
    if (isDemoScan) {
      console.log(`[CREDITS] Demo scan completed - no credits deducted`);
      response.creditInfo = {
        creditsDeducted: 0,
        remainingCredits: userCredits?.available_credits || 0,
        totalCreditsUsed: userCredits?.total_credits_used || 0,
        note: 'Demo scan - no credits charged. Demo files are free to use.'
      };
    } else {
      try {
        const creditsToDeduct = allScannedComments.length * creditsPerComment;
        console.log(`[CREDITS] Deducting ${creditsToDeduct} credits for Scan A processing of ${allScannedComments.length} comments`);
        
        const { data: deductionResult, error: deductionError } = await supabase
          .rpc('deduct_user_credits', {
            user_uuid: user.id,
            credits_to_deduct: creditsToDeduct,
            scan_run_id: scanRunId,
            comments_scanned: allScannedComments.length,
            scan_type: 'comment_scan'
          });
        
        if (deductionError) {
          console.error('[CREDITS] Error deducting credits for Scan A:', deductionError);
          // Don't fail the scan if credit deduction fails, just log it
        } else {
          console.log(`[CREDITS] Successfully deducted ${creditsToDeduct} credits for Scan A. Result:`, deductionResult);
          
          // Get updated credit balance
          const { data: updatedCredits, error: updateError } = await supabase
            .from('user_credits')
            .select('available_credits, total_credits_used')
            .eq('user_id', user.id)
            .single();
          
          if (!updateError && updatedCredits) {
            console.log(`[CREDITS] Updated balance: ${updatedCredits.available_credits} available, ${updatedCredits.total_credits_used} total used`);
            
            // Add credit information to response
            response.creditInfo = {
              creditsDeducted: creditsToDeduct,
              remainingCredits: updatedCredits.available_credits,
              totalCreditsUsed: updatedCredits.total_credits_used,
              note: 'Credits charged only for Scan A. Scan B, adjudication, and post-processing are free.'
            };
          }
        }
      } catch (creditError) {
        console.error('[CREDITS] Unexpected error during credit deduction for Scan A:', creditError);
        // Don't fail the scan if credit deduction fails
      }
    }
    
    // Mark run as completed
    gAny.__runCompleted.add(scanRunId);
    gAny.__runInProgress.delete(scanRunId);

    // Restore console methods before returning
    try {
      const __root: any = globalThis as any;
      if (__root.__baseLog && __root.__baseWarn && __root.__baseError) {
        console.log = __root.__baseLog;
        console.warn = __root.__baseWarn;
        console.error = __root.__baseError;
      }
    } catch (e) {
      console.warn('Failed to restore console methods:', e);
    }

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });

  } catch (error) {
    console.error('Error in scan-comments function:', error);
    
    // Restore console methods before returning error
    try {
      const __root: any = globalThis as any;
      if (__root.__baseLog && __root.__baseWarn && __root.__baseError) {
        console.log = __root.__baseLog;
        console.warn = __root.__baseWarn;
        console.error = __root.__baseError;
      }
    } catch (e) {
      console.warn('Failed to restore console methods:', e);
    }

    return new Response(JSON.stringify({ 
      error: `Error in scan-comments function: ${error.message}` 
    }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
      status: 500 
    });
  }
});

// Utility functions
function buildBatchInput(comments: any[]): string {
  const items = comments.map((comment, i) => 
    `<<<ITEM ${i + 1}>>>
${comment.originalText || comment.text}
<<<END ${i + 1}>>>`
  ).join('\n\n');
  
  return `Comments to analyze (each bounded by sentinels):

${items}`;
}

function parseBatchResults(response: any, expectedCount: number, source: string): any[] {
  try {
    if (!response) {
      throw new Error('Empty response');
    }

    // Decode HTML entities that might break JSON parsing
    let decodedResponse = response;
    if (typeof response === 'string') {
      const originalResponse = response;
      // Common HTML entities that can appear in AI responses
      decodedResponse = response
        .replace(/&#160;/g, ' ') // non-breaking space
        .replace(/&nbsp;/g, ' ') // non-breaking space
        .replace(/&amp;/g, '&') // ampersand
        .replace(/&lt;/g, '<') // less than
        .replace(/&gt;/g, '>') // greater than
        .replace(/&quot;/g, '"') // quote
        .replace(/&#39;/g, "'") // apostrophe
        .replace(/&#x20;/g, ' ') // space (hex)
        .replace(/&#x0A;/g, '\n') // newline (hex)
        .replace(/&#x0D;/g, '\r') // carriage return (hex)
        .replace(/&#x09;/g, '\t'); // tab (hex)
      
      // Log if HTML entities were found and decoded
      if (decodedResponse !== originalResponse) {
        console.log(`${source}: HTML entities detected and decoded in response`);
        const entityMatches = originalResponse.match(/&[#\w]+;/g);
        if (entityMatches) {
          console.log(`${source}: Found HTML entities:`, entityMatches.slice(0, 10)); // Log first 10
        }
      }
    }

    // Try to extract JSON from the decoded response - handle truncated responses
    let jsonMatch = decodedResponse.match(/\[[\s\S]*\]/);
    
    // If no complete array found, try to extract partial JSON and complete it
    if (!jsonMatch) {
      console.warn(`${source}: No complete JSON array found, attempting to extract partial response`);
      console.log(`${source}: Response length: ${decodedResponse.length} characters`);
      console.log(`${source}: Response preview: ${decodedResponse.substring(0, 200)}...`);
      
      // Look for the start of a JSON array
      const arrayStart = decodedResponse.indexOf('[');
      if (arrayStart === -1) {
        throw new Error('No JSON array found in response');
      }
      
      // Extract from the start of the array to the end of the response
      const partialJson = decodedResponse.substring(arrayStart);
      console.log(`${source}: Partial JSON from position ${arrayStart}: ${partialJson.substring(0, 200)}...`);
      
      // Try to find complete objects by looking for balanced braces
      let braceCount = 0;
      let lastCompleteObject = 0;
      
      for (let i = 0; i < partialJson.length; i++) {
        if (partialJson[i] === '{') braceCount++;
        if (partialJson[i] === '}') {
          braceCount--;
          if (braceCount === 0) {
            lastCompleteObject = i + 1;
          }
        }
      }
      
      // If we found complete objects, extract them and close the array
      if (lastCompleteObject > 0) {
        const completeJson = partialJson.substring(0, lastCompleteObject) + ']';
        console.warn(`${source}: Response was truncated, extracted ${lastCompleteObject} characters of JSON`);
        console.log(`${source}: Extracted JSON preview: ${completeJson.substring(0, 200)}...`);
        
        // Validate the extracted JSON before using it
        try {
          JSON.parse(completeJson);
          jsonMatch = [completeJson];
        } catch (validationError) {
          console.error(`${source}: JSON validation failed:`, validationError.message);
          console.log(`${source}: Failed JSON:`, completeJson.substring(0, 500) + '...');
          console.warn(`${source}: Extracted JSON is invalid, trying to find last valid object`);
          
          // Find the last complete object by looking for the last complete property
          let lastValidPosition = 0;
          
          // Look for the last complete object by finding the last "}" that has a matching "{"
          for (let i = partialJson.length - 1; i >= 0; i--) {
            if (partialJson[i] === '}') {
              // Find the matching opening brace
              let tempBraceCount = 1;
              let objectStart = -1;
              
              for (let j = i - 1; j >= 0; j--) {
                if (partialJson[j] === '}') tempBraceCount++;
                if (partialJson[j] === '{') {
                  tempBraceCount--;
                  if (tempBraceCount === 0) {
                    objectStart = j;
                    break;
                  }
                }
              }
              
              if (objectStart !== -1) {
                const objectJson = partialJson.substring(objectStart, i + 1);
                try {
                  JSON.parse(objectJson);
                  lastValidPosition = i + 1;
                  break;
                } catch (e) {
                  // This object is invalid, continue
                }
              }
            }
          }
          
          if (lastValidPosition > 0) {
            const validJson = partialJson.substring(0, lastValidPosition) + ']';
            console.warn(`${source}: Found last valid object at position ${lastValidPosition}`);
            jsonMatch = [validJson];
          } else {
            // Last resort: try to extract individual valid objects
            console.warn(`${source}: Attempting to extract individual valid objects`);
            
            const validObjects = [];
            let currentObject = '';
            let braceCount = 0;
            let inString = false;
            let escapeNext = false;
            
            for (let i = 0; i < partialJson.length; i++) {
              const char = partialJson[i];
              
              if (escapeNext) {
                escapeNext = false;
                currentObject += char;
                continue;
              }
              
              if (char === '\\') {
                escapeNext = true;
                currentObject += char;
                continue;
              }
              
              if (char === '"' && !escapeNext) {
                inString = !inString;
                currentObject += char;
                continue;
              }
              
              if (!inString) {
                if (char === '{') {
                  if (braceCount === 0) {
                    currentObject = char;
                  } else {
                    currentObject += char;
                  }
                  braceCount++;
                } else if (char === '}') {
                  currentObject += char;
                  braceCount--;
                  
                  if (braceCount === 0) {
                    // Try to parse this object
                    try {
                      JSON.parse(currentObject);
                      validObjects.push(currentObject);
                      currentObject = '';
                    } catch (e) {
                      // Object is invalid, skip it
                      currentObject = '';
                    }
                  }
                } else {
                  currentObject += char;
                }
              } else {
                currentObject += char;
              }
            }
            
            if (validObjects.length > 0) {
              const reconstructedJson = '[' + validObjects.join(',') + ']';
              console.warn(`${source}: Reconstructed JSON from ${validObjects.length} valid objects`);
              console.log(`${source}: First object:`, validObjects[0].substring(0, 200) + '...');
              console.log(`${source}: Last object:`, validObjects[validObjects.length - 1].substring(0, 200) + '...');
              
              // Validate the reconstructed JSON
              try {
                JSON.parse(reconstructedJson);
                jsonMatch = [reconstructedJson];
              } catch (finalError) {
                console.error(`${source}: Final JSON validation failed:`, finalError.message);
                throw new Error(`Could not reconstruct valid JSON from truncated response. Extracted ${validObjects.length} objects but final JSON is invalid.`);
              }
            } else {
              throw new Error('Could not extract valid JSON from truncated response');
            }
          }
        }
      } else {
        throw new Error('No complete JSON objects found in truncated response');
      }
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error(`${source}: JSON parse error:`, parseError);
      console.error(`${source}: Attempted to parse:`, jsonMatch[0]);
      throw new Error(`Invalid JSON in response: ${parseError.message}`);
    }
    if (!Array.isArray(parsed)) {
      throw new Error('Response is not an array');
    }

    // Handle cases where AI returns fewer results than expected
    if (parsed.length < expectedCount) {
      console.warn(`${source}: Expected ${expectedCount} items, got ${parsed.length}. Padding with default results.`);
      
      // Create default results for missing items
      const paddedResults = [];
      for (let i = 0; i < expectedCount; i++) {
        const existingResult = parsed[i];
        if (existingResult) {
          paddedResults.push({
            index: existingResult.index || i + 1,
            concerning: Boolean(existingResult.concerning),
            identifiable: Boolean(existingResult.identifiable),
            reasoning: String(existingResult.reasoning || 'No reasoning provided')
          });
        } else {
          // Add default result for missing item
          paddedResults.push({
            index: i + 1,
            concerning: false,
            identifiable: false,
            reasoning: `No analysis provided by ${source} for this comment`
          });
        }
      }
      return paddedResults;
    }

    if (parsed.length > expectedCount) {
      console.warn(`${source}: Expected ${expectedCount} items, got ${parsed.length}. Truncating to expected count.`);
      parsed = parsed.slice(0, expectedCount);
    }

    return parsed.map((item, i) => ({
      index: item.index || i + 1,
      concerning: Boolean(item.concerning),
      identifiable: Boolean(item.identifiable),
      reasoning: String(item.reasoning || 'No reasoning provided')
    }));
  } catch (error) {
    console.error(`Failed to parse ${source} results:`, error);
    console.error(`Raw ${source} response:`, response);
    throw new Error(`Failed to parse ${source} results: ${error.message}`);
  }
}

async function callAI(provider: string, model: string, prompt: string, input: string, responseType: string, userId: string, scanRunId: string, phase: string, aiLogger?: AILogger) {
  const payload = {
    model: model, // Add the model parameter for OpenAI
    messages: [
      { role: 'system', content: prompt },
      { role: 'user', content: input }
    ],
    temperature: 0,
    max_tokens: 8192  // Increased from 4096 to handle larger responses
  };

  // Log the AI request if logger is provided
  if (aiLogger) {
    await aiLogger.logRequest({
      userId,
      scanRunId,
      functionName: 'scan-comments',
      provider,
      model,
      requestType: responseType,
      phase,
      requestPrompt: prompt,
      requestInput: input,
      requestTemperature: 0,
      requestMaxTokens: 8192
    });
  }

  if (provider === 'azure') {
    const response = await fetch(`${Deno.env.get('AZURE_OPENAI_ENDPOINT')}/openai/deployments/${model}/chat/completions?api-version=2024-02-15-preview`, {
      method: 'POST',
      headers: {
        'api-key': Deno.env.get('AZURE_OPENAI_API_KEY') || '',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorMessage = `Azure OpenAI API error: ${response.status} ${response.statusText}`;
      // Log the error response
      if (aiLogger) {
        await aiLogger.logResponse(userId, scanRunId, 'scan-comments', provider, model, responseType, phase, '', errorMessage);
      }
      throw new Error(errorMessage);
    }

    const result = await response.json();
    const responseText = result.choices[0]?.message?.content || '';
    console.log(`[AZURE] Response length: ${responseText.length} characters`);
    if (responseText.length > 8000) {
      console.warn(`[AZURE] Response is very long (${responseText.length} chars), may be approaching token limits`);
    }
    
    // Log the AI response
    if (aiLogger) {
      await aiLogger.logResponse(userId, scanRunId, 'scan-comments', provider, model, responseType, phase, responseText);
    }
    
    return responseText;
  } else if (provider === 'openai') {
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    console.log(`[OPENAI] API Key: ${openaiApiKey ? '***' + openaiApiKey.slice(-4) : 'NOT SET'}`);
    console.log(`[OPENAI] Request payload:`, JSON.stringify(payload, null, 2));
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });

    console.log(`[OPENAI] Response status: ${response.status} ${response.statusText}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[OPENAI] Error response:`, errorText);
      const errorMessage = `OpenAI API error: ${response.status} ${response.statusText}`;
      // Log the error response
      if (aiLogger) {
        await aiLogger.logResponse(userId, scanRunId, 'scan-comments', provider, model, responseType, phase, '', errorMessage);
      }
      throw new Error(errorMessage);
    }

    const result = await response.json();
    const responseText = result.choices[0]?.message?.content || '';
    console.log(`[OPENAI] Response length: ${responseText.length} characters`);
    if (responseText.length > 8000) {
      console.warn(`[OPENAI] Response is very long (${responseText.length} chars), may be approaching token limits`);
    }
    
    // Log the AI response
    if (aiLogger) {
      await aiLogger.logResponse(userId, scanRunId, 'scan-comments', provider, model, responseType, phase, responseText);
    }
    
    return responseText;
  } else if (provider === 'bedrock') {
    // AWS Bedrock implementation
    const region = Deno.env.get('AWS_REGION') || 'us-east-1';
    const accessKeyId = Deno.env.get('AWS_ACCESS_KEY_ID');
    const secretAccessKey = Deno.env.get('AWS_SECRET_ACCESS_KEY');
    
    console.log(`[BEDROCK] AWS Region: ${region}`);
    console.log(`[BEDROCK] Access Key ID: ${accessKeyId ? '***' + accessKeyId.slice(-4) : 'NOT SET'}`);
    console.log(`[BEDROCK] Secret Access Key: ${secretAccessKey ? '***' + secretAccessKey.slice(-4) : 'NOT SET'}`);
    
    if (!accessKeyId || !secretAccessKey) {
      throw new Error('AWS credentials not configured');
    }

    // Extract model identifier from provider:model format
    const modelId = model.includes('/') ? model.split('/')[1] : model;
    
    // Create AWS signature v4
    const host = `bedrock-runtime.${region}.amazonaws.com`;
    const endpoint = `https://${host}/model/${encodeURIComponent(modelId)}/invoke`;
    
    console.log(`[BEDROCK] Original model string: ${model}`);
    console.log(`[BEDROCK] Extracted model ID: ${modelId}`);
    console.log(`[BEDROCK] Encoded model ID: ${encodeURIComponent(modelId)}`);
    console.log(`[BEDROCK] Using model: ${modelId}, region: ${region}, endpoint: ${endpoint}`);
    
    // For Anthropic Claude models in Bedrock, system message should be top-level, not in messages array
    const systemMessage = payload.messages.find(msg => msg.role === 'system')?.content || '';
    const userMessage = payload.messages.find(msg => msg.role === 'user')?.content || '';
    
    const bedrockPayload = {
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 4096,  // Claude 3 Haiku maximum
      system: systemMessage,
      messages: [
        {
          role: 'user',
          content: userMessage
        }
      ],
      temperature: payload.temperature
    };

    const date = new Date();
    const amzDate = date.toISOString().replace(/[:\-]|\.\d{3}/g, '');
    
    console.log(`[BEDROCK] Request timestamp: ${date.toISOString()}, AMZ date: ${amzDate}`);
    
    console.log(`[BEDROCK] Request payload:`, JSON.stringify(bedrockPayload, null, 2));
    
    // Create signature using raw endpoint (without encoding) for canonical request
    const rawEndpoint = `https://${host}/model/${modelId}/invoke`;
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Host': host,
        'X-Amz-Date': amzDate,
        'Authorization': await createAWSSignature(
          'POST',
          rawEndpoint, // Use raw endpoint for signature calculation
          JSON.stringify(bedrockPayload),
          accessKeyId,
          secretAccessKey,
          region,
          amzDate
        ),
      },
      body: JSON.stringify(bedrockPayload)
    });

    console.log(`[BEDROCK] Response status: ${response.status} ${response.statusText}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[BEDROCK] Error response:`, errorText);
      const errorMessage = `Bedrock API error: ${response.status} ${response.statusText}`;
      // Log the error response
      if (aiLogger) {
        await aiLogger.logResponse(userId, scanRunId, 'scan-comments', provider, model, responseType, phase, '', errorMessage);
      }
      throw new Error(errorMessage);
    }

    const result = await response.json();
    const responseText = result.content[0]?.text || '';
    console.log(`[BEDROCK] Response length: ${responseText.length} characters`);
    if (responseText.length > 8000) {
      console.warn(`[BEDROCK] Response is very long (${responseText.length} chars), may be approaching token limits`);
    }
    
    // Log the AI response
    if (aiLogger) {
      await aiLogger.logResponse(userId, scanRunId, 'scan-comments', provider, model, responseType, phase, responseText);
    }
    
    return responseText;
      } else {
    throw new Error(`Unsupported provider: ${provider}`);
  }
  }

// AWS Signature V4 implementation for Bedrock
async function createAWSSignature(
  method: string,
  url: string,
  body: string,
  accessKeyId: string,
  secretAccessKey: string,
  region: string,
  amzDate: string
): Promise<string> {
  const { hostname, pathname, search } = new URL(url);
  const dateStamp = amzDate.substring(0, 8);
  
  // For Bedrock, AWS expects the path to have double-encoded colons (%253A instead of %3A or :)
  // This is specific to how Bedrock handles model names with colons
  const canonicalPath = pathname.replace(/:/g, '%3A').replace(/%3A/g, '%253A');
  
  // Create canonical request
  const canonicalHeaders = `content-type:application/json\nhost:${hostname}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = 'content-type;host;x-amz-date';
  const payloadHash = await sha256(body);
  const canonicalRequest = `${method}\n${canonicalPath}${search}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
  
  console.log(`[SIGNATURE] Canonical request:`, canonicalRequest);
  
  // Create string to sign
  const algorithm = 'AWS4-HMAC-SHA256';
  const credentialScope = `${dateStamp}/${region}/bedrock/aws4_request`;
  const stringToSign = `${algorithm}\n${amzDate}\n${credentialScope}\n${await sha256(canonicalRequest)}`;
  
  console.log(`[SIGNATURE] String to sign:`, stringToSign);
  
  // Calculate signature
  const kDate = await hmacSha256(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, 'bedrock');
  const kSigning = await hmacSha256(kService, 'aws4_request');
  const signature = await hmacSha256(kSigning, stringToSign);
  
  // Create authorization header
  const authorization = `${algorithm} Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${arrayBufferToHex(signature)}`;
  
  console.log(`[SIGNATURE] Authorization header:`, authorization);
  
  return authorization;
}

async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  return arrayBufferToHex(hashBuffer);
}

async function hmacSha256(key: string | ArrayBuffer, message: string): Promise<ArrayBuffer> {
  let keyBuffer: ArrayBuffer;
  if (typeof key === 'string') {
    keyBuffer = new TextEncoder().encode(key);
  } else {
    keyBuffer = key;
  }
  
  const msgBuffer = new TextEncoder().encode(message);
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return await crypto.subtle.sign('HMAC', cryptoKey, msgBuffer);
}

function arrayBufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

