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
      throw new Error('Comments array is required');
    }

    console.log(`Starting scan for ${comments.length} comments in ${defaultMode} mode`);

    // Return immediate response with processed results
    const processedComments = await processCommentsSync(comments, defaultMode);

    // Calculate summary
    const summary = {
      total: comments.length,
      concerning: processedComments.filter(c => c.concerning).length,
      identifiable: processedComments.filter(c => c.identifiable).length,
      rephrased: processedComments.filter(c => c.text !== c.originalText).length
    };

    console.log(`Processing complete. Summary:`, summary);

    return new Response(JSON.stringify({
      success: true,
      message: `Successfully processed ${comments.length} comments`,
      comments: processedComments,
      summary: summary,
      debugInfo: {
        timestamp: new Date().toISOString(),
        mode: defaultMode,
        batchSize: 5,
        fallbackUsed: processedComments.some(c => c.aiResponse?.includes('heuristic'))
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error in scan-comments function:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

// Process comments synchronously with improved error handling
async function processCommentsSync(comments: any[], defaultMode: string): Promise<any[]> {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  const { data: configs, error: configError } = await supabase
    .from('ai_configurations')
    .select('*')
    .in('scanner_type', ['scan_a', 'scan_b', 'adjudicator']);

  if (configError || !configs?.length) {
    console.error('No AI configurations found, falling back to heuristics');
    return processWithHeuristics(comments, defaultMode);
  }

  // Process in small batches to avoid timeout
  const BATCH_SIZE = 5; // Very small batch size
  const processedComments = [...comments];

  // Preserve original text for comparison
  processedComments.forEach(comment => {
    if (!comment.originalText) {
      comment.originalText = comment.text;
    }
  });

  for (let i = 0; i < comments.length; i += BATCH_SIZE) {
    const batch = processedComments.slice(i, i + BATCH_SIZE);
    console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(comments.length / BATCH_SIZE)} with ${batch.length} comments`);

    try {
      await processBatch(batch, configs, defaultMode, i);
      console.log(`Batch ${Math.floor(i / BATCH_SIZE) + 1} completed successfully`);
    } catch (error) {
      console.error(`Batch ${Math.floor(i / BATCH_SIZE) + 1} failed:`, error);
      // Fall back to heuristics for this batch
      const heuristicResults = processWithHeuristics(batch, defaultMode);
      heuristicResults.forEach((comment, idx) => {
        Object.assign(batch[idx], comment);
      });
    }
  }

  return processedComments;
}

// Process a single batch of comments
async function processBatch(batch: any[], configs: any[], defaultMode: string, batchStartIndex: number): Promise<void> {
  const concerningConfig = configs.find(c => c.scanner_type === 'scan_a');
  const identifiableConfig = configs.find(c => c.scanner_type === 'scan_b');
  const redactionConfig = configs.find(c => c.scanner_type === 'adjudicator');

  if (!concerningConfig || !identifiableConfig) {
    throw new Error('Missing required scanner configurations. Please configure both scan_a and scan_b scanners.');
  }

  // Analyze for concerning content
  try {
    console.log(`Analyzing ${batch.length} comments for concerning content...`);
    const concerningResults = await analyzeForConcerning(batch, concerningConfig);
    applyResults(batch, concerningResults, 'concerning');
    console.log(`Concerning analysis complete. Found ${batch.filter(c => c.concerning).length} concerning comments`);
  } catch (error) {
    console.error('Concerning analysis failed:', error);
    // Apply heuristic fallback for concerning
    batch.forEach(comment => {
      comment.concerning = checkConcerningHeuristic(comment.text);
      comment.debugInfo = { ...comment.debugInfo, concerningMethod: 'heuristic', concerningError: error.message };
    });
  }

  // Analyze for identifiable information
  try {
    console.log(`Analyzing ${batch.length} comments for identifiable information...`);
    const identifiableResults = await analyzeForIdentifiable(batch, identifiableConfig);
    applyResults(batch, identifiableResults, 'identifiable');
    console.log(`Identifiable analysis complete. Found ${batch.filter(c => c.identifiable).length} identifiable comments`);
  } catch (error) {
    console.error('Identifiable analysis failed:', error);
    // Apply heuristic fallback for identifiable
    batch.forEach(comment => {
      comment.identifiable = checkIdentifiableHeuristic(comment.text);
      comment.debugInfo = { ...comment.debugInfo, identifiableMethod: 'heuristic', identifiableError: error.message };
    });
  }

  // Generate redacted and rephrased versions for flagged comments
  const flaggedComments = batch.filter(c => c.concerning || c.identifiable);
  
  if (flaggedComments.length > 0 && redactionConfig) {
    try {
      console.log(`Generating redacted versions for ${flaggedComments.length} flagged comments...`);
      const redactedTexts = await performRedaction(flaggedComments, redactionConfig, 'redact');
      flaggedComments.forEach((comment, idx) => {
        if (redactedTexts[idx] && typeof redactedTexts[idx] === 'string') {
          comment.redactedText = redactedTexts[idx];
          console.log(`Generated redacted version for comment ${comment.id || idx}`);
        }
      });

      console.log(`Generating rephrased versions for ${flaggedComments.length} flagged comments...`);
      const rephrasedTexts = await performRedaction(flaggedComments, redactionConfig, 'rephrase');
      flaggedComments.forEach((comment, idx) => {
        if (rephrasedTexts[idx] && typeof rephrasedTexts[idx] === 'string') {
          comment.rephrasedText = rephrasedTexts[idx];
          console.log(`Generated rephrased version for comment ${comment.id || idx}`);
        }
      });
      
    } catch (error) {
      console.error('AI redaction/rephrasing failed, using simple redaction:', error);
      // Apply simple redaction fallback
      flaggedComments.forEach(comment => {
        comment.redactedText = applySimpleRedaction(comment.originalText || comment.text);
        comment.rephrasedText = applySimpleRedaction(comment.originalText || comment.text);
        comment.debugInfo = { ...comment.debugInfo, rephrasedBy: 'heuristic', rephrasingError: error.message };
      });
    }
  }

  // Set the display text based on defaultMode
  batch.forEach(comment => {
    if (comment.concerning || comment.identifiable) {
      if (defaultMode === 'redact' && comment.redactedText) {
        comment.text = comment.redactedText;
        comment.mode = 'redact';
      } else if (defaultMode === 'rephrase' && comment.rephrasedText) {
        comment.text = comment.rephrasedText;
        comment.mode = 'rephrase';
      } else {
        comment.mode = 'revert';
      }
    } else {
      comment.mode = 'revert';
    }
    
    // Set AI reasoning for display
    if (comment.aiResponse) {
      comment.aiReasoning = comment.aiResponse;
    }
  });

  // Add debug info to all comments in batch
  batch.forEach((comment, idx) => {
    comment.debugInfo = {
      batchIndex: batchStartIndex + idx,
      processingTime: new Date().toISOString(),
      hasRedactedText: !!comment.redactedText,
      hasRephrasedText: !!comment.rephrasedText,
      finalMode: comment.mode,
      ...comment.debugInfo
    };
  });
}

// Analyze comments for concerning content
async function analyzeForConcerning(comments: any[], config: any): Promise<any[]> {
  const prompt = `${config.analysis_prompt}\n\nComments to analyze:\n${comments.map((c, idx) => `${idx + 1}. ${c.text}`).join('\n')}`;
  const result = await callAIModel(config, prompt);
  return parseAIResponse(result, comments.length);
}

// Analyze comments for identifiable information
async function analyzeForIdentifiable(comments: any[], config: any): Promise<any[]> {
  const prompt = `${config.analysis_prompt}\n\nComments to analyze:\n${comments.map((c, idx) => `${idx + 1}. ${c.text}`).join('\n')}`;
  const result = await callAIModel(config, prompt);
  return parseAIResponse(result, comments.length);
}

// Perform redaction on comments
async function performRedaction(comments: any[], config: any, mode: 'redact' | 'rephrase' = 'rephrase'): Promise<string[]> {
  const texts = comments.map(c => c.originalText || c.text);
  
  let prompt: string;
  if (mode === 'redact') {
    prompt = `${config.redact_prompt}\n\n${JSON.stringify(texts)}`;
  } else {
    prompt = `${config.rephrase_prompt}\n\n${JSON.stringify(texts)}`;
  }
  
  console.log(`Calling ${config.provider}:${config.model} for ${mode} of ${texts.length} comments`);
  const result = await callAIModel(config, prompt);
  
  // Parse the result as an array of strings
  const parsed = parseAIResponse(result, texts.length);
  
  // Extract just the text if we got objects, otherwise use as-is
  if (Array.isArray(parsed)) {
    return parsed.map(item => typeof item === 'string' ? item : (item.text || item.rephrased || item.redacted || texts[parsed.indexOf(item)]));
  }
  
  console.warn(`${mode} result was not an array, using original texts`);
  return texts; // Fallback to original if parsing fails completely
}

// Build prompt for concerning content analysis
function buildConcerningPrompt(comments: any[], systemPrompt: string): string {
  const commentsList = comments.map((c, idx) => `${idx + 1}. ${c.text}`).join('\n');
  return `${systemPrompt}\n\nAnalyze the following list of comments. For each comment, determine: 1) Concerning content (harassment, threats, illegal activity, safety violations) 2) Personally identifiable information (names, employee IDs, contact info, specific locations). Return a parallel list of JSON objects in the exact same order: [{"concerning": boolean, "identifiable": boolean, "reasoning": "explanation"}, {"concerning": boolean, "identifiable": boolean, "reasoning": "explanation"}, ...]\n\nComments to analyze:\n${commentsList}`;
}

// Build prompt for identifiable information analysis
function buildIdentifiablePrompt(comments: any[], systemPrompt: string): string {
  return buildConcerningPrompt(comments, systemPrompt); // Same prompt for now
}

// Call AI model with rate limiting
async function callAIModel(config: any, prompt: string): Promise<any> {
  const startTime = Date.now();
  
  try {
    if (config.provider === 'openai') {
      return await callOpenAI(config, prompt);
    } else if (config.provider === 'bedrock') {
      return await callBedrock(config, prompt);
    } else {
      throw new Error(`Unsupported provider: ${config.provider}`);
    }
  } catch (error) {
    console.error(`AI call failed after ${Date.now() - startTime}ms:`, error);
    throw error;
  }
}

// Call OpenAI API
async function callOpenAI(config: any, prompt: string): Promise<any> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: config.max_tokens || 1000,
      temperature: config.temperature || 0.1,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

// Call Bedrock API
async function callBedrock(config: any, prompt: string): Promise<any> {
  const region = Deno.env.get('AWS_REGION') || 'us-east-1';
  const modelId = config.model;
  
  const body = JSON.stringify({
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: config.max_tokens || 1000,
    temperature: config.temperature || 0.1,
    messages: [{ role: "user", content: prompt }]
  });

  const url = `https://bedrock-runtime.${region}.amazonaws.com/model/${modelId}/invoke`;
  
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': await createAwsSignature(url, body, region),
      'X-Amz-Date': timestamp,
      'Host': new URL(url).host,
    },
    body: body,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Bedrock API error: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return data.content[0].text;
}

// Create AWS signature for Bedrock
async function createAwsSignature(url: string, body: string, region: string): Promise<string> {
  const accessKey = Deno.env.get('AWS_ACCESS_KEY_ID');
  const secretKey = Deno.env.get('AWS_SECRET_ACCESS_KEY');
  
  if (!accessKey || !secretKey) {
    throw new Error('AWS credentials missing');
  }

  // AWS v4 signing implementation
  const now = new Date();
  const dateString = now.toISOString().split('T')[0].replace(/-/g, '');
  const timestampString = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  
  const service = 'bedrock';
  const algorithm = 'AWS4-HMAC-SHA256';
  const credentialScope = `${dateString}/${region}/${service}/aws4_request`;
  
  // Create canonical request
  const urlParts = new URL(url);
  const canonicalUri = urlParts.pathname;
  const canonicalQueryString = '';
  const canonicalHeaders = `host:${urlParts.host}\nx-amz-date:${timestampString}\n`;
  const signedHeaders = 'host;x-amz-date';
  
  // Hash the payload
  const payloadHash = await sha256(body);
  
  const canonicalRequest = [
    'POST',
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash
  ].join('\n');
  
  // Create string to sign
  const canonicalRequestHash = await sha256(canonicalRequest);
  const stringToSign = [
    algorithm,
    timestampString,
    credentialScope,
    canonicalRequestHash
  ].join('\n');
  
  // Calculate signature
  const kDate = await hmacSha256(`AWS4${secretKey}`, dateString);
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, service);
  const kSigning = await hmacSha256(kService, 'aws4_request');
  const signature = await hmacSha256(kSigning, stringToSign);
  
  const signatureHex = Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  
  return `${algorithm} Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signatureHex}`;
}

// Utility functions for AWS signing
async function sha256(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const buffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function hmacSha256(key: ArrayBuffer | string, data: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const keyBuffer = typeof key === 'string' ? encoder.encode(key) : key;
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(data));
}

// Parse AI response into structured format
function parseAIResponse(content: string, expectedLength: number): any[] {
  console.log(`Parsing AI response: ${content.substring(0, 200)}...`);
  
  // Clean up the content
  let cleaned = content.replace(/```json\s*/g, '').replace(/```/g, '').trim();
  
  // Remove common prose prefixes
  cleaned = cleaned.replace(/^Here is.*?:\s*/i, '');
  cleaned = cleaned.replace(/^The analysis.*?:\s*/i, '');
  cleaned = cleaned.replace(/^Analysis.*?:\s*/i, '');
  cleaned = cleaned.replace(/^Results.*?:\s*/i, '');
  cleaned = cleaned.trim();

  // Try to parse as JSON array
  if (cleaned.startsWith('[') && cleaned.endsWith(']')) {
    try {
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed) && parsed.length === expectedLength) {
        console.log(`Successfully parsed JSON array with ${parsed.length} items`);
        return parsed;
      }
    } catch (e) {
      console.log(`JSON parse failed: ${e.message}`);
    }
  }

  // Try to extract JSON array from prose
  const first = cleaned.indexOf('[');
  const last = cleaned.lastIndexOf(']');
  if (first !== -1 && last > first) {
    const candidate = cleaned.slice(first, last + 1);
    try {
      const parsed = JSON.parse(candidate);
      if (Array.isArray(parsed) && parsed.length === expectedLength) {
        console.log(`Successfully extracted JSON array with ${parsed.length} items`);
        return parsed;
      }
    } catch (e) {
      console.log(`Extracted JSON parse failed: ${e.message}`);
    }
  }

  // Fallback: create default objects
  console.log('Using fallback parsing');
  return Array.from({ length: expectedLength }, () => ({
    concerning: false,
    identifiable: false,
    reasoning: 'AI response parsing failed'
  }));
}

// Apply results to comments
function applyResults(comments: any[], results: any[], field: string): void {
  results.forEach((result, idx) => {
    if (idx < comments.length) {
      if (typeof result === 'boolean') {
        comments[idx][field] = result;
        comments[idx].debugInfo = { ...comments[idx].debugInfo, [`${field}Method`]: 'AI-boolean' };
      } else if (typeof result === 'object' && result !== null) {
        comments[idx][field] = Boolean(result[field]);
        if (result.reasoning) {
          comments[idx].aiResponse = result.reasoning;
        }
        comments[idx].debugInfo = { ...comments[idx].debugInfo, [`${field}Method`]: 'AI-detailed' };
      }
    }
  });
}

// Fallback processing with heuristics
function processWithHeuristics(comments: any[], defaultMode: string): any[] {
  console.log('Using heuristic processing as fallback');
  
  return comments.map(comment => {
    const concerning = checkConcerningHeuristic(comment.text);
    const identifiable = checkIdentifiableHeuristic(comment.text);
    
    const processed = {
      ...comment,
      concerning,
      identifiable,
      aiResponse: 'Processed using heuristic analysis (AI unavailable)',
      aiReasoning: 'Processed using heuristic analysis (AI unavailable)',
      debugInfo: {
        processingMethod: 'heuristic',
        fallbackReason: 'AI analysis failed'
      }
    };

    // Generate redacted and rephrased versions for flagged comments
    if (concerning || identifiable) {
      processed.redactedText = applySimpleRedaction(processed.originalText || processed.text);
      processed.rephrasedText = applySimpleRedaction(processed.originalText || processed.text);
      
      // Set display text based on mode
      if (defaultMode === 'redact') {
        processed.text = processed.redactedText;
        processed.mode = 'redact';
      } else if (defaultMode === 'rephrase') {
        processed.text = processed.rephrasedText;
        processed.mode = 'rephrase';
      } else {
        processed.mode = 'revert';
      }
      
      processed.debugInfo.rephrasedBy = 'heuristic';
    } else {
      processed.mode = 'revert';
    }

    return processed;
  });
}

// Heuristic check for concerning content
function checkConcerningHeuristic(text: string): boolean {
  const concerningPatterns = [
    /threat|harm|hurt|kill|violence/i,
    /harassment|abuse|discrimination/i,
    /illegal|drug|weapon/i,
    /unsafe|danger|risk/i,
    /make.*life.*hell/i,
    /going to get hurt/i
  ];
  
  return concerningPatterns.some(pattern => pattern.test(text));
}

// Heuristic check for identifiable information
function checkIdentifiableHeuristic(text: string): boolean {
  const identifiablePatterns = [
    /\b[A-Z][a-z]+ [A-Z][a-z]+\b/, // Full names
    /\b\d{3}-\d{2}-\d{4}\b/, // SSN
    /\b\d{3}-\d{3}-\d{4}\b/, // Phone numbers
    /employee id|badge|#\d+/i,
    /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/ // Email
  ];
  
  return identifiablePatterns.some(pattern => pattern.test(text));
}

// Simple redaction for fallback
function applySimpleRedaction(text: string): string {
  return text
    .replace(/\b[A-Z][a-z]+ [A-Z][a-z]+\b/g, '[NAME REDACTED]')
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN REDACTED]')
    .replace(/\b\d{3}-\d{3}-\d{4}\b/g, '[PHONE REDACTED]')
    .replace(/employee id|badge #?\d+/gi, '[ID REDACTED]')
    .replace(/\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g, '[EMAIL REDACTED]');
}