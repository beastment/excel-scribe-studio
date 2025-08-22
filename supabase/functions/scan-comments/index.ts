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
    const requestBody = await req.json();
    // Generate a per-request scanRunId for log correlation
    const scanRunId = requestBody.scanRunId || String(Math.floor(1000 + Math.random() * 9000));
    ;(globalThis as any).__scanRunId = scanRunId;
    // Global run-guards to prevent duplicate analysis batches for the same run id
    const gAny: any = globalThis as any;
    gAny.__runInProgress = gAny.__runInProgress || new Set<string>();
    gAny.__runCompleted = gAny.__runCompleted || new Set<string>();
    gAny.__analysisStarted = gAny.__analysisStarted || new Set<string>();
    // Prefix all logs for this request with the run id.
    // Ensure we always wrap the same base logger to avoid double-wrapping.
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
          summary: { total: 0, concerning: 0, identifiable: 0 }
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      gAny.__analysisStarted.add(scanRunId);
    }

    // If this request is an adjudication/postprocess follow-up (useCachedAnalysis: true), never re-run analysis inside.
    if (isCached) {
      // Ensure we skip any internal analysis path by short-circuiting batch analysis when cached
      // The regular flow below already respects useCachedAnalysis for scans, but this guard prevents
      // accidental re-entry in edge cases.
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
        summary: { total: 0, concerning: 0, identifiable: 0 }
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
        summary: { total: 0, concerning: 0, identifiable: 0 }
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    // Mark run as in progress
    gAny.__runInProgress.add(scanRunId);
    
    const { 
      comments, 
      defaultMode = 'redact',
      batchStart = 0,
      // Optional orchestration flags to ensure fast responses under edge timeouts
      skipAdjudicator = false,
      skipPostprocess = false,
      useCachedAnalysis = false,
      phase = 'analysis' // 'analysis' | 'postprocess' (for future use)
    } = requestBody;

    // Clarify request intent to disambiguate initial vs follow-up calls in logs
    console.log(`[REQUEST_DETAILS] phase=${useCachedAnalysis ? 'followup' : 'initial'} cached=${useCachedAnalysis} skipAdjudicator=${skipAdjudicator} skipPostprocess=${skipPostprocess} comments=${comments?.length} batchStart=${batchStart}`);
    
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

    // Process only the specified batch using configured preferred batch sizes
    const remaining = Math.max(0, comments.length - batchStart);
    // Use the smallest preferred batch size across Scan A and Scan B to keep them aligned
    const preferredAForAnalysis = getPreferredBatchSize(scanA, remaining);
    const preferredBForAnalysis = getPreferredBatchSize(scanB, remaining);
    const effectiveBatchSize = Math.min(remaining, Math.min(preferredAForAnalysis, preferredBForAnalysis));
    const batch = comments.slice(batchStart, batchStart + effectiveBatchSize);
    const scannedComments = [];
    let summary = { total: batch.length, concerning: 0, identifiable: 0, needsAdjudication: 0 };

    console.log(`[PROCESS] Batch ${batchStart + 1}-${Math.min(batchStart + batch.length, comments.length)} of ${comments.length} (preferredA=${preferredAForAnalysis}, preferredB=${preferredBForAnalysis}, chosen=${effectiveBatchSize})`);

    if (batch.length === 0) {
      throw new Error('No comments in specified batch range');
    }

    // Rate limiting setup
    const rateLimiters = new Map<string, any>();
    // Per-request AI call de-duplication to avoid duplicate batch postprocess submissions
    const aiDedupe = new Set<string>();

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
      // Use same conservative defaults as per-scanner setup when limits are not configured
      let aggDefaultRpm = 10;
      let aggDefaultTpm = 50000;
      if (c.provider === 'bedrock' && !c.rpm_limit && !c.tpm_limit) {
        if (c.model.includes('haiku')) {
          aggDefaultRpm = 3;
          aggDefaultTpm = 10000;
        } else if (c.model.includes('claude')) {
          aggDefaultRpm = 5;
          aggDefaultTpm = 20000;
        } else {
          aggDefaultRpm = 6;
          aggDefaultTpm = 30000;
        }
      }
      const effectiveRpm = c.rpm_limit || aggDefaultRpm;
      const effectiveTpm = c.tpm_limit || aggDefaultTpm;
      providerModelAggregates.get(key)!.rpm.push(effectiveRpm);
      providerModelAggregates.get(key)!.tpm.push(effectiveTpm);
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
      
      if (isDebug) console.log(`Provider limiter for ${key}: RPM=${minRpm}, TPM=${minTpm}`);
    });
    // Helpers to enforce stable batch alignment
    const buildBatchAnalysisPrompt = (basePrompt: string, expectedLen: number): string => {
      const sentinels = `BOUNDING AND ORDER RULES:\n- Each comment is delimited by explicit sentinels: <<<ITEM k>>> ... <<<END k>>>.\n- Treat EVERYTHING between these sentinels as ONE single comment, even if multi-paragraph or contains lists/headings.\n- Do NOT split or merge any comment segments.\nOUTPUT RULES:\n- Return ONLY a JSON array with exactly ${expectedLen} objects, aligned to ids (1..${expectedLen}).\n- Each object MUST include: {\"index\": number (1-based id), \"concerning\": boolean, \"identifiable\": boolean, \"reasoning\": string}.\n- No prose, no code fences, no extra keys, no preface or suffix.`;
      return `${basePrompt}\n\n${sentinels}`;
    };

    const buildBatchTextPrompt = (basePrompt: string, expectedLen: number): string => {
      const sentinels = `BOUNDING AND ORDER RULES:\n- Each comment is delimited by explicit sentinels: <<<ITEM k>>> ... <<<END k>>>.\n- Treat EVERYTHING between these sentinels as ONE single comment, even if multi-paragraph or contains lists/headings.\n- Do NOT split or merge any comment segments.\nOUTPUT RULES:\n- Return ONLY a JSON array of ${expectedLen} strings, aligned to ids (1..${expectedLen}).\n- CRITICAL: Each string MUST BEGIN with the exact prefix <<<ITEM k>>> followed by a space, then the full text for k.\n- Do NOT output any headers such as "Rephrased comment:" or "Here are...".\n- Do NOT include any <<<END k>>> markers in the output.\n- Do NOT emit standalone array tokens like "[" or "]" as array items.\n- No prose, no code fences, no explanations before/after the JSON array.`;
      return `${basePrompt}\n\n${sentinels}`;
    };

    const buildSentinelInput = (texts: string[]): string => {
      return `Comments to analyze (each bounded by sentinels):\n\n${texts.map((t, i) => `<<<ITEM ${i + 1}>>>\n${t}\n<<<END ${i + 1}>>>`).join('\n\n')}`;
    };

    // Preferred batch size utilities
    function getPreferredBatchSize(config: any, fallback: number): number {
      const candidates = [
        (config && (config.preferred_batch_size ?? config.preferredBatchSize)),
        (config && (config.batch_size ?? config.batchSize)),
      ];
      for (const c of candidates) {
        const n = Number(c);
        if (Number.isFinite(n) && n > 0) return Math.max(1, Math.floor(n));
      }
      return fallback;
    }
    // Output token limit utility (reads multiple possible field names)
    function getOutputTokenLimit(config: any, fallback: number = 0): number {
      const candidates = [
        config && (config.output_token_limit ?? config.outputTokenLimit),
        config && (config.output_tokens_limit ?? config.outputTokensLimit),
        config && (config.output_tokens ?? config.outputTokens),
        config && (config.max_output_tokens ?? config.maxOutputTokens),
        config && (config.max_tokens ?? config.maxTokens)
      ];
      for (const c of candidates) {
        const n = Number(c);
        if (Number.isFinite(n) && n > 0) return Math.floor(n);
      }
      return fallback;
    }
    function chunkArray<T>(arr: T[], size: number): T[][] {
      const out: T[][] = [];
      for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
      return out;
    }
    // Resolve effective output token limit: prefer explicit config, else provider/model defaults
    function getEffectiveMaxTokens(config: any): number {
      const explicit = getOutputTokenLimit(config, 0);
      if (explicit && explicit > 0) return Math.floor(explicit);
      const provider = String(config?.provider || '').toLowerCase();
      const model = String(config?.model || '').toLowerCase();
      if (provider === 'bedrock') {
        if (model.includes('anthropic.claude')) return 4096;
        if (model.startsWith('mistral.')) return 4096; // honor higher default unless config overrides
        if (model.startsWith('amazon.titan')) return 1000;
      }
      if (provider === 'openai' || provider === 'azure') return 4096;
      return 1000;
    }

    // Batch adjudication helpers (mirror batch analysis formatting)
    const buildBatchAdjudicationPrompt = (expectedLen: number): string => {
      const sentinels = `BOUNDING AND ORDER RULES:\n- Each item is delimited by explicit sentinels: <<<ITEM k>>> ... <<<END k>>>.\n- Treat EVERYTHING between these sentinels as ONE single item.\n- Do NOT split or merge any items.\nOUTPUT RULES:\n- Return ONLY a JSON array with exactly ${expectedLen} objects, aligned to ids (1..${expectedLen}).\n- Each object MUST include: {"index": number (1-based id), "concerning": boolean, "identifiable": boolean, "reasoning": string}.\n- Preserve agreements when explicitly stated in the item notes.\n- No prose, no code fences, no extra keys, no preface or suffix.`;
      const header = `You are an adjudicator resolving disagreements between two prior scans.\nFor each item, you will receive:\n- ORIGINAL comment text\n- SCAN_A result JSON\n- SCAN_B result JSON\n- AGREEMENTS note indicating which fields already agree.\nDecide only the fields that are in disagreement; otherwise preserve agreements.`;
      return `${header}\n\n${sentinels}`;
    };

    const buildBatchAdjudicationInput = (items: Array<{ originalText: string; scanA: any; scanB: any; agreements: { concerning: boolean | null; identifiable: boolean | null } }>): string => {
      const body = items.map((it, i) => {
        const agreeConcerning = it.agreements.concerning;
        const agreeIdentifiable = it.agreements.identifiable;
        const agreeLine = `AGREEMENTS: concerning=${agreeConcerning === null ? 'DISAGREE' : agreeConcerning}, identifiable=${agreeIdentifiable === null ? 'DISAGREE' : agreeIdentifiable}`;
        return `<<<ITEM ${i + 1}>>>\nORIGINAL: ${it.originalText}\nSCAN_A: ${JSON.stringify(it.scanA)}\nSCAN_B: ${JSON.stringify(it.scanB)}\n${agreeLine}\n<<<END ${i + 1}>>>`;
      }).join('\n\n');
      return `Items for adjudication (each bounded by sentinels):\n\n${body}`;
    };

    const realignResultsByIndex = (arr: any[], expectedLen: number) => {
      const defaults = { concerning: false, identifiable: false, reasoning: 'Auto-aligned: missing result' };
      const out = Array(expectedLen).fill(null);
      for (const item of arr) {
        if (item && typeof item === 'object' && typeof item.index === 'number') {
          const i = Math.floor(item.index);
          if (i >= 1 && i <= expectedLen) {
            out[i - 1] = { concerning: !!item.concerning, identifiable: !!item.identifiable, reasoning: String(item.reasoning ?? '').trim() };
          }
        }
      }
      for (let i = 0; i < expectedLen; i++) {
        if (!out[i]) out[i] = { ...defaults };
      }
      return out;
    };

    {
      const requestStartMs = Date.now();
      const timeBudgetMs = 55000; // aim to return within ~55s to avoid client timeouts
      const REDACTION_POLICY = `\nREDACTION POLICY:\n- Replace job level/grade indicators (e.g., \"Level 5\", \"L5\", \"Band 3\") with \"XXXX\".\n- Replace tenure/time-in-role statements (e.g., \"3 years in role\", \"tenure\") with \"XXXX\".`;
      // Prepare batch input for AI models (use original text, not redacted)
      const batchTexts = batch.map(comment => comment.originalText || comment.text);
      const batchInput = buildSentinelInput(batchTexts);

      if (isDebug) console.log(`Sending ${batch.length} comments to AI models for batch analysis`);
      if (isDebug) console.log(`Batch input preview: ${preview(batchInput, 500)}`);
      if (isDebug) console.log(`Batch texts count: ${batchTexts.length}`);

        // Run Scan A and Scan B in parallel on the entire batch
      let scanAResults, scanBResults, scanARawResponse, scanBRawResponse;
      // Helper: one strict retry to enforce JSON array of correct length without prose
      const strictBatchRetry = async (
        provider: string,
        model: string,
        basePrompt: string,
        inputText: string,
        expectedLen: number,
        scannerKey: 'scan_a' | 'scan_b'
      ) => {
        const strictHeader = `STRICT MODE: Output ONLY a JSON array of exactly ${expectedLen} objects, in the same order as the inputs. Each object MUST have: {"index": number (1-based), "concerning": boolean, "identifiable": boolean, "reasoning": string}. No prose, no code fences, no extra text.`;
        const strictPrompt = `${strictHeader}\n\n${basePrompt}`;
        try {
          const maxTokens = scannerKey === 'scan_a' ? getEffectiveMaxTokens(scanA) : getEffectiveMaxTokens(scanB);
          const resp = await callAI(provider, model, strictPrompt, inputText, 'batch_analysis', scannerKey, rateLimiters, sequentialQueue, maxTokens);
          const results = resp?.results ?? resp;
          if (Array.isArray(results) && results.length === expectedLen) {
            console.log(`[STRICT RETRY] Succeeded for ${provider}/${model} with ${expectedLen} results.`);
            return results;
          }
          console.warn(`[STRICT RETRY] Returned invalid shape for ${provider}/${model}.`);
        } catch (e) {
          console.warn(`[STRICT RETRY] Failed for ${provider}/${model}:`, (e as Error).message);
        }
        return null;
      };
      if (!useCachedAnalysis) {
        try {
          const piiPolicy = `\nPII POLICY:\n- Organization/employer names are allowed and DO NOT make a comment identifiable.\n- Treat job level/grade (e.g., \"Level 5\", \"L5\"), specific internal level numbers, and tenure/time-in-role (e.g., \"3 years in role\") as personally identifiable.\n- If such attributes are present for a specific person, set \"identifiable\"=true.`;

          async function runModelBatch(config: any, texts: string[], scannerKey: 'scan_a'|'scan_b'): Promise<{ results: any[]; raw: any[] }> {
            // Single-shot batch call: never re-chunk here
            const expectedLen = texts.length;
            let enforcedPrompt = buildBatchAnalysisPrompt(config.analysis_prompt, expectedLen) + piiPolicy;
            // Strengthen Mistral guidance
            if (config.model.startsWith('mistral.')) {
              const extra = `\n\nADDITIONAL MANDATES (DO NOT IGNORE):\n- Treat EACH <<<ITEM k>>> block as ONE single comment; NEVER output more than ${expectedLen} objects.\n- Independently assess EACH comment. Do not copy the same result across items.\n- Set \"identifiable\" to true if the comment contains ANY personally identifiable information.`;
              enforcedPrompt += extra;
            }
            const input = buildSentinelInput(texts);
            let resp: any;
            if (config.model.startsWith('mistral.') && expectedLen === 1) {
              // Avoid Mistral oddities on single-item batch
              resp = await callAI(
                config.provider,
                config.model,
                config.analysis_prompt + piiPolicy,
                texts[0],
                'analysis',
                scannerKey,
                rateLimiters,
                sequentialQueue,
                getEffectiveMaxTokens(config)
              );
              resp = { results: [resp?.results || resp] };
            } else {
              // Use only enforcedPrompt as system and the sentinel input as user; avoid duplicating basePrompt elsewhere
              resp = await callAI(
                config.provider,
                config.model,
                enforcedPrompt,
                input,
                'batch_analysis',
                scannerKey,
                rateLimiters,
                sequentialQueue,
                getEffectiveMaxTokens(config)
              );
            }
            let results = resp?.results || resp;
            // If model returned indexed objects but count mismatches, realign before retrying
            if (Array.isArray(results) && results.some((x: any) => x && typeof x.index === 'number')) {
              results = realignResultsByIndex(results, expectedLen);
            }
            if (!Array.isArray(results) || results.length !== expectedLen) {
              const retried = await strictBatchRetry(config.provider, config.model, config.analysis_prompt, input, expectedLen, scannerKey);
              if (retried) results = retried;
            }
            if (!Array.isArray(results)) {
              // Final guard: pad/truncate
              const defaultResult = { concerning: false, identifiable: false, reasoning: 'Default result due to missing analysis' };
              results = Array(expectedLen).fill(null).map(() => ({ ...defaultResult }));
            } else if (results.length !== expectedLen) {
              results = results.slice(0, expectedLen);
              while (results.length < expectedLen) results.push({ concerning: false, identifiable: false, reasoning: 'Padded default due to missing analysis' });
            }
            return { results, raw: [resp?.rawResponse ?? null] };
          }

          const [aOut, bOut] = await Promise.all([
            runModelBatch(scanA, batchTexts, 'scan_a'),
            runModelBatch(scanB, batchTexts, 'scan_b')
          ]);

          scanAResults = aOut.results;
          scanBResults = bOut.results;
          scanARawResponse = null;
          scanBRawResponse = null;
            
            if (isDebug) {
              console.log(`Scan A results count: ${Array.isArray(scanAResults) ? scanAResults.length : 'n/a'}`);
              console.log(`Scan B results count: ${Array.isArray(scanBResults) ? scanBResults.length : 'n/a'}`);
            }

            // Realign by explicit indices if provided by the model
            if (Array.isArray(scanAResults) && scanAResults.some((x: any) => x && typeof x.index === 'number')) {
              console.log('Realigning Scan A results by index field');
              scanAResults = realignResultsByIndex(scanAResults, batch.length);
            }
            if (Array.isArray(scanBResults) && scanBResults.some((x: any) => x && typeof x.index === 'number')) {
              console.log('Realigning Scan B results by index field');
              scanBResults = realignResultsByIndex(scanBResults, batch.length);
            }
            
            // Additional debugging: Check if the AI returned a string that needs parsing
            if (typeof scanBResults === 'string') {
              console.warn(`⚠️ Scan B returned string instead of parsed JSON:`, (scanBResults as string).substring(0, 200));
              try {
                const parsed = JSON.parse(scanBResults as string);
                scanBResults = parsed;
                console.log(`✅ Successfully parsed Scan B string response:`, typeof parsed, Array.isArray(parsed) ? parsed.length : 'not array');
              } catch (parseError) {
                console.error(`❌ Failed to parse Scan B string response:`, parseError);
                // Fallback to individual processing
                scanBResults = null;
              }
            }
            
            if (typeof scanAResults === 'string') {
              console.warn(`⚠️ Scan A returned string instead of parsed JSON:`, (scanAResults as string).substring(0, 200));
              try {
                const parsed = JSON.parse(scanAResults as string);
                scanAResults = parsed;
                console.log(`✅ Successfully parsed Scan A string response:`, typeof parsed, Array.isArray(parsed) ? parsed.length : 'not array');
              } catch (parseError) {
                console.error(`❌ Failed to parse Scan A string response:`, parseError);
                // Fallback to individual processing
                scanAResults = null;
              }
            }
        } catch (error) {
          console.error(`Parallel batch scanning failed:`, error);
          throw error;
        }
      } else {
        // Use cached analysis results from incoming comments
        console.log(`Using cached analysis for ${batch.length} comments`);
        scanAResults = batch.map((c: any) => c?.debugInfo?.scanAResult || null);
        scanBResults = batch.map((c: any) => c?.debugInfo?.scanBResult || null);
        scanARawResponse = null;
        scanBRawResponse = null;
      }

        console.log(`[RESULT] Scan A ${scanA.provider}/${scanA.model}: type=${typeof scanAResults} len=${Array.isArray(scanAResults) ? scanAResults.length : 'n/a'}`);
        console.log(`[RESULT] Scan B ${scanB.provider}/${scanB.model}: type=${typeof scanBResults} len=${Array.isArray(scanBResults) ? scanBResults.length : 'n/a'}`);
        if (isDebug) console.log(`Scan A sample: ${preview(JSON.stringify(scanAResults?.[0] ?? ''), 200)}`);
        if (isDebug) console.log(`Scan B sample: ${preview(JSON.stringify(scanBResults?.[0] ?? ''), 200)}`);
        
        // Additional debugging for Scan B results mismatch
        if (Array.isArray(scanBResults) && scanBResults.length !== batch.length) {
          console.warn(`⚠️ SCAN B BATCH MISMATCH: Expected ${batch.length} results, got ${scanBResults.length}`);
          console.warn(`Scan B results structure:`, scanBResults);
          console.warn(`Batch length:`, batch.length);
          
          // Log first few results to see the pattern
          for (let i = 0; i < Math.min(scanBResults.length, 5); i++) {
            console.log(`Scan B result ${i}:`, scanBResults[i]);
          }
          
          // Fix: Truncate Scan B results to match batch size if we have too many
          if (scanBResults.length > batch.length) {
            console.warn(`🔧 FIXING: Truncating Scan B results from ${scanBResults.length} to ${batch.length}`);
            scanBResults = scanBResults.slice(0, batch.length);
          }
          
          // Additional safety: If we still have mismatched results, pad with default values
          if (scanBResults.length < batch.length) {
            console.warn(`🔧 FIXING: Padding Scan B results from ${scanBResults.length} to ${batch.length}`);
            const defaultResult = { concerning: false, identifiable: false, reasoning: 'Default result due to missing analysis' };
            while (scanBResults.length < batch.length) {
              scanBResults.push({ ...defaultResult });
            }
          }
        }
        
        // Additional debugging for Scan A results mismatch
        if (Array.isArray(scanAResults) && scanAResults.length !== batch.length) {
          console.warn(`⚠️ SCAN A BATCH MISMATCH: Expected ${batch.length} results, got ${scanAResults.length}`);
          console.warn(`Scan A results structure:`, scanAResults);
          console.warn(`Batch length:`, batch.length);
          
          // Log first few results to see the pattern
          for (let i = 0; i < Math.min(scanAResults.length, 5); i++) {
            console.log(`Scan A result ${i}:`, scanAResults[i]);
          }
          // Do not issue another strict retry here; runModelBatch has already attempted one
            // Fix: Truncate Scan A results to match batch size if we have too many
            if (scanAResults.length > batch.length) {
              console.warn(`🔧 FIXING: Truncating Scan A results from ${scanAResults.length} to ${batch.length}`);
              scanAResults = scanAResults.slice(0, batch.length);
            }
            // Additional safety: If we still have mismatched results, pad with default values
            if (scanAResults.length < batch.length) {
              console.warn(`🔧 FIXING: Padding Scan A results from ${scanAResults.length} to ${batch.length}`);
              const defaultResult = { concerning: false, identifiable: false, reasoning: 'Default result due to missing analysis' };
              const defaultResultCopy = JSON.parse(JSON.stringify(defaultResult));
              while (scanAResults.length < batch.length) {
                scanAResults.push({ ...defaultResultCopy });
            }
          }
        }

        // Ensure we have results for all comments in the batch
      const scanAValid = Array.isArray(scanAResults) && scanAResults.length === batch.length;
      const scanBValid = Array.isArray(scanBResults) && scanBResults.length === batch.length;
      
      // Additional validation: Check that each result has the expected structure
      if (scanAValid && Array.isArray(scanAResults)) {
        for (let i = 0; i < scanAResults.length; i++) {
          const result = scanAResults[i];
          if (!result || typeof result.concerning !== 'boolean' || typeof result.identifiable !== 'boolean' || !result.reasoning) {
            console.warn(`⚠️ SCAN A RESULT ${i} INVALID STRUCTURE:`, result);
            // Fix the invalid result
            scanAResults[i] = {
              concerning: false,
              identifiable: false,
              reasoning: 'Fixed invalid result structure'
            };
          }
        }
      }
      
      if (scanBValid && Array.isArray(scanBResults)) {
        for (let i = 0; i < scanBResults.length; i++) {
          const result = scanBResults[i];
          if (!result || typeof result.concerning !== 'boolean' || typeof result.identifiable !== 'boolean' || !result.reasoning) {
            console.warn(`⚠️ SCAN B RESULT ${i} INVALID STRUCTURE:`, result);
            // Fix the invalid result
            scanBResults[i] = {
              concerning: false,
              identifiable: false,
              reasoning: 'Fixed invalid result structure'
            };
          }
        }
      }
      
      if (!scanAValid || !scanBValid) {
        console.warn(`Invalid batch results - Scan A (${scanA.provider}/${scanA.model}): ${scanAValid ? 'valid' : `invalid (${Array.isArray(scanAResults) ? `got ${scanAResults.length} results for ${batch.length} comments` : 'not array'})`}, Scan B (${scanB.provider}/${scanB.model}): ${scanBValid ? 'valid' : `invalid (${Array.isArray(scanBResults) ? `got ${scanBResults.length} results for ${batch.length} comments` : 'not array'})`} - falling back to individual processing`);
        
        // Fallback to individual processing - process sequentially to maintain order
        for (let j = 0; j < batch.length; j++) {
          const comment = batch[j];
          console.log(`Processing comment ${comment.id} individually (index ${j}) with Scan A (${scanA.provider}/${scanA.model}) and Scan B (${scanB.provider}/${scanB.model})...`);

          try {
            // Process one at a time to maintain strict order and avoid sync issues (use original text)
            const scanAResponse = await callAI(scanA.provider, scanA.model, scanA.analysis_prompt.replace('list of comments', 'comment').replace('parallel list of JSON objects', 'single JSON object'), comment.originalText || comment.text, 'analysis', 'scan_a', rateLimiters, sequentialQueue, getEffectiveMaxTokens(scanA));
            const scanBResponse = await callAI(scanB.provider, scanB.model, scanB.analysis_prompt.replace('list of comments', 'comment').replace('parallel list of JSON objects', 'single JSON object'), comment.originalText || comment.text, 'analysis', 'scan_b', rateLimiters, sequentialQueue, getEffectiveMaxTokens(scanB));

            // Deep clone the results to avoid mutation issues
            const scanAResult = JSON.parse(JSON.stringify(scanAResponse?.results || scanAResponse));
            const scanBResult = JSON.parse(JSON.stringify(scanBResponse?.results || scanBResponse));
            
            console.log(`Individual processing for comment ${comment.id} (index ${j}) - Scan A result:`, scanAResult);
            console.log(`Individual processing for comment ${comment.id} (index ${j}) - Scan B result:`, scanBResult);
            console.log(`Scan A raw response:`, scanAResponse);
            console.log(`Scan B raw response:`, scanBResponse);
            console.log(`Scan A results field:`, scanAResponse?.results);
            console.log(`Scan B results field:`, scanBResponse?.results);
            
            await processIndividualComment(
              comment,
              scanAResult,
              scanBResult,
              scanA,
              scanB,
              adjudicator,
              defaultMode,
              summary,
              scannedComments,
              rateLimiters,
              sequentialQueue,
              scanAResponse?.rawResponse,
              scanBResponse?.rawResponse,
              { skipAdjudicator, skipPostprocess, requestStartMs, timeBudgetMs }
            );
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
        console.log(`✅ BATCH PROCESSING: Processing ${batch.length} comments with validated results`);
        console.log(`✅ Scan A results count: ${scanAResults.length}`);
        console.log(`✅ Scan B results count: ${scanBResults.length}`);
        
        // Final validation: Ensure we have valid results for each comment
        if (scanAResults.length !== batch.length || scanBResults.length !== batch.length) {
          console.error(`❌ CRITICAL: Results count mismatch after validation! Batch: ${batch.length}, Scan A: ${scanAResults.length}, Scan B: ${scanBResults.length}`);
          throw new Error(`Results count mismatch after validation: Batch ${batch.length}, Scan A ${scanAResults.length}, Scan B ${scanBResults.length}`);
        }
        
        // Queue for batched adjudication when using cached analysis (Phase 2 adjudication-only)
        const adjQueue: Array<{ scannedIndex: number; comment: any; scanAResult: any; scanBResult: any; bothAgreeConcerning: boolean; bothAgreeIdentifiable: boolean }>= [];
        
        for (let j = 0; j < batch.length; j++) {
          const comment = batch[j];
          const scanAResult = scanAResults[j];
          const scanBResult = scanBResults[j];
          
          if (isDebug) console.log(`Batch processing comment ${comment.id} (index ${j}) - Scan A: ${preview(JSON.stringify(scanAResult), 240)}`);
          if (isDebug) console.log(`Batch processing comment ${comment.id} (index ${j}) - Scan B: ${preview(JSON.stringify(scanBResult), 240)}`);

          // Heuristic safety net - only use when the model response is unusable
          const heur = heuristicAnalyze(comment.originalText || comment.text);
          const patchResult = (r: any) => {
            if (!r) return { concerning: heur.concerning, identifiable: heur.identifiable, reasoning: 'Heuristic fallback: ' + heur.reasoning };
            if (typeof r.concerning !== 'boolean') r.concerning = false;
            if (typeof r.identifiable !== 'boolean') r.identifiable = false;
            if (r.identifiable === false && heur.identifiable === true) {
              r.identifiable = true;
              if (!/PII|personally identifiable|email|phone|id|badge|SSN|level|grade|tenure/i.test(r.reasoning || '')) {
                r.reasoning = (r.reasoning ? r.reasoning + ' | ' : '') + 'Safety net: Detected PII in the original text.';
              }
            }
            if (!r.reasoning || r.reasoning.trim() === '') {
              r = heur.concerning || heur.identifiable
                ? { concerning: heur.concerning, identifiable: heur.identifiable, reasoning: 'AI provided no analysis, heuristic fallback: ' + heur.reasoning }
                : { ...r, reasoning: 'No concerning content or identifiable information detected.' };
            }
            return r;
          };
          
          let scanAResultCopy = JSON.parse(JSON.stringify(scanAResult));
          let scanBResultCopy = JSON.parse(JSON.stringify(scanBResult));
          const scanAResultToProcess = Array.isArray(scanAResultCopy) ? scanAResultCopy[0] : scanAResultCopy;
          const scanBResultToProcess = Array.isArray(scanBResultCopy) ? scanBResultCopy[0] : scanBResultCopy;
          patchResult(scanAResultToProcess);
          patchResult(scanBResultToProcess);
          try { scanAResultCopy = JSON.parse(JSON.stringify(scanAResultToProcess)); } catch {}
          try { scanBResultCopy = JSON.parse(JSON.stringify(scanBResultToProcess)); } catch {}

          let finalResult = null as any;
          let adjudicationResult = null as any;
          let needsAdjudication = false;
          const safetyNetTriggered = Boolean((scanAResultToProcess as any)?.__piiSafetyNetApplied || (scanBResultToProcess as any)?.__piiSafetyNetApplied);

          const concerningDisagreement = scanAResultCopy.concerning !== scanBResultCopy.concerning;
          const identifiableDisagreement = scanAResultCopy.identifiable !== scanBResultCopy.identifiable;
          
          if (concerningDisagreement || identifiableDisagreement || safetyNetTriggered) {
            needsAdjudication = true;

            // Always use batched adjudication when possible to avoid duplicate calls
            if (!skipAdjudicator) {
              const finalMode = (scanAResultCopy.concerning || scanAResultCopy.identifiable) ? defaultMode : 'original';
              const placeholder: any = {
                ...comment,
                text: finalMode === 'original' ? (comment.originalText || comment.text) : comment.text,
                concerning: scanAResultCopy.concerning,
                identifiable: scanAResultCopy.identifiable,
                aiReasoning: scanAResultCopy.reasoning,
                redactedText: null,
                rephrasedText: null,
                mode: finalMode,
                approved: false,
                hideAiResponse: false,
                debugInfo: {
                  scanAResult: { ...scanAResultCopy, model: `${scanA.provider}/${scanA.model}` },
                  scanBResult: { ...scanBResultCopy, model: `${scanB.provider}/${scanB.model}` },
                  adjudicationResult: { skipped: true, reason: 'batched_pending' } as any,
                  needsAdjudication: true,
                  safetyNetTriggered,
                  finalDecision: null,
                  rawResponses: {
                    scanAResponse: scanARawResponse,
                    scanBResponse: scanBRawResponse,
                    adjudicationResponse: null
                  }
                }
              };
              const scannedIndex = scannedComments.length;
              scannedComments.push(placeholder);
              adjQueue.push({
                scannedIndex,
                comment,
                scanAResult: scanAResultCopy,
                scanBResult: scanBResultCopy,
                bothAgreeConcerning: !concerningDisagreement,
                bothAgreeIdentifiable: !identifiableDisagreement && !safetyNetTriggered
              });
              continue;
            }

            // Individual adjudication is now handled by the batched approach above
            // This ensures we don't make duplicate adjudicator calls

            // Individual adjudication logic removed - now handled by batched approach
            // Individual adjudication prompt removed - now handled by batched approach

            // Individual adjudication calls removed - now handled by batched approach

            // Individual adjudication result processing removed - now handled by batched approach

            // Summary updates removed - now handled by batched approach

            // Individual adjudication processing removed - now handled by batched approach
            const processedComment = {
              ...comment,
              text: finalMode === 'original' ? (comment.originalText || comment.text) : comment.text,
              concerning: scanAResultCopy.concerning,
              identifiable: scanAResultCopy.identifiable,
              aiReasoning: scanAResultCopy.reasoning,
              redactedText: null,
              rephrasedText: null,
              mode: finalMode,
              approved: false,
              hideAiResponse: false,
              debugInfo: {
                scanAResult: { ...scanAResultCopy, model: `${scanA.provider}/${scanA.model}` },
                scanBResult: { ...scanBResultCopy, model: `${scanB.provider}/${scanB.model}` },
                adjudicationResult: { skipped: true, reason: 'batched_pending' } as any
                  ? { ...adjudicationResult, model: adjudicatorFallbackUsed ? `${scanB.provider}/${scanB.model}` : `${adjudicator.provider}/${adjudicator.model}` }
                  : (adjudicationSkippedReason ? { skipped: true, reason: adjudicationSkippedReason } as any : null),
                needsAdjudication,
                safetyNetTriggered,
                finalDecision: null,
                rawResponses: {
                  scanAResponse: scanARawResponse,
                  scanBResponse: scanBRawResponse,
                  adjudicationResponse: adjudicationResult?.rawResponse
                },
                piiSafetyNetApplied: Boolean((scanAResultCopy as any)?.__piiSafetyNetApplied || (scanBResultCopy as any)?.__piiSafetyNetApplied || (finalResult as any)?.__piiSafetyNetApplied),
                adjudicatorFallbackUsed: adjudicatorFallbackUsed || undefined
              }
            } as any;

            scannedComments.push(processedComment);
          } else {
            // No adjudication needed; use Scan A result (already patched) as final
            const finalMode = (scanAResultCopy.concerning || scanAResultCopy.identifiable) ? defaultMode : 'original';
            const processedComment = {
              ...comment,
              text: finalMode === 'original' ? (comment.originalText || comment.text) : comment.text,
              concerning: scanAResultCopy.concerning,
              identifiable: scanAResultCopy.identifiable,
              aiReasoning: scanAResultCopy.reasoning,
              redactedText: null,
              rephrasedText: null,
              mode: finalMode,
              approved: false,
              hideAiResponse: false,
              debugInfo: {
                scanAResult: { ...scanAResultCopy, model: `${scanA.provider}/${scanA.model}` },
                scanBResult: { ...scanBResultCopy, model: `${scanB.provider}/${scanB.model}` },
                adjudicationResult: null,
                needsAdjudication: false,
                safetyNetTriggered,
                finalDecision: scanAResultCopy,
                rawResponses: {
                  scanAResponse: scanARawResponse,
                  scanBResponse: scanBRawResponse,
                  adjudicationResponse: null
                },
                piiSafetyNetApplied: Boolean((scanAResultCopy as any)?.__piiSafetyNetApplied || (scanBResultCopy as any)?.__piiSafetyNetApplied)
              }
            } as any;
            if (processedComment.concerning) summary.concerning++;
            if (processedComment.identifiable) summary.identifiable++;
            scannedComments.push(processedComment);
          }
        }

        // Perform one batched adjudication call for all queued items and update placeholders
        if (adjQueue.length > 0) {
          try {
            // De-duplicate adjudication items by comment id to avoid double processing within a single run
            const uniqueAdjQueue = Array.from(new Map(adjQueue.map(q => [q.comment.id, q])).values());
            // Respect preferred batch size for adjudicator as well
            const preferredAdj = getPreferredBatchSize(adjudicator, uniqueAdjQueue.length);
            const adjChunks = chunkArray(uniqueAdjQueue, preferredAdj);
            for (const chunk of adjChunks) {
              // Idempotency guard: prevent duplicate adjudication calls for the same set of ids within one run
              const adjKey = `adjudicate:${adjudicator.provider}:${adjudicator.model}:${chunk.map(q => q.comment.id).join(',')}`;
              if (aiDedupe.has(adjKey)) {
                console.log(`Skipping duplicate adjudication batch for key ${adjKey}`);
                continue;
              }
              aiDedupe.add(adjKey);
              const items = chunk.map(q => ({
                originalText: q.comment.originalText || q.comment.text,
                scanA: q.scanAResult,
                scanB: q.scanBResult,
                agreements: {
                  concerning: q.bothAgreeConcerning ? q.scanAResult.concerning : null,
                  identifiable: q.bothAgreeIdentifiable ? q.scanAResult.identifiable : null
                }
              }));
              const prompt = buildBatchAdjudicationPrompt(items.length);
              const input = buildBatchAdjudicationInput(items);
              let adjResp: any;
              
              console.log(`Starting adjudication with primary model: ${adjudicator.provider}/${adjudicator.model}`);
              try {
                adjResp = await callAI(
                  adjudicator.provider,
                  adjudicator.model,
                  prompt,
                  input,
                  'batch_analysis',
                  'adjudicator',
                  rateLimiters,
                  sequentialQueue,
                  getEffectiveMaxTokens(adjudicator)
                );
              } catch (primaryErr) {
                console.warn(`Primary adjudicator (${adjudicator.provider}/${adjudicator.model}) failed:`, (primaryErr as Error).message);
                // Only use fallback for critical errors, not for parsing issues
                if (primaryErr instanceof Error && 
                    (primaryErr.message.includes('timeout') || 
                     primaryErr.message.includes('rate limit') || 
                     primaryErr.message.includes('quota') ||
                     primaryErr.message.includes('service unavailable'))) {
                  console.log(`Using fallback adjudicator (${scanB.provider}/${scanB.model}) due to critical error`);
                  adjResp = await callAI(
                    scanB.provider,
                    scanB.model,
                    prompt,
                    input,
                    'batch_analysis',
                    'adjudicator',
                    rateLimiters,
                    sequentialQueue,
                    getEffectiveMaxTokens(scanB)
                  );
                } else {
                  console.log(`Skipping fallback adjudicator - error appears to be parsing-related, not critical`);
                  console.log(`Error details: ${(primaryErr as Error).message}`);
                  // Set a default response to avoid further processing
                  adjResp = { results: null };
                }
              }
              let adjResults = adjResp?.results || adjResp;
              
              // Log the adjudication response for debugging
              console.log(`Adjudication response type: ${typeof adjResults}, isArray: ${Array.isArray(adjResults)}`);
              if (adjResults) {
                console.log(`Adjudication response preview: ${preview(JSON.stringify(adjResults), 200)}`);
              }
              
              if (!Array.isArray(adjResults)) {
                const extracted = extractJsonArrayOrObjects(typeof adjResults === 'string' ? adjResults : JSON.stringify(adjResults));
                if (Array.isArray(extracted)) {
                  adjResults = extracted;
                  console.log(`Successfully extracted JSON array from adjudication response`);
                } else {
                  console.warn(`Failed to extract valid JSON array from adjudication response`);
                }
              }
              
              if (Array.isArray(adjResults) && adjResults.some((x: any) => x && typeof x.index === 'number')) {
                adjResults = realignResultsByIndex(adjResults, items.length);
                console.log(`Realigned adjudication results by index`);
              }
              
              // Validate that we have valid adjudication results before processing
              if (!Array.isArray(adjResults) || adjResults.length === 0) {
                console.warn(`No valid adjudication results available, using Scan A results as fallback`);
                // Process with Scan A results only
                for (let qi = 0; qi < chunk.length; qi++) {
                  const q = chunk[qi];
                  const prev = scannedComments[q.scannedIndex];
                  const resolved = {
                    concerning: q.scanAResult.concerning,
                    identifiable: q.scanAResult.identifiable,
                    reasoning: q.scanAResult.reasoning
                  };
                  
                  if (resolved.concerning) summary.concerning++;
                  if (resolved.identifiable) summary.identifiable++;
                  summary.needsAdjudication++;

                  prev.concerning = resolved.concerning;
                  prev.identifiable = resolved.identifiable;
                  prev.aiReasoning = `Adjudication failed, using Scan A result: ${resolved.reasoning}`.trim();
                  prev.mode = (resolved.concerning || resolved.identifiable) ? defaultMode : 'original';
                  prev.text = prev.mode === 'original' ? (q.comment.originalText || q.comment.text) : prev.text;
                  prev.debugInfo = {
                    ...prev.debugInfo,
                    adjudicationResult: { skipped: true, reason: 'adjudication_failed' } as any,
                    finalDecision: resolved,
                    rawResponses: { ...(prev.debugInfo?.rawResponses || {}), adjudicationResponse: null }
                  };
                }
              } else {
                // Process with valid adjudication results
                for (let qi = 0; qi < chunk.length; qi++) {
                const q = chunk[qi];
                const res = Array.isArray(adjResults) ? adjResults[qi] : null;
                const prev = scannedComments[q.scannedIndex];
                const resolved = {
                  concerning: q.bothAgreeConcerning ? q.scanAResult.concerning : (res?.concerning ?? q.scanAResult.concerning),
                  identifiable: q.bothAgreeIdentifiable ? q.scanAResult.identifiable : (res?.identifiable ?? q.scanAResult.identifiable),
                  reasoning: res?.reasoning || q.scanAResult.reasoning
                };
                if (resolved.concerning) summary.concerning++;
                if (resolved.identifiable) summary.identifiable++;
                summary.needsAdjudication++;

                prev.concerning = resolved.concerning;
                prev.identifiable = resolved.identifiable;
                prev.aiReasoning = `Adjudicator: ${resolved.reasoning}`.trim();
                prev.mode = (resolved.concerning || resolved.identifiable) ? defaultMode : 'original';
                prev.text = prev.mode === 'original' ? (q.comment.originalText || q.comment.text) : prev.text;
                                  prev.debugInfo = {
                    ...prev.debugInfo,
                    adjudicationResult: { ...(res || resolved), model: `${adjudicator.provider}/${adjudicator.model}` },
                    finalDecision: resolved,
                    rawResponses: { ...(prev.debugInfo?.rawResponses || {}), adjudicationResponse: (adjResp && (adjResp as any).rawResponse) || null }
                  };
                }
              }
            }
          } catch (e) {
            console.warn('Batched adjudication failed; keeping placeholder scan decisions:', (e as Error).message);
          }
        }

        // Batch process redaction and rephrasing for flagged comments
        const flaggedComments = scannedComments.filter(c => c.concerning || c.identifiable);
        if (!skipPostprocess && flaggedComments.length > 0) {
          const flaggedTexts = flaggedComments.map(c => c.originalText || c.text);
          const activeConfig = scanA; // Use scan_a config for batch operations

          try {
            const activeIsVeryLowRpm = activeConfig.provider === 'bedrock' && /sonnet|opus/i.test(activeConfig.model);
            const outOfTime = Date.now() - requestStartMs > timeBudgetMs;
            // Skip only if we're out of time; allow batching even on very low RPM models (handled by sequential queue and backoff)
            if (outOfTime) {
              console.log('Skipping redaction/rephrasing to avoid timeouts (time budget exceeded)');
            } else if (activeConfig.provider === 'bedrock' && activeConfig.model.startsWith('mistral.')) {
              for (let k = 0; k < scannedComments.length; k++) {
                if (scannedComments[k].concerning || scannedComments[k].identifiable) {
                  try {
                    const [red, reph] = await Promise.all([
                      callAI(activeConfig.provider, activeConfig.model, activeConfig.redact_prompt.replace('these comments', 'this comment').replace('parallel list', 'single'), scannedComments[k].originalText || scannedComments[k].text, 'text', 'scan_a', rateLimiters),
                      callAI(activeConfig.provider, activeConfig.model, activeConfig.rephrase_prompt.replace('these comments', 'this comment').replace('parallel list', 'single'), scannedComments[k].originalText || scannedComments[k].text, 'text', 'scan_a', rateLimiters)
                    ]);
                    scannedComments[k].redactedText = enforceRedactionPolicy(red);
                    scannedComments[k].rephrasedText = reph;

                    if (scannedComments[k].mode === 'redact' && red) {
                      scannedComments[k].text = enforceRedactionPolicy(red);
                    } else if (scannedComments[k].mode === 'rephrase' && reph) {
                      scannedComments[k].text = reph;
                    }
                  } catch (perItemErr) {
                    console.warn(`Per-item redaction/rephrasing failed for comment index ${k}:`, perItemErr);
                  }
                }
              }
            } else if (!outOfTime) {
              // Respect preferred batch size for post-processing
              const preferredPost = getPreferredBatchSize(activeConfig, flaggedTexts.length);
              const chunks = chunkArray(flaggedTexts, preferredPost);
              const redactedTextsAll: string[] = [];
              const rephrasedTextsAll: string[] = [];
              for (const chunk of chunks) {
                const redPrompt = buildBatchTextPrompt(activeConfig.redact_prompt + REDACTION_POLICY, chunk.length);
                const rephPrompt = buildBatchTextPrompt(activeConfig.rephrase_prompt, chunk.length);
                const sentinelInput = buildSentinelInput(chunk);
                const postKey = `${activeConfig.provider}:${activeConfig.model}:post_batch:${chunk.length}:${sentinelInput.length}`;
                if (aiDedupe.has(postKey)) {
                  console.log(`Skipping duplicate batch postprocess for key ${postKey}`);
                  continue;
                }
                aiDedupe.add(postKey);
                let rawRedacted: any = [];
                let rawRephrased: any = [];
                if (activeConfig.provider === 'bedrock') {
                  rawRedacted = await callAI(activeConfig.provider, activeConfig.model, redPrompt, sentinelInput, 'batch_text', 'scan_a', rateLimiters, undefined, getEffectiveMaxTokens(activeConfig));
                  rawRephrased = await callAI(activeConfig.provider, activeConfig.model, rephPrompt, sentinelInput, 'batch_text', 'scan_a', rateLimiters, undefined, getEffectiveMaxTokens(activeConfig));
                } else {
                  [rawRedacted, rawRephrased] = await Promise.all([
                    callAI(activeConfig.provider, activeConfig.model, redPrompt, sentinelInput, 'batch_text', 'scan_a', rateLimiters, undefined, getEffectiveMaxTokens(activeConfig)),
                    callAI(activeConfig.provider, activeConfig.model, rephPrompt, sentinelInput, 'batch_text', 'scan_a', rateLimiters, undefined, getEffectiveMaxTokens(activeConfig))
                  ]);
                }

              let redactedTexts = normalizeBatchTextParsed(rawRedacted);
              let rephrasedTexts = normalizeBatchTextParsed(rawRephrased);

              // If model returned aligned ID-tagged strings, strip tags and re-align by ID
                const idTag = /^\s*<<<(?:ID|ITEM)\s+(\d+)>>>\s*/i;
              const stripAndIndex = (arr: string[]) => arr.map(s => {
                const m = idTag.exec(s || '');
                return { idx: m ? parseInt(m[1], 10) : null, text: m ? s.replace(idTag, '').trim() : (s || '').trim() };
              });
              const redIdx = stripAndIndex(redactedTexts);
              const rephIdx = stripAndIndex(rephrasedTexts);
              const allHaveIds = redIdx.every(x => x.idx != null) && rephIdx.every(x => x.idx != null);
              if (allHaveIds) {
                const expected = flaggedTexts.length;
                const byId = (list: { idx: number|null; text: string }[]) => {
                  const out: string[] = Array(expected).fill('');
                  for (const it of list) {
                    if (it.idx && it.idx >= 1 && it.idx <= expected) out[it.idx - 1] = it.text;
                  }
                  return out;
                };
                redactedTexts = byId(redIdx).map(enforceRedactionPolicy) as string[];
                rephrasedTexts = byId(rephIdx);
              } else {
                redactedTexts = redactedTexts.map(enforceRedactionPolicy);
              }

              // Validate lengths and basic sanity; if invalid, run targeted per-item fallbacks
              const isInvalid = (s: string | null | undefined) => !s || !String(s).trim() || /^(\[|here\s+(is|are))/i.test(String(s).trim());
                const expected = chunk.length;
              let needsFallback = redactedTexts.length !== expected || rephrasedTexts.length !== expected || redactedTexts.some(isInvalid) || rephrasedTexts.some(isInvalid);
              if (needsFallback) {
                console.warn(`Batch text outputs invalid or mismatched (expected=${expected}, red=${redactedTexts.length}, reph=${rephrasedTexts.length}). Running per-item fallback for failed entries.`);
                // Build index list of flagged comments to process individually for the failed ones
                  for (let flaggedIndex = 0; flaggedIndex < chunk.length; flaggedIndex++) {
                  const red = redactedTexts[flaggedIndex];
                  const reph = rephrasedTexts[flaggedIndex];
                  const redBad = flaggedIndex >= redactedTexts.length || isInvalid(red);
                  const rephBad = flaggedIndex >= rephrasedTexts.length || isInvalid(reph);
                  if (redBad || rephBad) {
                    try {
                      const [red1, reph1] = await Promise.all([
                          redBad ? callAI(
                            activeConfig.provider,
                            activeConfig.model,
                            activeConfig.redact_prompt.replace('these comments', 'this comment').replace('parallel list', 'single'),
                            chunk[flaggedIndex],
                            'text',
                            'scan_a',
                            rateLimiters,
                            undefined,
                            getEffectiveMaxTokens(activeConfig)
                          ) : Promise.resolve(red),
                          rephBad ? callAI(
                            activeConfig.provider,
                            activeConfig.model,
                            activeConfig.rephrase_prompt.replace('these comments', 'this comment').replace('parallel list', 'single'),
                            chunk[flaggedIndex],
                            'text',
                            'scan_a',
                            rateLimiters,
                            undefined,
                            getEffectiveMaxTokens(activeConfig)
                          ) : Promise.resolve(reph)
                      ]);
                      if (redBad) redactedTexts[flaggedIndex] = enforceRedactionPolicy(red1 as string);
                      if (rephBad) rephrasedTexts[flaggedIndex] = reph1 as string;
                    } catch (perItemErr) {
                      console.warn(`Per-item fallback failed for flagged index ${flaggedIndex}:`, perItemErr);
                    }
                  }
                  }
                }

                redactedTextsAll.push(...redactedTexts.map(enforceRedactionPolicy) as string[]);
                rephrasedTextsAll.push(...rephrasedTexts);
              }

              // Apply accumulated redacted and rephrased texts across all flagged comments
              let flaggedIndex = 0;
              for (let k = 0; k < scannedComments.length; k++) {
                if (scannedComments[k].concerning || scannedComments[k].identifiable) {
                  scannedComments[k].redactedText = redactedTextsAll[flaggedIndex] ?? null;
                  scannedComments[k].rephrasedText = rephrasedTextsAll[flaggedIndex] ?? null;
                  if (scannedComments[k].mode === 'redact' && redactedTextsAll[flaggedIndex]) {
                    scannedComments[k].text = enforceRedactionPolicy(redactedTextsAll[flaggedIndex]);
                  } else if (scannedComments[k].mode === 'rephrase' && rephrasedTextsAll[flaggedIndex]) {
                    scannedComments[k].text = rephrasedTextsAll[flaggedIndex];
                  }
                  flaggedIndex++;
                }
              }

              // Additional Phase 2: for items where Scan B flagged identifiable but Scan A did not,
              // and adjudicator's final decision is identifiable, generate redaction/rephrase with Scan B
              const preferBIndices: number[] = [];
              for (let i = 0; i < scannedComments.length; i++) {
                const c = scannedComments[i];
                const di = c?.debugInfo || {};
                const a = di.scanAResult || {};
                const b = di.scanBResult || {};
                const fd = di.finalDecision || {};
                if ((a?.identifiable === false) && (b?.identifiable === true) && (fd?.identifiable === true)) {
                  preferBIndices.push(i);
                }
              }
              if (preferBIndices.length > 0) {
                const preferBTexts = preferBIndices.map(i => scannedComments[i].originalText || scannedComments[i].text);
                const activeConfigB = scanB;
                const preferredPostB = getPreferredBatchSize(activeConfigB, preferBTexts.length);
                const bChunks = chunkArray(preferBTexts, preferredPostB);
                const redBAll: string[] = [];
                const rephBAll: string[] = [];
                for (const chunk of bChunks) {
                  const redPromptB = buildBatchTextPrompt(activeConfigB.redact_prompt + REDACTION_POLICY, chunk.length);
                  const rephPromptB = buildBatchTextPrompt(activeConfigB.rephrase_prompt, chunk.length);
                  const sentinelInputB = buildSentinelInput(chunk);
                  const postKeyB = `${activeConfigB.provider}:${activeConfigB.model}:post_batch:${chunk.length}:${sentinelInputB.length}:preferB`;
                  if (aiDedupe.has(postKeyB)) {
                    console.log(`Skipping duplicate batch postprocess for key ${postKeyB}`);
                    continue;
                  }
                  aiDedupe.add(postKeyB);
                  let rawRedB: any = [];
                  let rawRephB: any = [];
                  if (activeConfigB.provider === 'bedrock') {
                    rawRedB = await callAI(activeConfigB.provider, activeConfigB.model, redPromptB, sentinelInputB, 'batch_text', 'scan_b', rateLimiters, undefined, getEffectiveMaxTokens(activeConfigB));
                    rawRephB = await callAI(activeConfigB.provider, activeConfigB.model, rephPromptB, sentinelInputB, 'batch_text', 'scan_b', rateLimiters, undefined, getEffectiveMaxTokens(activeConfigB));
                  } else {
                    [rawRedB, rawRephB] = await Promise.all([
                      callAI(activeConfigB.provider, activeConfigB.model, redPromptB, sentinelInputB, 'batch_text', 'scan_b', rateLimiters, undefined, getEffectiveMaxTokens(activeConfigB)),
                      callAI(activeConfigB.provider, activeConfigB.model, rephPromptB, sentinelInputB, 'batch_text', 'scan_b', rateLimiters, undefined, getEffectiveMaxTokens(activeConfigB))
                    ]);
                  }
                  let redTextsB = normalizeBatchTextParsed(rawRedB);
                  let rephTextsB = normalizeBatchTextParsed(rawRephB);
                  const isInvalidB = (s: string | null | undefined) => !s || !String(s).trim() || /^(\[|here\s+(is|are))/i.test(String(s).trim());
                  const expectedB = chunk.length;
                  if (redTextsB.length !== expectedB || rephTextsB.length !== expectedB || redTextsB.some(isInvalidB) || rephTextsB.some(isInvalidB)) {
                    console.warn(`Batch text (Scan B) outputs invalid or mismatched (expected=${expectedB}, red=${redTextsB.length}, reph=${rephTextsB.length}). Running per-item fallback for failed entries.`);
                    for (let i = 0; i < expectedB; i++) {
                      const redBad = i >= redTextsB.length || isInvalidB(redTextsB[i]);
                      const rephBad = i >= rephTextsB.length || isInvalidB(rephTextsB[i]);
                      if (redBad || rephBad) {
                        try {
                          const [r1, p1] = await Promise.all([
                            redBad ? callAI(activeConfigB.provider, activeConfigB.model, activeConfigB.redact_prompt.replace('these comments', 'this comment').replace('parallel list', 'single'), chunk[i], 'text', 'scan_b', rateLimiters, undefined, getEffectiveMaxTokens(activeConfigB)) : Promise.resolve(redTextsB[i]),
                            rephBad ? callAI(activeConfigB.provider, activeConfigB.model, activeConfigB.rephrase_prompt.replace('these comments', 'this comment').replace('parallel list', 'single'), chunk[i], 'text', 'scan_b', rateLimiters, undefined, getEffectiveMaxTokens(activeConfigB)) : Promise.resolve(rephTextsB[i])
                          ]);
                          if (redBad) redTextsB[i] = enforceRedactionPolicy(r1 as string) as string;
                          if (rephBad) rephTextsB[i] = p1 as string;
                        } catch (perItemErr) {
                          console.warn(`Per-item fallback failed for Scan B group item ${i}:`, perItemErr);
                        }
                      }
                    }
                  }
                  redBAll.push(...(redTextsB.map(enforceRedactionPolicy) as string[]));
                  rephBAll.push(...rephTextsB);
                }
                // Assign Scan B outputs to the preferB indices only
                for (let i = 0; i < preferBIndices.length; i++) {
                  const idx = preferBIndices[i];
                  const red = redBAll[i];
                  const reph = rephBAll[i];
                  if (typeof red === 'string') scannedComments[idx].redactedText = red;
                  if (typeof reph === 'string') scannedComments[idx].rephrasedText = reph;
                  if (scannedComments[idx].mode === 'redact' && typeof red === 'string') {
                    scannedComments[idx].text = enforceRedactionPolicy(red) as string;
                  } else if (scannedComments[idx].mode === 'rephrase' && typeof reph === 'string') {
                    scannedComments[idx].text = reph;
                  }
                }
              }
            }
          } catch (error) {
            console.warn(`Batch redaction/rephrasing failed:`, error);
            // Continue without redaction/rephrasing
          }
        }
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

    // Restore console methods before returning
    try {
      const __root: any = globalThis as any;
      if (__root.__baseLog && __root.__baseWarn && __root.__baseError) {
        console.log = __root.__baseLog;
        console.warn = __root.__baseWarn;
        console.error = __root.__baseError;
      }
    } catch {}

    // Mark completion state if no further batches are expected
    try {
      if (!response.hasMore) {
        gAny.__runCompleted.add(scanRunId);
      }
    } catch {}
    // Clear in-progress flag
    try { gAny.__runInProgress.delete(scanRunId); } catch {}

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in scan-comments function:', error);
    try {
      const g: any = globalThis as any;
      if (g.__scanRunId && g.__runInProgress) g.__runInProgress.delete(g.__scanRunId);
    } catch {}
    // Attempt to restore console methods if they were overridden
    try {
      const __root: any = globalThis as any;
      if (__root.__baseLog && __root.__baseWarn && __root.__baseError) {
        console.log = __root.__baseLog;
        console.warn = __root.__baseWarn;
        console.error = __root.__baseError;
      }
    } catch {}
    const errMsg = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: errMsg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Helper function to process individual comments
async function processIndividualComment(comment, scanAResult, scanBResult, scanA, scanB, adjudicator, defaultMode, summary, scannedComments, rateLimiters, sequentialQueue, scanARawResponse?, scanBRawResponse?) {
  let finalResult = null;
  let adjudicationResult = null;
  let needsAdjudication = false;

  // Heuristic safety net - only use when AI completely fails (use original text)
  const heur = heuristicAnalyze(comment.originalText || comment.text);
  const patchResult = (r: any) => {
    // Debug logging to see what's being passed in
    console.log(`processIndividualComment patchResult called with:`, JSON.stringify(r, null, 2));
    console.log(`r.reasoning type: ${typeof r?.reasoning}, value: "${r?.reasoning}"`);
    console.log(`r.reasoning truthy check: ${!!r?.reasoning}`);
    console.log(`r.reasoning trim check: ${r?.reasoning?.trim() === ''}`);
    
    // If no result at all, use heuristic
    if (!r) {
      console.log(`No result provided, using heuristic fallback`);
      return { concerning: heur.concerning, identifiable: heur.identifiable, reasoning: 'Heuristic fallback: ' + heur.reasoning };
    }
    
    // Create a deep copy to avoid mutation
    const result = JSON.parse(JSON.stringify(r));
    
    // If boolean values are missing, use false (conservative approach)
    if (typeof result.concerning !== 'boolean') result.concerning = false;
    if (typeof result.identifiable !== 'boolean') result.identifiable = false;
    
    // Only apply heuristic fallback if AI gave absolutely no reasoning
    if (!result.reasoning || result.reasoning.trim() === '') {
      console.log(`AI reasoning check failed - reasoning: "${result.reasoning}", applying heuristic fallback`);
      // Only override if heuristic detects violations AND AI gave no reasoning
      if (heur.concerning || heur.identifiable) {
        result.concerning = heur.concerning;
        result.identifiable = heur.identifiable;
        result.reasoning = 'AI provided no analysis, heuristic fallback: ' + heur.reasoning;
      } else {
        // Ensure reasoning is always set if none provided
        result.reasoning = 'No concerning content or identifiable information detected.';
      }
    } else {
      console.log(`AI reasoning preserved: "${result.reasoning}"`);
    }
    // PII safety net when AI says false but heuristic detects PII
    if (result.identifiable === false && heur.identifiable === true) {
      result.identifiable = true;
      try { (result as any).__piiSafetyNetApplied = true; } catch {}
      if (!/PII|personally identifiable|email|phone|id|badge|SSN/i.test(result.reasoning)) {
        result.reasoning = (result.reasoning ? result.reasoning + ' | ' : '') + 'Safety net: Detected PII in the original text.';
      }
    }
    // Always preserve AI reasoning when it exists - don't override it
    return result;
  };
  
  // Create deep copies to prevent mutation issues
  // Extract the first result from arrays if the AI returned an array
  const scanAResultToProcess = Array.isArray(scanAResult) ? scanAResult[0] : scanAResult;
  const scanBResultToProcess = Array.isArray(scanBResult) ? scanBResult[0] : scanBResult;
  
  console.log(`processIndividualComment: Original scanAResult:`, scanAResult);
  console.log(`processIndividualComment: Original scanBResult:`, scanBResult);
  console.log(`processIndividualComment: Processed scanAResult:`, scanAResultToProcess);
  console.log(`processIndividualComment: Processed scanBResult:`, scanBResultToProcess);
  
  scanAResult = patchResult(scanAResultToProcess);
  scanBResult = patchResult(scanBResultToProcess);

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

Comment: "${comment.originalText || comment.text}"

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
          sequentialQueue,
          getOutputTokenLimit(adjudicator, 0)
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
        callAI(
          activeConfig.provider,
          activeConfig.model,
          activeConfig.redact_prompt.replace('these comments', 'this comment').replace('parallel list', 'single'),
          comment.text,
          'text',
          needsAdjudication ? 'adjudicator' : 'scan_a',
          rateLimiters,
          undefined,
          getEffectiveMaxTokens(activeConfig)
        ),
        callAI(
          activeConfig.provider,
          activeConfig.model,
          activeConfig.rephrase_prompt.replace('these comments', 'this comment').replace('parallel list', 'single'),
          comment.text,
          'text',
          needsAdjudication ? 'adjudicator' : 'scan_a',
          rateLimiters,
          undefined,
          getEffectiveMaxTokens(activeConfig)
        )
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

  // PII indicators (explicit)
  const piiPatterns = [
    /\b\d{3}-\d{2}-\d{4}\b/i, // SSN
    /(?:\+?\d{1,2}\s*)?(?:\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})/i, // Phone
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i, // Email
    /(employee\s*id|badge\s*#?\s*\d+)/i, // Employee ID / Badge
    /\bL(?:evel)?\s*\d+\b/i, // Level/L5, Level 5
    /\b(?:years?|yrs?)\s+(?:in\s+role|experience|tenure)\b/i, // 3 years in role, years of tenure
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

// Robust parser for batch_text responses that may include prose headers or wrapped JSON
function parseBatchTextList(content: string): string[] {
  try {
    // Fast path: already a valid JSON array
    const direct = JSON.parse(content);
    if (Array.isArray(direct)) {
      return direct.map((v: any) => (typeof v === 'string' ? v : JSON.stringify(v)));
    }
  } catch {}

  // Cleanup common wrappers and markdown fences
  let c = String(content || '').trim();
  c = c.replace(/```json\s*/gi, '').replace(/```/g, '').trim();

  // Remove leading prose like "Here is/are the list ..."
  c = c.replace(/^(?:here\s+(?:is|are)[\s\S]*?:)\s*/i, '');

  // Extract the first JSON array present
  const jsonArrayMatch = c.match(/\[[\s\S]*?\]/);
  if (jsonArrayMatch) {
    const arrText = jsonArrayMatch[0];
    try {
      let arr = JSON.parse(arrText);
      // If the array contains a single string that itself is a JSON array, parse that
      if (
        Array.isArray(arr) &&
        arr.length === 1 &&
        typeof arr[0] === 'string' &&
        arr[0].trim().startsWith('[')
      ) {
        try {
          const inner = JSON.parse(arr[0]);
          if (Array.isArray(inner)) arr = inner;
        } catch {}
      }
      if (Array.isArray(arr)) {
        return arr.map((v: any) => (typeof v === 'string' ? v : JSON.stringify(v)));
      }
    } catch {}
  }

  // Fallback: Haiku tokenization repair by ID markers
  {
    const tokens = c
      .split(/\r?\n/)
      .map(s => s.trim())
      .filter(Boolean)
      .filter(line => !/^here\s+(?:is|are)/i.test(line));
    const results: string[] = [];
    let currentId: number | null = null;
    let buffer: string[] = [];
    const idStart = /^<<<(?:ID|ITEM)\s+(\d+)>>>\s*/i;
    const endMarker = /^<<<END\s+\d+>>>\s*$/i;
    for (const t of tokens) {
      const m = idStart.exec(t);
      if (m) {
        // flush previous
        if (currentId != null) {
          results.push(buffer.join(' ').trim());
        }
        currentId = parseInt(m[1], 10);
        buffer = [t.replace(idStart, '').trim()];
        continue;
      }
      if (endMarker.test(t) || t === '[' || t === ']') {
        // ignore stray markers/brackets
        continue;
      }
      if (currentId != null) buffer.push(t);
    }
    if (currentId != null) results.push(buffer.join(' ').trim());
    if (results.length > 0) return results;
  }

  // Fallback: split by lines, drop obvious headers, and if a single JSON-like line remains, parse it
  const lines = c
    .split(/\r?\n/)
    .map(s => s.trim())
    .filter(Boolean)
    .filter(line => !/^here\s+(?:is|are)/i.test(line));

  if (lines.length === 1 && lines[0].startsWith('[')) {
    try {
      const parsed = JSON.parse(lines[0]);
      if (Array.isArray(parsed)) {
        return parsed.map((v: any) => (typeof v === 'string' ? v : JSON.stringify(v)));
      }
    } catch {}
  }

  // Last resort: return non-empty lines or whole content as a single item
  return lines.length > 0 ? lines : [c];
}

function normalizeBatchTextParsed(parsed: any): string[] {
  // If already a string array, drop header-like lines and return
  if (Array.isArray(parsed)) {
    const cleaned = parsed
      .filter((v) => v != null)
      .map((v) => (typeof v === 'string' ? v.trim() : JSON.stringify(v)))
      .filter((s) => s.length > 0)
      .filter((s) => !/^here\s+(?:is|are)[\s\S]*?:\s*$/i.test(s));

    // Haiku repair: merge tokenized segments into per-ID strings
    const idStart = /^\s*<<<(?:ID|ITEM)\s+(\d+)>>>\s*/i;
    const endMarker = /^<<<END\s+\d+>>>\s*$/i;
    const hasIds = cleaned.some(s => idStart.test(s) || endMarker.test(s) || s === '[' || s === ']');
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
        if (endMarker.test(s) || s === '[' || s === ']') continue;
        if (currentId != null) buffer.push(s);
      }
      if (currentId != null) merged.push(buffer.join(' ').trim());
      if (merged.length > 0) return merged;
    }

    // Repair: If the model returned a tokenized JSON array, e.g., [ "[", "\"text\"", "]" ],
    // join the pieces and parse once to recover the true string array.
    try {
      const joined = cleaned.join('');
      const bracketStart = joined.indexOf('[');
      const bracketEnd = joined.lastIndexOf(']');
      if (bracketStart !== -1 && bracketEnd !== -1 && bracketEnd > bracketStart) {
        const maybeJson = joined.slice(bracketStart, bracketEnd + 1);
        const parsedJoined = JSON.parse(maybeJson);
        if (Array.isArray(parsedJoined)) {
          return parsedJoined.map((v: any) => (typeof v === 'string' ? v : JSON.stringify(v)));
        }
      }
    } catch {}

    // If single element that is itself a JSON array string, parse it
    if (cleaned.length === 1 && cleaned[0].startsWith('[')) {
      try {
        const inner = JSON.parse(cleaned[0]);
        if (Array.isArray(inner)) {
          return inner.map((v: any) => (typeof v === 'string' ? v : JSON.stringify(v)));
        }
      } catch {}
    }

    // If two elements where the second looks like a JSON array string, parse second
    if (
      cleaned.length === 2 &&
      cleaned[1] &&
      cleaned[1].startsWith('[')
    ) {
      try {
        const inner = JSON.parse(cleaned[1]);
        if (Array.isArray(inner)) {
          return inner.map((v: any) => (typeof v === 'string' ? v : JSON.stringify(v)));
        }
      } catch {}
    }

    return cleaned;
  }

  // Fallback to string-based parser
  return parseBatchTextList(String(parsed ?? ''));
}

// Attempt to extract a valid JSON array or a sequence of JSON objects from noisy text
function extractJsonArrayOrObjects(content: string): any[] | null {
  try {
    const trimmed = String(content || '').trim().replace(/```json\s*/gi, '').replace(/```/g, '');
    // If there's an obvious array, try to isolate the outermost [ ... ] by slicing to the last closing bracket
    const firstBracket = trimmed.indexOf('[');
    const lastBracket = trimmed.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket > firstBracket) {
      const maybeArray = trimmed.slice(firstBracket, lastBracket + 1);
      try {
        const parsed = JSON.parse(maybeArray);
        if (Array.isArray(parsed)) return parsed;
      } catch {}
    }
  } catch {}

  // As a fallback, scan for top-level JSON objects and build an array
  const text = String(content || '');
  const objects: any[] = [];
  let depth = 0;
  let inString = false;
  let stringQuote: string | null = null;
  let escapeNext = false;
  let startIdx: number | null = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escapeNext) {
        escapeNext = false;
      } else if (ch === '\\') {
        escapeNext = true;
      } else if (ch === stringQuote) {
        inString = false;
        stringQuote = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = true;
      stringQuote = ch;
      continue;
    }
    if (ch === '{') {
      if (depth === 0) startIdx = i;
      depth++;
    } else if (ch === '}') {
      if (depth > 0) depth--;
      if (depth === 0 && startIdx != null) {
        const candidate = text.slice(startIdx, i + 1);
        try {
          const obj = JSON.parse(candidate);
          objects.push(obj);
        } catch {}
        startIdx = null;
      }
    }
  }
  return objects.length > 0 ? objects : null;
}

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

// Logging utilities
const LOG_LEVEL = (Deno.env.get('LOG_LEVEL') || 'info').toLowerCase();
const isDebug = LOG_LEVEL === 'debug';
function preview(text: any, length: number = 200): string {
  const t = typeof text === 'string' ? text : String(text ?? '');
  return t.length > length ? t.slice(0, length) + '...' : t;
}
function logAIRequest(
  provider: string,
  model: string,
  responseType: string,
  prompt: string,
  input: string,
  payload?: string,
  mode: 'batch' | 'single' = 'single',
  phase: 'analysis' | 'postprocess' | 'adjudication' = 'analysis'
) {
  const tag = mode === 'batch' ? '[AI BATCH REQUEST]' : '[AI SINGLE REQUEST]';
  const phaseTag = phase ? ` phase=${phase}` : '';
  // Avoid duplicating inputs when payload already contains the full request
  if (payload) {
    // To reduce duplication, only log the payload when present
    console.log(`${tag} ${provider}/${model} type=${responseType}${phaseTag}\npayload=${payload}`);
    return;
  }
  console.log(`${tag} ${provider}/${model} type=${responseType}${phaseTag}\nprompt=${prompt}\ninput=${input}`);
}
function logAIResponse(provider: string, model: string, responseType: string, result: any) {
  try {
    const results = (result && typeof result === 'object' && 'results' in result) ? (result as any).results : result;
    const raw = (result && typeof result === 'object' && 'rawResponse' in result) ? (result as any).rawResponse : undefined;
    const resultsStr = typeof results === 'string' ? results : JSON.stringify(results, null, 2);
    const rawStr = raw === undefined ? '' : (typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2));
    console.log(`[AI RESPONSE] ${provider}/${model} type=${responseType}\nresults=${resultsStr}${raw !== undefined ? `\nraw=${rawStr}` : ''}`);
  } catch (e) {
    console.log(`[AI RESPONSE] ${provider}/${model} type=${responseType} (unserializable) error=${(e as Error).message}`);
  }
}

// Helper function to call AI services with rate limiting
async function callAI(provider: string, model: string, prompt: string, commentText: string, responseType: 'analysis' | 'text' | 'batch_analysis' | 'batch_text', scannerType?: string, rateLimiters?: Map<string, any>, sequentialQueue?: Map<string, any>, maxTokens?: number) {
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
      return await performAICall(provider, model, prompt, commentText, responseType, scannerType, rateLimiters, estimatedTokens, maxTokens);
    }, sequentialQueue);
  }
  
  // Enforce both provider+model and per-scanner limits if available
  if (rateLimiters) {
    const providerKey = `provider:${provider}:${model}`;
    if (rateLimiters.has(providerKey)) {
      await enforceRateLimit(providerKey, estimatedTokens, rateLimiters);
    }
  }
  
  return await performAICall(provider, model, prompt, commentText, responseType, scannerType, rateLimiters, estimatedTokens, maxTokens);
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
async function performAICall(provider: string, model: string, prompt: string, commentText: string, responseType: 'analysis' | 'text' | 'batch_analysis' | 'batch_text', scannerType?: string, rateLimiters?: Map<string, any>, estimatedTokens?: number, maxTokens?: number) {
  // Enforce per-scanner limits if available
  if (scannerType && rateLimiters && rateLimiters.has(scannerType)) {
    await enforceRateLimit(scannerType, estimatedTokens || 0, rateLimiters);
  }

  // Call the appropriate AI provider
  let result;
  if (provider === 'openai') {
    result = await callOpenAI(model, prompt, commentText, responseType, scannerType, maxTokens);
  } else if (provider === 'azure') {
    result = await callAzureOpenAI(model, prompt, commentText, responseType, scannerType, maxTokens);
  } else if (provider === 'bedrock') {
    result = await callBedrock(model, prompt, commentText, responseType, scannerType, maxTokens);
  } else {
    throw new Error(`Unsupported AI provider: ${provider}`);
  }
  
  logAIResponse(provider, model, responseType, result);
  return result;
}

  // OpenAI API call
  async function callOpenAI(model: string, prompt: string, commentText: string, responseType: 'analysis' | 'text' | 'batch_analysis' | 'batch_text', scannerType?: string, maxTokens?: number) {
    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    
    const messages = [
      { role: 'system', content: prompt },
      { role: 'user', content: commentText }
    ];

    const payload = JSON.stringify({ model, messages, temperature: 0.1, max_tokens: Number.isFinite(maxTokens) && (maxTokens as number) > 0 ? Math.floor(maxTokens as number) : undefined });
    logAIRequest('openai', model, responseType, prompt, commentText, payload, responseType.startsWith('batch') ? 'batch' : 'single', scannerType === 'adjudicator' ? 'adjudication' : (responseType.includes('text') ? 'postprocess' : 'analysis'));
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: payload,
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
        console.error(`JSON parsing failed for ${responseType}: ${String(parseError)} preview=${preview(content, 300)}`);
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
        if (isDebug) console.log(`JSON parsing failed for batch_text: ${String(parseError)} preview=${preview(content, 300)}`);
        return parseBatchTextList(content);
      }
    } else {
      return content;
    }
  }

  // Azure OpenAI API call
  async function callAzureOpenAI(model: string, prompt: string, commentText: string, responseType: 'analysis' | 'text' | 'batch_analysis' | 'batch_text', scannerType?: string, maxTokens?: number) {
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

    const azPayload = JSON.stringify({ messages, temperature: 0.1, max_tokens: Number.isFinite(maxTokens) && (maxTokens as number) > 0 ? Math.floor(maxTokens as number) : undefined });
    logAIRequest('azure', model, responseType, prompt, commentText, azPayload, responseType.startsWith('batch') ? 'batch' : 'single', scannerType === 'adjudicator' ? 'adjudication' : (responseType.includes('text') ? 'postprocess' : 'analysis'));
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'api-key': azureApiKey,
        'Content-Type': 'application/json',
      },
      body: azPayload,
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
        if (isDebug) console.log(`JSON parsing failed for batch_text: ${String(parseError)} preview=${preview(content, 300)}`);
        return parseBatchTextList(content);
      }
    } else {
      return content;
    }
  }

  // AWS Bedrock API call with retry logic
  async function callBedrock(model: string, prompt: string, commentText: string, responseType: 'analysis' | 'text' | 'batch_analysis' | 'batch_text', scannerType?: string, maxTokens?: number) {
    const awsAccessKey = Deno.env.get('AWS_ACCESS_KEY_ID');
    const awsSecretKey = Deno.env.get('AWS_SECRET_ACCESS_KEY');
    const awsRegion = Deno.env.get('AWS_REGION') || 'us-west-2';

    if (isDebug) console.log(`Bedrock call - Model: ${model}, Region: ${awsRegion}, AccessKey: ${awsAccessKey ? 'present' : 'missing'}`);

    if (!awsAccessKey || !awsSecretKey) {
      throw new Error('AWS credentials not configured');
    }

    return await retryWithBackoff(async () => {
      return await makeBedrockRequest(model, prompt, commentText, responseType, awsAccessKey, awsSecretKey, awsRegion, false, scannerType, maxTokens);
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
  async function makeBedrockRequest(model: string, prompt: string, commentText: string, responseType: 'analysis' | 'text' | 'batch_analysis' | 'batch_text', awsAccessKey: string, awsSecretKey: string, awsRegion: string, titanStrictRetry: boolean = false, scannerType?: string, maxTokens?: number) {

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
        // Encourage JSON-only responses by asking for <json> wrapper and setting stop sequences
        const systemPrompt = `Return ONLY JSON. Wrap the JSON in <json> and </json>. No prose, no code fences.\n\n${prompt}`;
        requestBody = JSON.stringify({
          anthropic_version: "bedrock-2023-05-31",
          max_tokens: Number.isFinite(maxTokens) && (maxTokens as number) > 0 ? Math.floor(maxTokens as number) : 1000,
          temperature: 0.1,
          system: systemPrompt,
          messages: [
            {
              role: "user",
              content: `${commentText}`
            }
          ],
          stop_sequences: ["</json>"]
        });
      } else {
        // Legacy Claude models
        requestBody = JSON.stringify({
          prompt: `\n\nHuman: ${prompt}\n\n${commentText}\n\nAssistant:`,
          max_tokens_to_sample: Number.isFinite(maxTokens) && (maxTokens as number) > 0 ? Math.floor(maxTokens as number) : 1000,
          temperature: 0.1,
        });
      }
    } else if (model.startsWith('amazon.titan')) {
      requestBody = JSON.stringify({
        inputText: `${effectivePrompt}\n\n${commentText}`,
        textGenerationConfig: {
          maxTokenCount: Number.isFinite(maxTokens) && (maxTokens as number) > 0 ? Math.floor(maxTokens as number) : 1000,
          temperature: 0.1,
          topP: 0.1
        }
      });
    } else if (model.startsWith('mistral.')) {
      // Mistral models on Bedrock use a simple prompt-based schema
      // Use deterministic settings and higher token budget to avoid truncation and uniform outputs
      requestBody = JSON.stringify({
        prompt: `${prompt}\n\n${commentText}`,
        max_tokens: Number.isFinite(maxTokens) && (maxTokens as number) > 0 ? Math.floor(maxTokens as number) : 2000,
        temperature: 0,
        top_p: 1
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
    if (isDebug) {
    console.log(`AWS Debug - Model: ${model}`);
    console.log(`AWS Debug - Region: ${awsRegion}`);
    console.log(`AWS Debug - Service: ${service}`);
    console.log(`AWS Debug - Host: ${host}`);
    console.log(`AWS Debug - CanonicalUri: ${canonicalUri}`);
    console.log(`AWS Debug - PayloadHash: ${payloadHash}`);
    console.log(`AWS Debug - StringToSign: ${stringToSign}`);
    console.log(`AWS Debug - Signature: ${signature}`);
    console.log(`AWS Debug - RequestBody: ${requestBody}`);
    }
    
    // Create authorization header
    const authorizationHeader = `${algorithm} Credential=${awsAccessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    
    if (isDebug) {
    console.log(`Bedrock request to: ${endpoint}`);
      console.log(`Authorization: ${authorizationHeader}`);
    }
    
    logAIRequest('bedrock', model, responseType, prompt, commentText, requestBody, responseType.startsWith('batch') ? 'batch' : 'single', scannerType === 'adjudicator' ? 'adjudication' : (responseType.includes('text') ? 'postprocess' : 'analysis'));
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
      
      // Log the Mistral response structure only when debugging
      if (isDebug) console.log('Mistral response structure:', preview(JSON.stringify(data, null, 2), 300));
      if (isDebug) console.log('Extracted content preview:', preview(content, 300));
      
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

        // Prefer <json>...</json> extraction for Claude to avoid prose
        if (model.startsWith('anthropic.claude')) {
          const tag = /<json>([\s\S]*?)<\/json>/i.exec(jsonContent);
          if (tag && tag[1]) {
            jsonContent = tag[1].trim();
          }
        }

        // Titan: prefer sentinel-extracted JSON first
        if (model.startsWith('amazon.titan')) {
          const sentinel = /<json>([\s\S]*?)<\/json>/i.exec(jsonContent);
          if (sentinel && sentinel[1]) {
            jsonContent = sentinel[1].trim();
          }
        }
        
        // For Mistral models, be more aggressive in JSON extraction
        if (model.startsWith('mistral.')) {
          if (isDebug) console.log(`Mistral: Extracting JSON from response with additional text`);
          
          // Look for the first complete JSON array or object
          const jsonMatch = jsonContent.match(/(\[[\s\S]*?\]|\{[\s\S]*?\})/);
          if (jsonMatch) {
            const extractedJson = jsonMatch[0];
            if (isDebug) console.log(`Mistral: Extracted JSON: ${preview(extractedJson, 200)}`);
            
            // Validate that it's complete JSON
            try {
              JSON.parse(extractedJson);
              jsonContent = extractedJson;
              if (isDebug) console.log(`Mistral: Successfully extracted and validated JSON`);
            } catch (e) {
              if (isDebug) console.log(`Mistral: Extracted JSON is invalid, trying alternative extraction`);
            }
          }
          
          // Additional fix: If the JSON is followed by explanatory text, try to extract just the JSON part
          if (jsonContent.includes('Comment:') || jsonContent.includes('Your analysis is correct')) {
            if (isDebug) console.log(`Mistral: Detected explanatory text after JSON, attempting to extract clean JSON`);
            
            // Try to find the JSON array/object before any explanatory text
            const cleanJsonMatch = jsonContent.match(/(\[[\s\S]*?\]|\{[\s\S]*?\})/);
            if (cleanJsonMatch) {
              try {
                const cleanJson = cleanJsonMatch[0];
                const parsed = JSON.parse(cleanJson); // Validate it's valid JSON
                if (isDebug) console.log(`Mistral: Parsed JSON before cleanup preview: ${preview(JSON.stringify(parsed), 200)}`);
                jsonContent = cleanJson;
                if (isDebug) console.log(`Mistral: Successfully extracted clean JSON without explanatory text`);
              } catch (e) {
                console.log(`Mistral: Clean JSON extraction failed: ${e.message}`);
              }
            }
          }
          
          // Final cleanup: Remove any trailing text after the JSON
          if (model.startsWith('mistral.')) {
            // Look for the last valid JSON structure in the content
            const jsonMatches = jsonContent.match(/(\[[\s\S]*?\]|\{[\s\S]*?\})/g);
            if (jsonMatches && jsonMatches.length > 0) {
              // Take the last (most complete) JSON match
              const lastJson = jsonMatches[jsonMatches.length - 1];
              try {
                const parsed = JSON.parse(lastJson);
                console.log(`Mistral: Final JSON extraction result:`, parsed);
                jsonContent = lastJson;
              } catch (e) {
                console.log(`Mistral: Final JSON extraction failed: ${e.message}`);
              }
            }
          }
        }
        
        // Clean up common issues in JSON responses
        jsonContent = jsonContent.replace(/```json\s*/g, '').replace(/```\s*/g, '');
        
        // For Mistral models, try additional cleanup
        if (model.startsWith('mistral.')) {
          if (isDebug) console.log(`Mistral raw content before cleanup: ${preview(jsonContent, 300)}`);
          
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
              if (isDebug) console.log(`Mistral: Found JSON using pattern, extracted: ${preview(jsonContent, 100)}`);
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
          console.log(`Mistral: Attempting to parse JSON content: ${jsonContent.substring(0, 300)}...`);
          let parsed = JSON.parse(jsonContent);
          console.log(`Mistral: Successfully parsed JSON:`, parsed);
          
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

          // Anthropic/Claude fallback: attempt to extract from <json> tags or array/object from noisy text
          if (model.startsWith('anthropic.claude')) {
            try {
              const tagged = /<json>([\s\S]*?)<\/json>/i.exec(jsonContent) || /<json>([\s\S]*?)<\/json>/i.exec(content);
              if (tagged && tagged[1]) {
                const arrOrObj = JSON.parse(tagged[1].trim());
                if (responseType === 'analysis') {
                  const first = Array.isArray(arrOrObj) ? (arrOrObj.find((x: any) => x && typeof x === 'object') ?? arrOrObj[0]) : arrOrObj;
                  return { results: first, rawResponse: null };
                }
                return { results: arrOrObj, rawResponse: null };
              }
              const arr = extractJsonArrayOrObjects(jsonContent) || extractJsonArrayOrObjects(content);
              if (arr && Array.isArray(arr) && arr.length > 0) {
                if (responseType === 'analysis') {
                  // Use the first object-like entry if present
                  const first = arr.find((x: any) => x && typeof x === 'object') ?? arr[0];
                  return { results: first, rawResponse: null };
                }
                // For batch, return the array directly
                return { results: arr, rawResponse: null };
              }
            } catch {}
          }
          
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
            // Try to find the complete JSON response (array or object)
            // Look for the largest valid JSON structure first
            let bestMatch = null;
            let bestMatchLength = 0;
            
            // Pattern 1: Look for complete JSON array or object without markdown
            const directPatterns = [
              /\[[\s\S]*?\]/,  // Complete array (non-greedy to avoid capturing explanatory text)
              /\{[\s\S]*?\}/   // Complete object (non-greedy to avoid capturing explanatory text)
            ];
            
            // Pattern 1.5: Look for JSON followed by explanatory text and extract just the JSON
            const jsonWithTextPatterns = [
              /(\[[\s\S]*?\])(?=\s*Comment:|\s*Your analysis is|\s*Here is the JSON)/,
              /(\{[\s\S]*?\})(?=\s*Comment:|\s*Your analysis is|\s*Here is the JSON)/
            ];
            
            for (const pattern of jsonWithTextPatterns) {
              const match = content.match(pattern);
              if (match && match[1]) {
                try {
                  const parsed = JSON.parse(match[1]);
                  bestMatch = match[1];
                  bestMatchLength = match[1].length;
                  console.log(`Found JSON with explanatory text for Mistral: ${match[1].substring(0, 100)}...`);
                  break;
                } catch (e) {
                  // Not valid JSON, continue
                }
              }
            }
            
            for (const pattern of directPatterns) {
              const match = content.match(pattern);
              if (match && match[0].length > bestMatchLength) {
                try {
                  const parsed = JSON.parse(match[0]);
                  bestMatch = match[0];
                  bestMatchLength = match[0].length;
                  console.log(`Found direct JSON match for Mistral: ${match[0].substring(0, 100)}...`);
                } catch (e) {
                  // Not valid JSON, continue
                }
              }
            }
            
            // Pattern 2: If no direct match, look for JSON in markdown blocks
            if (!bestMatch) {
              const markdownPatterns = [
                /```json\s*([\s\S]*?)\s*```/,
                /```\s*([\s\S]*?)\s*```/
              ];
              
              for (const pattern of markdownPatterns) {
                const match = content.match(pattern);
                if (match && match[1]) {
                  try {
                    const cleaned = match[1].trim();
                    const parsed = JSON.parse(cleaned);
                    if (cleaned.length > bestMatchLength) {
                      bestMatch = cleaned;
                      bestMatchLength = cleaned.length;
                      console.log(`Found markdown JSON match for Mistral: ${cleaned.substring(0, 100)}...`);
                    }
                  } catch (e) {
                    // Not valid JSON, continue
                  }
                }
              }
            }
            
            if (bestMatch) {
              try {
                extractedJson = JSON.parse(bestMatch);
                console.log(`Successfully extracted JSON using Mistral pattern for ${model}`);
                
                // Validate the response structure for batch analysis
                if (responseType === 'batch_analysis') {
                  if (Array.isArray(extractedJson)) {
                    console.log(`Mistral returned ${extractedJson.length} results for batch analysis`);
                  } else {
                    console.log(`Mistral returned single object for batch analysis, this may cause issues`);
                  }
                }
              } catch (e) {
                console.log(`Failed to parse best match: ${bestMatch.substring(0, 50)}...`);
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
            console.log(`Mistral: Final extractedJson before processing:`, extractedJson);
            
            if (model.startsWith('amazon.titan')) {
              extractedJson = normalizeTitanAnalysis(extractedJson, responseType === 'analysis');
            }
            
            console.log(`Mistral: Final extractedJson after processing:`, extractedJson);
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
            return await makeBedrockRequest(model, prompt, commentText, responseType, awsAccessKey, awsSecretKey, awsRegion, true, scannerType);
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
          return await makeBedrockRequest(model, prompt, commentText, responseType, awsAccessKey, awsSecretKey, awsRegion, true, scannerType);
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
        if (isDebug) console.log(`JSON parsing failed for batch_text: ${String(parseError)} preview=${preview(content, 300)}`);
        return parseBatchTextList(content);
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

