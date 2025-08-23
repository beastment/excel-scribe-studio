import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface AdjudicationRequest {
  comments: Array<{
    id: string;
    originalText: string;
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
}

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
async function callAI(provider: string, model: string, prompt: string, input: string, maxTokens?: number) {
  const payload = {
    model: model, // Add the model parameter for OpenAI
    messages: [
      { role: 'system', content: prompt },
      { role: 'user', content: input }
    ],
    temperature: 0.1,
    max_tokens: maxTokens || 4096
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
    throw new Error('Bedrock provider not yet implemented in adjudicator function');
  } else {
    throw new Error(`Unsupported provider: ${provider}`);
  }
}

// Build adjudication prompt
function buildAdjudicationPrompt(commentCount: number): string {
  return `You are an AI adjudicator resolving disagreements between two AI scanners analyzing workplace feedback comments.

Your task is to determine the final classification for each comment based on the two scanner results and your own analysis.

ANALYSIS RULES:
1. Concerning content: harassment, threats, illegal activity, safety violations, discrimination
2. Personally identifiable information: names, employee IDs, specific job levels (e.g., "Level 5"), tenure statements (e.g., "3 years experience"), contact details

OUTPUT FORMAT:
Return ONLY a JSON array with exactly ${commentCount} objects in this exact format:
[
  {
    "index": 1,
    "concerning": boolean,
    "identifiable": boolean,
    "reasoning": "explanation of your decision"
  },
  ...
]

CRITICAL: Return ONLY the JSON array, no prose, no code fences, no explanations before/after.`;
}

// Build adjudication input
function buildAdjudicationInput(comments: AdjudicationRequest['comments']): string {
  const items = comments.map((comment, i) => {
    const concerningStatus = comment.agreements.concerning === null ? 'No agreement' : 
      comment.agreements.concerning ? 'Both agree true' : 'Both agree false';
    const identifiableStatus = comment.agreements.identifiable === null ? 'No agreement' : 
      comment.agreements.identifiable ? 'Both agree true' : 
      comment.agreements.identifiable === false ? 'Both agree false' : 'Disagree';
    
    return `<<<ITEM ${i + 1}>>>
Original Text: ${comment.originalText}

Scan A (${comment.scanAResult.model}):
- Concerning: ${comment.scanAResult.concerning}
- Identifiable: ${comment.scanAResult.identifiable}
- Reasoning: ${comment.scanAResult.reasoning}

Scan B (${comment.scanBResult.model}):
- Concerning: ${comment.scanBResult.concerning}
- Identifiable: ${comment.scanBResult.identifiable}
- Reasoning: ${comment.scanBResult.reasoning}

Agreements:
- Concerning: ${concerningStatus}
- Identifiable: ${identifiableStatus}

<<<END ${i + 1}>>>`;
  }).join('\n\n');

  return `Comments to adjudicate (each bounded by sentinels):

${items}`;
}

// Parse adjudication response
function parseAdjudicationResponse(response: string, expectedCount: number): Array<{ index: number; concerning: boolean; identifiable: boolean; reasoning: string }> {
  try {
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

  try {
    const { comments, adjudicatorConfig, scanRunId }: AdjudicationRequest = await req.json()
    
    if (!comments || !Array.isArray(comments) || comments.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'No comments provided' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    if (!adjudicatorConfig) {
      return new Response(
        JSON.stringify({ success: false, error: 'No adjudicator configuration provided' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Use scanRunId if provided, otherwise generate a new one
    const runId = scanRunId || Math.floor(Math.random() * 10000);
    const logPrefix = `[RUN ${runId}]`;

    console.log(`${logPrefix} [ADJUDICATOR] Processing ${comments.length} comments with ${adjudicatorConfig.provider}/${adjudicatorConfig.model}`);

    // Filter comments that need adjudication (where agreements are null)
    const needsAdjudication = comments.filter(c => 
      c.agreements.concerning === null || c.agreements.identifiable === null
    );

    if (needsAdjudication.length === 0) {
      console.log(`${logPrefix} [ADJUDICATOR] No comments need adjudication`);
      return new Response(
        JSON.stringify({
          success: true,
          adjudicatedComments: comments.map(c => ({
            id: c.id,
            concerning: c.agreements.concerning !== null ? c.agreements.concerning : c.scanAResult.concerning,
            identifiable: c.agreements.identifiable !== null ? c.agreements.identifiable : c.scanAResult.identifiable,
            reasoning: 'No adjudication needed - scanners agreed',
            model: `${adjudicatorConfig.provider}/${adjudicatorConfig.model}`
          })),
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
      // Build prompt and input for adjudication
      const prompt = buildAdjudicationPrompt(needsAdjudication.length);
      const input = buildAdjudicationInput(needsAdjudication);

      console.log(`${logPrefix} [AI REQUEST] ${adjudicatorConfig.provider}/${adjudicatorConfig.model} type=adjudication`);
      console.log(`${logPrefix} [AI REQUEST] payload=${JSON.stringify({
        provider: adjudicatorConfig.provider,
        model: adjudicatorConfig.model,
        prompt_length: prompt.length,
        input_length: input.length,
        comment_count: needsAdjudication.length
      }).substring(0, 500)}...`);

      // Call AI for adjudication
      const rawResponse = await callAI(
        adjudicatorConfig.provider,
        adjudicatorConfig.model,
        prompt,
        input,
        adjudicatorConfig.max_tokens
      );

      console.log(`${logPrefix} [AI RESPONSE] ${adjudicatorConfig.provider}/${adjudicatorConfig.model} type=adjudication`);
      console.log(`${logPrefix} [AI RESPONSE] rawResponse=${JSON.stringify(rawResponse).substring(0, 500)}...`);

      // Parse the adjudication response
      const adjudicatedResults = parseAdjudicationResponse(rawResponse, needsAdjudication.length);
      console.log(`${logPrefix} [ADJUDICATOR] Parsed ${adjudicatedResults.length} adjudication results`);

      // Create a map of adjudicated results by index
      const adjudicatedMap = new Map(adjudicatedResults.map((result, i) => [i, result]));

      // Build final response
      const adjudicatedComments = comments.map((comment, i) => {
        const needsAdj = needsAdjudication.includes(comment);
        
        if (needsAdj) {
          const adjudicated = adjudicatedMap.get(i);
          if (adjudicated) {
            return {
              id: comment.id,
              concerning: adjudicated.concerning,
              identifiable: adjudicated.identifiable,
              reasoning: adjudicated.reasoning,
              model: `${adjudicatorConfig.provider}/${adjudicatorConfig.model}`
            };
          }
        }

        // For comments that don't need adjudication, use agreement results
        return {
          id: comment.id,
          concerning: comment.agreements.concerning !== null ? comment.agreements.concerning : comment.scanAResult.concerning,
          identifiable: comment.agreements.identifiable !== null ? comment.agreements.identifiable : comment.scanAResult.identifiable,
          reasoning: 'No adjudication needed - scanners agreed',
          model: `${adjudicatorConfig.provider}/${adjudicatorConfig.model}`
        };
      });

      const summary = {
        total: comments.length,
        resolved: needsAdjudication.length,
        errors: 0
      };

      console.log(`${logPrefix} [ADJUDICATOR] Completed: ${summary.resolved} resolved, ${summary.total - summary.resolved} already agreed`);

      return new Response(
        JSON.stringify({
          success: true,
          adjudicatedComments,
          summary
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
