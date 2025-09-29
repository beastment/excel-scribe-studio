// @ts-ignore - Deno module import
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// @ts-ignore - Deno module import
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { AILogger } from './ai-logger.ts';

// Deno global type declarations
declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
  serve: any;
};


const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

// Timeout utilities (configurable via environment)
function getTimeoutMs(envKey: string, fallbackMs: number): number {
  const raw = Deno.env.get(envKey);
  const parsed = raw ? Number(raw) : NaN;
  if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed);
  return fallbackMs;
}

function seconds(ms: number): number {
  return Math.round(ms / 1000);
}

// Default timeouts (override via env)
const ADJUDICATOR_REQUEST_TIMEOUT_MS = getTimeoutMs("ADJUDICATOR_AI_REQUEST_TIMEOUT_MS", 140000);

interface AdjudicationRequest {
  comments: Array<{
    id: string;
    originalText: string;
    originalRow?: number; // Add originalRow for proper ID tracking
    scannedIndex?: number; // Add scannedIndex for proper ID tracking
    scanAResult: {
      concerning: boolean;
      identifiable: boolean;
      reasoning: string;
      model: string;
    };
    scanBResult: {
      concerning: boolean;
      identifiable: boolean;
      reasoning: string;
      model: string;
    };
    agreements: {
      concerning: boolean | null; // true if both agree, false if disagree, null if no agreement
      identifiable: boolean | null;
    };
  }>;
  adjudicatorConfig: {
    provider: string;
    model: string;
    prompt: string;
    max_tokens?: number;
  };
  scanRunId?: string;
  batchIndex?: number; // Track which batch this is
  batchKey?: string; // Unique key for this batch to prevent duplicates
  clientCalculatedOutputTokens?: number; // Client-calculated output tokens for this batch
}
//
interface AdjudicationResponse {
  success: boolean;
  adjudicatedComments: Array<{
    id: string;
    concerning: boolean;
    identifiable: boolean;
    reasoning: string;
    model: string;
  }>;
  summary: {
    total: number;
    resolved: number;
    errors: number;
  };
  error?: string;
}

// AI calling function
async function callAI(provider: string, model: string, prompt: string, input: string, maxTokens?: number, userId?: string, scanRunId?: string, aiLogger?: any, temperature?: number) {
  const payload = {
    model: model, // Add the model parameter for OpenAI
    messages: [
      { role: 'system', content: prompt },
      { role: 'user', content: input }
    ],
    temperature: temperature || 0,
    max_tokens: maxTokens || 4096
  };

  // Log the AI request if logger is provided
  if (aiLogger && userId && scanRunId) {
    await aiLogger.logRequest({
      userId,
      scanRunId,
      functionName: 'adjudicator',
      provider,
      model,
      requestType: 'adjudication',
      phase: 'adjudication',
      requestPrompt: prompt,
      requestInput: input,
      requestTemperature: temperature || 0,
      requestMaxTokens: maxTokens
    });
  }

  if (provider === 'azure') {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), ADJUDICATOR_REQUEST_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(`${Deno.env.get('AZURE_OPENAI_ENDPOINT')}/openai/deployments/${model}/chat/completions?api-version=2024-02-15-preview`, {
        method: 'POST',
        headers: {
          'api-key': Deno.env.get('AZURE_OPENAI_API_KEY') || '',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
    } catch (e: unknown) {
      clearTimeout(timeoutId);
      const isAbort = (e as { name?: string })?.name === 'AbortError';
      const errorMessage = isAbort ? `Azure OpenAI API timeout after ${seconds(ADJUDICATOR_REQUEST_TIMEOUT_MS)} seconds` : `Azure OpenAI API fetch failed: ${e instanceof Error ? e.message : String(e)}`;
      if (aiLogger && userId && scanRunId) {
        await aiLogger.logResponse(userId, scanRunId, 'adjudicator', provider, model, 'adjudication', 'adjudication', '', errorMessage, undefined);
      }
      throw new Error(errorMessage);
    }
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorMessage = `Azure OpenAI API error: ${response.status} ${response.statusText}`;
      if (aiLogger && userId && scanRunId) {
        await aiLogger.logResponse(userId, scanRunId, 'adjudicator', provider, model, 'adjudication', 'adjudication', '', errorMessage, undefined);
      }
      throw new Error(errorMessage);
    }

    const result = await response.json();
    const responseText = result.choices[0]?.message?.content || '';
    
    // Log the AI response
    if (aiLogger && userId && scanRunId) {
      await aiLogger.logResponse(userId, scanRunId, 'adjudicator', provider, model, 'adjudication', 'adjudication', responseText, undefined, undefined);
    }

    return responseText;
  } else if (provider === 'openai') {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), ADJUDICATOR_REQUEST_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
    } catch (e: unknown) {
      clearTimeout(timeoutId);
      const isAbort = (e as { name?: string })?.name === 'AbortError';
      const errorMessage = isAbort ? `OpenAI API timeout after ${seconds(ADJUDICATOR_REQUEST_TIMEOUT_MS)} seconds` : `OpenAI API fetch failed: ${e instanceof Error ? e.message : String(e)}`;
      if (aiLogger && userId && scanRunId) {
        await aiLogger.logResponse(userId, scanRunId, 'adjudicator', provider, model, 'adjudication', 'adjudication', '', errorMessage, undefined);
      }
      throw new Error(errorMessage);
    }
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorMessage = `OpenAI API error: ${response.status} ${response.statusText}`;
      if (aiLogger && userId && scanRunId) {
        await aiLogger.logResponse(userId, scanRunId, 'adjudicator', provider, model, 'adjudication', 'adjudication', '', errorMessage, undefined);
      }
      throw new Error(errorMessage);
    }

    const result = await response.json();
    const responseText = result.choices[0]?.message?.content || '';
    
    // Log the AI response
    if (aiLogger && userId && scanRunId) {
      await aiLogger.logResponse(userId, scanRunId, 'adjudicator', provider, model, 'adjudication', 'adjudication', responseText, undefined, undefined);
    }

    return responseText;
  } else if (provider === 'bedrock') {
    // Bedrock implementation would go here //
    throw new Error('Bedrock provider not yet implemented in adjudicator function');
  } else {
    throw new Error(`Unsupported provider: ${provider}`);
  }
}

// Detect harmful/refusal-like responses and partial coverage
function isHarmfulContentResponse(responseText: string, provider: string, model: string): boolean {
  if (!responseText || responseText.trim().length === 0) return true;
  const lower = responseText.toLowerCase();
  const refusalPatterns = [
    'violates content policy', 'violates safety guidelines', 'content policy violation',
    'safety guidelines violation', 'inappropriate', 'harmful', 'unsafe', 'sensitive',
    'cannot analyze', 'will not analyze', 'refuse to analyze', 'cannot provide', 'will not provide',
    'refuse to provide', 'cannot respond', 'will not respond', 'refuse to respond',
    'cannot classify', 'will not classify', 'refuse to classify',
    'cannot generate', 'will not generate', 'refuse to generate',
    'cannot rephrase', 'will not rephrase', 'refuse to rephrase', 'i apologize'
  ];
  const containsRefusal = refusalPatterns.some(p => lower.includes(p));
  // Very short refusals are likely filters
  const veryShortRefusal = responseText.length < 120 && (lower.includes('cannot') || lower.includes('refuse') || lower.includes('policy'));
  if (containsRefusal || veryShortRefusal) {
    console.log(`[RECURSIVE_SPLIT][ADJ] Refusal detected for ${provider}/${model}`);
    return true;
  }
  return false;
}

// Partial parser tolerant to incomplete adjudication outputs
function parseAdjudicationPartialResults(response: string, expectedIds: number[]): {
  results: Array<{ index: number; concerning: boolean; identifiable: boolean }>;
  missingIds: number[];
  hasPartial: boolean;
} {
  const results: Array<{ index: number; concerning: boolean; identifiable: boolean }> = [];
  const foundIds = new Set<number>();
  const text = String(response || '');

  // Try simple key-value format first
  try {
    const lines = text.split('\n');
    let cur: { index: number | null; concerning?: boolean; identifiable?: boolean } = { index: null };
    const flush = () => {
      if (typeof cur.index === 'number' && typeof cur.concerning === 'boolean' && typeof cur.identifiable === 'boolean') {
        results.push({ index: cur.index, concerning: cur.concerning, identifiable: cur.identifiable });
        foundIds.add(cur.index);
      }
      cur = { index: null };
    };
    for (const raw of lines) {
      const line = raw.trim();
      const mi = /^i:\s*(\d+)$/i.exec(line);
      if (mi) {
        flush();
        cur.index = parseInt(mi[1], 10);
        continue;
      }
      const ma = /^a:\s*([YN])$/i.exec(line);
      if (ma) {
        cur.concerning = ma[1].toUpperCase() === 'Y';
        continue;
      }
      const mb = /^b:\s*([YN])$/i.exec(line);
      if (mb) {
        cur.identifiable = mb[1].toUpperCase() === 'Y';
        continue;
      }
    }
    flush();
  } catch (_) {
    // ignore
  }

  // If nothing, try JSON array form
  if (results.length === 0) {
    try {
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed)) {
          for (let i = 0; i < parsed.length; i++) {
            const item = parsed[i] as { index?: number; concerning?: unknown; identifiable?: unknown };
            const idx = typeof item.index === 'number' ? item.index : (i + 1);
            const c = Boolean(item.concerning);
            const id = Boolean(item.identifiable);
            results.push({ index: idx, concerning: c, identifiable: id });
            foundIds.add(idx);
          }
        }
      }
    } catch (_) {
      // ignore
    }
  }

  const missingIds = expectedIds.filter(id => !foundIds.has(id));
  return { results, missingIds, hasPartial: results.length > 0 && results.length < expectedIds.length };
}

async function processAdjudicationWithRecursiveSplitting(
  comments: Array<{ id: string; originalText: string; originalRow?: number; scannedIndex?: number; scanAResult: { concerning: boolean; identifiable: boolean }; scanBResult: { concerning: boolean; identifiable: boolean } }>,
  provider: string,
  model: string,
  prompt: string,
  maxTokens: number,
  userId: string,
  runId: string,
  aiLogger: any,
  temperature: number,
  maxSplits: number = 3,
  currentSplit: number = 0
): Promise<Array<{ index: number; concerning: boolean; identifiable: boolean }>> {
  if (comments.length === 0) return [];

  const getItemId = (c: { originalRow?: number; scannedIndex?: number }, i: number): number => {
    if (typeof c.originalRow === 'number' && Number.isFinite(c.originalRow) && c.originalRow > 0) return c.originalRow;
    if (typeof c.scannedIndex === 'number' && Number.isFinite(c.scannedIndex) && c.scannedIndex > 0) return c.scannedIndex;
    return i + 1;
  };
  const expectedIds = comments.map((c, i) => getItemId(c, i));
  const input = buildAdjudicationInput(comments as any);

  let responseText: string;
  try {
    responseText = await callAI(provider, model, prompt, input, maxTokens, userId, runId, aiLogger, temperature);
  } catch (e) {
    responseText = '';
  }

  const harmful = isHarmfulContentResponse(responseText, provider, model);
  if (!harmful) {
    // Try strict parse first
    try {
      const full = parseAdjudicationResponse(responseText, comments.length);
      return full.map(r => ({ index: typeof r.index === 'number' ? r.index : parseInt(String(r.index), 10), concerning: Boolean(r.concerning), identifiable: Boolean(r.identifiable) }));
    } catch (_) {
      const partial = parseAdjudicationPartialResults(responseText, expectedIds);
      if (partial.results.length === expectedIds.length) return partial.results;
      if (partial.hasPartial && currentSplit < maxSplits && partial.missingIds.length > 0) {
        const missingSet = new Set(partial.missingIds);
        const missingComments = comments.filter((c, i) => missingSet.has(getItemId(c, i)));
        const missingResults = await processAdjudicationWithRecursiveSplitting(
          missingComments,
          provider,
          model,
          prompt,
          maxTokens,
          userId,
          runId,
          aiLogger,
          temperature,
          maxSplits,
          currentSplit + 1
        );
        const byId = new Map<number, { index: number; concerning: boolean; identifiable: boolean }>();
        for (const r of partial.results) byId.set(r.index, r);
        for (const r of missingResults) byId.set(r.index, r);
        return expectedIds.map(id => byId.get(id)).filter((v): v is { index: number; concerning: boolean; identifiable: boolean } => Boolean(v));
      }
    }
  }

  // Harmful or unparseable: split
  if (comments.length > 1 && currentSplit < maxSplits) {
    const mid = Math.floor(comments.length / 2);
    const a = await processAdjudicationWithRecursiveSplitting(
      comments.slice(0, mid), provider, model, prompt, maxTokens, userId, runId, aiLogger, temperature, maxSplits, currentSplit + 1
    );
    const b = await processAdjudicationWithRecursiveSplitting(
      comments.slice(mid), provider, model, prompt, maxTokens, userId, runId, aiLogger, temperature, maxSplits, currentSplit + 1
    );
    return [...a, ...b];
  }

  // Fallback: default safe labels
  return expectedIds.map((id) => ({ index: id, concerning: false, identifiable: false }));
}



// Build adjudication input
function buildAdjudicationInput(comments: AdjudicationRequest['comments']): string {
  const items = comments.map((comment, i) => {
    // Use the same ID system as scan-comments: originalRow if available, otherwise scannedIndex, fallback to i+1//
    const itemId = comment.originalRow || comment.scannedIndex || (i + 1);
    
    return `<<<ITEM ${itemId}>>>
Text: ${comment.originalText}
AI1:
Concerning: ${comment.scanAResult.concerning ? 'Y' : 'N'}
Identifiable: ${comment.scanAResult.identifiable ? 'Y' : 'N'}
AI2:
Concerning: ${comment.scanBResult.concerning ? 'Y' : 'N'}
Identifiable: ${comment.scanBResult.identifiable ? 'Y' : 'N'}
<<<END ${itemId}>>>`;
  }).join('\n\n');

  return `Comments to adjudicate (each bounded by sentinels):

${items}`;
}

// Parse adjudication response
function parseAdjudicationResponse(response: string, expectedCount: number): Array<{ index: number; concerning: boolean; identifiable: boolean }> {
  try {
    // First try to parse the simple key-value format (i:1\nA:N\nB:Y)
    if (response.includes('i:') && response.includes('A:') && response.includes('B:')) {
      console.log('[RUNID-BATCH] Detected simple key-value format, parsing directly');
      
      const lines = response.split('\n').filter(line => line.trim().length > 0);
      const results: any[] = [];
      let currentItem: any = {};
      
      for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine.startsWith('i:')) {
          // Save previous item if exists
          if (currentItem.index !== undefined) {
            results.push(currentItem);
          }
          // Start new item
          const index = parseInt(trimmedLine.substring(2));
          currentItem = { index };
        } else if (trimmedLine.startsWith('A:')) {
          const value = trimmedLine.substring(2).trim();
          currentItem.concerning = value === 'Y';
        } else if (trimmedLine.startsWith('B:')) {
          const value = trimmedLine.substring(2).trim();
          currentItem.identifiable = value === 'Y';
        }
      }
      
      // Add the last item
      if (currentItem.index !== undefined) {
        results.push(currentItem);
      }
      
      if (results.length !== expectedCount) {
        throw new Error(`Expected ${expectedCount} items, got ${results.length}`);
      }
      
      return results;
    }
    
    // Fallback to JSON parsing if simple format not detected
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('No valid format found in response');
    }

    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) {
      throw new Error('Response is not an array');
    }

    if (parsed.length !== expectedCount) {
      throw new Error(`Expected ${expectedCount} items, got ${parsed.length}`);
    }

    return parsed.map((item, i) => ({
      index: item.index || i + 1,
      concerning: Boolean(item.concerning),
      identifiable: Boolean(item.identifiable)
    }));
  } catch (error) {
    console.error('[RUNID-BATCH] Failed to parse adjudication response:', error);
    console.error('[RUNID-BATCH] Raw response:', response);
    throw new Error(`Failed to parse adjudication response: ${error.message}`);
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const overallStartTime = Date.now(); // Track overall process time

  try {
    const request: AdjudicationRequest = await req.json();
    const { comments, adjudicatorConfig, scanRunId, batchIndex, batchKey, clientCalculatedOutputTokens } = request;
    
    if (!comments || !Array.isArray(comments) || comments.length === 0) {
      console.log(`[RUNID-BATCH] No comments provided; returning success with empty results`);
      return new Response(
        JSON.stringify({
          success: true,
          adjudicatedComments: [],
          summary: { total: 0, resolved: 0, errors: 0 }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // adjudicatorConfig is optional; server will resolve provider/model/prompt from AI Config

    // Use scanRunId if provided, otherwise generate a new one
    const runId = scanRunId || Math.floor(Math.random() * 10000);
    const logPrefix = `[RUN ${runId}]`;

    console.log(`${logPrefix} [RUNID-BATCH] Request received: comments=${comments.length}, hasConfig=${Boolean(adjudicatorConfig)}`);
    console.log(`${logPrefix} [RUNID-BATCH] Processing ${comments.length} comments with ${adjudicatorConfig?.provider || '(auto)'}/${adjudicatorConfig?.model || '(auto)'}`);
    console.log(`${logPrefix} [RUNID-BATCH] Config received:`, {
      provider: adjudicatorConfig?.provider,
      model: adjudicatorConfig?.model,
      promptLength: adjudicatorConfig?.prompt?.length || 0,
      maxTokens: adjudicatorConfig?.max_tokens
    });

    // Check user credits before processing adjudication
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Authorization header required for credit checking' }),
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
    
    // Adjudication is now free - no credit checking needed
    console.log(`${logPrefix} [RUNID-BATCH] Adjudication is free - no credits required`);
    
    // Normalize agreements. If not provided, derive from scanA vs scanB equality.
    const enriched = comments.map(c => {
      const a = c.scanAResult || { concerning: false, identifiable: false };
      const b = c.scanBResult || { concerning: false, identifiable: false };
      const concerningAgrees = a.concerning === b.concerning;
      const identifiableAgrees = a.identifiable === b.identifiable;
      const agreements = c.agreements && typeof c.agreements === 'object' ? c.agreements : {} as any;
      const normAgreements = {
        concerning: typeof agreements.concerning === 'boolean' ? agreements.concerning : concerningAgrees,
        identifiable: typeof agreements.identifiable === 'boolean' ? agreements.identifiable : identifiableAgrees
      };
      return { ...c, agreements: normAgreements };
    });

    // A comment needs adjudication if either axis disagrees (agreement === false)
    const needsAdjudication = enriched.filter(c => c.agreements.concerning === false || c.agreements.identifiable === false);

    // Filter comments that need adjudication (where agreements are null)

    if (needsAdjudication.length === 0) {
      console.log(`${logPrefix} [RUNID-BATCH] No comments need adjudication`);
      return new Response(
        JSON.stringify({
          success: true,
          adjudicatedComments: enriched.map(c => {
            // On agreement, use the agreed labels (from either scan)
            const a = c.scanAResult;
            const b = c.scanBResult;
            const agreedConcerning = (a?.concerning === b?.concerning) ? a?.concerning : a?.concerning;
            const agreedIdentifiable = (a?.identifiable === b?.identifiable) ? a?.identifiable : a?.identifiable;
            return {
              id: c.id,
              concerning: Boolean(agreedConcerning),
              identifiable: Boolean(agreedIdentifiable),
              reasoning: 'No adjudication needed - scanners agreed',
              model: `${adjudicatorConfig?.provider || 'auto'}/${adjudicatorConfig?.model || 'auto'}`
            };
          }),
          summary: {
            total: comments.length,
            resolved: 0,
            errors: 0
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`${logPrefix} [RUNID-BATCH] ${needsAdjudication.length} comments need adjudication`);

    try {
      // Scan-comments style: fetch AI configs, pick adjudicator row
      const { data: configs, error: cfgErr } = await supabase
        .from('ai_configurations')
        .select('*');
      if (cfgErr) {
        throw new Error(`Database error fetching AI configurations: ${cfgErr.message}`);
      }
      const adjudicatorCfg = Array.isArray(configs)
        ? configs.find((c: any) => c.scanner_type === 'adjudicator')
        : undefined;
      if (!adjudicatorCfg) {
        throw new Error('No adjudicator configuration found in ai_configurations');
      }
      console.log(`${logPrefix} [RUNID-BATCH] Adjudicator: ${adjudicatorCfg.provider}/${adjudicatorCfg.model}`);

      // Fetch model configurations, find matching row
      const { data: modelConfigs, error: modelErr } = await supabase
        .from('model_configurations')
        .select('*');
      if (modelErr) {
        throw new Error(`Database error fetching model configurations: ${modelErr.message}`);
      }
      const modelCfgEff = Array.isArray(modelConfigs)
        ? modelConfigs.find((m: any) => m.provider === adjudicatorCfg.provider && m.model === adjudicatorCfg.model)
        : undefined;
      if (!modelCfgEff?.output_token_limit) {
        throw new Error(`Max Tokens is not defined for Adjudicator model (${adjudicatorCfg.provider}/${adjudicatorCfg.model}). Please check the Model Configuration section in your dashboard.`);
      }

      // Temperature & tokens_per_comment (scan-comments style)
      const aiTempAdj = (adjudicatorCfg as any)?.temperature;
      const temperature = (aiTempAdj !== undefined && aiTempAdj !== null)
        ? aiTempAdj
        : (modelCfgEff?.temperature ?? 0);
      const tokensPerComment = adjudicatorCfg?.tokens_per_comment || 13;
      console.log(`${logPrefix} [RUNID-BATCH] Adjudicator temperature: ${temperature}, tokens_per_comment: ${tokensPerComment}`);

      // Limits
      let actualMaxTokens = modelCfgEff.output_token_limit as number;
      const tpmLimit = modelCfgEff?.tpm_limit;
      const rpmLimit = modelCfgEff?.rpm_limit;
      console.log(`${logPrefix} [RUNID-BATCH] Adjudicator output_token_limit: ${actualMaxTokens}, TPM: ${tpmLimit || 'n/a'}, RPM: ${rpmLimit || 'n/a'}`);

      // Prompt
      const prompt = String(adjudicatorCfg.analysis_prompt || '');
      if (!prompt) {
        throw new Error('Adjudicator prompt (analysis_prompt) is missing in ai_configurations');
      }

      // Build input
      const input = buildAdjudicationInput(needsAdjudication);
      console.log(`${logPrefix} [RUNID-BATCH] ${adjudicatorCfg.provider}/${adjudicatorCfg.model} type=adjudication`);
      console.log(`${logPrefix} [RUNID-BATCH] payload=${JSON.stringify({
        provider: adjudicatorCfg.provider,
        model: adjudicatorCfg.model,
        prompt_length: prompt.length,
        input_length: input.length,
        comment_count: needsAdjudication.length
      }).substring(0, 500)}...`);

      // Token estimates
      const estimatedInputTokens = Math.ceil(input.length / 4);
      const estimatedOutputTokens = needsAdjudication.length * tokensPerComment;
      const totalEstimatedTokens = estimatedInputTokens + estimatedOutputTokens;
      console.log(`${logPrefix} [RUNID-BATCH] Adjudication (${needsAdjudication.length} comments):`);
      console.log(`  Input: ~${estimatedInputTokens} tokens (estimated)`);
      console.log(`  Output: ${estimatedOutputTokens} tokens (${tokensPerComment} tokens per comment)`);
      console.log(`  Total: ${totalEstimatedTokens} tokens`);
      console.log(`  Max tokens: ${actualMaxTokens}`);

      console.log(`${logPrefix} [RATE_LIMITS] TPM limit: ${tpmLimit || 'none'}, RPM limit: ${rpmLimit || 'none'} for ${adjudicatorCfg.provider}/${adjudicatorCfg.model}`);

      // Validate that the request doesn't exceed TPM limits
      if (tpmLimit && totalEstimatedTokens > tpmLimit) {
        console.error(`${logPrefix} [TPM_VALIDATION] Request would exceed TPM limit: ${totalEstimatedTokens} > ${tpmLimit}`);
        return new Response(
          JSON.stringify({
            success: false,
            adjudicatedComments: [],
            summary: { total: comments.length, resolved: 0, errors: comments.length },
            error: `Request would exceed TPM limit of ${tpmLimit} tokens (estimated ${totalEstimatedTokens} tokens). Please reduce batch size on client side.`
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      // Duplicate guard remains unchanged
      try {
        const duplicateCheck = await supabase
          .from('ai_logs')
          .select('id')
          .eq('scan_run_id', runId)
          .eq('function_name', 'adjudicator')
          .eq('response_status', 'success')
          .eq('request_input', input)
          .limit(1);
        if (duplicateCheck.data && duplicateCheck.data.length > 0) {
          console.log(`${logPrefix} [DUPLICATE_CHECK] Identical adjudication input already processed for this run. Skipping.`);
          return new Response(
            JSON.stringify({
              success: true,
              adjudicatedComments: [],
              summary: { total: 0, resolved: 0, errors: 0 },
              message: 'Duplicate adjudication skipped'
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } catch (dupErr) {
        console.warn(`${logPrefix} [DUPLICATE_CHECK] Duplicate check failed, proceeding:`, dupErr);
      }

      // Batch sizing: mirror scan-comments logic using Dashboard limits and tokens-per-comment
      // Fetch batch sizing configuration for safety margin
      let safetyMarginPercent = 15;
      try {
        const { data: batchSizingData } = await supabase
          .from('batch_sizing_config')
          .select('*')
          .single();
        if (batchSizingData && Number.isFinite(batchSizingData.safety_margin_percent)) {
          safetyMarginPercent = Math.min(90, Math.max(0, batchSizingData.safety_margin_percent));
        }
      } catch (_) {
        // default safety margin remains
      }

      const tokenLimits = {
        input_token_limit: (typeof modelCfgEff?.input_token_limit === 'number' && modelCfgEff.input_token_limit > 0) ? modelCfgEff.input_token_limit : 128000,
        output_token_limit: modelCfgEff.output_token_limit as number,
        tpm_limit: modelCfgEff?.tpm_limit,
        rpm_limit: modelCfgEff?.rpm_limit
      };

      const getPreciseTokens = async (text: string, provider: string, model: string): Promise<number> => {
        try {
          const { getPreciseTokenCount } = await import('./token-counter.ts');
          return await getPreciseTokenCount(provider, model, text);
        } catch (error) {
          console.warn(`[TOKEN_COUNT] Fallback to approximation for ${provider}/${model}:`, error);
          return Math.ceil(text.length / 4);
        }
      };

      // Batch sizing is handled client-side to avoid edge function timeouts
      console.log(`${logPrefix} [CLIENT_MANAGED] Processing ${needsAdjudication.length} comments as single batch (client-managed batching)`);
      
      // Process all comments as a single batch
      const batchedComments: typeof needsAdjudication[] = [needsAdjudication];

      // Initialize AI logger for this adjudication run
      const aiLogger = new AILogger();
      aiLogger.setFunctionStartTime(overallStartTime);
      
      // Log batch information if provided
      if (batchIndex !== undefined) {
        console.log(`${logPrefix} [BATCH_INFO] Processing batch ${batchIndex + 1} with ${needsAdjudication.length} comments`);
      }
      if (batchKey) {
        console.log(`${logPrefix} [BATCH_KEY] Batch key: ${batchKey}`);
      }
      
      // Process batches with TPM enforcement
      let allAdjudicatedResults: any[] = [];
      
      for (let batchIndex = 0; batchIndex < batchedComments.length; batchIndex++) {
        const batch = batchedComments[batchIndex];
        console.log(`${logPrefix} [BATCH ${batchIndex + 1}/${batchedComments.length}] Processing ${batch.length} comments`);

        // Determine maxTokens: use client-calculated value if provided, otherwise fall back to dashboard value
        const maxTokensToUse = clientCalculatedOutputTokens || actualMaxTokens;
        console.log(`${logPrefix} [BATCH ${batchIndex + 1}] Using maxTokens: ${maxTokensToUse} (${clientCalculatedOutputTokens ? 'client-calculated' : 'dashboard fallback'})`);

        const batchResults = await processAdjudicationWithRecursiveSplitting(
          batch as any,
          adjudicatorCfg.provider,
          adjudicatorCfg.model,
          prompt,
          maxTokensToUse,
          user.id,
          runId.toString(),
          aiLogger,
          temperature,
          3,
          0
        );
        allAdjudicatedResults.push(...batchResults);
        console.log(`${logPrefix} [BATCH ${batchIndex + 1}] Parsed ${batchResults.length} results (after recursive splitting if needed)`);
      }

      console.log(`${logPrefix} [RUNID-BATCH] Completed all batches. Total results: ${allAdjudicatedResults.length}`);

      // Use the combined results from all batches
      const adjudicatedResults = allAdjudicatedResults;
      console.log(`${logPrefix} [RUNID-BATCH] Combined ${adjudicatedResults.length} adjudication results from ${batchedComments.length} batches`);

      // Map results by the sentinel item id used in input (originalRow || scannedIndex || sequence)
      const resultByItemId = new Map<number, { index: number; concerning: boolean; identifiable: boolean }>();
      for (const r of adjudicatedResults) {
        const idxNum = typeof r.index === 'string' ? parseInt(r.index) : r.index;
        if (Number.isFinite(idxNum)) {
          resultByItemId.set(idxNum as number, r);
        }
      }

      // Build final response using stable ids
      const needsAdjIdSet = new Set(needsAdjudication.map(c => c.id));
      const adjudicatedComments = enriched.map((comment, i) => {
        const needsAdj = needsAdjIdSet.has(comment.id);
        const itemId = (comment.originalRow as number) || (comment.scannedIndex as number);
        if (needsAdj) {
          const adjudicated = typeof itemId === 'number' ? resultByItemId.get(itemId) : undefined;
          if (adjudicated) {
            return {
              id: comment.id,
              concerning: Boolean(adjudicated.concerning),
              identifiable: Boolean(adjudicated.identifiable),
              reasoning: (adjudicated as any).reasoning || 'Resolved by adjudicator',
              model: `${adjudicatorCfg.provider}/${adjudicatorCfg.model}`
            };
          }
        }
        // For comments that don't need adjudication or missing adjudicated result, use agreement results
        return {
          id: comment.id,
          concerning: Boolean(comment.scanAResult.concerning),
          identifiable: Boolean(comment.scanAResult.identifiable),
          reasoning: 'No adjudication needed - scanners agreed',
          model: `${adjudicatorCfg.provider}/${adjudicatorCfg.model}`
        };
      });

      const totalRunTimeMs = Date.now() - overallStartTime;
       
      const summary = {
        total: comments.length,
        resolved: needsAdjudication.length,
        errors: 0
      };

      console.log(`${logPrefix} [RUNID-BATCH] Completed: ${summary.resolved} resolved, ${summary.total - summary.resolved} already agreed`);
      console.log(`${logPrefix} [RUNID-BATCH] No credits deducted - adjudication is free`);
      console.log(`${logPrefix} [TIMING] Total run time: ${totalRunTimeMs}ms (${(totalRunTimeMs / 1000).toFixed(1)}s)`);

      return new Response(
        JSON.stringify({
          success: true,
          adjudicatedComments,
          summary,
          totalRunTimeMs: totalRunTimeMs
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } catch (error) {
      console.error(`${logPrefix} [RUNID-BATCH] Error during adjudication:`, error);
      
      return new Response(
        JSON.stringify({
          success: false,
          adjudicatedComments: [],
          summary: {
            total: comments.length,
            resolved: 0,
            errors: comments.length
          },
          error: `Adjudication failed: ${error.message}`
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

  } catch (error) {
    console.error('Adjudicator function error:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        adjudicatedComments: [],
        summary: {
          total: 0,
          resolved: 0,
          errors: 1
        },
        error: `Function error: ${error.message}`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
