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
      throw new Error('Invalid comments data');
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get AI configuration
    const { data: config, error: configError } = await supabase
      .from('ai_configurations')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (configError) {
      console.error('Error fetching AI configuration:', configError);
      throw new Error('Failed to fetch AI configuration');
    }

    if (!config) {
      throw new Error('No AI configuration found');
    }

    // Validate required API keys based on provider
    if (config.provider === 'openai') {
      const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
      if (!openAIApiKey) {
        throw new Error('OpenAI API key not configured');
      }
    } else if (config.provider === 'bedrock') {
      const awsAccessKey = Deno.env.get('AWS_ACCESS_KEY_ID');
      const awsSecretKey = Deno.env.get('AWS_SECRET_ACCESS_KEY');
      const awsRegion = Deno.env.get('AWS_REGION');
      if (!awsAccessKey || !awsSecretKey || !awsRegion) {
        throw new Error('AWS credentials not configured');
      }
    }

    const scannedComments = [];

    // Process comments in batches to avoid rate limits
    for (const comment of comments) {
      console.log(`Scanning comment ${comment.id}...`);
      
      const analysisPrompt = config.analysis_prompt.replace('{comment}', comment.text);

      try {
        const result = await callAI(config.provider, config.model, analysisPrompt, 'analysis');
        
        if (!result || typeof result.concerning === 'undefined' || typeof result.identifiable === 'undefined') {
          throw new Error('Invalid AI response format');
        }
        
        let redactedText = '';
        let rephrasedText = '';
        
        // If the comment is flagged, generate redacted and rephrased versions
        if (result.concerning || result.identifiable) {
          // Generate redacted version
          const redactPrompt = config.redact_prompt.replace('{comment}', comment.text);
          const redactedResponse = await callAI(config.provider, config.model, redactPrompt, 'text');
          if (redactedResponse) {
            redactedText = redactedResponse.trim();
          }

          // Generate rephrased version
          const rephrasePrompt = config.rephrase_prompt.replace('{comment}', comment.text);
          const rephrasedResponse = await callAI(config.provider, config.model, rephrasePrompt, 'text');
          if (rephrasedResponse) {
            rephrasedText = rephrasedResponse.trim();
          }
        }
        
        // Determine the final text based on the mode (or defaultMode for initial scans)
        const mode = comment.mode || defaultMode;
        let finalText = comment.text;
        
        // If the comment is flagged and we have processed versions, use them based on mode
        if (result.concerning || result.identifiable) {
          if (mode === 'redact' && redactedText) {
            finalText = redactedText;
          } else if (mode === 'rephrase' && rephrasedText) {
            finalText = rephrasedText;
          }
          // For 'revert' mode or if no processed text available, keep original
        }
        
        scannedComments.push({
          ...comment,
          concerning: result.concerning || false,
          identifiable: result.identifiable || false,
          aiReasoning: result.reasoning,
          redactedText: redactedText,
          rephrasedText: rephrasedText,
          text: finalText,
          mode: mode,
          approved: false
        });

        // Small delay to respect rate limits (increased for multiple API calls)
        await new Promise(resolve => setTimeout(resolve, 300));

      } catch (error) {
        console.error(`Error scanning comment ${comment.id}:`, error);
        // Keep original comment if scanning fails
        scannedComments.push({
          ...comment,
          concerning: false,
          identifiable: false,
          aiReasoning: 'Scan failed',
          redactedText: '',
          rephrasedText: '',
          mode: defaultMode,
          approved: false
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

  // Helper function to call AI services
  async function callAI(provider: string, model: string, prompt: string, responseType: 'analysis' | 'text') {
    if (provider === 'openai') {
      return await callOpenAI(model, prompt, responseType);
    } else if (provider === 'bedrock') {
      return await callBedrock(model, prompt, responseType);
    } else {
      throw new Error(`Unsupported AI provider: ${provider}`);
    }
  }

  // OpenAI API call
  async function callOpenAI(model: string, prompt: string, responseType: 'analysis' | 'text') {
    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model,
        messages: [
          {
            role: 'system',
            content: responseType === 'analysis' 
              ? 'You are an expert at analyzing employee feedback for safety concerns and identifiable information. Be conservative with "concerning" - only flag genuine safety issues. For "identifiable", ignore positive identifications like praise.'
              : 'You are an expert at processing employee feedback text. Follow the instructions precisely.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: responseType === 'analysis' ? 0.1 : 0.2,
        max_tokens: responseType === 'analysis' ? 200 : 300
      }),
    });

    if (!response.ok) {
      console.error(`OpenAI API error: ${response.status}`);
      throw new Error('OpenAI API request failed');
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    
    if (responseType === 'analysis') {
      return JSON.parse(content);
    } else {
      return content;
    }
  }

  // AWS Bedrock API call
  async function callBedrock(model: string, prompt: string, responseType: 'analysis' | 'text') {
    const awsAccessKey = Deno.env.get('AWS_ACCESS_KEY_ID');
    const awsSecretKey = Deno.env.get('AWS_SECRET_ACCESS_KEY');
    const awsRegion = Deno.env.get('AWS_REGION') || 'us-east-1';

    // Create AWS signature
    const service = 'bedrock-runtime';
    const host = `bedrock-runtime.${awsRegion}.amazonaws.com`;
    const endpoint = `https://${host}/model/${model}/invoke`;

    let requestBody;
    if (model.startsWith('anthropic.claude')) {
      requestBody = JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: responseType === 'analysis' ? 200 : 300,
        temperature: responseType === 'analysis' ? 0.1 : 0.2,
        messages: [
          {
            role: "user",
            content: prompt
          }
        ]
      });
    } else if (model.startsWith('amazon.titan')) {
      requestBody = JSON.stringify({
        inputText: prompt,
        textGenerationConfig: {
          maxTokenCount: responseType === 'analysis' ? 200 : 300,
          temperature: responseType === 'analysis' ? 0.1 : 0.2,
          topP: 0.9
        }
      });
    } else {
      throw new Error(`Unsupported Bedrock model: ${model}`);
    }

    // Simple AWS4 signature (basic implementation)
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:\-]|\.\d{3}/g, '');
    const dateStamp = amzDate.substr(0, 8);
    
    const headers = {
      'Authorization': await createAWSSignature(awsAccessKey, awsSecretKey, awsRegion, service, host, 'POST', '/', '', requestBody, amzDate, dateStamp),
      'Content-Type': 'application/json',
      'X-Amz-Date': amzDate,
      'X-Amz-Target': 'com.amazon.bedrock.client.BedrockRuntime.InvokeModel'
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: requestBody
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Bedrock API error: ${response.status} - ${errorText}`);
      throw new Error('Bedrock API request failed');
    }

    const data = await response.json();
    
    let content;
    if (model.startsWith('anthropic.claude')) {
      content = data.content[0].text;
    } else if (model.startsWith('amazon.titan')) {
      content = data.results[0].outputText;
    }

    if (responseType === 'analysis') {
      return JSON.parse(content);
    } else {
      return content;
    }
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
});
