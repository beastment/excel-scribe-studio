import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { AILogger } from '../adjudicator/ai-logger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

interface Comment {
  id: string;
  text: string;
  department?: string;
  gender?: string;
  age?: string;
  role?: string;
  location?: string;
  [key: string]: any;
}

interface Theme {
  id: string;
  name: string;
  description: string;
  frequency: number;
  sentiment: 'positive' | 'negative' | 'neutral';
  keywords: string[];
  comments: Comment[];
}

interface DemographicBreakdown {
  department: Record<string, Theme[]>;
  gender: Record<string, Theme[]>;
  age: Record<string, Theme[]>;
  role: Record<string, Theme[]>;
}

interface AnalysisResult {
  themes: Theme[];
  demographicBreakdown: DemographicBreakdown;
  summary: {
    totalComments: number;
    totalThemes: number;
    averageSentiment: number;
    topTheme: Theme;
  };
  taggedComments: Comment[];
}

interface ThematicAnalysisRequest {
  comments: Comment[];
  userId: string;
  analysisConfig?: {
    provider: string;
    model: string;
    maxThemes?: number;
    minFrequency?: number;
  };
}

// AI calling function
async function callAI(provider: string, model: string, prompt: string, input: string, maxTokens?: number, userId?: string, aiLogger?: any, temperature?: number) {
  const payload = {
    model: model,
    messages: [
      { role: 'system', content: prompt },
      { role: 'user', content: input }
    ],
    temperature: temperature || 0.3,
    max_tokens: maxTokens || 4096
  };

  // Log the AI request if logger is provided
  if (aiLogger && userId) {
    await aiLogger.logRequest({
      userId,
      scanRunId: `thematic-${Date.now()}`,
      functionName: 'thematic-analysis',
      provider,
      model,
      requestType: 'thematic-analysis',
      phase: 'analysis',
      requestPrompt: prompt,
      requestInput: input,
      requestTemperature: temperature || 0.3,
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
      if (aiLogger && userId) {
        await aiLogger.logResponse(userId, `thematic-${Date.now()}`, 'thematic-analysis', provider, model, 'thematic-analysis', 'analysis', '', errorMessage, undefined);
      }
      throw new Error(errorMessage);
    }

    const result = await response.json();
    const responseText = result.choices[0]?.message?.content || '';
    
    // Log the AI response
    if (aiLogger && userId) {
      await aiLogger.logResponse(userId, `thematic-${Date.now()}`, 'thematic-analysis', provider, model, 'thematic-analysis', 'analysis', responseText, undefined, undefined);
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
      if (aiLogger && userId) {
        await aiLogger.logResponse(userId, `thematic-${Date.now()}`, 'thematic-analysis', provider, model, 'thematic-analysis', 'analysis', '', errorMessage, undefined);
      }
      throw new Error(errorMessage);
    }

    const result = await response.json();
    const responseText = result.choices[0]?.message?.content || '';
    
    // Log the AI response
    if (aiLogger && userId) {
      await aiLogger.logResponse(userId, `thematic-${Date.now()}`, 'thematic-analysis', provider, model, 'thematic-analysis', 'analysis', responseText, undefined, undefined);
    }

    return responseText;
  } else {
    throw new Error(`Unsupported provider: ${provider}`);
  }
}

// Build thematic analysis input
function buildThematicAnalysisInput(comments: Comment[]): string {
  const commentTexts = comments.map((comment, i) => {
    const demographics = [];
    if (comment.department) demographics.push(`Dept: ${comment.department}`);
    if (comment.gender) demographics.push(`Gender: ${comment.gender}`);
    if (comment.age) demographics.push(`Age: ${comment.age}`);
    if (comment.role) demographics.push(`Role: ${comment.role}`);
    
    const demoText = demographics.length > 0 ? ` [${demographics.join(', ')}]` : '';
    return `Comment ${i + 1}${demoText}: ${comment.text}`;
  }).join('\n\n');

  return `Employee feedback comments to analyze:

${commentTexts}

Please analyze these comments and identify the main themes, sentiment patterns, and demographic insights.`;
}

// Parse thematic analysis response
function parseThematicAnalysisResponse(response: string, comments: Comment[]): AnalysisResult {
  try {
    // Try to extract JSON from the response
    const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) || response.match(/\[[\s\S]*\]/);
    
    if (!jsonMatch) {
      throw new Error('No valid JSON found in response');
    }

    const parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
    
    if (!parsed.themes || !Array.isArray(parsed.themes)) {
      throw new Error('Invalid response format: missing themes array');
    }

    // Process themes and assign comments
    const themes: Theme[] = parsed.themes.map((theme: any, index: number) => ({
      id: `theme-${index + 1}`,
      name: theme.name || `Theme ${index + 1}`,
      description: theme.description || '',
      frequency: theme.frequency || 0,
      sentiment: theme.sentiment || 'neutral',
      keywords: theme.keywords || [],
      comments: [] // Will be populated below
    }));

    // Create tagged comments by matching themes to comments
    const taggedComments: Comment[] = comments.map(comment => ({ ...comment }));

    // Simple keyword matching to assign comments to themes
    themes.forEach(theme => {
      theme.comments = comments.filter(comment => {
        const commentText = comment.text.toLowerCase();
        return theme.keywords.some((keyword: string) => 
          commentText.includes(keyword.toLowerCase())
        );
      });
      theme.frequency = theme.comments.length;
    });

    // Calculate demographic breakdown
    const demographicBreakdown: DemographicBreakdown = {
      department: {},
      gender: {},
      age: {},
      role: {}
    };

    // Group themes by demographics
    themes.forEach(theme => {
      theme.comments.forEach(comment => {
        if (comment.department) {
          if (!demographicBreakdown.department[comment.department]) {
            demographicBreakdown.department[comment.department] = [];
          }
          if (!demographicBreakdown.department[comment.department].find(t => t.id === theme.id)) {
            demographicBreakdown.department[comment.department].push(theme);
          }
        }
        
        if (comment.gender) {
          if (!demographicBreakdown.gender[comment.gender]) {
            demographicBreakdown.gender[comment.gender] = [];
          }
          if (!demographicBreakdown.gender[comment.gender].find(t => t.id === theme.id)) {
            demographicBreakdown.gender[comment.gender].push(theme);
          }
        }
        
        if (comment.age) {
          if (!demographicBreakdown.age[comment.age]) {
            demographicBreakdown.age[comment.age] = [];
          }
          if (!demographicBreakdown.age[comment.age].find(t => t.id === theme.id)) {
            demographicBreakdown.age[comment.age].push(theme);
          }
        }
        
        if (comment.role) {
          if (!demographicBreakdown.role[comment.role]) {
            demographicBreakdown.role[comment.role] = [];
          }
          if (!demographicBreakdown.role[comment.role].find(t => t.id === theme.id)) {
            demographicBreakdown.role[comment.role].push(theme);
          }
        }
      });
    });

    // Calculate summary statistics
    const totalComments = comments.length;
    const totalThemes = themes.length;
    const averageSentiment = themes.reduce((sum, theme) => {
      const sentimentValue = theme.sentiment === 'positive' ? 1 : theme.sentiment === 'negative' ? -1 : 0;
      return sum + (sentimentValue * theme.frequency);
    }, 0) / totalComments;
    
    const topTheme = themes.reduce((max, theme) => 
      theme.frequency > max.frequency ? theme : max, themes[0] || { frequency: 0 });

    return {
      themes,
      demographicBreakdown,
      summary: {
        totalComments,
        totalThemes,
        averageSentiment,
        topTheme
      },
      taggedComments
    };
  } catch (error) {
    console.error('Failed to parse thematic analysis response:', error);
    console.error('Raw response:', response);
    throw new Error(`Failed to parse thematic analysis response: ${error.message}`);
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const overallStartTime = Date.now();

  try {
    const request: ThematicAnalysisRequest = await req.json();
    const { comments, userId, analysisConfig } = request;
    
    if (!comments || !Array.isArray(comments) || comments.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'No comments provided' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    if (!userId) {
      return new Response(
        JSON.stringify({ success: false, error: 'User ID required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    const runId = `thematic-${Date.now()}`;
    const logPrefix = `[RUN ${runId}]`;

    console.log(`${logPrefix} [THEMATIC-ANALYSIS] Processing ${comments.length} comments`);

    // Check user credits before processing
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

    // Check user credits
    const { data: userCredits, error: creditsError } = await supabase
      .from('user_credits')
      .select('available_credits')
      .eq('user_id', user.id)
      .single();

    if (creditsError) {
      console.error(`${logPrefix} [CREDITS] Error fetching user credits:`, creditsError);
      return new Response(
        JSON.stringify({ success: false, error: 'Unable to verify user credits' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    const availableCredits = userCredits?.available_credits || 0;
    const estimatedCost = Math.ceil(comments.length / 10); // Rough estimate: 1 credit per 10 comments

    if (availableCredits < estimatedCost) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Insufficient credits', 
          required: estimatedCost,
          available: availableCredits 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 402 }
      );
    }

    // Get AI configuration
    const { data: aiConfig, error: configError } = await supabase
      .from('ai_configurations')
      .select('*')
      .eq('scanner_type', 'thematic-analysis')
      .single();

    if (configError || !aiConfig) {
      // Use default configuration
      console.warn(`${logPrefix} [CONFIG] No thematic analysis config found, using defaults`);
    }

    const provider = analysisConfig?.provider || aiConfig?.provider || 'openai';
    const model = analysisConfig?.model || aiConfig?.model || 'gpt-4';
    const maxTokens = aiConfig?.tokens_per_comment ? comments.length * aiConfig.tokens_per_comment : 4096;

    // Build the thematic analysis prompt
    const prompt = `You are an expert in thematic analysis of employee feedback. Analyze the provided comments and identify key themes, sentiment patterns, and demographic insights.

Return your analysis as a JSON object with the following structure:
{
  "themes": [
    {
      "name": "Theme Name",
      "description": "Detailed description of this theme",
      "frequency": 0,
      "sentiment": "positive|negative|neutral",
      "keywords": ["keyword1", "keyword2", "keyword3"]
    }
  ]
}

Guidelines:
1. Identify 5-15 distinct themes that capture the main topics in the feedback
2. Each theme should have a clear, descriptive name
3. Provide a detailed description explaining what the theme represents
4. Assign sentiment (positive, negative, or neutral) based on the overall tone
5. Include 3-8 relevant keywords for each theme
6. Focus on actionable insights that organizations can act upon
7. Consider both explicit and implicit themes in the feedback

Ensure the response is valid JSON and focuses on themes that appear in multiple comments.`;

    const input = buildThematicAnalysisInput(comments);

    console.log(`${logPrefix} [AI REQUEST] ${provider}/${model} type=thematic-analysis`);
    console.log(`${logPrefix} [AI REQUEST] Processing ${comments.length} comments`);

    // Initialize AI logger
    const aiLogger = new AILogger();
    aiLogger.setFunctionStartTime(overallStartTime);

    // Call AI for thematic analysis
    const rawResponse = await callAI(
      provider,
      model,
      prompt,
      input,
      maxTokens,
      user.id,
      aiLogger,
      aiConfig?.temperature || 0.3
    );

    console.log(`${logPrefix} [AI RESPONSE] Received response from ${provider}/${model}`);

    // Parse the response
    const analysisResult = parseThematicAnalysisResponse(rawResponse, comments);

    // Deduct credits
    const { error: deductError } = await supabase.rpc('deduct_user_credits', {
      user_uuid: user.id,
      credits_to_deduct: estimatedCost,
      comments_scanned: comments.length,
      scan_run_id: runId,
      scan_type: 'thematic-analysis'
    });

    if (deductError) {
      console.error(`${logPrefix} [CREDITS] Error deducting credits:`, deductError);
    } else {
      console.log(`${logPrefix} [CREDITS] Deducted ${estimatedCost} credits for ${comments.length} comments`);
    }

    const totalRunTimeMs = Date.now() - overallStartTime;

    console.log(`${logPrefix} [THEMATIC-ANALYSIS] Completed: ${analysisResult.summary.totalThemes} themes identified`);
    console.log(`${logPrefix} [TIMING] Total run time: ${totalRunTimeMs}ms (${(totalRunTimeMs / 1000).toFixed(1)}s)`);

    return new Response(
      JSON.stringify({
        success: true,
        result: analysisResult,
        creditsUsed: estimatedCost,
        totalRunTimeMs: totalRunTimeMs
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Thematic analysis function error:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: `Function error: ${error.message}`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
