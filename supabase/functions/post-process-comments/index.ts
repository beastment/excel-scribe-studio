import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { AILogger } from './ai-logger.ts';
import { calculateWaitTime, calculateRPMWaitTime, recordUsage, recordRequest, calculateOptimalBatchSize } from './tpm-tracker.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Constants and utility functions copied from the main scan function
const REDACTION_POLICY = `\nREDACTION POLICY:\n- Replace job level/grade indicators (e.g., "Level 5", "L5", "Band 3") with "XXXX".\n- Replace tenure/time-in-role statements (e.g., "3 years in role", "tenure") with "XXXX".`;

// Utility functions
function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
//

function getEffectiveMaxTokens(config: any): number {
  const explicit = config?.max_tokens;
  if (explicit && explicit > 0) return Math.floor(explicit);
  const provider = String(config?.provider || '').toLowerCase();
  const model = String(config?.model || '').toLowerCase();
  if (provider === 'bedrock') {
    if (model.includes('anthropic.claude')) return 4096;
    if (model.startsWith('mistral.')) return 4096;
    if (model.startsWith('amazon.titan')) return 1000;
  }
  if (provider === 'openai' || provider === 'azure') return 4096;
  return 1000;
}

// Default batch size for post-processing - will be dynamically calculated based on model limits
const DEFAULT_POST_PROCESS_BATCH_SIZE = 50;

const buildBatchTextPrompt = (basePrompt: string, expectedLen: number): string => {
  const sentinels = `BOUNDING AND ORDER RULES:\n- Each comment is delimited by explicit sentinels: <<<ITEM k>>> ... <<<END k>>>.\n- Treat EVERYTHING between these sentinels as ONE single comment, even if multi-paragraph or contains lists/headings.\n- Do NOT split or merge any comment segments.\nOUTPUT RULES:\n- Return ONLY a JSON array of ${expectedLen} strings, aligned to ids (1..${expectedLen}).\n- CRITICAL: Each string MUST BEGIN with the exact prefix <<<ITEM k>>> followed by a space, then the full text for k.\n- Do NOT output any headers such as "Rephrased comment:" or "Here are...".\n- Do NOT include any <<<END k>>> markers in the output.\n- Do NOT emit standalone array tokens like "[" or "]" as array items.\n- No prose, no code fences, no explanations before/after the JSON array.\n- IMPORTANT: The <<<ITEM k>>> prefix is ONLY for identification - do NOT include <<<END k>>> markers anywhere in your output.\n- ALTERNATIVE FORMAT: If you prefer, you can also return results in this simple format:\n  <<<ITEM 1>>> [redacted/rephrased text]\n  <<<ITEM 2>>> [redacted/rephrased text]\n  ...\n  <<<ITEM ${expectedLen}>>> [redacted/rephrased text]`;
  return `${basePrompt}\n\n${sentinels}`;
};

const buildSentinelInput = (texts: string[], comments?: any[]): string => {
  if (comments && comments.length > 0) {
    // Use the same ID system as scan-comments: originalRow if available, otherwise scannedIndex, fallback to i+1
    return `Comments to analyze (each bounded by sentinels):\n\n${texts.map((t, i) => {
      const comment = comments[i];
      const itemId = comment?.originalRow || comment?.scannedIndex || (i + 1);
      return `<<<ITEM ${itemId}>>>\n${t}\n<<<END ${itemId}>>>`;
    }).join('\n\n')}`;
  } else {
    // Fallback to sequential numbering if no comment objects provided
    return `Comments to analyze (each bounded by sentinels):\n\n${texts.map((t, i) => `<<<ITEM ${i + 1}>>>\n${t}\n<<<END ${i + 1}>>>`).join('\n\n')}`;
  }
};

// Deterministic redaction enforcement to catch items models may miss
function enforceRedactionPolicy(text: string | null | undefined): string | null {
  if (!text) return text ?? null;
  let out = String(text);
  // Job level/grade indicators: Level 5, L5, Band 3
  out = out.replace(/\b(?:Level|Band)\s*\d+\b/gi, 'XXXX');
  out = out.replace(/\bL\s*\d+\b/gi, 'XXXX');
  out = out.replace(/\bL(?:evel)?\s*\d+\b/gi, 'XXXX');
  // Tenure/time-in-role
  out = out.replace(/\b\d+\s*(?:years?|yrs?)\s+(?:in\s+role|experience|tenure)\b/gi, 'XXXX');
  // Additional tenure/experience phrasings
  out = out.replace(/\b\d+\s*(?:years?|yrs?)\s+(?:of\s+)?(?:work\s+)?experience\b/gi, 'XXXX');
  out = out.replace(/\b\d+\s*(?:months?)\s+(?:in\s+role|experience)\b/gi, 'XXXX');
  out = out.replace(/\btenure\b/gi, 'XXXX');
  // Role/position indicators that can make an individual identifiable in context
  out = out.replace(/\bHDR\b/gi, 'XXXX');
  out = out.replace(/\bHigher\s+Degree\s+Research(?:er)?\b/gi, 'XXXX');
  out = out.replace(/\bacademic\s+staff\b/gi, 'XXXX');
  out = out.replace(/\bstaff\s+member(?:s)?\b/gi, 'XXXX');
  return out;
}

// AI calling function (simplified version for post-processing)
async function callAI(provider: string, model: string, prompt: string, input: string, responseType: string, maxTokens?: number, userId?: string, scanRunId?: string, phase?: string, aiLogger?: AILogger, temperature?: number) {
  const payload = {
    messages: [
      { role: 'system', content: prompt },
      { role: 'user', content: input }
    ],
    temperature: temperature || 0,
    max_tokens: maxTokens || 4096
  };

  console.log(`[CALL_AI] ${provider}/${model} max_tokens=${maxTokens || 4096}, temperature=${temperature || 0}`);

        // Log the AI request if logger is provided
      if (aiLogger && userId && scanRunId && phase) {
        await aiLogger.logRequest({
          userId,
          scanRunId,
          functionName: 'post-process-comments',
          provider,
          model,
          requestType: responseType,
          phase,
          requestPrompt: prompt,
          requestInput: input,
          requestTemperature: temperature || 0,
          requestMaxTokens: maxTokens // Use the actual max_tokens passed from model_configurations
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
      if (aiLogger && userId && scanRunId && phase) {
        await aiLogger.logResponse(userId, scanRunId, 'post-process-comments', provider, model, responseType, phase, '', errorMessage, undefined);
      }
      throw new Error(errorMessage);
    }

    const result = await response.json();
    const responseText = result.choices?.[0]?.message?.content || null;
    
    // Log the AI response if logger is provided
    if (aiLogger && userId && scanRunId && phase && responseText) {
      await aiLogger.logResponse(userId, scanRunId, 'post-process-comments', provider, model, responseType, phase, responseText, undefined, undefined);
    }
    
    return responseText;
  } else if (provider === 'openai') {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY') || ''}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model,
        ...payload
      })
    });

    if (!response.ok) {
      const errorMessage = `OpenAI API error: ${response.status} ${response.statusText}`;
      if (aiLogger && userId && scanRunId && phase) {
        await aiLogger.logResponse(userId, scanRunId, 'post-process-comments', provider, model, responseType, phase, '', errorMessage, undefined);
      }
      throw new Error(errorMessage);
    }

    const result = await response.json();
    const responseText = result.choices?.[0]?.message?.content || null;
    
    // Log the AI response if logger is provided
    if (aiLogger && userId && scanRunId && phase && responseText) {
      await aiLogger.logResponse(userId, scanRunId, 'post-process-comments', provider, model, responseType, phase, responseText, undefined, undefined);
    }
    
    return responseText;
  } else if (provider === 'bedrock') {
    // For Bedrock, we'll use a simplified approach
    // In production, you'd want to implement the full Bedrock client logic
    throw new Error('Bedrock provider not yet implemented in post-processing function');
  }

  throw new Error(`Unsupported provider: ${provider}`);
}

// Parse and normalize batch text responses
function normalizeBatchTextParsed(parsed: any): string[] {
  // Helper function to clean up any remaining sentinel markers
  const cleanSentinels = (text: string): string => {
    return text
      .replace(/<<<END\s+\d+>>>/gi, '') // Remove END markers
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  };

  if (Array.isArray(parsed)) {
    const cleaned = parsed
      .filter((v) => v != null)
      .map((v) => {
        if (typeof v === 'string') {
          return cleanSentinels(v.trim());
        } else if (typeof v === 'object' && v !== null) {
          // Handle JSON objects with redacted/rephrased/text fields
          if (v.redacted) return cleanSentinels(v.redacted);
          if (v.rephrased) return cleanSentinels(v.rephrased);
          if (v.text) return cleanSentinels(v.text);
          // Fallback to stringifying the object
          return cleanSentinels(JSON.stringify(v));
        } else {
          return cleanSentinels(String(v));
        }
      })
      .filter((s) => s.length > 0)
      .filter((s) => !/^here\s+(?:is|are)[\s\S]*?:\s*$/i.test(s));

    // Handle ID-tagged responses
    const idStart = /^\s*<<<(?:ID|ITEM)\s+(\d+)>>>\s*/i;
    const hasIds = cleaned.some(s => idStart.test(s));
    if (hasIds) {
      const merged: string[] = [];
      let currentId: number | null = null;
      let buffer: string[] = [];
      for (const s of cleaned) {
        const m = idStart.exec(s);
        if (m) {
          if (currentId != null) merged.push(buffer.join(' ').trim());
          currentId = parseInt(m[1], 10);
          buffer = [s.replace(idStart, '').trim()];
          continue;
        }
        if (currentId != null) buffer.push(s);
      }
      if (currentId != null) merged.push(buffer.join(' ').trim());
      if (merged.length > 0) return merged;
    }

    return cleaned;
  }

  // Fallback: try to parse as string
  const content = String(parsed || '');
  
  // Check if this is the simple format with ITEM markers
  if (content.includes('<<<ITEM')) {
    // Extract content between ITEM markers
    const itemRegex = /<<<ITEM\s+\d+>>>\s*([\s\S]*?)(?=<<<ITEM\s+\d+>>>|$)/g;
    const matches = [...content.matchAll(itemRegex)];
    return matches.map(m => m[1].trim()).filter(s => s.length > 0);
  }
  
  // Check if this is a JSON array (the AI might return the entire array as a string)
  if (content.trim().startsWith('[') && content.trim().endsWith(']')) {
    try {
      const jsonArray = JSON.parse(content);
      if (Array.isArray(jsonArray)) {
        return jsonArray.map(item => {
          if (typeof item === 'string') {
            return cleanSentinels(item.trim());
          } else if (typeof item === 'object' && item !== null) {
            // Handle JSON objects with redacted/rephrased/text fields
            if (item.redacted) return cleanSentinels(item.redacted);
            if (item.rephrased) return cleanSentinels(item.rephrased);
            if (item.text) return cleanSentinels(item.text);
            // Fallback to stringifying the object
            return cleanSentinels(JSON.stringify(item));
          } else {
            return cleanSentinels(String(item));
          }
        }).filter(s => s.length > 0);
      }
    } catch (e) {
      console.warn('[NORMALIZE] Failed to parse JSON array, falling back to string parsing:', e);
    }
  }

  return [String(parsed || '')];
}

interface PostProcessRequest {
  comments: Array<{
    id: string;
    originalRow?: number; // Add originalRow for proper ID tracking
    scannedIndex?: number; // Add scannedIndex for proper lookup
    originalText: string;
    text: string;
    concerning: boolean;
    identifiable: boolean;
    mode: 'redact' | 'rephrase' | 'original';
    scanAResult: any;
    adjudicationResult?: any;
  }>;
  scanConfig: {
    provider: string;
    model: string;
    redact_prompt: string;
    rephrase_prompt: string;
    max_tokens?: number;
  };
  defaultMode: 'redact' | 'rephrase';
  scanRunId?: string; // Add scanRunId to the interface
}

interface PostProcessResponse {
  success: boolean;
  processedComments: Array<{
    id: string;
    originalRow?: number; // Preserve originalRow for proper ID tracking
    scannedIndex?: number; // Preserve scannedIndex for proper lookup
    redactedText?: string;
    rephrasedText?: string;
    finalText: string;
    mode: 'redact' | 'rephrase' | 'original';
  }>;
  summary: {
    total: number;
    redacted: number;
    rephrased: number;
    original: number;
  };
  totalRunTimeMs?: number;
  error?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const overallStartTime = Date.now(); // Track overall process time

  try {
    const { comments, scanConfig, defaultMode, scanRunId }: PostProcessRequest = await req.json()
    
    if (!comments || !Array.isArray(comments) || comments.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'No comments provided' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Check user authentication
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Authorization header required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }
    
    const token = authHeader.replace('Bearer ', '');
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    );
    
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid authentication token' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    // Use scanRunId if provided, otherwise generate a new one
    const runId = scanRunId || Math.floor(Math.random() * 10000);
    const logPrefix = `[RUN ${runId}]`;

    console.log(`${logPrefix} [POSTPROCESS] Processing ${comments.length} comments with ${scanConfig.provider}/${scanConfig.model}`)

    // Fetch the actual AI configuration to get correct token limits and temperature
    const { data: modelCfg, error: modelCfgError } = await supabase
      .from('model_configurations')
      .select('*')
      .eq('provider', scanConfig.provider)
      .eq('model', scanConfig.model)
      .single();

    const { data: aiCfg, error: aiCfgError } = await supabase
      .from('ai_configurations')
      .select('temperature, tokens_per_comment')
      .eq('provider', scanConfig.provider)
      .eq('model', scanConfig.model)
      .limit(1)
      .single();

    let actualMaxTokens = getEffectiveMaxTokens(scanConfig);
    if (modelCfgError) {
      console.warn(`${logPrefix} [POSTPROCESS] Warning: Could not fetch model_configurations, using defaults:`, modelCfgError.message);
    } else {
      actualMaxTokens = modelCfg?.output_token_limit || getEffectiveMaxTokens(scanConfig);
      console.log(`${logPrefix} [POSTPROCESS] Using max_tokens from model_configurations: ${actualMaxTokens}, model_temperature=${modelCfg?.temperature}`);
    }

    const effectiveTemperature = (aiCfg && aiCfg.temperature !== null && aiCfg.temperature !== undefined)
      ? aiCfg.temperature
      : (modelCfg?.temperature ?? scanConfig.temperature ?? 0);

    const tokensPerComment = aiCfg?.tokens_per_comment || 13;
    console.log(`${logPrefix} [POSTPROCESS] Using tokens_per_comment: ${tokensPerComment} (for reference, post-processing uses I/O ratios)`);

    // Get rate limits
    const tpmLimit = modelCfg?.tpm_limit;
    const rpmLimit = modelCfg?.rpm_limit;
    console.log(`${logPrefix} [POSTPROCESS] TPM limit: ${tpmLimit || 'none'}, RPM limit: ${rpmLimit || 'none'} for ${scanConfig.provider}/${scanConfig.model}`);

    // Use the actual max_tokens from model_configurations
    const effectiveConfig = {
      ...scanConfig,
      max_tokens: actualMaxTokens,
      temperature: effectiveTemperature,
      tpm_limit: tpmLimit,
      rpm_limit: rpmLimit
    };

    console.log(`${logPrefix} [POSTPROCESS] Effective config: max_tokens=${effectiveConfig.max_tokens}, temperature=${effectiveConfig.temperature}`);

    // Filter comments that need post-processing
    const flaggedComments = comments.filter(c => c.concerning || c.identifiable)
    const needsProcessing = flaggedComments.length > 0

    if (!needsProcessing) {
      console.log(`${logPrefix} [POSTPROCESS] No comments need post-processing`)
      return new Response(
        JSON.stringify({
          success: true,
          processedComments: comments.map(c => ({
            id: c.id,
            finalText: c.text,
            mode: c.mode
          })),
          summary: {
            total: comments.length,
            redacted: 0,
            rephrased: 0,
            original: comments.length
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Process flagged comments using AI-powered redaction and rephrasing
    const processedComments = []
    let redactedCount = 0
    let rephrasedCount = 0
    let originalCount = 0

    try {
      // Calculate optimal batch size based on model limits and actual comment sizes
      let optimalBatchSize = DEFAULT_POST_PROCESS_BATCH_SIZE;
      
      // Calculate actual token usage for better batch sizing
      const avgCommentLength = flaggedComments.reduce((sum, c) => sum + (c.originalText || c.text || '').length, 0) / flaggedComments.length;
      const estimatedInputTokensPerComment = Math.ceil(avgCommentLength / 3.5); // ~3.5 chars per token (less conservative)
      const estimatedOutputTokensPerComment = Math.ceil(avgCommentLength / 3.5) * 1.1; // Output is typically similar to input for post-processing
      const estimatedTotalTokensPerComment = estimatedInputTokensPerComment + estimatedOutputTokensPerComment;
      
      console.log(`${logPrefix} [BATCH_CALC] Average comment length: ${Math.round(avgCommentLength)} chars`);
      console.log(`${logPrefix} [BATCH_CALC] Estimated tokens per comment: ${estimatedInputTokensPerComment} input + ${estimatedOutputTokensPerComment} output = ${estimatedTotalTokensPerComment} total`);
      
      // Calculate batch size based on input token limits
      const inputTokenLimit = modelCfg?.input_token_limit || 128000;
      const outputTokenLimit = modelCfg?.output_token_limit || 4096;
      
      // Reserve tokens for prompt (estimate ~2000 tokens for post-processing prompts)
      const promptTokens = 2000;
      const availableInputTokens = inputTokenLimit - promptTokens;
      
      // Calculate max batch size by input tokens
      const maxBatchByInput = Math.floor(availableInputTokens / estimatedInputTokensPerComment);
      
      // Calculate max batch size by output tokens  
      const maxBatchByOutput = Math.floor(outputTokenLimit / estimatedOutputTokensPerComment);
      
      // Use the more restrictive limit
      const maxBatchByTokens = Math.min(maxBatchByInput, maxBatchByOutput);
      
      console.log(`${logPrefix} [BATCH_CALC] Input limit: ${inputTokenLimit}, Output limit: ${outputTokenLimit}`);
      console.log(`${logPrefix} [BATCH_CALC] Available input tokens: ${availableInputTokens} (after ${promptTokens} prompt tokens)`);
      console.log(`${logPrefix} [BATCH_CALC] Max batch by input: ${maxBatchByInput}, Max batch by output: ${maxBatchByOutput}`);
      console.log(`${logPrefix} [BATCH_CALC] Max batch by tokens: ${maxBatchByTokens}`);
      
      // Start with token-based limit
      optimalBatchSize = Math.min(DEFAULT_POST_PROCESS_BATCH_SIZE, maxBatchByTokens);
      
      // Apply rate limits if configured
      if (tpmLimit || rpmLimit) {
        const rateLimitedBatchSize = calculateOptimalBatchSize(
          effectiveConfig.provider,
          effectiveConfig.model,
          estimatedTotalTokensPerComment,
          optimalBatchSize,
          tpmLimit,
          rpmLimit,
          `${logPrefix} [RATE_BATCH]`,
          2 // Post-processing makes 2 requests per batch (redaction + rephrasing)
        );
        
        if (rateLimitedBatchSize < optimalBatchSize) {
          console.log(`${logPrefix} [RATE_BATCH] Reduced batch size from ${optimalBatchSize} to ${rateLimitedBatchSize} due to rate limits`);
          optimalBatchSize = rateLimitedBatchSize;
        }
      }
      
      // Apply safety margin (90% of calculated maximum)
      const safetyBatchSize = Math.floor(optimalBatchSize * 0.9);
      if (safetyBatchSize < optimalBatchSize) {
        console.log(`${logPrefix} [BATCH_CALC] Applied safety margin: ${optimalBatchSize} → ${safetyBatchSize} (90% of max)`);
        optimalBatchSize = safetyBatchSize;
      }
      
      console.log(`${logPrefix} [BATCH_CALC] Final optimal batch size: ${optimalBatchSize}`);
      
      // Use batch processing for efficiency
      const chunks = chunkArray(flaggedComments, optimalBatchSize);
      
      console.log(`${logPrefix} [POSTPROCESS] Processing ${flaggedComments.length} comments in ${chunks.length} chunks of size ${optimalBatchSize}`);
      
      for (const chunk of chunks) {
        console.log(`${logPrefix} [POSTPROCESS] Processing chunk of ${chunk.length} comments`);
        const chunkTexts = chunk.map(c => c.originalText || c.text);
        const sentinelInput = buildSentinelInput(chunkTexts, chunk);
        
        // Process redaction and rephrasing in parallel for each chunk
        const redactPrompt = buildBatchTextPrompt(scanConfig.redact_prompt + REDACTION_POLICY, chunk.length);
        const rephrasePrompt = buildBatchTextPrompt(scanConfig.rephrase_prompt, chunk.length);
        
        console.log(`${logPrefix} [AI REQUEST] ${effectiveConfig.provider}/${effectiveConfig.model} type=batch_text phase=redaction`);
        console.log(`${logPrefix} [AI REQUEST] payload=${JSON.stringify({
          provider: effectiveConfig.provider,
          model: effectiveConfig.model,
          prompt_length: redactPrompt.length,
          input_length: sentinelInput.length,
          chunk_size: chunk.length
        }).substring(0, 500)}...`);
        
                 // Initialize AI logger
         const aiLogger = new AILogger();
         aiLogger.setFunctionStartTime(overallStartTime);
        
        // Estimate tokens for this chunk more accurately
        const chunkEstimatedInputTokens = Math.ceil(sentinelInput.length / 3.5);
        const chunkEstimatedOutputTokens = Math.ceil(sentinelInput.length / 3.5) * 1.1; // Post-processing typically generates similar text
        const chunkTotalTokens = chunkEstimatedInputTokens + chunkEstimatedOutputTokens;
        
        console.log(`${logPrefix} [CHUNK] Estimated tokens: ${chunkTotalTokens} (${chunkEstimatedInputTokens} input + ${chunkEstimatedOutputTokens} output)`);
        
        // Check rate limits and wait if necessary before making parallel calls
        if (tpmLimit || rpmLimit) {
          const tpmWaitTime = calculateWaitTime(effectiveConfig.provider, effectiveConfig.model, chunkTotalTokens, tpmLimit);
          const rpmWaitTime = calculateRPMWaitTime(effectiveConfig.provider, effectiveConfig.model, 1, rpmLimit);
          const maxWaitTime = Math.max(tpmWaitTime, rpmWaitTime);
          
          if (maxWaitTime > 0) {
            const reason = [];
            if (tpmWaitTime > 0) reason.push(`TPM (${tpmWaitTime}ms)`);
            if (rpmWaitTime > 0) reason.push(`RPM (${rpmWaitTime}ms)`);
            
            console.log(`${logPrefix} [CHUNK] Waiting ${maxWaitTime}ms to comply with ${reason.join(' and ')} limits`);
            await new Promise(resolve => setTimeout(resolve, maxWaitTime));
          }
        }
        
        const [rawRedacted, rawRephrased] = await Promise.all([
          callAI(
            effectiveConfig.provider,
            effectiveConfig.model,
            redactPrompt,
            sentinelInput,
            'batch_text',
            effectiveConfig.max_tokens,
            user.id,
            scanRunId,
            'redaction',
            aiLogger,
            effectiveConfig.temperature
          ),
          callAI(
            effectiveConfig.provider,
            effectiveConfig.model,
            rephrasePrompt,
            sentinelInput,
            'batch_text',
            effectiveConfig.max_tokens,
            user.id,
            scanRunId,
            'rephrase',
            aiLogger,
            effectiveConfig.temperature
          )
        ]);
        
        console.log(`${logPrefix} [AI RESPONSE] ${scanConfig.provider}/${scanConfig.model} type=batch_text phase=redaction`);
        console.log(`${logPrefix} [AI RESPONSE] rawRedacted=${JSON.stringify(rawRedacted).substring(0, 500)}...`);
        console.log(`${logPrefix} [AI RESPONSE] ${scanConfig.provider}/${scanConfig.model} type=batch_text phase=rephrase`);
        console.log(`${logPrefix} [AI RESPONSE] rawRephrased=${JSON.stringify(rawRephrased).substring(0, 500)}...`);
        
        // Record usage AFTER the AI calls complete (2 requests: redaction + rephrasing)
        if (tpmLimit || rpmLimit) {
          recordUsage(effectiveConfig.provider, effectiveConfig.model, chunkTotalTokens * 2); // Both calls use same token count
          recordRequest(effectiveConfig.provider, effectiveConfig.model, 2); // 2 requests: redaction + rephrasing
          console.log(`${logPrefix} [CHUNK] Recorded usage: ${chunkTotalTokens * 2} tokens, 2 requests`);
        }

        // Parse and normalize the responses
        console.log(`${logPrefix} [POSTPROCESS] Parsing AI responses...`);
        
        // Validate AI responses before parsing
        if (!rawRedacted || !rawRephrased) {
          console.error(`${logPrefix} [POSTPROCESS] ERROR: AI responses are empty or null`);
          console.error(`${logPrefix} [POSTPROCESS] rawRedacted: ${rawRedacted}`);
          console.error(`${logPrefix} [POSTPROCESS] rawRephrased: ${rawRephrased}`);
          throw new Error('AI responses are empty or null');
        }
        
        let redactedTexts = normalizeBatchTextParsed(rawRedacted);
        let rephrasedTexts = normalizeBatchTextParsed(rawRephrased);
        
        console.log(`${logPrefix} [POSTPROCESS] Parsed redactedTexts: ${redactedTexts.length} items`);
        console.log(`${logPrefix} [POSTPROCESS] Parsed rephrasedTexts: ${rephrasedTexts.length} items`);
        
        // Validate parsed results
        if (redactedTexts.length === 0 || rephrasedTexts.length === 0) {
          console.error(`${logPrefix} [POSTPROCESS] ERROR: Parsed results are empty`);
          console.error(`${logPrefix} [POSTPROCESS] redactedTexts: ${JSON.stringify(redactedTexts)}`);
          console.error(`${logPrefix} [POSTPROCESS] rephrasedTexts: ${JSON.stringify(rephrasedTexts)}`);
          throw new Error('Parsed results are empty');
        }

        // Handle ID-tagged responses and realign by index
        console.log(`${logPrefix} [POSTPROCESS] Handling ID-tagged responses...`);
        const idTag = /^\s*<<<(?:ID|ITEM)\s+(\d+)>>>\s*/i;
        const stripAndIndex = (arr: string[]) => arr.map(s => {
          const m = idTag.exec(s || '');
          return { idx: m ? parseInt(m[1], 10) : null, text: m ? s.replace(idTag, '').trim() : (s || '').trim() };
        });
        
        const redIdx = stripAndIndex(redactedTexts);
        const rephIdx = stripAndIndex(rephrasedTexts);
        const allHaveIds = redIdx.every(x => x.idx != null) && rephIdx.every(x => x.idx != null);
        
        console.log(`${logPrefix} [POSTPROCESS] ID handling - allHaveIds: ${allHaveIds}, redIdx: ${redIdx.length}, rephIdx: ${rephIdx.length}`);
        
        if (allHaveIds) {
          const expected = chunk.length;
          const byId = (list: { idx: number|null; text: string }[]) => {
            const out: string[] = Array(expected).fill('');
            for (const it of list) {
              if (it.idx) {
                // Find the comment in the chunk that matches this ID
                const commentIndex = chunk.findIndex(c => 
                  (c.originalRow && c.originalRow === it.idx) || 
                  (c.scannedIndex && c.scannedIndex === it.idx)
                );
                if (commentIndex >= 0 && commentIndex < expected) {
                  out[commentIndex] = it.text;
                }
              }
            }
            return out;
          };
          redactedTexts = byId(redIdx).map(enforceRedactionPolicy) as string[];
          rephrasedTexts = byId(rephIdx);
          console.log(`${logPrefix} [POSTPROCESS] Realigned by ID - redactedTexts: ${redactedTexts.length}, rephrasedTexts: ${rephrasedTexts.length}`);
        } else {
          redactedTexts = redactedTexts.map(enforceRedactionPolicy);
          console.log(`${logPrefix} [POSTPROCESS] Using sequential alignment - redactedTexts: ${redactedTexts.length}`);
        }

        // Process each comment in the chunk
        console.log(`${logPrefix} [POSTPROCESS] Processing ${chunk.length} comments in chunk...`);
        for (let i = 0; i < chunk.length; i++) {
          const comment = chunk[i];
          const redactedText = redactedTexts[i] || comment.text;
          const rephrasedText = rephrasedTexts[i] || comment.text;
          let mode = comment.mode;

          // Determine mode if not specified
          if (!mode) {
            mode = (comment.concerning || comment.identifiable) ? defaultMode : 'original'
          }

          let finalText = comment.text;
          
          // Apply the appropriate transformation based on mode
          if (mode === 'redact' && comment.concerning) {
            finalText = redactedText;
            redactedCount++;
            console.log(`${logPrefix} [POSTPROCESS] Comment ${i+1} (${comment.id}) - REDACTED: ${redactedText.substring(0, 100)}...`);
          } else if (mode === 'rephrase' && comment.identifiable) {
            finalText = rephrasedText;
            rephrasedCount++;
            console.log(`${logPrefix} [POSTPROCESS] Comment ${i+1} (${comment.id}) - REPHRASED: ${rephrasedText.substring(0, 100)}...`);
          } else {
            originalCount++;
            console.log(`${logPrefix} [POSTPROCESS] Comment ${i+1} (${comment.id}) - ORIGINAL (mode: ${mode}, concerning: ${comment.concerning}, identifiable: ${comment.identifiable})`);
          }

          processedComments.push({
            id: comment.id,
            originalRow: comment.originalRow, // Preserve originalRow for proper ID tracking
            scannedIndex: comment.scannedIndex, // Preserve scannedIndex
            redactedText,
            rephrasedText,
            finalText,
            mode
          });
        }
      }
    } catch (error) {
      console.error('[POSTPROCESS] Error during AI processing:', error);
      
      // Fallback: process comments individually without AI
      console.log('[POSTPROCESS] Falling back to individual processing due to AI error');
      for (const comment of flaggedComments) {
        let mode = comment.mode;
        if (!mode) {
          mode = (comment.concerning || comment.identifiable) ? defaultMode : 'original'
        }

        let finalText = comment.text;
        let redactedText = comment.text;
        let rephrasedText = comment.text;

        if (mode === 'redact' && comment.concerning) {
          redactedText = `[REDACTED: ${comment.scanAResult?.reasoning || 'Concerning content removed'}]`;
          finalText = redactedText;
          redactedCount++;
        } else if (mode === 'rephrase' && comment.identifiable) {
          rephrasedText = `[REPHRASED: ${comment.scanAResult?.reasoning || 'Identifiable information rephrased'}]`;
          finalText = rephrasedText;
          rephrasedCount++;
        } else {
          originalCount++;
        }

        processedComments.push({
          id: comment.id,
          originalRow: comment.originalRow, // Preserve originalRow for proper ID tracking
          scannedIndex: comment.scannedIndex, // Preserve scannedIndex for proper lookup
          redactedText,
          rephrasedText,
          finalText,
          mode
        });
      }
    }

    // Add unprocessed comments
    const unprocessedComments = comments.filter(c => !c.concerning && !c.identifiable)
    for (const comment of unprocessedComments) {
      processedComments.push({
        id: comment.id,
        originalRow: comment.originalRow, // Preserve originalRow for proper ID tracking
        scannedIndex: comment.scannedIndex, // Preserve scannedIndex for proper lookup
        finalText: comment.text,
        mode: 'original'
      })
      originalCount++
    }

         const totalRunTimeMs = Date.now() - overallStartTime;
     
     const response: PostProcessResponse = {
       success: true,
       processedComments,
       summary: {
         total: comments.length,
         redacted: redactedCount,
         rephrased: rephrasedCount,
         original: originalCount
       },
       totalRunTimeMs: totalRunTimeMs
     }

     console.log(`${logPrefix} [POSTPROCESS] Completed: ${redactedCount} redacted, ${rephrasedCount} rephrased, ${originalCount} original`)
     console.log(`${logPrefix} [TIMING] Total run time: ${totalRunTimeMs}ms (${(totalRunTimeMs / 1000).toFixed(1)}s)`)

     return new Response(
       JSON.stringify(response),
       { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
     )

  } catch (error) {
    console.error('[POSTPROCESS] Error:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
