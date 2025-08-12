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

    return new Response(JSON.stringify({
      success: true,
      message: `Successfully processed ${comments.length} comments`,
      comments: processedComments,
      summary: {
        total: comments.length,
        concerning: processedComments.filter(c => c.concerning).length,
        identifiable: processedComments.filter(c => c.identifiable).length
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
    .in('scanner_type', ['concerning_scanner', 'identifiable_scanner', 'redaction_scanner']);

  if (configError || !configs?.length) {
    console.error('No AI configurations found, falling back to heuristics');
    return processWithHeuristics(comments, defaultMode);
  }

  // Process in small batches to avoid timeout
  const BATCH_SIZE = 5; // Very small batch size
  const processedComments = [...comments];

  for (let i = 0; i < comments.length; i += BATCH_SIZE) {
    const batch = comments.slice(i, i + BATCH_SIZE);
    console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(comments.length / BATCH_SIZE)}`);

    try {
      await processBatch(batch, configs, defaultMode, i);
      // Copy results back to main array
      batch.forEach((comment, idx) => {
        processedComments[i + idx] = comment;
      });
    } catch (error) {
      console.error(`Batch ${Math.floor(i / BATCH_SIZE) + 1} failed:`, error);
      // Fall back to heuristics for this batch
      const heuristicResults = processWithHeuristics(batch, defaultMode);
      heuristicResults.forEach((comment, idx) => {
        processedComments[i + idx] = comment;
      });
    }
  }

  return processedComments;
}

// Process a single batch of comments
async function processBatch(batch: any[], configs: any[], defaultMode: string, batchStartIndex: number): Promise<void> {
  const concerningConfig = configs.find(c => c.scanner_type === 'concerning_scanner');
  const identifiableConfig = configs.find(c => c.scanner_type === 'identifiable_scanner');
  const redactionConfig = configs.find(c => c.scanner_type === 'redaction_scanner');

  if (!concerningConfig || !identifiableConfig) {
    throw new Error('Missing scanner configurations');
  }

  // Analyze for concerning content
  try {
    const concerningResults = await analyzeForConcerning(batch, concerningConfig);
    applyResults(batch, concerningResults, 'concerning');
  } catch (error) {
    console.error('Concerning analysis failed:', error);
    // Apply heuristic fallback for concerning
    batch.forEach(comment => {
      comment.concerning = checkConcerningHeuristic(comment.text);
    });
  }

  // Analyze for identifiable information
  try {
    const identifiableResults = await analyzeForIdentifiable(batch, identifiableConfig);
    applyResults(batch, identifiableResults, 'identifiable');
  } catch (error) {
    console.error('Identifiable analysis failed:', error);
    // Apply heuristic fallback for identifiable
    batch.forEach(comment => {
      comment.identifiable = checkIdentifiableHeuristic(comment.text);
    });
  }

  // Apply redaction if needed
  if (defaultMode === 'redact' && redactionConfig) {
    const needsRedaction = batch.filter(c => c.identifiable);
    if (needsRedaction.length > 0) {
      try {
        const redactedTexts = await performRedaction(needsRedaction, redactionConfig);
        needsRedaction.forEach((comment, idx) => {
          if (redactedTexts[idx]) {
            comment.text = redactedTexts[idx];
          }
        });
      } catch (error) {
        console.error('Redaction failed:', error);
        // Apply simple redaction fallback
        needsRedaction.forEach(comment => {
          comment.text = applySimpleRedaction(comment.text);
        });
      }
    }
  }
}

// Analyze comments for concerning content
async function analyzeForConcerning(comments: any[], config: any): Promise<any[]> {
  const prompt = buildConcerningPrompt(comments, config.system_prompt);
  const result = await callAIModel(config, prompt);
  return parseAIResponse(result, comments.length);
}

// Analyze comments for identifiable information
async function analyzeForIdentifiable(comments: any[], config: any): Promise<any[]> {
  const prompt = buildIdentifiablePrompt(comments, config.system_prompt);
  const result = await callAIModel(config, prompt);
  return parseAIResponse(result, comments.length);
}

// Perform redaction on comments
async function performRedaction(comments: any[], config: any): Promise<string[]> {
  const texts = comments.map(c => c.text);
  const prompt = `Rephrase these comments to remove personally identifiable information while maintaining the original meaning, tone, and level of concern. Return a parallel list of rephrased comments in the exact same order as the input.\n\n${JSON.stringify(texts)}`;
  
  const result = await callAIModel(config, prompt);
  return Array.isArray(result) ? result : texts; // Fallback to original if parsing fails
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
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': await createAwsSignature(url, body, region),
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
  // Simplified AWS signature - in production you'd want a proper implementation
  const accessKey = Deno.env.get('AWS_ACCESS_KEY_ID');
  const secretKey = Deno.env.get('AWS_SECRET_ACCESS_KEY');
  
  if (!accessKey || !secretKey) {
    throw new Error('AWS credentials missing');
  }

  // For now, return a basic auth header - this needs proper AWS v4 signing
  return `AWS4-HMAC-SHA256 Credential=${accessKey}/${new Date().toISOString().split('T')[0]}/${region}/bedrock/aws4_request, SignedHeaders=host;x-amz-date, Signature=placeholder`;
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
      } else if (typeof result === 'object' && result !== null) {
        comments[idx][field] = Boolean(result[field]);
        if (result.reasoning) {
          comments[idx].aiResponse = result.reasoning;
        }
      }
    }
  });
}

// Fallback processing with heuristics
function processWithHeuristics(comments: any[], defaultMode: string): any[] {
  console.log('Using heuristic processing as fallback');
  
  return comments.map(comment => ({
    ...comment,
    concerning: checkConcerningHeuristic(comment.text),
    identifiable: checkIdentifiableHeuristic(comment.text),
    text: defaultMode === 'redact' && checkIdentifiableHeuristic(comment.text) 
      ? applySimpleRedaction(comment.text) 
      : comment.text,
    aiResponse: 'Processed using heuristic analysis (AI unavailable)'
  }));
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