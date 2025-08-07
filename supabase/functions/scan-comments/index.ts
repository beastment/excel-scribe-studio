import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
    const { comments } = await req.json();
    
    if (!comments || !Array.isArray(comments)) {
      throw new Error('Invalid comments data');
    }

    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAIApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const scannedComments = [];

    // Process comments in batches to avoid rate limits
    for (const comment of comments) {
      console.log(`Scanning comment ${comment.id}...`);
      
      const prompt = `Analyze this employee feedback comment and determine:

1. Is it CONCERNING? (threats, violence, self-harm mentions, serious accusations of criminal behavior, extreme harassment)
2. Is it IDENTIFIABLE? (contains personal details that could identify someone like names, specific roles, personal details like age/tenure, specific events)

IMPORTANT EXCEPTION: If the identification is POSITIVE (praise, recognition, appreciation), do NOT mark as identifiable.

Comment: "${comment.text}"

Respond with JSON only:
{
  "concerning": boolean,
  "identifiable": boolean,
  "reasoning": "brief explanation"
}`;

      try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openAIApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              {
                role: 'system',
                content: 'You are an expert at analyzing employee feedback for safety concerns and identifiable information. Be conservative with "concerning" - only flag genuine safety issues. For "identifiable", ignore positive identifications like praise.'
              },
              {
                role: 'user',
                content: prompt
              }
            ],
            temperature: 0.1,
            max_tokens: 200
          }),
        });

        if (!response.ok) {
          console.error(`OpenAI API error: ${response.status}`);
          throw new Error('OpenAI API request failed');
        }

        const data = await response.json();
        const result = JSON.parse(data.choices[0].message.content);
        
        scannedComments.push({
          ...comment,
          concerning: result.concerning || false,
          identifiable: result.identifiable || false,
          aiReasoning: result.reasoning
        });

        // Small delay to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        console.error(`Error scanning comment ${comment.id}:`, error);
        // Keep original comment if scanning fails
        scannedComments.push({
          ...comment,
          concerning: false,
          identifiable: false,
          aiReasoning: 'Scan failed'
        });
      }
    }

    console.log(`Successfully scanned ${scannedComments.length} comments`);

    return new Response(JSON.stringify({ 
      comments: scannedComments,
      summary: {
        total: scannedComments.length,
        concerning: scannedComments.filter(c => c.concerning).length,
        identifiable: scannedComments.filter(c => c.identifiable).length
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in scan-comments function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
