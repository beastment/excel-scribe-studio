import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { AILogger } from './ai-logger.ts';


const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

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
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorMessage = `OpenAI API error: ${response.status} ${response.statusText}`;
      if (aiLogger && userId && scanRunId) {
        await aiLogger.logResponse(userId, scanRunId, 'adjudicator', provider, model, 'adjudication', 'adjudication', '', errorMessage, undefined);
      }
      throw new Error(errorMessage);
    }

    const result = await response.json();
    const responseText = result.choices[0]?.message?.content || '';
    
    // Log the AI response //
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
      console.log('Detected simple key-value format, parsing directly');
      
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
    console.error('Failed to parse adjudication response:', error);
    console.error('Raw response:', response);
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
    const { comments, adjudicatorConfig, scanRunId, batchIndex, batchKey } = request;
    
    if (!comments || !Array.isArray(comments) || comments.length === 0) {
      console.log(`[RUN ${scanRunId || 'n/a'}] [ADJUDICATOR] No comments provided; returning success with empty results`);
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

    console.log(`${logPrefix} [ADJUDICATOR] Request received: comments=${comments.length}, hasConfig=${Boolean(adjudicatorConfig)}`);
    console.log(`${logPrefix} [ADJUDICATOR] Processing ${comments.length} comments with ${adjudicatorConfig?.provider || '(auto)'}/${adjudicatorConfig?.model || '(auto)'}`);
    console.log(`${logPrefix} [ADJUDICATOR] Config received:`, {
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
    console.log(`${logPrefix} [ADJUDICATOR] Adjudication is free - no credits required`);
    
    const needsAdjudication = comments.filter(c => {
      // Safely check if agreements exist and have null values
      const agreements = c.agreements || {};
      return agreements.concerning === null || agreements.identifiable === null;
    });

    // Filter comments that need adjudication (where agreements are null)

    if (needsAdjudication.length === 0) {
      console.log(`${logPrefix} [ADJUDICATOR] No comments need adjudication`);
      return new Response(
        JSON.stringify({
          success: true,
          adjudicatedComments: comments.map(c => {
            const agreements = c.agreements || {};
            return {
              id: c.id,
              concerning: agreements.concerning !== null ? agreements.concerning : c.scanAResult.concerning,
              identifiable: agreements.identifiable !== null ? agreements.identifiable : c.scanAResult.identifiable,
              reasoning: 'No adjudication needed - scanners agreed',
              model: `${adjudicatorConfig.provider}/${adjudicatorConfig.model}`
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

    console.log(`${logPrefix} [ADJUDICATOR] ${needsAdjudication.length} comments need adjudication`);

    try {

      // Fetch limits from model_configurations and temperature from Dashboard AI Config
      const { data: modelCfg, error: modelCfgError } = await supabase
        .from('model_configurations')
        .select('*')
        .eq('provider', adjudicatorConfig.provider)
        .eq('model', adjudicatorConfig.model)
        .single();

      // Fetch adjudicator AI config rows and match in code to handle case/format drift
      const normalizedProvider = String(adjudicatorConfig.provider || '').trim().toLowerCase();
      const normalizedModel = String(adjudicatorConfig.model || '').trim().toLowerCase();
      const { data: aiCfgRows } = await supabase
        .from('ai_configurations')
        .select('temperature, tokens_per_comment, analysis_prompt, provider, model, updated_at')
        .eq('scanner_type', 'adjudicator')
        .order('updated_at', { ascending: false })
        .limit(50);
      const aiCfg = Array.isArray(aiCfgRows)
        ? aiCfgRows.find(r => String(r.provider || '').trim().toLowerCase() === normalizedProvider && String(r.model || '').trim().toLowerCase() === normalizedModel)
        : undefined;
      if (!aiCfg) {
        const available = Array.isArray(aiCfgRows) ? aiCfgRows.map(r => `${r.provider}/${r.model}`) : [];
        console.warn(`${logPrefix} [ADJUDICATOR] No exact adjudicator AI config match for ${adjudicatorConfig.provider}/${adjudicatorConfig.model}. Available adjudicator configs:`, available);
      }

      let actualMaxTokens = adjudicatorConfig.max_tokens || 4096;
      if (modelCfgError) {
        console.warn(`${logPrefix} [ADJUDICATOR] Warning: Could not fetch model_configurations, using provided max_tokens:`, modelCfgError.message);
      } else {
        actualMaxTokens = modelCfg?.output_token_limit || adjudicatorConfig.max_tokens || 4096;
        console.log(`${logPrefix} [ADJUDICATOR] Using max_tokens from model_configurations: ${actualMaxTokens}`);
      }

      const effectiveTemperature = (aiCfg && aiCfg.temperature !== null && aiCfg.temperature !== undefined)
        ? aiCfg.temperature
        : (modelCfg?.temperature ?? 0);

      const tokensPerComment = aiCfg?.tokens_per_comment || 13;
      console.log(`${logPrefix} [ADJUDICATOR] Using tokens_per_comment: ${tokensPerComment}`);

      // Resolve prompt and effective provider/model: prefer exact DB row; fallback to any adjudicator config; else use request values
      const defaultPrompt = `You are an adjudicator that resolves disagreements between two prior AI scans (AI1 and AI2) of user comments. For each item between <<<ITEM X>>> and <<<END X>>>:
Return ONLY the following simple key-value lines, one item after another, no extra text or explanations:

i:X
A:Y|N
B:Y|N

Where:
- i is the numeric item index X
- A is Concerning (Y if concerning, else N)
- B is Identifiable (Y if identifiable, else N)

Constraints:
- Do not include any prose, bullets, JSON, or markdown.
- Output exactly three lines per item in order i, A, B.
- Ensure an output block exists for every input item.`;

      let promptSource = 'request';
      let prompt: string = '';
      let modelSource = 'request';
      let effectiveProvider = adjudicatorConfig.provider;
      let effectiveModel = adjudicatorConfig.model;
      let fallbackAdjRow: { analysis_prompt?: string; provider?: string; model?: string } | null = null;
      if (typeof adjudicatorConfig.prompt === 'string' && adjudicatorConfig.prompt.length > 0) {
        prompt = adjudicatorConfig.prompt;
        promptSource = 'request';
      } else if (typeof aiCfg?.analysis_prompt === 'string' && aiCfg.analysis_prompt.length > 0) {
        prompt = aiCfg.analysis_prompt;
        promptSource = 'ai_config_exact_match';
        if (aiCfg.provider && aiCfg.model) {
          effectiveProvider = aiCfg.provider as string;
          effectiveModel = aiCfg.model as string;
          modelSource = 'ai_config_exact_match';
        }
      } else {
        try {
          const { data: anyAdjCfg } = await supabase
            .from('ai_configurations')
            .select('analysis_prompt, provider, model')
            .eq('scanner_type', 'adjudicator')
            .order('updated_at', { ascending: false })
            .limit(1);
          if (Array.isArray(anyAdjCfg) && anyAdjCfg.length > 0 && typeof anyAdjCfg[0].analysis_prompt === 'string' && anyAdjCfg[0].analysis_prompt.length > 0) {
            prompt = anyAdjCfg[0].analysis_prompt as string;
            promptSource = 'ai_config_fallback_any';
            fallbackAdjRow = anyAdjCfg[0] as typeof fallbackAdjRow;
            if (fallbackAdjRow?.provider && fallbackAdjRow?.model) {
              effectiveProvider = fallbackAdjRow.provider as string;
              effectiveModel = fallbackAdjRow.model as string;
              modelSource = 'ai_config_fallback_any';
            }
          }
        } catch (_e) {
          // ignore and use defaultPrompt below
        }
      }
      if (prompt.length === 0) {
        prompt = defaultPrompt;
        promptSource = 'default_prompt';
      }
      console.log(`${logPrefix} [ADJUDICATOR] Using prompt source: ${promptSource} (length=${prompt.length})`);
      console.log(`${logPrefix} [ADJUDICATOR] Using provider/model: ${effectiveProvider}/${effectiveModel} (source=${modelSource})`);

      // If effective model differs from request, refresh model configuration
      let modelCfgEff = modelCfg;
      if (
        String(effectiveProvider || '').trim().toLowerCase() !== String(adjudicatorConfig.provider || '').trim().toLowerCase() ||
        String(effectiveModel || '').trim().toLowerCase() !== String(adjudicatorConfig.model || '').trim().toLowerCase()
      ) {
        const { data: modelCfg2, error: modelCfg2Error } = await supabase
          .from('model_configurations')
          .select('*')
          .eq('provider', effectiveProvider)
          .eq('model', effectiveModel)
          .single();
        if (modelCfg2Error) {
          console.warn(`${logPrefix} [ADJUDICATOR] Warning: Could not fetch model_configurations for effective model ${effectiveProvider}/${effectiveModel}:`, modelCfg2Error.message);
        } else {
          modelCfgEff = modelCfg2;
        }
      }

      // Recompute tokens limit based on effective model
      if (modelCfgEff && typeof modelCfgEff.output_token_limit === 'number') {
        actualMaxTokens = modelCfgEff.output_token_limit as number;
        console.log(`${logPrefix} [ADJUDICATOR] Using max_tokens from model_configurations (effective): ${actualMaxTokens}`);
      }

      const input = buildAdjudicationInput(needsAdjudication);

      console.log(`${logPrefix} [AI REQUEST] ${effectiveProvider}/${effectiveModel} type=adjudication`);
      console.log(`${logPrefix} [AI REQUEST] payload=${JSON.stringify({
        provider: effectiveProvider,
        model: effectiveModel,
        prompt_length: prompt.length,
        input_length: input.length,
        comment_count: needsAdjudication.length
      }).substring(0, 500)}...`);

      // Calculate token estimates for adjudication
      const estimatedInputTokens = Math.ceil(input.length / 4); // Rough estimation: 4 chars per token
      const estimatedOutputTokens = needsAdjudication.length * tokensPerComment;
      const totalEstimatedTokens = estimatedInputTokens + estimatedOutputTokens;

      console.log(`${logPrefix} [TOKEN ESTIMATES] Adjudication (${needsAdjudication.length} comments):`);
      console.log(`  Input: ~${estimatedInputTokens} tokens (estimated)`);
      console.log(`  Output: ${estimatedOutputTokens} tokens (${tokensPerComment} tokens per comment)`);
      console.log(`  Total: ${totalEstimatedTokens} tokens`);
      console.log(`  Max tokens: ${actualMaxTokens}`);

      // Check rate limits and potentially split into batches
      const tpmLimit = modelCfgEff?.tpm_limit;
      const rpmLimit = modelCfgEff?.rpm_limit;
      console.log(`${logPrefix} [RATE_LIMITS] TPM limit: ${tpmLimit || 'none'}, RPM limit: ${rpmLimit || 'none'} for ${effectiveProvider}/${effectiveModel}`);

      // Global duplicate guard: check database for an identical request input for this run
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

      // Process all comments in a single batch (rate limiting removed)
      let batchedComments: typeof needsAdjudication[] = [needsAdjudication];

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
        const batchInput = buildAdjudicationInput(batch);
        const batchEstimatedInputTokens = Math.ceil(batchInput.length / 4);
        const batchEstimatedOutputTokens = batch.length * tokensPerComment;
        const batchTotalTokens = batchEstimatedInputTokens + batchEstimatedOutputTokens;
        
        console.log(`${logPrefix} [BATCH ${batchIndex + 1}/${batchedComments.length}] Processing ${batch.length} comments`);
        console.log(`${logPrefix} [BATCH ${batchIndex + 1}] Estimated tokens: ${batchTotalTokens} (${batchEstimatedInputTokens} input + ${batchEstimatedOutputTokens} output)`);
        
        // Call AI for this batch
        const rawResponse = await callAI(
          effectiveProvider,
          effectiveModel,
          prompt,
          batchInput,
          actualMaxTokens,
          user.id,
          runId.toString(),
          aiLogger,
          effectiveTemperature
        );

        console.log(`${logPrefix} [BATCH ${batchIndex + 1}] AI RESPONSE ${effectiveProvider}/${effectiveModel} type=adjudication`);
        console.log(`${logPrefix} [BATCH ${batchIndex + 1}] rawResponse=${JSON.stringify(rawResponse).substring(0, 500)}...`);
        
        // Parse the batch response
        const batchResults = parseAdjudicationResponse(rawResponse, batch.length);
        allAdjudicatedResults.push(...batchResults);
        
        console.log(`${logPrefix} [BATCH ${batchIndex + 1}] Parsed ${batchResults.length} results`);
      }

      console.log(`${logPrefix} [ADJUDICATOR] Completed all batches. Total results: ${allAdjudicatedResults.length}`);

      // Use the combined results from all batches
      const adjudicatedResults = allAdjudicatedResults;
      console.log(`${logPrefix} [ADJUDICATOR] Combined ${adjudicatedResults.length} adjudication results from ${batchedComments.length} batches`);

      // Map results by the sentinel item id used in input (originalRow || scannedIndex || sequence)
      const resultByItemId = new Map<number, { index: number; concerning: boolean; identifiable: boolean }>();
      for (const r of adjudicatedResults) {
        const idxNum = typeof r.index === 'string' ? parseInt(r.index) : r.index;
        if (Number.isFinite(idxNum)) {
          resultByItemId.set(idxNum as number, r);
        }
      }

      // Build final response using stable ids
      const adjudicatedComments = comments.map((comment, i) => {
        const needsAdj = needsAdjudication.includes(comment);
        const itemId = (comment.originalRow as number) || (comment.scannedIndex as number) || (i + 1);
        if (needsAdj) {
          const adjudicated = resultByItemId.get(itemId);
          if (adjudicated) {
            return {
              id: comment.id,
              concerning: Boolean(adjudicated.concerning),
              identifiable: Boolean(adjudicated.identifiable),
              reasoning: adjudicated.reasoning || 'Resolved by adjudicator',
              model: `${adjudicatorConfig.provider}/${adjudicatorConfig.model}`
            };
          }
        }
        // For comments that don't need adjudication, use agreement results
        const agreements = comment.agreements || {};
        return {
          id: comment.id,
          concerning: agreements.concerning !== null ? agreements.concerning : comment.scanAResult.concerning,
          identifiable: agreements.identifiable !== null ? agreements.identifiable : comment.scanAResult.identifiable,
          reasoning: 'No adjudication needed - scanners agreed',
          model: `${adjudicatorConfig.provider}/${adjudicatorConfig.model}`
        };
      });

      const totalRunTimeMs = Date.now() - overallStartTime;
       
      const summary = {
        total: comments.length,
        resolved: needsAdjudication.length,
        errors: 0
      };

      console.log(`${logPrefix} [ADJUDICATOR] Completed: ${summary.resolved} resolved, ${summary.total - summary.resolved} already agreed`);
      console.log(`${logPrefix} [ADJUDICATOR] No credits deducted - adjudication is free`);
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
      console.error(`${logPrefix} [ADJUDICATOR] Error during adjudication:`, error);
      
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
