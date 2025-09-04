import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { AILogger } from './ai-logger.ts';
import { calculateWaitTime, calculateRPMWaitTime, recordUsage, recordRequest, calculateOptimalBatchSize } from './tpm-tracker.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

// Adjudication deduplication and batching utilities
interface AdjudicationBatch {
  comments: any[];
  batchIndex: number;
  batchKey: string;
}

const createAdjudicationKey = (comments: any[]): string => {
  // Create a unique key based on comment indices and content hash
  const indices = comments.map(c => c.id || c.scannedIndex).sort();
  const contentHash = comments.map(c => c.originalText || c.text).join('|').length;
  return `${indices.join(',')}-${contentHash}`;
};

const buildAdjudicationInput = (comments: any[]): string => {
  // Build the input string that will be sent to adjudicator //
  return comments.map(comment => {
    const scanA = comment.scanAResult || {};
    const scanB = comment.scanBResult || {};
    return `<<<ITEM ${comment.scannedIndex || comment.id}>>>\nText: ${comment.originalText || comment.text}\nAI1:\nConcerning: ${scanA.concerning ? 'Y' : 'N'}\nIdentifiable: ${scanA.identifiable ? 'Y' : 'N'}\nAI2:\nConcerning: ${scanB.concerning ? 'Y' : 'N'}\nIdentifiable: ${scanB.identifiable ? 'Y' : 'N'}\n<<<END ${comment.scannedIndex || comment.id}>>>`;
  }).join('\n\n');
};

const checkForDuplicateAdjudication = async (supabase: any, scanRunId: string, comments: any[]): Promise<boolean> => {
  try {
    const inputString = buildAdjudicationInput(comments);
    const existingAdjudication = await supabase
      .from('ai_logs')
      .select('id, response_status')
      .eq('scan_run_id', scanRunId)
      .eq('function_name', 'adjudicator')
      .eq('response_status', 'success')
      .eq('request_input', inputString)
      .limit(1);

    return existingAdjudication.data && existingAdjudication.data.length > 0;
  } catch (error) {
    console.error('[ADJUDICATION] Error checking for duplicates:', error);
    return false; // If we can't check, proceed with the call
  }
};

const createAdjudicationBatches = (comments: any[], maxBatchSize: number = 50): AdjudicationBatch[] => {
  const batches: AdjudicationBatch[] = [];
  
  for (let i = 0; i < comments.length; i += maxBatchSize) {
    const batchComments = comments.slice(i, i + maxBatchSize);
    const batchKey = createAdjudicationKey(batchComments);
    
    batches.push({
      comments: batchComments,
      batchIndex: Math.floor(i / maxBatchSize),
      batchKey: batchKey
    });
  }
  
  return batches;
};

const processAdjudicationBatches = async (
  supabase: any,
  scanRunId: string,
  commentsToAdjudicate: any[],
  adjudicatorConfig: any,
  authHeader: string,
  maxBatchSize: number = 50
): Promise<any[]> => {
  const batches = createAdjudicationBatches(commentsToAdjudicate, maxBatchSize);
  const allResults: any[] = [];
  
  // Track completed batches for this run to prevent duplicates within the same execution
  const gAny: any = globalThis as any;
  const completedBatchKeys = gAny.__adjudicationBatchesCompleted || new Set<string>();
  
  console.log(`[ADJUDICATION] Processing ${commentsToAdjudicate.length} comments in ${batches.length} batches`);
  
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    const { comments, batchKey } = batch;
    
    console.log(`[ADJUDICATION] Processing batch ${batchIndex + 1}/${batches.length} (${comments.length} comments, key: ${batchKey})`);
    
    // Check for duplicate batch in memory (same execution)
    const batchKeyForRun = `${scanRunId}-${batchKey}`;
    if (completedBatchKeys.has(batchKeyForRun)) {
      console.log(`[ADJUDICATION] Batch ${batchIndex + 1} already processed in this execution, skipping duplicate call`);
      continue;
    }
    
    // Check for duplicate batch in database (previous executions)
    const isDuplicate = await checkForDuplicateAdjudication(supabase, scanRunId, comments);
    
    if (isDuplicate) {
      console.log(`[ADJUDICATION] Batch ${batchIndex + 1} already processed in database, skipping duplicate call`);
      continue;
    }
    
    try {
      // Transform comments to match adjudicator's expected format
      const adjudicatorComments = comments.map(comment => ({
        id: comment.id,
        originalText: comment.originalText || comment.text,
        originalRow: comment.originalRow,
        scannedIndex: comment.scannedIndex,
        scanAResult: {
          ...comment.adjudicationData.scanAResult,
          reasoning: comment.adjudicationData.scanAResult?.reasoning || 'No reasoning provided'
        },
        scanBResult: {
          ...comment.adjudicationData.scanBResult,
          reasoning: comment.adjudicationData.scanBResult?.reasoning || 'No reasoning provided'
        },
        agreements: comment.adjudicationData.agreements
      }));

      console.log(`[ADJUDICATION] Calling adjudicator for batch ${batchIndex + 1} with ${comments.length} comments`);
      
      const adjudicationResponse = await supabase.functions.invoke('adjudicator', {
        body: {
          comments: adjudicatorComments,
          adjudicatorConfig: {
            provider: adjudicatorConfig.provider,
            model: adjudicatorConfig.model,
            prompt: adjudicatorConfig.prompt,
            max_tokens: adjudicatorConfig.max_tokens
          },
          scanRunId: scanRunId,
          batchIndex: batchIndex,
          batchKey: batchKey
        },
        headers: {
          authorization: authHeader
        }
      });

      if (adjudicationResponse.error) {
        console.error(`[ADJUDICATION] Error calling adjudicator for batch ${batchIndex + 1}:`, adjudicationResponse.error);
        throw new Error(`Adjudicator batch ${batchIndex + 1} failed: ${adjudicationResponse.error.message}`);
      }

      console.log(`[ADJUDICATION] Batch ${batchIndex + 1} completed successfully`);
      
      // Mark this batch as completed to prevent duplicates
      completedBatchKeys.add(batchKeyForRun);
      console.log(`[ADJUDICATION] Marked batch ${batchIndex + 1} (key: ${batchKeyForRun}) as completed`);
      
      // Add results to the collection
      if (adjudicationResponse.data?.adjudicatedComments) {
        allResults.push(...adjudicationResponse.data.adjudicatedComments);
      }
      
      // Add delay between batches to respect rate limits (if not the last batch)
      if (batchIndex < batches.length - 1) {
        const delayMs = 1000; // 1 second delay between batches
        console.log(`[ADJUDICATION] Waiting ${delayMs}ms before next batch to respect rate limits`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
      
    } catch (batchError) {
      console.error(`[ADJUDICATION] Failed to process batch ${batchIndex + 1}:`, batchError);
      throw batchError; // Re-throw to stop processing
    }
  }
  
  console.log(`[ADJUDICATION] All batches completed. Total results: ${allResults.length}`);
  return allResults;
};

serve(async (req) => {
  console.log('Edge function called with method:', req.method);
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const overallStartTime = Date.now(); // Track overall process time
      const MAX_EXECUTION_TIME = 120 * 1000; // 120 seconds max execution time (2 minutes)

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
    gAny.__adjudicationBatchesCompleted = gAny.__adjudicationBatchesCompleted || new Set<string>();
    
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

    // Allow incremental processing: only block duplicate initial requests (batchStart=0)
    const isCached = Boolean(requestBody.useCachedAnalysis);
    const batchStartValue = typeof requestBody.batchStart === 'number' ? requestBody.batchStart : 
                           typeof requestBody.batchStart === 'string' ? parseInt(requestBody.batchStart) : 0;
    const isIncrementalRequest = Number.isFinite(batchStartValue) && batchStartValue > 0;
    
    if (!isCached && !isIncrementalRequest) {
      // Only block duplicate initial requests (batchStart=0 or undefined)
      if (gAny.__analysisStarted.has(scanRunId)) {
        console.log(`[DUPLICATE ANALYSIS] scanRunId=${scanRunId} received a second initial analysis request. Ignoring.`);
        return new Response(JSON.stringify({
          comments: [],
          batchStart: batchStartValue,
          batchSize: 0,
          hasMore: false,
          totalComments: requestBody.comments?.length || 0,
          summary: { total: 0, concerning: 0, identifiable: 0, needsAdjudication: 0 }
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      gAny.__analysisStarted.add(scanRunId);
    } else if (isIncrementalRequest) {
      console.log(`[INCREMENTAL] Allowing incremental request for scanRunId=${scanRunId} with batchStart=${batchStartValue}`);
    }

    // If this run id has already completed, short-circuit to avoid duplicate model calls
    if (gAny.__runCompleted.has(scanRunId)) {
      console.log(`[DUPLICATE RUN] scanRunId=${scanRunId} already completed. Skipping.`);
      return new Response(JSON.stringify({
        comments: [],
        batchStart: batchStartValue,
        batchSize: 0,
        hasMore: false,
        totalComments: requestBody.comments?.length || 0,
        summary: { total: 0, concerning: 0, identifiable: 0, needsAdjudication: 0 }
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    

    
    // Allow incremental processing: only block if this is a duplicate initial request
    if (gAny.__runInProgress.has(scanRunId) && !isIncrementalRequest) {
      console.log(`[DUPLICATE RUN] scanRunId=${scanRunId} already in progress. Skipping duplicate call.`);
      return new Response(JSON.stringify({
        comments: [],
        batchStart: batchStartValue,
        batchSize: 0,
        hasMore: false,
        totalComments: requestBody.comments?.length || 0,
        summary: { total: 0, concerning: 0, identifiable: 0, needsAdjudication: 0 }
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    
    console.log(`[RUN STATUS] scanRunId=${scanRunId}, isIncrementalRequest=${isIncrementalRequest}, runInProgress=${gAny.__runInProgress.has(scanRunId)}`);
    
    // Mark run as in progress
    gAny.__runInProgress.add(scanRunId);
    console.log(`[RUN STATUS] scanRunId=${scanRunId} marked as in progress`);
    
    const { 
      comments: inputComments, 
      defaultMode = 'redact',
      useCachedAnalysis = false,
      isDemoScan = false
    } = requestBody;
    
    // Use the parsed batchStartValue instead of the raw requestBody.batchStart
    const batchStart = batchStartValue;

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
    
    // Check database for run status to prevent duplicates across function instances
    // IMPORTANT: Only apply this to duplicate INITIAL requests. Incremental follow-ups must not be blocked.
    if (!isIncrementalRequest && !isCached) {
      const { data: existingRun, error: runCheckError } = await supabase
        .from('ai_logs')
        .select('id, function_name, response_status, created_at')
        .eq('scan_run_id', scanRunId)
        .eq('function_name', 'scan-comments')
        .eq('response_status', 'success')
        .order('created_at', { ascending: false })
        .limit(1);
      
      if (runCheckError) {
        console.error('[RUN CHECK] Error checking run status:', runCheckError);
      } else if (existingRun && existingRun.length > 0) {
        const lastRun = existingRun[0];
        const runAge = Date.now() - new Date(lastRun.created_at).getTime();
        const maxRunAge = 5 * 60 * 1000; // 5 minutes
        
        if (runAge < maxRunAge) {
          console.log(`[DUPLICATE RUN] scanRunId=${scanRunId} already completed recently (${Math.round(runAge/1000)}s ago). Skipping duplicate initial call.`);
          return new Response(JSON.stringify({
            comments: [],
            batchStart: batchStartValue,
            batchSize: 0,
            hasMore: false,
            totalComments: requestBody.comments?.length || 0,
            summary: { total: 0, concerning: 0, identifiable: 0, needsAdjudication: 0 }
          }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
      }
    } else if (isIncrementalRequest) {
      console.log(`[RUN CHECK] Skipping DB duplicate check for incremental request scanRunId=${scanRunId}`);
    }

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
    const adjudicator = configs.find(c => c.scanner_type === 'adjudicator');

    if (!scanA || !scanB) {
      throw new Error('Missing required AI configurations: scan_a and scan_b');
    }

    if (!adjudicator) {
      console.warn('No adjudicator configuration found - adjudication will be skipped');
    }

    console.log(`[CONFIG] Scan A: ${scanA.provider}/${scanA.model}, Scan B: ${scanB.provider}/${scanB.model}`);
    console.log(`[CONFIG] Scan A tokens_per_comment: ${scanA.tokens_per_comment || 13}, Scan B tokens_per_comment: ${scanB.tokens_per_comment || 13}`);
    if (adjudicator) {
      console.log(`[CONFIG] Adjudicator: ${adjudicator.provider}/${adjudicator.model}`);
    }

    // Fetch model configurations for token limits
    const { data: modelConfigs, error: modelError } = await supabase
      .from('model_configurations')
      .select('*');

    if (modelError) {
      console.error('Database error fetching model configurations:', modelError);
      throw new Error(`Database error: ${modelError.message || JSON.stringify(modelError)}`);
    }

    if (!modelConfigs || modelConfigs.length === 0) {
      console.warn('No model configurations found, using default token limits');
    }

    console.log(`[MODEL_CONFIG] Found ${modelConfigs?.length || 0} model configurations`);

    // Temperature will be configured when model configs are fetched later

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

    // Get batch sizing configuration for dynamic batching
    const { data: batchSizingData } = await supabase
      .from('batch_sizing_config')
      .select('*')
      .single();
    
    if (!batchSizingData) {
      console.warn('[BATCH] No batch sizing configuration found, using defaults');
    }
    
    // Get I/O ratios for post-processing and safety margin from configuration
    const ioRatios = {
      redaction_io_ratio: batchSizingData?.redaction_io_ratio ?? 1.7,
      rephrase_io_ratio: batchSizingData?.rephrase_io_ratio ?? 2.3
    };
    
    const safetyMarginPercent = batchSizingData?.safety_margin_percent ?? 15;
    
    console.log(`[BATCH] Post-processing I/O Ratios:`, ioRatios);
    console.log(`[BATCH] Safety Margin: ${safetyMarginPercent}%`);
    console.log(`[BATCH] Scan and Adjudication: Using configurable tokens per comment estimation`);
    
    // Calculate dynamic batch sizes based on I/O ratios and token limits
    // Use precise token counting for more accurate batch sizing
    const getPreciseTokens = async (text: string, provider: string, model: string) => {
      try {
        const { getPreciseTokenCount } = await import('./token-counter.ts');
        return await getPreciseTokenCount(provider, model, text);
      } catch (error) {
        console.warn(`[TOKEN_COUNT] Fallback to approximation for ${provider}/${model}:`, error);
        return Math.ceil(text.length / 4);
      }
    };
    
    const estimateBatchInputTokens = async (comments: any[], prompt: string, provider: string, model: string) => {
      const promptTokens = await getPreciseTokens(prompt, provider, model);
      let commentTokens = 0;
      
      for (const comment of comments) {
        const commentText = comment.originalText || comment.text || '';
        commentTokens += await getPreciseTokens(commentText, provider, model);
      }
      
      return promptTokens + commentTokens;
    };
    
    const calculateOptimalBatchSize = async (
      phase: 'scan_a' | 'scan_b',
      comments: any[],
      prompt: string,
      tokenLimits: { input_token_limit: number; output_token_limit: number; tpm_limit?: number; rpm_limit?: number },
      safetyMarginPercent: number = 15,
      provider: string,
      model: string,
      tokensPerComment: number = 13
    ) => {
      console.log(`[BATCH_CALC] ${phase}: Starting batch size calculation`);
      console.log(`[BATCH_CALC] ${phase}: Input parameters:`, {
        commentsCount: comments.length,
        promptLength: prompt.length,
        inputTokenLimit: tokenLimits.input_token_limit,
        outputTokenLimit: tokenLimits.output_token_limit,
        safetyMarginPercent
      });
      
      // Clamp and sanitize limits to prevent NaN/negative multipliers
      const boundedSafetyPercent = Math.min(90, Math.max(0, Number.isFinite(safetyMarginPercent) ? safetyMarginPercent : 15));
      if (boundedSafetyPercent !== safetyMarginPercent) {
        console.warn(`[BATCH_CALC] ${phase}: Safety margin clamped from ${safetyMarginPercent} to ${boundedSafetyPercent}`);
      }
      const safetyMultiplier = 1 - (boundedSafetyPercent / 100);
      console.log(`[BATCH_CALC] ${phase}: Safety multiplier: ${safetyMultiplier} (${boundedSafetyPercent}% safety margin)`);
      
      // Calculate maximum input tokens we can use
      const sanitizedInputLimit = Number.isFinite(tokenLimits.input_token_limit) && tokenLimits.input_token_limit > 0
        ? tokenLimits.input_token_limit
        : 128000;
      if (sanitizedInputLimit !== tokenLimits.input_token_limit) {
        console.warn(`[BATCH_CALC] ${phase}: input_token_limit was ${tokenLimits.input_token_limit}, defaulting to ${sanitizedInputLimit}`);
      }
      const maxInputTokens = Math.floor(sanitizedInputLimit * safetyMultiplier);
      console.log(`[BATCH_CALC] ${phase}: Max input tokens: ${sanitizedInputLimit} × ${safetyMultiplier} = ${maxInputTokens}`);
      
      // Calculate maximum output tokens we can generate
      const sanitizedOutputLimit = Number.isFinite(tokenLimits.output_token_limit) && tokenLimits.output_token_limit > 0
        ? tokenLimits.output_token_limit
        : 8192;
      if (sanitizedOutputLimit !== tokenLimits.output_token_limit) {
        console.warn(`[BATCH_CALC] ${phase}: output_token_limit was ${tokenLimits.output_token_limit}, defaulting to ${sanitizedOutputLimit}`);
      }
      const maxOutputTokens = Math.floor(sanitizedOutputLimit * safetyMultiplier);
      console.log(`[BATCH_CALC] ${phase}: Max output tokens: ${sanitizedOutputLimit} × ${safetyMultiplier} = ${maxOutputTokens}`);
      
      // For scan phases, use configurable tokens per comment estimation for output
      console.log(`[BATCH_CALC] ${phase}: Using ${tokensPerComment} tokens per comment estimation for output`);
      
      // Calculate the maximum number of comments we can process based on output limits
      const maxCommentsByOutput = Math.floor(maxOutputTokens / tokensPerComment);
      console.log(`[BATCH_CALC] ${phase}: Max comments by output: ${maxOutputTokens} / ${tokensPerComment} = ${maxCommentsByOutput}`);
      
      // We'll use the input token limit to determine how many comments we can actually fit
      // The output limit gives us the theoretical maximum, but input tokens are the real constraint
      console.log(`[BATCH_CALC] ${phase}: Using input token limit as primary constraint (output allows up to ${maxCommentsByOutput} comments)`);
      
      // Log the theoretical output tokens for the full dataset
      const theoreticalOutputTokens = comments.length * tokensPerComment;
      console.log(`[BATCH_CALC] ${phase}: Theoretical output tokens for all ${comments.length} comments: ${theoreticalOutputTokens}`);
      if (theoreticalOutputTokens > maxOutputTokens) {
        console.log(`[BATCH_CALC] ${phase}: WARNING: Full dataset would exceed output limit by ${theoreticalOutputTokens - maxOutputTokens} tokens`);
      }
      
      // Estimate tokens for prompt
      const promptStartTime = Date.now();
      const promptTokens = await getPreciseTokens(prompt, provider, model);
      const promptTime = Date.now() - promptStartTime;
      console.log(`[BATCH_CALC] ${phase}: Prompt tokens: ${prompt.length} chars, precise count: ${promptTokens} (${promptTime}ms)`);
      
      const availableTokensForComments = maxInputTokens - promptTokens;
      console.log(`[BATCH_CALC] ${phase}: Available tokens for comments: ${maxInputTokens} - ${promptTokens} = ${availableTokensForComments}`);
      
      if (availableTokensForComments <= 0) {
        console.log(`[BATCH_CALC] ${phase}: No tokens available for comments, returning batch size 1`);
        return 1; // Can only process one comment if prompt is too long
      }
      
      // Calculate how many comments we can fit//
      let batchSize = 0;
      let totalTokens = 0;
      let commentTokenDetails: string[] = [];
      let totalCommentTime = 0;
      
      console.log(`[BATCH_CALC] ${phase}: Starting comment-by-comment token calculation...`);
      
      for (let i = 0; i < comments.length; i++) {
        const comment = comments[i];
        const commentText = comment.originalText || comment.text || '';
        const commentStartTime = Date.now();
        const commentTokens = await getPreciseTokens(commentText, provider, model);
        const commentTime = Date.now() - commentStartTime;
        totalCommentTime += commentTime;
        
        if (totalTokens + commentTokens <= availableTokensForComments) {
          totalTokens += commentTokens;
          batchSize++;
          commentTokenDetails.push(`Comment ${i + 1}: ${commentTokens} tokens (${commentText.length} chars, ${commentTime}ms)`);
        } else {
          console.log(`[BATCH_CALC] ${phase}: Comment ${i + 1} would exceed limit: ${totalTokens} + ${commentTokens} > ${availableTokensForComments}`);
          break;
        }
      }
      
      console.log(`[BATCH_CALC] ${phase}: Comment token breakdown:`);
      // commentTokenDetails.forEach(detail => console.log(`[BATCH_CALC] ${phase}:   ${detail}`));
      console.log(`[BATCH_CALC] ${phase}: Total comment tokens: ${totalTokens}`);
      console.log(`[BATCH_CALC] ${phase}: Calculated batch size: ${batchSize}`);
      
      // Check if we would exceed output token limits
      const estimatedOutputTokens = batchSize * tokensPerComment;
      if (estimatedOutputTokens > maxOutputTokens) {
        console.log(`[BATCH_CALC] ${phase}: Output token limit exceeded: ${estimatedOutputTokens} > ${maxOutputTokens}`);
        // Reduce batch size to fit within output limits
        const maxCommentsByOutput = Math.floor(maxOutputTokens / tokensPerComment);
        batchSize = Math.min(batchSize, maxCommentsByOutput);
        console.log(`[BATCH_CALC] ${phase}: Reduced batch size to ${batchSize} to fit output limits`);
      } else {
        console.log(`[BATCH_CALC] ${phase}: Output tokens within limit: ${estimatedOutputTokens} <= ${maxOutputTokens}`);
      }
      
      // Apply configurable safety margin to prevent hitting token limits
      const safetyBatchSize = Math.floor(batchSize * safetyMultiplier);
      if (safetyBatchSize < batchSize) {
        console.log(`[BATCH_CALC] ${phase}: Applying safety margin: ${batchSize} → ${safetyBatchSize} (${safetyMarginPercent}% of max)`);
        batchSize = safetyBatchSize;
      }
      
      // Consider TPM and RPM limits when determining final batch size
      if (tokenLimits.tpm_limit || tokenLimits.rpm_limit) {
        const estimatedTokensPerComment = Math.ceil(totalTokens / batchSize) + tokensPerComment; // Average input + output per comment
        const optimalBatchSize = calculateOptimalBatchSize(
          provider,
          model,
          estimatedTokensPerComment,
          batchSize,
          tokenLimits.tpm_limit,
          tokenLimits.rpm_limit,
          `[BATCH_CALC] ${phase}`,
          2 // Scan-comments makes 2 parallel requests per batch (Scan A + Scan B)
        );
        
        if (optimalBatchSize < batchSize) {
          console.log(`[BATCH_CALC] ${phase}: Reducing batch size from ${batchSize} to ${optimalBatchSize} due to rate limits`);
          batchSize = optimalBatchSize;
        }
      } else {
        console.log(`[BATCH_CALC] ${phase}: No rate limits configured`);
      }

      console.log(`[BATCH_CALC] ${phase}: Token counting timing - Prompt: ${promptTime}ms, Comments: ${totalCommentTime}ms, Total: ${promptTime + totalCommentTime}ms`);
      console.log(`[BATCH_CALC] ${phase}: Calculation complete`);
      
      return Math.max(1, batchSize); // Always return at least 1
    };
    
    // Get token limits and temperature for the models being used
    const scanAModelConfig = modelConfigs?.find(m => m.provider === scanA.provider && m.model === scanA.model);
    const scanBModelConfig = modelConfigs?.find(m => m.provider === scanB.provider && m.model === scanB.model);
    
    console.log(`[MODEL_LOOKUP] Looking for Scan A: ${scanA.provider}/${scanA.model}`);
    console.log(`[MODEL_LOOKUP] Looking for Scan B: ${scanB.provider}/${scanB.model}`);
    console.log(`[MODEL_LOOKUP] Available models:`, modelConfigs?.map(m => `${m.provider}/${m.model}`));
    
    if (!scanAModelConfig?.output_token_limit) {
      console.error(`[ERROR] Scan A model config missing output_token_limit:`, scanAModelConfig);
      console.error(`[ERROR] Available model configs:`, modelConfigs);
      throw new Error(`Max Tokens is not defined for Scan A model (${scanA.provider}/${scanA.model}). Please check the Model Configuration section in your dashboard.`);
    }
    
    if (!scanBModelConfig?.output_token_limit) {
      console.error(`[ERROR] Scan B model config missing output_token_limit:`, scanBModelConfig);
      console.error(`[ERROR] Available model configs:`, modelConfigs);
      throw new Error(`Max Tokens is not defined for Scan B model (${scanB.provider}/${scanB.model}). Please check the Model Configuration section in your dashboard.`);
    }
    
    // Configure temperature for both scans
    // Prefer Dashboard AI Config (ai_configurations.temperature), fallback to model_configurations.temperature, else 0
    const aiTempA = (scanA as any)?.temperature;
    const aiTempB = (scanB as any)?.temperature;
    scanA.temperature = (aiTempA !== undefined && aiTempA !== null)
      ? aiTempA
      : (scanAModelConfig?.temperature ?? 0);
    scanB.temperature = (aiTempB !== undefined && aiTempB !== null)
      ? aiTempB
      : (scanBModelConfig?.temperature ?? 0);
    
    console.log(`[CONFIG] Scan A temperature: ${scanA.temperature}, Scan B temperature: ${scanB.temperature}`);
    
    const scanATokenLimits = {
      input_token_limit: scanAModelConfig?.input_token_limit || 128000,
      output_token_limit: scanAModelConfig.output_token_limit,
      tpm_limit: scanAModelConfig?.tpm_limit,
      rpm_limit: scanAModelConfig?.rpm_limit
    };
    
    const scanBTokenLimits = {
      input_token_limit: scanBModelConfig?.input_token_limit || 128000,
      output_token_limit: scanBModelConfig.output_token_limit,
      tpm_limit: scanBModelConfig?.tpm_limit,
      rpm_limit: scanBModelConfig?.rpm_limit
    };
    
    console.log(`[TOKEN LIMITS] Scan A:`, scanATokenLimits);
    console.log(`[TOKEN LIMITS] Scan B:`, scanBTokenLimits);
    
    // Use faster batch size calculation for large datasets
    console.log(`[BATCH_SIZING] Using optimized batch size calculation for ${inputComments.length} comments...`);
    const batchSizingStartTime = Date.now();
    
    // Use precise AI batch size calculation for all datasets
    let scanABatchSize, scanBBatchSize;
    
    console.log(`[BATCH_SIZING] Using precise token counting for ${inputComments.length} comments...`);
    
    // Use precise calculation for all datasets to optimize performance
    scanABatchSize = await calculateOptimalBatchSize(
      'scan_a',
      inputComments,
      scanA.analysis_prompt,
      scanATokenLimits,
      safetyMarginPercent,
      scanA.provider,
      scanA.model,
      scanA.tokens_per_comment || 13
    );
    
    scanBBatchSize = await calculateOptimalBatchSize(
      'scan_b',
      inputComments,
      scanB.analysis_prompt,
      scanBTokenLimits,
      safetyMarginPercent,
      scanB.provider,
      scanB.model,
      scanB.tokens_per_comment || 13
    );
    
    const batchSizingTime = Date.now() - batchSizingStartTime;
    console.log(`[BATCH_SIZING] Precise batch size calculation completed in ${batchSizingTime}ms`);
    
    // Log performance impact of precise calculation
    if (inputComments.length > 100) {
      console.log(`[PERFORMANCE] Precise calculation overhead: ${batchSizingTime}ms for ${inputComments.length} comments`);
      console.log(`[PERFORMANCE] Expected performance gain from optimized batch sizes`);
    }
    
    // Use the smaller batch size to ensure both scans can process the same batches
    let finalBatchSize = Math.min(scanABatchSize, scanBBatchSize);
    
    console.log(`[BATCH_SELECTION] Individual batch sizes calculated:`);
    console.log(`[BATCH_SELECTION]   Scan A: ${scanABatchSize} comments`);
    console.log(`[BATCH_SELECTION]   Scan B: ${scanBBatchSize} comments`);
    console.log(`[BATCH_SELECTION] Initial final batch size: min(${scanABatchSize}, ${scanBBatchSize}) = ${finalBatchSize}`);
    
    // Small-dataset override: if the full dataset fits within token limits, process in a single batch
    if (inputComments.length <= 50) {
      try {
        const safetyMultiplier = 1 - (safetyMarginPercent / 100);
        const scanAInputAll = await estimateBatchInputTokens(inputComments, scanA.analysis_prompt, scanA.provider, scanA.model);
        const scanAOutputAll = inputComments.length * (scanA.tokens_per_comment || 13);
        const scanBInputAll = await estimateBatchInputTokens(inputComments, scanB.analysis_prompt, scanB.provider, scanB.model);
        const scanBOutputAll = inputComments.length * (scanB.tokens_per_comment || 13);
        const fitsA = scanAInputAll <= Math.floor(scanATokenLimits.input_token_limit * safetyMultiplier) && scanAOutputAll <= Math.floor(scanATokenLimits.output_token_limit * safetyMultiplier);
        const fitsB = scanBInputAll <= Math.floor(scanBTokenLimits.input_token_limit * safetyMultiplier) && scanBOutputAll <= Math.floor(scanBTokenLimits.output_token_limit * safetyMultiplier);
        console.log(`[BATCH_SELECTION] Small dataset check: fitsA=${fitsA} fitsB=${fitsB}`);
        if (fitsA && fitsB) {
          finalBatchSize = inputComments.length;
          console.log(`[BATCH_SELECTION] Overriding finalBatchSize to ${finalBatchSize} (single batch for small dataset)`);
        }
      } catch (e) {
        console.warn('[BATCH_SELECTION] Small dataset override check failed, keeping computed batch size:', e);
      }
    }
    
    if (finalBatchSize === scanABatchSize) {
      console.log(`[BATCH_SELECTION] Scan A batch size is the limiting factor`);
    } else {
      console.log(`[BATCH_SELECTION] Scan B batch size is the limiting factor`);
    }
    
    console.log(`[BATCH SIZING] Precise calculation results:`);
    console.log(`  Scan A optimal: ${scanABatchSize} (${scanA.tokens_per_comment || 13} tokens per comment)`);
    console.log(`  Scan B optimal: ${scanBBatchSize} (${scanB.tokens_per_comment || 13} tokens per comment)`);
    console.log(`  Final batch size: ${finalBatchSize}`);
    console.log(`[BATCH SIZING] Dataset size: ${inputComments.length} comments`);
    console.log(`[BATCH SIZING] Estimated batches: ${Math.ceil(inputComments.length / finalBatchSize)}`);
    console.log(`[BATCH SIZING] Safety margin: ${safetyMarginPercent}%`);
    console.log(`[BATCH SIZING] Token limits - Scan A: ${scanATokenLimits.output_token_limit}, Scan B: ${scanBTokenLimits.output_token_limit}`);
    console.log(`[BATCH SIZING] Precise batch sizing enabled for optimal performance`);
    
    // Log token estimation method for reference
    console.log(`[BATCH SIZING] Token estimation - Scan A: ${scanA.tokens_per_comment || 13} tokens per comment, Scan B: ${scanB.tokens_per_comment || 13} tokens per comment`);
    
    // Log token estimates for the first batch
    if (inputComments.length > 0) {
      const firstBatch = inputComments.slice(0, finalBatchSize);
      const scanAInputTokens = await estimateBatchInputTokens(firstBatch, scanA.analysis_prompt, scanA.provider, scanA.model);
      const scanBInputTokens = await estimateBatchInputTokens(firstBatch, scanB.analysis_prompt, scanB.provider, scanB.model);
      const scanAOutputTokens = finalBatchSize * (scanA.tokens_per_comment || 13); // configurable tokens per comment
      const scanBOutputTokens = finalBatchSize * (scanB.tokens_per_comment || 13); // configurable tokens per comment
      
      console.log(`[TOKEN ESTIMATES] First batch (${finalBatchSize} comments):`);
      console.log(`  Scan A: ${scanAInputTokens} input → ${scanAOutputTokens} output (${scanA.tokens_per_comment || 13} tokens per comment)`);
      console.log(`  Scan B: ${scanBInputTokens} input → ${scanBOutputTokens} output (${scanB.tokens_per_comment || 13} tokens per comment)`);
    }
    
    // Process comments in smaller chunks to avoid gateway timeout
    // Reduce batch limits to prevent edge function timeout
    const MAX_BATCHES_PER_REQUEST = 1; // Process exactly one batch per invocation to stay under edge timeout
    const MAX_EXECUTION_TIME = 120 * 1000; // Fixed 120 second limit for safety
    let allScannedComments: any[] = [];
    let totalSummary = { total: 0, concerning: 0, identifiable: 0, needsAdjudication: 0 };
    
    // Initialize AI logger for this scan run
    const aiLogger = new AILogger();
    aiLogger.setFunctionStartTime(overallStartTime);
    
    let batchesProcessed = 0;
    for (let currentBatchStart = batchStart; currentBatchStart < inputComments.length; currentBatchStart += finalBatchSize) {
      // Check for timeout before processing each batch
      const currentTime = Date.now();
      const elapsedTime = currentTime - overallStartTime;
      
      // Check if we've processed enough batches for this request
      if (batchesProcessed >= MAX_BATCHES_PER_REQUEST) {
        console.log(`[BATCH_LIMIT] Processed ${batchesProcessed} batches, returning partial results to avoid gateway timeout`);
        
        const partialResponse = {
          comments: allScannedComments,
          batchStart: currentBatchStart, // Next batch to process
          batchSize: finalBatchSize,
          hasMore: currentBatchStart < inputComments.length,
          totalComments: inputComments.length,
          summary: totalSummary,
          totalRunTimeMs: elapsedTime,
          batchesProcessed: batchesProcessed,
          nextBatchStart: currentBatchStart
        };
        
        console.log('Returning partial response due to batch limit:', `Processed ${allScannedComments.length}/${inputComments.length} comments in ${batchesProcessed} batches`);
        return new Response(JSON.stringify(partialResponse), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }
      
      if (elapsedTime > MAX_EXECUTION_TIME) {
        console.warn(`[TIMEOUT] Function execution time (${elapsedTime}ms) exceeded maximum (${MAX_EXECUTION_TIME}ms)`);
        console.warn(`[TIMEOUT] Stopping processing to prevent gateway timeout. Processed ${allScannedComments.length}/${inputComments.length} comments`);
        
        // Return partial results with timeout warning
        const partialResponse = {
          comments: allScannedComments,
          batchStart: currentBatchStart,
          batchSize: finalBatchSize,
          hasMore: currentBatchStart < inputComments.length,
          totalComments: inputComments.length,
          summary: totalSummary,
          totalRunTimeMs: elapsedTime,
          timeoutWarning: `Processing stopped after ${elapsedTime}ms to prevent gateway timeout. Processed ${allScannedComments.length}/${inputComments.length} comments.`
        };
        
        console.log('Returning partial response due to timeout:', partialResponse.timeoutWarning);
        return new Response(JSON.stringify(partialResponse), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }
      
      const batch = inputComments.slice(currentBatchStart, currentBatchStart + finalBatchSize);
      const batchEnd = Math.min(currentBatchStart + finalBatchSize, inputComments.length);
      
      console.log(`[PROCESS] Batch ${currentBatchStart + 1}-${batchEnd} of ${inputComments.length} (finalBatchSize=${finalBatchSize}) - Elapsed: ${elapsedTime}ms`);
      console.log(`[TOKENS] Scan A max_tokens: ${scanATokenLimits.output_token_limit}, Scan B max_tokens: ${scanBTokenLimits.output_token_limit}`);
      console.log(`[TOKENS] Scan A temperature: ${scanA.temperature}, Scan B temperature: ${scanB.temperature}`);

            // Process batch with Scan A and Scan B, enforcing TPM limits
      const batchStartTime = Date.now();
      
      // Calculate estimated tokens for this batch
      const batchInput = buildBatchInput(batch, currentBatchStart + 1);
      const estimatedInputTokens = Math.ceil(batchInput.length / 4);
      const estimatedOutputTokens = batch.length * Math.max(scanA.tokens_per_comment || 13, scanB.tokens_per_comment || 13);
      const totalEstimatedTokens = estimatedInputTokens + estimatedOutputTokens;
      
      console.log(`[BATCH ${currentBatchStart + 1}-${batchEnd}] Estimated tokens: ${totalEstimatedTokens} (${estimatedInputTokens} input + ${estimatedOutputTokens} output)`);
      
      // Check rate limits and wait if necessary before making parallel calls
      if (scanATokenLimits.tpm_limit || scanATokenLimits.rpm_limit) {
        const tpmWaitTimeA = calculateWaitTime(scanA.provider, scanA.model, totalEstimatedTokens, scanATokenLimits.tpm_limit);
        const rpmWaitTimeA = calculateRPMWaitTime(scanA.provider, scanA.model, 1, scanATokenLimits.rpm_limit);
        const maxWaitTimeA = Math.max(tpmWaitTimeA, rpmWaitTimeA);
        
        if (maxWaitTimeA > 0) {
          const reason = [];
          if (tpmWaitTimeA > 0) reason.push(`TPM (${tpmWaitTimeA}ms)`);
          if (rpmWaitTimeA > 0) reason.push(`RPM (${rpmWaitTimeA}ms)`);
          
          console.log(`[BATCH ${currentBatchStart + 1}-${batchEnd}] [SCAN_A] Waiting ${maxWaitTimeA}ms to comply with ${reason.join(' and ')} limits`);
          await new Promise(resolve => setTimeout(resolve, maxWaitTimeA));
        }
      }
      
      if (scanBTokenLimits.tpm_limit || scanBTokenLimits.rpm_limit) {
        const tpmWaitTimeB = calculateWaitTime(scanB.provider, scanB.model, totalEstimatedTokens, scanBTokenLimits.tpm_limit);
        const rpmWaitTimeB = calculateRPMWaitTime(scanB.provider, scanB.model, 1, scanBTokenLimits.rpm_limit);
        const maxWaitTimeB = Math.max(tpmWaitTimeB, rpmWaitTimeB);
        
        if (maxWaitTimeB > 0) {
          const reason = [];
          if (tpmWaitTimeB > 0) reason.push(`TPM (${tpmWaitTimeB}ms)`);
          if (rpmWaitTimeB > 0) reason.push(`RPM (${rpmWaitTimeB}ms)`);
          
          console.log(`[BATCH ${currentBatchStart + 1}-${batchEnd}] [SCAN_B] Waiting ${maxWaitTimeB}ms to comply with ${reason.join(' and ')} limits`);
          await new Promise(resolve => setTimeout(resolve, maxWaitTimeB));
        }
      }
      
      const settled = await Promise.allSettled([
        callAI(scanA.provider, scanA.model, scanA.analysis_prompt, batchInput, 'batch_analysis', user.id, scanRunId, 'scan_a', aiLogger, scanATokenLimits.output_token_limit, scanA.temperature),
        callAI(scanB.provider, scanB.model, scanB.analysis_prompt, batchInput, 'batch_analysis', user.id, scanRunId, 'scan_b', aiLogger, scanBTokenLimits.output_token_limit, scanB.temperature)
      ]);
      let scanAResults: any = null;
      let scanBResults: any = null;
      if (settled[0].status === 'fulfilled') {
        scanAResults = settled[0].value;
      } else {
        const errMsg = settled[0].reason instanceof Error ? settled[0].reason.message : String(settled[0].reason);
        console.error(`[SCAN_A] Error: ${errMsg}`);
        if (aiLogger) {
          await aiLogger.logResponse(user.id, scanRunId, 'scan-comments', scanA.provider, scanA.model, 'batch_analysis', 'scan_a', '', errMsg, undefined);
        }
      }
      if (settled[1].status === 'fulfilled') {
        scanBResults = settled[1].value;
      } else {
        const errMsg = settled[1].reason instanceof Error ? settled[1].reason.message : String(settled[1].reason);
        console.error(`[SCAN_B] Error: ${errMsg}`);
        if (aiLogger) {
          await aiLogger.logResponse(user.id, scanRunId, 'scan-comments', scanB.provider, scanB.model, 'batch_analysis', 'scan_b', '', errMsg, undefined);
        }
      }
      const batchEndTime = Date.now();
      console.log(`[PERFORMANCE] Batch ${currentBatchStart + 1}-${batchEnd} processed in ${batchEndTime - batchStartTime}ms (parallel AI calls)`);
      
      // Record usage AFTER the AI calls complete
      if (scanATokenLimits.tpm_limit || scanATokenLimits.rpm_limit) {
        recordUsage(scanA.provider, scanA.model, totalEstimatedTokens);
        recordRequest(scanA.provider, scanA.model, 1);
        console.log(`[BATCH ${currentBatchStart + 1}-${batchEnd}] [SCAN_A] Recorded usage: ${totalEstimatedTokens} tokens, 1 request`);
      }
      
      if (scanBTokenLimits.tpm_limit || scanBTokenLimits.rpm_limit) {
        recordUsage(scanB.provider, scanB.model, totalEstimatedTokens);
        recordRequest(scanB.provider, scanB.model, 1);
        console.log(`[BATCH ${currentBatchStart + 1}-${batchEnd}] [SCAN_B] Recorded usage: ${totalEstimatedTokens} tokens, 1 request`);
      }

      console.log(`[RESULT] Scan A ${scanA.provider}/${scanA.model}: type=${typeof scanAResults} len=${Array.isArray(scanAResults) ? scanAResults.length : 'n/a'}`);
      console.log(`[RESULT] Scan B ${scanB.provider}/${scanB.model}: type=${typeof scanBResults} len=${Array.isArray(scanBResults) ? scanBResults.length : 'n/a'}`);
      
      // Log the row ranges being processed
      console.log(`[BATCH_ROWS] Processing comments from rows ${currentBatchStart + 1} to ${batchEnd}`);

      // Parse and validate results
      const scanAResultsArray = parseBatchResults(scanAResults, batch.length, 'Scan A', currentBatchStart + 1);
      const scanBResultsArray = parseBatchResults(scanBResults, batch.length, 'Scan B', currentBatchStart + 1);

      // CRITICAL FIX: Validate that we got complete results for all comments
      if (scanAResultsArray.length !== batch.length) {
        console.error(`[ERROR] Scan A returned ${scanAResultsArray.length} results for ${batch.length} comments - response may be truncated`);
        console.error(`[ERROR] Scan A response length: ${scanAResults.length} characters`);
        console.error(`[ERROR] Scan A response preview: ${scanAResults.substring(0, 500)}...`);
      }
      
      if (scanBResultsArray.length !== batch.length) {
        console.error(`[ERROR] Scan B returned ${scanBResultsArray.length} results for ${batch.length} comments - response may be truncated`);
        console.error(`[ERROR] Scan B response length: ${scanBResults.length} characters`);
        console.error(`[ERROR] Scan B response preview: ${scanBResults.substring(0, 500)}...`);
      }

      // CRITICAL FIX: Log incomplete results but continue processing
      if (scanAResultsArray.length !== batch.length || scanBResultsArray.length !== batch.length) {
        console.error(`[ERROR] Incomplete batch results detected for batch ${currentBatchStart + 1}-${batchEnd}`);
        console.error(`[ERROR] Expected ${batch.length} results, got Scan A: ${scanAResultsArray.length}, Scan B: ${scanBResultsArray.length}`);
        console.warn(`[WARNING] Continuing with padded results - missing items will be filled with defaults`);
      }

      // Process each comment in this batch
      const maxResults = Math.max(scanAResultsArray.length, scanBResultsArray.length);
      console.log(`[BATCH_DEBUG] Processing batch ${currentBatchStart + 1}-${batchEnd}: batch.length=${batch.length}, maxResults=${maxResults}`);
      
      for (let i = 0; i < maxResults && i < batch.length; i++) {
        const comment = batch[i];
        const scanAResult = scanAResultsArray[i];
        const scanBResult = scanBResultsArray[i];
        const expectedIndex = currentBatchStart + i + 1;

        if (!scanAResult || !scanBResult) {
          console.warn(`Missing scan results for comment ${expectedIndex}, skipping`);
          continue;
        }

        // Validate that the AI returned the correct index
        if (scanAResult.index !== expectedIndex) {
          console.warn(`[WARNING] Scan A returned index ${scanAResult.index} for comment ${expectedIndex}`);
        }
        if (scanBResult.index !== expectedIndex) {
          console.warn(`[WARNING] Scan B returned index ${scanBResult.index} for comment ${expectedIndex}`);
        }

        // Determine if adjudication is needed
        const concerningDisagreement = scanAResult.concerning !== scanBResult.concerning;
        const identifiableDisagreement = scanAResult.identifiable !== scanBResult.identifiable;
        const needsAdjudication = concerningDisagreement || identifiableDisagreement;

        if (needsAdjudication) {
          totalSummary.needsAdjudication++;
          console.log(`[ADJUDICATION] Comment ${comment.id} needs adjudication: concerning disagreement=${concerningDisagreement} (A:${scanAResult.concerning}, B:${scanBResult.concerning}), identifiable disagreement=${identifiableDisagreement} (A:${scanAResult.identifiable}, B:${scanBResult.identifiable})`);
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
      
      console.log(`[BATCH] Completed batch ${currentBatchStart + 1}-${batchEnd}, processed ${Math.min(maxResults, batch.length)} comments`);
      console.log(`[BATCH] Results: Scan A: ${scanAResultsArray.length}, Scan B: ${scanBResultsArray.length}, Batch: ${batch.length}`);
      console.log(`[BATCH] Comments processed: rows ${currentBatchStart + 1} to ${currentBatchStart + Math.min(maxResults, batch.length)}`);
      console.log(`[BATCH] Total comments processed so far: ${allScannedComments.length}/${inputComments.length}`);
      
      // Increment batch counter
      batchesProcessed++;
    }
      
      totalSummary.total = allScannedComments.length;
    console.log(`Successfully scanned ${allScannedComments.length}/${inputComments.length} comments across ${Math.ceil(inputComments.length / finalBatchSize)} batches`);
    
    // Log detailed breakdown of what was processed
    
    if (isIncrementalRequest) {
      // For incremental requests, we only process a subset of the total comments
      const firstCommentIndex = allScannedComments[0]?.originalRow || (batchStartValue + 1);
      const lastCommentIndex = allScannedComments[allScannedComments.length - 1]?.originalRow || (batchStartValue + allScannedComments.length);
      console.log(`[INCREMENTAL] Processed batch: rows ${firstCommentIndex} to ${lastCommentIndex} (${allScannedComments.length} comments)`);
    } else {
      // For initial requests, check if we processed all comments in this invocation
      if (allScannedComments.length < inputComments.length) {
        console.warn(`[WARNING] Missing ${inputComments.length - allScannedComments.length} comments!`);
        console.warn(`[WARNING] This suggests some batches were not fully processed`);
        
        // Log the range of comments we have
        const firstCommentIndex = allScannedComments[0]?.originalRow || 1;
        const lastCommentIndex = allScannedComments[allScannedComments.length - 1]?.originalRow || allScannedComments.length;
        console.warn(`[WARNING] Comment range: ${firstCommentIndex} to ${lastCommentIndex}`);
      } else {
        // Log successful processing range
        const firstCommentIndex = allScannedComments[0]?.originalRow || 1;
        const lastCommentIndex = allScannedComments[allScannedComments.length - 1]?.originalRow || allScannedComments.length;
        console.log(`[SUCCESS] All comments processed successfully: rows ${firstCommentIndex} to ${lastCommentIndex}`);
      }
    }
    
    const totalRunTimeMs = Date.now() - overallStartTime;
    
    // Check for missing tail comments and retry if needed
    const expectedTotal = inputComments.length;
    const actualTotal = allScannedComments.length;
    
    // Determine if there are more batches to process (must be defined before first use)
    const lastProcessedIndex = batchStart + (batchesProcessed * finalBatchSize);
    const hasMoreBatches = lastProcessedIndex < inputComments.length;
    
    if (!hasMoreBatches && actualTotal < expectedTotal) {
      const missingCount = expectedTotal - actualTotal;
      console.log(`[TAIL_RETRY] Missing ${missingCount} comments (${actualTotal}/${expectedTotal}), attempting tail retry...`);
      
      // Find the highest processed index
      const processedIndices = allScannedComments.map(c => c.originalRow || 0);
      const lastProcessedIndex = processedIndices.length > 0 ? Math.max(...processedIndices) : -1;
      
      // Calculate what comments are missing
      const tailStartIndex = lastProcessedIndex;
      const tailComments = inputComments.slice(tailStartIndex);
      
      if (tailComments.length > 0 && tailComments.length <= 100) { // Only retry for reasonable sizes
        console.log(`[TAIL_RETRY] Processing ${tailComments.length} tail comments starting from index ${tailStartIndex}`);
        
        try {
          // Use a very small batch size for tail retry
          const tailBatchSize = Math.min(50, tailComments.length);
          const tailResponse = await processBatch(tailComments, 0, tailBatchSize, scanRunId, "scan_b");
          
          if (tailResponse && tailResponse.length > 0) {
            // Adjust the originalRow indices for tail comments
            const adjustedTailComments = tailResponse.map(comment => ({
              ...comment,
              originalRow: (comment.originalRow || 0) + tailStartIndex
            }));
            
            allScannedComments.push(...adjustedTailComments);
            console.log(`[TAIL_RETRY] Successfully processed ${tailResponse.length} tail comments`);
          }
        } catch (tailError) {
          console.error(`[TAIL_RETRY] Failed to process tail comments:`, tailError);
          // Continue without failing the entire request
        }
      }
    }
    
    // Call adjudicator if there are comments that need adjudication and no more batches
    console.log(`[ADJUDICATION] Checking conditions: hasMoreBatches=${hasMoreBatches}, needsAdjudication=${totalSummary.needsAdjudication}, adjudicator=${!!adjudicator}`);
    
    if (!hasMoreBatches && totalSummary.needsAdjudication > 0 && adjudicator) {
      // Safety gate: ensure ALL scan-comments calls have finished (no pending logs for this run)
      try {
        const { data: pendingScanLogs, error: pendingErr } = await supabase
          .from('ai_logs')
          .select('id')
          .eq('scan_run_id', scanRunId)
          .eq('function_name', 'scan-comments')
          .eq('response_status', 'pending')
          .limit(1);
        if (pendingErr) {
          console.warn(`[ADJUDICATION] Pending check failed, proceeding cautiously:`, pendingErr);
        } else if (pendingScanLogs && pendingScanLogs.length > 0) {
          console.log(`[ADJUDICATION] Deferring adjudication: found pending scan-comments logs for run ${scanRunId}`);
          // Skip adjudication for this invocation; frontend will call again on next batch/refresh
          return new Response(JSON.stringify({
            comments: allScannedComments,
            batchStart: batchStart,
            batchSize: finalBatchSize,
            hasMore: hasMoreBatches,
            totalComments: inputComments.length,
            summary: totalSummary,
            totalRunTimeMs: totalRunTimeMs,
            batchesProcessed: batchesProcessed,
            nextBatchStart: hasMoreBatches ? lastProcessedIndex : inputComments.length,
            adjudicationDeferred: true
          }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
      } catch (gateErr) {
        console.warn(`[ADJUDICATION] Error during pending scan check, proceeding:`, gateErr);
      }
      // In-memory guards to ensure adjudicator runs only once per scanRunId (per edge function instance)
      gAny.__adjudicationStarted = gAny.__adjudicationStarted || new Set<string>();
      gAny.__adjudicationCompleted = gAny.__adjudicationCompleted || new Set<string>();

      if (gAny.__adjudicationStarted.has(scanRunId)) {
        console.log(`[ADJUDICATION] Already started for scanRunId=${scanRunId}, skipping duplicate adjudicator call`);
      } else {
        gAny.__adjudicationStarted.add(scanRunId);
        console.log(`[ADJUDICATION] Starting adjudication for ${totalSummary.needsAdjudication} comments that need resolution`);
        
        try {
          // Filter comments that need adjudication
          const commentsNeedingAdjudication = allScannedComments.filter(comment => {
            const scanAResult = comment.adjudicationData?.scanAResult;
            const scanBResult = comment.adjudicationData?.scanBResult;
            
            if (!scanAResult || !scanBResult) return false;
            
            const concerningDisagreement = scanAResult.concerning !== scanBResult.concerning;
            const identifiableDisagreement = scanAResult.identifiable !== scanBResult.identifiable;
            
            return concerningDisagreement || identifiableDisagreement;
          });

          console.log(`[ADJUDICATION] Found ${commentsNeedingAdjudication.length} comments that need adjudication`);

          // Check for duplicate adjudication call (cross-invocation, via DB logs)
          const isDuplicate = await checkForDuplicateAdjudication(supabase, scanRunId, commentsNeedingAdjudication);
          
          if (isDuplicate) {
            console.log(`[ADJUDICATION] These comments have already been processed, skipping duplicate call`);
            // Continue without calling adjudicator again
          } else {
            // Process adjudication with proper batching
            const adjudicatorConfig = {
              provider: adjudicator.provider,
              model: adjudicator.model,
              prompt: adjudicator.analysis_prompt,
              max_tokens: adjudicator.max_tokens
            };

            console.log(`[ADJUDICATION] Sending adjudicator config:`, {
              provider: adjudicator.provider,
              model: adjudicator.model,
              promptLength: adjudicator.analysis_prompt?.length || 0,
              maxTokens: adjudicator.max_tokens
            });

            // Use the new batching system
            const adjudicatedResults = await processAdjudicationBatches(
              supabase,
              scanRunId,
              commentsNeedingAdjudication,
              adjudicatorConfig,
              authHeader || '',
              50 // maxBatchSize - adjust based on token limits
            );

            // Update the comments with adjudicated results
            if (adjudicatedResults.length > 0) {
              const adjudicatedMap = new Map(adjudicatedResults.map(adj => [adj.id, adj]));
              
              allScannedComments = allScannedComments.map(comment => {
                const adjudicated = adjudicatedMap.get(comment.id);
                if (adjudicated) {
                  return {
                    ...comment,
                    concerning: Boolean(adjudicated.concerning),
                    identifiable: Boolean(adjudicated.identifiable),
                    mode: adjudicated.concerning ? 'redact' : adjudicated.identifiable ? 'rephrase' : 'original',
                    needsAdjudication: false,
                    isAdjudicated: true,
                    aiReasoning: adjudicated.reasoning || comment.aiReasoning
                  };
                }
                return comment;
              });
            }
          }
        } catch (adjudicationError) {
          console.error('[ADJUDICATION] Failed to call adjudicator:', adjudicationError);
          // Continue without failing the entire scan
        } finally {
          gAny.__adjudicationCompleted.add(scanRunId);
          console.log(`[ADJUDICATION] Marked adjudication as completed for scanRunId=${scanRunId}`);
        }
      }
    }

    const response = { 
      comments: allScannedComments,
      batchStart: batchStart, // Starting batch for this request
      batchSize: finalBatchSize, // Batch size used for processing
      hasMore: hasMoreBatches, // True if there are more batches to process
      totalComments: inputComments.length,
      summary: totalSummary,
      totalRunTimeMs: totalRunTimeMs,
      batchesProcessed: batchesProcessed,
      nextBatchStart: hasMoreBatches ? lastProcessedIndex : inputComments.length, // Next batch to process or all done
      adjudicationStarted: Boolean((globalThis as any).__adjudicationStarted && (globalThis as any).__adjudicationStarted.has(scanRunId)),
      adjudicationCompleted: Boolean((globalThis as any).__adjudicationCompleted && (globalThis as any).__adjudicationCompleted.has(scanRunId))
    };
    
    console.log('Returning response with comments count:', response.comments.length);
    console.log('Response summary:', response.summary);
    console.log(`[FINAL] Processed ${response.comments.length}/${inputComments.length} comments in ${Math.ceil(inputComments.length / finalBatchSize)} batches`);
    console.log(`[TIMING] Total run time: ${totalRunTimeMs}ms (${(totalRunTimeMs / 1000).toFixed(1)}s)`);
    
    // Performance summary
    const avgBatchTime = totalRunTimeMs / batchesProcessed;
    const commentsPerSecond = (response.comments.length / (totalRunTimeMs / 1000)).toFixed(1);
    console.log(`[PERFORMANCE] Average batch time: ${avgBatchTime.toFixed(0)}ms`);
    console.log(`[PERFORMANCE] Processing rate: ${commentsPerSecond} comments/second`);
    console.log(`[PERFORMANCE] Parallel AI calls enabled: Scan A and Scan B run concurrently`);
    console.log(`[PERFORMANCE] Precise batch sizing: Optimized batch sizes using I/O ratios and token limits`);
    
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
    
    // Only mark run as completed if we've processed all comments
    if (!hasMoreBatches) {
      console.log(`[COMPLETION] All comments processed for scanRunId=${scanRunId}, marking as completed`);
      gAny.__runCompleted.add(scanRunId);
      console.log(`[RUN STATUS] scanRunId=${scanRunId} marked as completed`);
    }
    gAny.__runInProgress.delete(scanRunId);
    console.log(`[RUN STATUS] scanRunId=${scanRunId} removed from in progress`);

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

    console.log('Returning successful response with CORS headers:', corsHeaders);
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

    console.log('Returning error response with CORS headers:', corsHeaders);
    return new Response(JSON.stringify({ 
      error: `Error in scan-comments function: ${error.message}` 
    }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
      status: 500 
    });
  }
});

// Utility functions
function buildBatchInput(comments: any[], globalStartIndex: number): string {
  const items = comments.map((comment, i) => 
    `<<<ITEM ${globalStartIndex + i}>>>
${comment.originalText || comment.text}
<<<END ${globalStartIndex + i}>>>`
  ).join('\n\n');
  
  return `Comments to analyze (each bounded by sentinels):

${items}`;
}

function parseBatchResults(response: any, expectedCount: number, source: string, globalStartIndex: number): any[] {
  try {
    console.log(`${source}: parseBatchResults called with expectedCount: ${expectedCount}`);
    console.log(`${source}: Response type: ${typeof response}`);
    if (typeof response === 'string') {
      console.log(`${source}: Response length: ${response.length} characters`);
    }
    
    if (!response) {
      throw new Error('Empty response');
    }

    // Use response as-is since it appears to be valid JSON
    let decodedResponse = response;

    // Helper to extract the first balanced JSON array from arbitrary text
    const extractJsonArray = (str: string): string | null => {
      let start = -1;
      let depth = 0;
      let inString = false;
      let escape = false;
      for (let i = 0; i < str.length; i++) {
        const ch = str[i];
        if (inString) {
          if (escape) { escape = false; continue; }
          if (ch === '\\') { escape = true; continue; }
          if (ch === '"') { inString = false; continue; }
          continue;
        }
        if (ch === '"') { inString = true; continue; }
        if (ch === '[') {
          if (depth === 0) start = i;
          depth++;
        } else if (ch === ']') {
          if (depth > 0) depth--;
          if (depth === 0 && start !== -1) {
            return str.slice(start, i + 1);
          }
        }
      }
      return null;
    };





    // First try to parse the simple key-value format (i:1\nA:N\nB:Y)
    let parsed: any;
    let cleanedJson = decodedResponse; // Define cleanedJson at the top level
    
    // Check if response is in the simple format
    if (decodedResponse.includes('i:') && decodedResponse.includes('A:') && decodedResponse.includes('B:')) {
      console.log(`${source}: Detected simple key-value format, parsing directly`);
      console.log(`${source}: Simple format response preview: ${decodedResponse.substring(0, 200)}...`);
      
      try {
        const lines = decodedResponse.split('\n').filter(line => line.trim().length > 0);
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
        
        // Check if the response appears to be truncated
        if (results.length > 0) {
          const lastResult = results[results.length - 1];
          const expectedLastIndex = globalStartIndex + expectedCount - 1;
          if (lastResult.index < expectedLastIndex) {
            console.warn(`${source}: Response appears truncated. Last result index: ${lastResult.index}, expected last index: ${expectedLastIndex}`);
          }
        }
        
        if (results.length > 0) {
          console.log(`${source}: Successfully parsed ${results.length} items from simple format`);
          console.log(`${source}: Parsed results:`, results);
          
          // Handle cases where AI returns fewer results than expected
          if (results.length < expectedCount) {
            const missingCount = expectedCount - results.length;
            const missingPercentage = Math.round((missingCount / expectedCount) * 100);
            console.warn(`${source}: Expected ${expectedCount} items, got ${results.length}. Missing ${missingCount} items (${missingPercentage}%). This may indicate the AI response was truncated due to output token limits. Padding with default results.`);
            
            // Create default results for missing items
            const paddedResults = [];
            for (let i = 0; i < expectedCount; i++) {
              const existingResult = results[i];
              if (existingResult) {
                paddedResults.push({
                  index: existingResult.index || (globalStartIndex + i),
                  concerning: Boolean(existingResult.concerning),
                  identifiable: Boolean(existingResult.identifiable)
                });
              } else {
                // Add default result for missing item
                paddedResults.push({
                  index: globalStartIndex + i,
                  concerning: false,
                  identifiable: false
                });
              }
            }
            
            console.log(`${source}: Returning ${paddedResults.length} padded results (${results.length} original + ${paddedResults.length - results.length} defaults)`);
            return paddedResults;
          }
          
          console.log(`${source}: Returning ${results.length} parsed results (exactly as expected)`);
          return results;
        } else {
          console.warn(`${source}: No valid items found in simple format. Lines processed:`, lines.length);
          console.warn(`${source}: Lines:`, lines);
          throw new Error('No valid items found in simple format');
        }
      } catch (simpleParseError) {
        console.warn(`${source}: Simple format parsing failed: ${simpleParseError.message}`);
        // Fall back to JSON parsing
      }
    }
    
    // If simple format parsing failed or wasn't detected, try JSON parsing
    if (!parsed) {
      try {
        parsed = JSON.parse(cleanedJson);
        console.log(`${source}: Response is valid JSON directly`);
      } catch (directParseError) {
        console.log(`${source}: Direct parse failed; attempting balanced array extraction: ${directParseError.message}`);
        const arr = extractJsonArray(decodedResponse);
        if (!arr) {
          console.error(`${source}: No JSON array found in response`);
          console.log(`${source}: Response preview: ${decodedResponse.substring(0, 500)}...`);
          
          // Try to extract individual JSON objects as fallback
          const objectMatches = decodedResponse.match(/\{[^{}]*\}/g);
          if (objectMatches && objectMatches.length > 0) {
            console.log(`${source}: Found ${objectMatches.length} potential JSON objects, attempting extraction`);
            const extractedObjects: any[] = [];
            for (let i = 0; i < objectMatches.length && i < expectedCount; i++) {
              try {
                const obj = JSON.parse(objectMatches[i]);
                extractedObjects.push({
                  index: obj.index || (globalStartIndex + i),
                  concerning: Boolean(obj.concerning),
                  identifiable: Boolean(obj.identifiable)
                });
              } catch (objError) {
                console.warn(`${source}: Failed to parse object ${i}: ${objError.message}`);
              }
            }
            
            if (extractedObjects.length > 0) {
              console.log(`${source}: Successfully extracted ${extractedObjects.length} objects, using as fallback`);
              return extractedObjects.length < expectedCount ? 
                [...extractedObjects, ...Array(expectedCount - extractedObjects.length).fill(null).map((_, i) => ({
                  index: globalStartIndex + extractedObjects.length + i,
                  concerning: false,
                  identifiable: false
                }))] : extractedObjects;
            }
          }
          
          throw new Error('No valid format found in response');
        }
        cleanedJson = arr;
        console.log(`${source}: Extracted JSON array from response`);
      }
    }

    if (typeof cleanedJson === 'string') {
      console.log(`${source}: Response length: ${cleanedJson.length} characters`);
      console.log(`${source}: JSON starts with: ${cleanedJson.substring(0, 100)}...`);
      console.log(`${source}: JSON ends with: ...${cleanedJson.substring(cleanedJson.length - 100)}`);
      
      // Check for common truncation indicators
      if (cleanedJson.includes('...') || cleanedJson.includes('…') || cleanedJson.includes('truncated')) {
        console.warn(`${source}: Response appears to be truncated`);
      }
      
      // Check if the JSON is properly closed
      const openBraces = (cleanedJson.match(/\{/g) || []).length;
      const closeBraces = (cleanedJson.match(/\}/g) || []).length;
      const openBrackets = (cleanedJson.match(/\[/g) || []).length;
      const closeBrackets = (cleanedJson.match(/\]/g) || []).length;
      
      console.log(`${source}: JSON structure check - Braces: ${openBraces}/${closeBraces}, Brackets: ${openBrackets}/${closeBrackets}`);
      
      if (openBraces !== closeBraces || openBrackets !== closeBrackets) {
        console.warn(`${source}: JSON structure is unbalanced - this may indicate truncation`);
      }
    }

    try {
      parsed = JSON.parse(cleanedJson);
    } catch (parseError) {
      // Attempt sanitization for unescaped quotes in reasoning fields, then parse again
      console.warn(`${source}: JSON parse error, attempting sanitization: ${parseError.message}`);
      console.log(`${source}: [DEBUG] Original JSON length: ${cleanedJson.length}`);
      
      // Show the area around the error position for debugging
      if (parseError.message.includes('position')) {
        const positionMatch = parseError.message.match(/position (\d+)/);
        if (positionMatch) {
          const position = parseInt(positionMatch[1]);
          const start = Math.max(0, position - 100);
          const end = Math.min(cleanedJson.length, position + 100);
          console.log(`${source}: [DEBUG] Error area around position ${position}:`);
          console.log(`${source}: [DEBUG] ...${cleanedJson.substring(start, end)}...`);
          
          // Check if this looks like a truncation issue
          if (position > cleanedJson.length * 0.9) {
            console.warn(`${source}: [DEBUG] Error is near the end of the JSON (position ${position} of ${cleanedJson.length}) - possible truncation`);
          }
          
          // Check if this is a very long response that might be hitting token limits
          if (cleanedJson.length > 10000) {
            console.warn(`${source}: [DEBUG] Very long response (${cleanedJson.length} chars) - may be hitting token limits`);
          }
        }
      }
      
      try {
        parsed = JSON.parse(cleanedJson);
        console.log(`${source}: JSON parse succeeded`);
      } catch (e2) {
        // If JSON parse fails, try JSON completion logic
        console.warn(`${source}: JSON parse failed, attempting JSON completion: ${e2.message}`);
        
        // Try the JSON completion logic directly
        try {
          // Final attempt: check if JSON is truncated and try to complete it
          console.warn(`${source}: Checking for truncation after JSON parse failed: ${e2.message}`);
          
          let completedJson = cleanedJson; // Use original version
          let needsCompletion = false;
          
          // Count brackets and braces to see if they're balanced
          const openBraces = (cleanedJson.match(/\{/g) || []).length;
          const closeBraces = (cleanedJson.match(/\}/g) || []).length;
          const openBrackets = (cleanedJson.match(/\[/g) || []).length;
          const closeBrackets = (cleanedJson.match(/\]/g) || []).length;
          
          // If we have more opening than closing, try to complete the JSON
          if (openBraces > closeBraces || openBrackets > closeBrackets) {
            needsCompletion = true;
            // Add missing closing characters
            while (openBraces > closeBraces) {
              completedJson += '}';
              closeBraces++;
            }
            while (openBrackets > closeBrackets) {
              completedJson += ']';
              closeBrackets++;
            }
            console.log(`${source}: Attempting to complete truncated JSON by adding ${openBraces - (cleanedJson.match(/\{/g) || []).length} braces and ${openBrackets - (cleanedJson.match(/\[/g) || []).length} brackets`);
          }
          
          if (needsCompletion) {
            try {
              parsed = JSON.parse(completedJson);
              console.log(`${source}: JSON completion succeeded`);
            } catch (e4) {
              console.error(`${source}: JSON completion failed: ${e4.message}`);
              // Show the error area for debugging
              if (e2.message.includes('position')) {
                const positionMatch = e2.message.match(/position (\d+)/);
                if (positionMatch) {
                  const position = parseInt(positionMatch[1]);
                  const start = Math.max(0, position - 100);
                  const end = Math.min(cleanedJson.length, position + 100);
                  console.error(`${source}: Error area around position ${position}:`);
                  console.error(`${source}: ...${cleanedJson.substring(start, end)}...`);
                }
              }
              throw new Error(`Invalid JSON in response: ${e2.message}`);
            }
          } else {
            console.error(`${source}: JSON parse error:`, e2);
            console.error(`${source}: Attempted to parse: ${cleanedJson.substring(0, 500)}...`);
            
            // If we have a position error, show the area around that position
            if (e2.message.includes('position')) {
              const positionMatch = e2.message.match(/position (\d+)/);
              if (positionMatch) {
                const position = parseInt(positionMatch[1]);
                const start = Math.max(0, position - 100);
                const end = Math.min(cleanedJson.length, position + 100);
                console.error(`${source}: Error area around position ${position}:`);
                console.error(`${source}: ...${cleanedJson.substring(start, end)}...`);
              }
            }
            
            throw new Error(`Invalid JSON in response: ${e2.message}`);
          }
        } catch (e3) {
          console.error(`${source}: JSON completion logic failed: ${e3.message}`);
          throw new Error(`Invalid JSON in response: ${e2.message}`);
        }
      }
    }
    
    if (!Array.isArray(parsed)) {
      throw new Error('Response is not an array');
    }

    console.log(`${source}: Successfully parsed JSON array with ${parsed.length} items`);

    // Handle cases where AI returns fewer results than expected
    if (parsed.length < expectedCount) {
      console.warn(`${source}: Expected ${expectedCount} items, got ${parsed.length}. Padding with default results.`);
      console.warn(`${source}: This suggests the AI response was truncated or incomplete`);
      
      // Create default results for missing items
      const paddedResults = [];
      for (let i = 0; i < expectedCount; i++) {
        const existingResult = parsed[i];
        if (existingResult) {
          paddedResults.push({
            index: existingResult.index || (globalStartIndex + i),
            concerning: Boolean(existingResult.concerning),
            identifiable: Boolean(existingResult.identifiable)
          });
                  } else {
            // Add default result for missing item
            paddedResults.push({
              index: globalStartIndex + i,
              concerning: false,
              identifiable: false
            });
          }
      }
      
      console.log(`${source}: Returning ${paddedResults.length} padded results (${parsed.length} original + ${paddedResults.length - parsed.length} defaults)`);
      return paddedResults;
    }

    console.log(`${source}: Returning ${parsed.length} parsed results (exactly as expected)`);
    return parsed;
  } catch (error) {
    console.error(`${source}: Error in parseBatchResults:`, error);
    throw error;
  }
}

async function callAI(provider: string, model: string, prompt: string, input: string, responseType: string, userId: string, scanRunId: string, phase: string, aiLogger?: AILogger, maxTokens?: number, temperature?: number) {
  const payload = {
    model: model, // Add the model parameter for OpenAI
    messages: [
      { role: 'system', content: prompt },
      { role: 'user', content: input }
    ],
    temperature: temperature || 0,
    max_tokens: maxTokens || 8192  // Use provided token limit or fallback to 8192
  };

  console.log(`[CALL_AI] ${provider}/${model} max_tokens=${maxTokens || 8192}, temperature=${temperature || 0}`);

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
          requestTemperature: temperature || 0,
          requestMaxTokens: maxTokens // Use the actual max_tokens from model_configurations
        });
      }

  if (provider === 'azure') {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 110000); // 110s, below 120s function max
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
    } catch (e: any) {
      clearTimeout(timeoutId);
      const errorMessage = e && e.name === 'AbortError' ? 'Azure OpenAI API timeout after 5 minutes' : `Azure OpenAI API fetch failed: ${String(e && e.message || e)}`;
      if (aiLogger) {
        await aiLogger.logResponse(userId, scanRunId, 'scan-comments', provider, model, responseType, phase, '', errorMessage, undefined);
      }
      throw new Error(errorMessage);
    }
    clearTimeout(timeoutId);
    if (!response.ok) {
      const errorMessage = `Azure OpenAI API error: ${response.status} ${response.statusText}`;
      if (aiLogger) {
        await aiLogger.logResponse(userId, scanRunId, 'scan-comments', provider, model, responseType, phase, '', errorMessage, undefined);
      }
      throw new Error(errorMessage);
    }

    const result = await response.json();
    const responseText = result.choices[0]?.message?.content || '';
    console.log(`[AZURE] Response length: ${responseText.length} characters`);
    
    // Check for truncation indicators in Azure responses
    if (responseText.includes('...') || responseText.includes('…') || responseText.includes('truncated')) {
      console.warn(`[AZURE] Response contains truncation indicators`);
    }
    
    // Check if response ends abruptly (common truncation pattern)
    const trimmedResponse = responseText.trim();
    
    // Check if this is the simple format (i:1\nA:N\nB:Y)
    const isSimpleFormat = trimmedResponse.includes('i:') && trimmedResponse.includes('A:') && trimmedResponse.includes('B:');
    
    if (!isSimpleFormat && !trimmedResponse.endsWith(']') && !trimmedResponse.endsWith('}')) {
      console.warn(`[AZURE] Response does not end with proper JSON closing character - may be truncated`);
      console.warn(`[AZURE] Response ends with: ...${trimmedResponse.substring(trimmedResponse.length - 50)}`);
    } else if (isSimpleFormat) {
      console.log(`[AZURE] Response appears to be in simple format, skipping JSON completion check`);
    }
    
    // Check if we hit the token limit (common cause of truncation)
    if (result.choices?.[0]?.finish_reason === 'length' || result.choices?.[0]?.finish_reason === 'max_tokens') {
      console.warn(`[AZURE] Response stopped due to token limit (${result.choices[0].finish_reason}) - this may cause truncation`);
    }
    
    if (responseText.length > 8000) {
      console.warn(`[AZURE] Response is very long (${responseText.length} chars), may be approaching token limits`);
    }
    
    // Log the AI response
    if (aiLogger) {
      await aiLogger.logResponse(userId, scanRunId, 'scan-comments', provider, model, responseType, phase, responseText, undefined, undefined);
    }
    
    return responseText;
  } else if (provider === 'openai') {
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    console.log(`[OPENAI] API Key: ${openaiApiKey ? '***' + openaiApiKey.slice(-4) : 'NOT SET'}`);
    console.log(`[OPENAI] Request payload:`, JSON.stringify(payload, null, 2));
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 110000); // 110s, below 120s function max
    let response: Response;
    try {
      response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
    } catch (e: any) {
      clearTimeout(timeoutId);
      const errorMessage = e && e.name === 'AbortError' ? 'OpenAI API timeout after 5 minutes' : `OpenAI API fetch failed: ${String(e && e.message || e)}`;
      if (aiLogger) {
        await aiLogger.logResponse(userId, scanRunId, 'scan-comments', provider, model, responseType, phase, '', errorMessage, undefined);
      }
      throw new Error(errorMessage);
    }
    clearTimeout(timeoutId);
    console.log(`[OPENAI] Response status: ${response.status} ${response.statusText}`);
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[OPENAI] Error response:`, errorText);
      const errorMessage = `OpenAI API error: ${response.status} ${response.statusText}`;
      if (aiLogger) {
        await aiLogger.logResponse(userId, scanRunId, 'scan-comments', provider, model, responseType, phase, '', errorMessage, undefined);
      }
      throw new Error(errorMessage);
    }

    const result = await response.json();
    const responseText = result.choices[0]?.message?.content || '';
    console.log(`[OPENAI] Response length: ${responseText.length} characters`);
    
    // Check for truncation indicators in OpenAI responses
    if (responseText.includes('...') || responseText.includes('truncated')) {
      console.warn(`[OPENAI] Response contains truncation indicators`);
    }
    
    // Check if response ends abruptly (common truncation pattern)
    const trimmedResponse = responseText.trim();
    
    // Check if this is the simple format (i:1\nA:N\nB:Y)
    const isSimpleFormat = trimmedResponse.includes('i:') && trimmedResponse.includes('A:') && trimmedResponse.includes('B:');
    
    if (!isSimpleFormat && !trimmedResponse.endsWith(']') && !trimmedResponse.endsWith('}')) {
      console.warn(`[OPENAI] Response does not end with proper JSON closing character - may be truncated`);
      console.warn(`[OPENAI] Response ends with: ...${trimmedResponse.substring(trimmedResponse.length - 50)}`);
    } else if (isSimpleFormat) {
      console.log(`[OPENAI] Response appears to be in simple format, skipping JSON completion check`);
    }
    
    // Check if we hit the token limit (common cause of truncation)
    if (result.choices?.[0]?.finish_reason === 'length' || result.choices?.[0]?.finish_reason === 'max_tokens') {
      console.warn(`[OPENAI] Response stopped due to token limit (${result.choices[0].finish_reason}) - this may cause truncation`);
    }
    
    if (responseText.length > 8000) {
      console.warn(`[OPENAI] Response is very long (${responseText.length} chars), may be approaching token limits`);
    }
    
    // Log the AI response
    if (aiLogger) {
      await aiLogger.logResponse(userId, scanRunId, 'scan-comments', provider, model, responseType, phase, responseText, undefined, undefined);
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
      max_tokens: payload.max_tokens,  // Use actual AI configuration value
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
    console.log(`[BEDROCK] Using max_tokens: ${bedrockPayload.max_tokens}, temperature: ${bedrockPayload.temperature}`);
    
    // Create signature using raw endpoint (without encoding) for canonical request
    const rawEndpoint = `https://${host}/model/${modelId}/invoke`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 110000); // 110s, below 120s function max
    let response: Response;
    try {
      response = await fetch(endpoint, {
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
        body: JSON.stringify(bedrockPayload),
        signal: controller.signal
      });
    } catch (e: any) {
      clearTimeout(timeoutId);
      const errorMessage = e && e.name === 'AbortError' ? 'Bedrock API timeout after 5 minutes' : `Bedrock API fetch failed: ${String(e && e.message || e)}`;
      if (aiLogger) {
        await aiLogger.logResponse(userId, scanRunId, 'scan-comments', provider, model, responseType, phase, '', errorMessage, undefined);
      }
      throw new Error(errorMessage);
    }
    clearTimeout(timeoutId);
    console.log(`[BEDROCK] Response status: ${response.status} ${response.statusText}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[BEDROCK] Error response:`, errorText);
      const errorMessage = `Bedrock API error: ${response.status} ${response.statusText}`;
      if (aiLogger) {
        await aiLogger.logResponse(userId, scanRunId, 'scan-comments', provider, model, responseType, phase, '', errorMessage, undefined);
      }
      throw new Error(errorMessage);
    }

    const result = await response.json();
    const responseText = result.content[0]?.text || '';
    console.log(`[BEDROCK] Response length: ${responseText.length} characters`);
    
    // Check for truncation indicators in Bedrock responses
    if (responseText.includes('...') || responseText.includes('…') || responseText.includes('truncated')) {
      console.warn(`[BEDROCK] Response contains truncation indicators`);
    }
    
    // Check if response ends abruptly (common truncation pattern)
    const trimmedResponse = responseText.trim();
    
    // Check if this is the simple format (i:1\nA:N\nB:Y)
    const isSimpleFormat = trimmedResponse.includes('i:') && trimmedResponse.includes('A:') && trimmedResponse.includes('B:');
    
    if (!isSimpleFormat && !trimmedResponse.endsWith(']') && !trimmedResponse.endsWith('}')) {
      console.warn(`[BEDROCK] Response does not end with proper JSON closing character - may be truncated`);
      console.warn(`[BEDROCK] Response ends with: ...${trimmedResponse.substring(trimmedResponse.length - 50)}`);
    } else if (isSimpleFormat) {
      console.log(`[BEDROCK] Response appears to be in simple format, skipping JSON completion check`);
    }
    
    // Check if we hit the token limit (common cause of truncation)
    if (result.stop_reason === 'max_tokens' || result.stop_reason === 'length') {
      console.warn(`[BEDROCK] Response stopped due to token limit (${result.stop_reason}) - this may cause truncation`);
    }
    
    if (responseText.length > 8000) {
      console.warn(`[BEDROCK] Response is very long (${responseText.length} chars), may be approaching token limits`);
    }
    
    // Log the AI response
    if (aiLogger) {
      await aiLogger.logResponse(userId, scanRunId, 'scan-comments', provider, model, responseType, phase, responseText, undefined, undefined);
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

