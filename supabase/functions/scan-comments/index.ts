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
      comments, 
      defaultMode = 'redact',
      batchStart = 0,
      useCachedAnalysis = false
    } = requestBody;

    console.log(`[REQUEST_DETAILS] phase=${useCachedAnalysis ? 'followup' : 'initial'} cached=${useCachedAnalysis} comments=${comments?.length} batchStart=${batchStart}`);

    if (!comments || !Array.isArray(comments) || comments.length === 0) {
      return new Response(JSON.stringify({ error: 'No comments provided' }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
        status: 400 
      });
    }

    // Get AI configurations from database
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_ANON_KEY') || ''
    );

    const { data: configs, error: configError } = await supabase
      .from('ai_configurations')
      .select('*')
      .eq('is_active', true);

    if (configError || !configs || configs.length === 0) {
      throw new Error('Failed to fetch AI configurations');
    }

    const scanA = configs.find(c => c.scanner_type === 'scan_a');
    const scanB = configs.find(c => c.scanner_type === 'scan_b');

    if (!scanA || !scanB) {
      throw new Error('Missing required AI configurations: scan_a and scan_b');
    }

    console.log(`[CONFIG] Scan A: ${scanA.provider}/${scanA.model}, Scan B: ${scanB.provider}/${scanB.model}`);

    // Process comments in batches
    const batch = comments.slice(batchStart, batchStart + 100); // Process up to 100 at a time
    let summary = { total: batch.length, concerning: 0, identifiable: 0, needsAdjudication: 0 };
    const scannedComments: any[] = [];

    console.log(`[PROCESS] Batch ${batchStart + 1}-${batchStart + batch.length} of ${comments.length} (preferredA=${scanA.preferred_batch_size || 100}, preferredB=${scanB.preferred_batch_size || 100}, chosen=${batch.length})`);

    // Process batch with Scan A and Scan B in parallel
    const [scanAResults, scanBResults] = await Promise.all([
      callAI(scanA.provider, scanA.model, scanA.scan_prompt, buildBatchInput(batch), 'batch_analysis'),
      callAI(scanB.provider, scanB.model, scanB.scan_prompt, buildBatchInput(batch), 'batch_analysis')
    ]);

    console.log(`[RESULT] Scan A ${scanA.provider}/${scanA.model}: type=${typeof scanAResults} len=${Array.isArray(scanAResults) ? scanAResults.length : 'n/a'}`);
    console.log(`[RESULT] Scan B ${scanB.provider}/${scanB.model}: type=${typeof scanBResults} len=${Array.isArray(scanBResults) ? scanBResults.length : 'n/a'}`);

    // Parse and validate results
    const scanAResultsArray = parseBatchResults(scanAResults, batch.length, 'Scan A');
    const scanBResultsArray = parseBatchResults(scanBResults, batch.length, 'Scan B');

    // Process each comment
    for (let i = 0; i < batch.length; i++) {
      const comment = batch[i];
      const scanAResult = scanAResultsArray[i];
      const scanBResult = scanBResultsArray[i];

      if (!scanAResult || !scanBResult) {
        console.warn(`Missing scan results for comment ${i + 1}, skipping`);
        continue;
      }

      // Determine if adjudication is needed
      const concerningDisagreement = scanAResult.concerning !== scanBResult.concerning;
      const identifiableDisagreement = scanAResult.identifiable !== scanBResult.identifiable;
      const needsAdjudication = concerningDisagreement || identifiableDisagreement;

      if (needsAdjudication) {
        summary.needsAdjudication++;
      }

      // Set flags based on scan results (will be resolved by adjudicator later)
      const concerning = scanAResult.concerning; // Use Scan A as default, will be updated by adjudicator
      const identifiable = scanAResult.identifiable;

      if (concerning) summary.concerning++;
      if (identifiable) summary.identifiable++;

      // Create comment result with adjudication flags
      const processedComment = {
        ...comment,
        text: comment.originalText || comment.text,
        concerning,
        identifiable,
        aiReasoning: scanAResult.reasoning,
        needsAdjudication,
        adjudicationData: {
          scanAResult: { ...scanAResult, model: `${scanA.provider}/${scanA.model}` },
          scanBResult: { ...scanBResult, model: `${scanB.provider}/${scanB.model}` },
          agreements: {
            concerning: !concerningDisagreement ? scanAResult.concerning : null,
            identifiable: !identifiableDisagreement ? scanAResult.identifiable : null
          }
        },
        debugInfo: {
          scanAResult: { ...scanAResult, model: `${scanA.provider}/${scanA.model}` },
          scanBResult: { ...scanBResult, model: `${scanB.provider}/${scanB.model}` },
          needsAdjudication,
          scanRunId
        }
      };

      scannedComments.push(processedComment);
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
        identifiable: scannedComments.filter(c => c.identifiable).length,
        needsAdjudication: scannedComments.filter(c => c.needsAdjudication).length
      }
    };
    
    console.log('Returning response with comments count:', response.comments.length);
    console.log('Response summary:', response.summary);
    
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
  return `Comments to analyze (each bounded by sentinels):

${comments.map((comment, i) => `<<<ITEM ${i + 1>>>
${comment.originalText || comment.text}
<<<END ${i + 1>>>`).join('\n\n')}`;
}

function parseBatchResults(response: any, expectedCount: number, source: string): any[] {
  try {
    if (!response) {
      throw new Error('Empty response');
    }

    // Try to extract JSON from the response
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('No JSON array found in response');
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
      identifiable: Boolean(item.identifiable),
      reasoning: String(item.reasoning || 'No reasoning provided')
    }));
  } catch (error) {
    console.error(`Failed to parse ${source} results:`, error);
    console.error(`Raw ${source} response:`, response);
    throw new Error(`Failed to parse ${source} results: ${error.message}`);
  }
}

async function callAI(provider: string, model: string, prompt: string, input: string, responseType: string) {
  const payload = {
    messages: [
      { role: 'system', content: prompt },
      { role: 'user', content: input }
    ],
    temperature: 0.1,
    max_tokens: 4096
  };

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
      throw new Error(`Azure OpenAI API error: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    return result.choices[0]?.message?.content || '';
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
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    return result.choices[0]?.message?.content || '';
  } else if (provider === 'bedrock') {
    // Bedrock implementation would go here
    throw new Error('Bedrock provider not yet implemented in scan-comments function');
  } else {
    throw new Error(`Unsupported provider: ${provider}`);
  }
}

