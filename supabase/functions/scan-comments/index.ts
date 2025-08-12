import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { comments, defaultMode = 'redact' } = await req.json();
    
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
      if (provider === 'bedrock') {
        if (!Deno.env.get('AWS_ACCESS_KEY_ID') || !Deno.env.get('AWS_SECRET_ACCESS_KEY') || !Deno.env.get('AWS_REGION')) {
          throw new Error('AWS credentials are required for Bedrock');
        }
      }
    }

    const scannedComments = [];
    let summary = { total: comments.length, concerning: 0, identifiable: 0, needsAdjudication: 0 };

    // Rate limiting setup
    const rateLimiters = new Map();
    configs.forEach(config => {
      rateLimiters.set(config.scanner_type, {
        rpmLimit: config.rpm_limit || 10, // Default to 10 RPM if not set
        tpmLimit: config.tpm_limit || 50000, // Default to 50k TPM if not set
        requestsThisMinute: 0,
        tokensThisMinute: 0,
        lastMinuteReset: Date.now(),
        pendingRequests: []
      });
    });

    // Calculate batch size based on strictest rate limits
    const minRpm = Math.min(...configs.map(c => c.rpm_limit || 10));
    const BATCH_SIZE = Math.min(20, Math.max(1, Math.floor(minRpm / 3))); // Conservative batch size
    const BATCH_DELAY = Math.max(3000, Math.ceil(60000 / minRpm)); // Ensure we don't exceed RPM

    for (let i = 0; i < comments.length; i += BATCH_SIZE) {
      const batch = comments.slice(i, i + BATCH_SIZE);
      console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(comments.length / BATCH_SIZE)} (comments ${i + 1}-${Math.min(i + BATCH_SIZE, comments.length)})`);

      try {
        // Prepare batch input for AI models
        const batchTexts = batch.map(comment => comment.text);
        const batchInput = `Comments to analyze:\n${batchTexts.map((text, idx) => `${idx + 1}. ${text}`).join('\n')}`;

        console.log(`Sending ${batch.length} comments to AI models for batch analysis`);

        // Run Scan A and Scan B in parallel on the entire batch
        let scanAResults, scanBResults;
        try {
          [scanAResults, scanBResults] = await Promise.all([
            callAI(scanA.provider, scanA.model, scanA.analysis_prompt, batchInput, 'batch_analysis', 'scan_a', rateLimiters).catch(e => {
              console.error(`Scan A failed for batch ${Math.floor(i / BATCH_SIZE) + 1}:`, e);
              throw new Error(`Scan A (${scanA.provider}/${scanA.model}) failed: ${e.message}`);
            }),
            callAI(scanB.provider, scanB.model, scanB.analysis_prompt, batchInput, 'batch_analysis', 'scan_b', rateLimiters).catch(e => {
              console.error(`Scan B failed for batch ${Math.floor(i / BATCH_SIZE) + 1}:`, e);
              throw new Error(`Scan B (${scanB.provider}/${scanB.model}) failed: ${e.message}`);
            })
          ]);
        } catch (error) {
          console.error(`Parallel batch scanning failed for batch ${Math.floor(i / BATCH_SIZE) + 1}:`, error);
          throw error;
        }

        console.log(`Received scanA results:`, typeof scanAResults, Array.isArray(scanAResults) ? scanAResults.length : 'not array');
        console.log(`Received scanB results:`, typeof scanBResults, Array.isArray(scanBResults) ? scanBResults.length : 'not array');

        // Ensure we have results for all comments in the batch
        if (!Array.isArray(scanAResults) || !Array.isArray(scanBResults) || 
            scanAResults.length !== batch.length || scanBResults.length !== batch.length) {
          
          console.warn(`Invalid batch results - falling back to individual processing for batch ${Math.floor(i / BATCH_SIZE) + 1}`);
          
          // Fallback to individual processing
          for (let j = 0; j < batch.length; j++) {
            const comment = batch[j];
            console.log(`Processing comment ${comment.id} individually...`);

            try {
              const [scanAResult, scanBResult] = await Promise.all([
                callAI(scanA.provider, scanA.model, scanA.analysis_prompt.replace('list of comments', 'comment').replace('parallel list of JSON objects', 'single JSON object'), comment.text, 'analysis', 'scan_a', rateLimiters),
                callAI(scanB.provider, scanB.model, scanB.analysis_prompt.replace('list of comments', 'comment').replace('parallel list of JSON objects', 'single JSON object'), comment.text, 'analysis', 'scan_b', rateLimiters)
              ]);

              await processIndividualComment(comment, scanAResult, scanBResult, scanA, adjudicator, defaultMode, summary, scannedComments, rateLimiters);
            } catch (error) {
              console.error(`Individual processing failed for comment ${comment.id}:`, error);
              scannedComments.push({
                ...comment,
                concerning: false,
                identifiable: false,
                aiReasoning: `Error processing: ${error.message}`,
                mode: 'original',
                approved: false,
                hideAiResponse: false,
                debugInfo: { error: error.message }
              });
            }
          }
          continue; // Skip to next batch
        }

        // Process each comment in the batch
        for (let j = 0; j < batch.length; j++) {
          const comment = batch[j];
          const scanAResult = scanAResults[j];
          const scanBResult = scanBResults[j];

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
              adjudicationResult = await callAI(
                adjudicator.provider, 
                adjudicator.model, 
                adjudicatorPrompt, 
                '', 
                'analysis',
                'adjudicator',
                rateLimiters
              );
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
          const processedComment = {
            ...comment,
            concerning: finalResult.concerning,
            identifiable: finalResult.identifiable,
            aiReasoning: finalResult.reasoning,
            redactedText: null,
            rephrasedText: null,
            mode: finalResult.concerning || finalResult.identifiable ? defaultMode : 'original',
            approved: false,
            hideAiResponse: false,
            debugInfo: {
              scanAResult,
              scanBResult,
              adjudicationResult,
              needsAdjudication,
              finalDecision: finalResult
            }
          };

          scannedComments.push(processedComment);
        }

        // Batch process redaction and rephrasing for flagged comments
        const flaggedComments = scannedComments.slice(-batch.length).filter(c => c.concerning || c.identifiable);
        if (flaggedComments.length > 0) {
          const flaggedTexts = flaggedComments.map(c => c.originalText || c.text);
          const activeConfig = scanA; // Use scan_a config for batch operations

          try {
            const [redactedTexts, rephrasedTexts] = await Promise.all([
              callAI(activeConfig.provider, activeConfig.model, activeConfig.redact_prompt, JSON.stringify(flaggedTexts), 'batch_text', 'scan_a', rateLimiters),
              callAI(activeConfig.provider, activeConfig.model, activeConfig.rephrase_prompt, JSON.stringify(flaggedTexts), 'batch_text', 'scan_a', rateLimiters)
            ]);

            // Apply redacted and rephrased texts
            let flaggedIndex = 0;
            for (let k = scannedComments.length - batch.length; k < scannedComments.length; k++) {
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
          } catch (error) {
            console.warn(`Batch redaction/rephrasing failed for batch ${Math.floor(i / BATCH_SIZE) + 1}:`, error);
            // Continue without redaction/rephrasing
          }
        }

      } catch (error) {
        console.error(`Error processing batch ${Math.floor(i / BATCH_SIZE) + 1}:`, error);
        // Include the original comments with error info
        for (const comment of batch) {
          scannedComments.push({
            ...comment,
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

      // Add delay between batches (except for the last batch)
      if (i + BATCH_SIZE < comments.length) {
        console.log(`Waiting ${BATCH_DELAY}ms before next batch...`);
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
      }
    }

    console.log(`Successfully scanned ${scannedComments.length} comments`);

    return new Response(JSON.stringify({ 
      comments: scannedComments,
      summary: {
        total: scannedComments.length,
        concerning: scannedComments.filter(c => c.concerning).length,
        identifiable: scannedComments.filter(c => c.identifiable).length
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in scan-comments function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
});

// Helper function to process individual comments
async function processIndividualComment(comment, scanAResult, scanBResult, scanA, adjudicator, defaultMode, summary, scannedComments, rateLimiters) {
  let finalResult = null;
  let adjudicationResult = null;
  let needsAdjudication = false;

  // Check if Scan A and Scan B results differ
  if (scanAResult.concerning !== scanBResult.concerning || 
      scanAResult.identifiable !== scanBResult.identifiable) {
    needsAdjudication = true;

    // Call adjudicator
    const adjudicatorPrompt = `${adjudicator.analysis_prompt.replace('these comments', 'this comment').replace('parallel list', 'single JSON object')}

Original comment: "${comment.text}"

Scan A Result: ${JSON.stringify(scanAResult)}
Scan B Result: ${JSON.stringify(scanBResult)}`;

    try {
      adjudicationResult = await callAI(
        adjudicator.provider, 
        adjudicator.model, 
        adjudicatorPrompt, 
        '', 
        'analysis',
        'adjudicator',
        rateLimiters
      );
    } catch (error) {
      console.error(`Adjudicator failed for comment ${comment.id}:`, error);
      throw new Error(`Adjudicator (${adjudicator.provider}/${adjudicator.model}) failed: ${error.message}`);
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
      scanAResult,
      scanBResult,
      adjudicationResult,
      needsAdjudication,
      finalDecision: finalResult
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

// Rate limiting helper function
async function enforceRateLimit(scannerType: string, estimatedTokens: number, rateLimiters) {
  const limiter = rateLimiters.get(scannerType);
  if (!limiter) return;

  const now = Date.now();
  
  // Reset counters if a minute has passed
  if (now - limiter.lastMinuteReset >= 60000) {
    limiter.requestsThisMinute = 0;
    limiter.tokensThisMinute = 0;
    limiter.lastMinuteReset = now;
  }

  // Check if we would exceed limits
  const wouldExceedRpm = limiter.requestsThisMinute >= limiter.rpmLimit;
  const wouldExceedTpm = limiter.tokensThisMinute + estimatedTokens > limiter.tpmLimit;

  if (wouldExceedRpm || wouldExceedTpm) {
    const timeToWait = 60000 - (now - limiter.lastMinuteReset);
    console.log(`Rate limit reached for ${scannerType}. Waiting ${Math.ceil(timeToWait / 1000)}s...`);
    await new Promise(resolve => setTimeout(resolve, timeToWait + 1000)); // Add 1s buffer
    
    // Reset after waiting
    limiter.requestsThisMinute = 0;
    limiter.tokensThisMinute = 0;
    limiter.lastMinuteReset = Date.now();
  }

  // Update counters
  limiter.requestsThisMinute++;
  limiter.tokensThisMinute += estimatedTokens;
}

// Helper function to estimate tokens (rough approximation: 1 token ≈ 4 characters)
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// Helper function to call AI services with rate limiting
async function callAI(provider: string, model: string, prompt: string, commentText: string, responseType: 'analysis' | 'text' | 'batch_analysis' | 'batch_text', scannerType?: string, rateLimiters?: Map<string, any>) {
  // Estimate tokens for this request
  const estimatedTokens = estimateTokens(prompt + commentText);
  
  // Enforce rate limits if scanner type is provided
  if (scannerType && rateLimiters) {
    await enforceRateLimit(scannerType, estimatedTokens, rateLimiters);
  }
    if (provider === 'openai') {
      return await callOpenAI(model, prompt, commentText, responseType);
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
        const parsed = JSON.parse(content);
        return parsed;
      } catch (parseError) {
        console.warn(`JSON parsing failed for ${responseType}:`, parseError, 'Content:', content);
        // Fallback parsing for single analysis
        if (responseType === 'analysis') {
          return {
            concerning: content.toLowerCase().includes('true') && content.toLowerCase().includes('concerning'),
            identifiable: content.toLowerCase().includes('true') && content.toLowerCase().includes('identifiable'),
            reasoning: content
          };
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
    }, 3, 1000);
  }

  // Retry function with exponential backoff
  async function retryWithBackoff<T>(fn: () => Promise<T>, maxRetries: number, baseDelay: number): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        
        // Check if it's a rate limit error
        if (error.message.includes('429') || error.message.includes('Too many requests')) {
          if (attempt < maxRetries) {
            const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1000; // Add jitter
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
  async function makeBedrockRequest(model: string, prompt: string, commentText: string, responseType: 'analysis' | 'text' | 'batch_analysis' | 'batch_text', awsAccessKey: string, awsSecretKey: string, awsRegion: string) {

    // Use AWS SDK v3 style endpoint for Bedrock
    const endpoint = `https://bedrock-runtime.${awsRegion}.amazonaws.com/model/${model}/invoke`;

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
        inputText: `${prompt}\n\n${commentText}`,
        textGenerationConfig: {
          maxTokenCount: 1000,
          temperature: 0.1,
        }
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
      content = data.results[0].outputText;
    }

    if (responseType === 'analysis' || responseType === 'batch_analysis') {
      try {
        const parsed = JSON.parse(content);
        return parsed;
      } catch (parseError) {
        console.warn(`JSON parsing failed for ${responseType}:`, parseError, 'Content:', content);
        // Fallback parsing for single analysis
        if (responseType === 'analysis') {
          return {
            concerning: content.toLowerCase().includes('true') && content.toLowerCase().includes('concerning'),
            identifiable: content.toLowerCase().includes('true') && content.toLowerCase().includes('identifiable'),
            reasoning: content
          };
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
});
