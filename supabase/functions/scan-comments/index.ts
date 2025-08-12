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
      if (provider === 'bedrock') {
        if (!Deno.env.get('AWS_ACCESS_KEY_ID') || !Deno.env.get('AWS_SECRET_ACCESS_KEY') || !Deno.env.get('AWS_REGION')) {
          throw new Error('AWS credentials are required for Bedrock');
        }
      }
    }

    const scannedComments = [];
    let summary = { total: comments.length, concerning: 0, identifiable: 0, needsAdjudication: 0 };

    for (const comment of comments) {
      try {
        console.log(`Processing comment ${comment.id}...`);

        // Run Scan A and Scan B in parallel
        const [scanAResult, scanBResult] = await Promise.all([
          callAI(scanA.provider, scanA.model, scanA.analysis_prompt, comment.text, 'analysis'),
          callAI(scanB.provider, scanB.model, scanB.analysis_prompt, comment.text, 'analysis')
        ]);

        let finalResult = null;
        let adjudicationResult = null;
        let needsAdjudication = false;

        // Check if Scan A and Scan B results differ
        if (scanAResult.concerning !== scanBResult.concerning || 
            scanAResult.identifiable !== scanBResult.identifiable) {
          needsAdjudication = true;
          summary.needsAdjudication++;

          // Call adjudicator
          const adjudicatorPrompt = `${adjudicator.analysis_prompt}

Original comment: "${comment.text}"

Scan A Result: ${JSON.stringify(scanAResult)}
Scan B Result: ${JSON.stringify(scanBResult)}`;

          adjudicationResult = await callAI(
            adjudicator.provider, 
            adjudicator.model, 
            adjudicatorPrompt, 
            '', 
            'analysis'
          );

          finalResult = adjudicationResult;
        } else {
          // Scan A and Scan B agree, use Scan A result
          finalResult = scanAResult;
        }

        // Update summary
        if (finalResult.concerning) summary.concerning++;
        if (finalResult.identifiable) summary.identifiable++;

        let redactedText = null;
        let rephrasedText = null;

        // If flagged, run redaction and rephrase prompts
        if (finalResult.concerning || finalResult.identifiable) {
          const activeConfig = needsAdjudication ? adjudicator : scanA;
          
          [redactedText, rephrasedText] = await Promise.all([
            callAI(activeConfig.provider, activeConfig.model, activeConfig.redact_prompt, comment.text, 'text'),
            callAI(activeConfig.provider, activeConfig.model, activeConfig.rephrase_prompt, comment.text, 'text')
          ]);
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
          // Debug information for admin users
          debugInfo: {
            scanAResult,
            scanBResult,
            adjudicationResult,
            needsAdjudication,
            finalDecision: finalResult
          }
        };

        // Set final text based on mode
        if (processedComment.mode === 'redact' && redactedText) {
          processedComment.text = redactedText;
        } else if (processedComment.mode === 'rephrase' && rephrasedText) {
          processedComment.text = rephrasedText;
        }

        scannedComments.push(processedComment);
      } catch (error) {
        console.error(`Error processing comment ${comment.id}:`, error);
        // Include the original comment with error info
        scannedComments.push({
          ...comment,
          concerning: false,
          identifiable: false,
          aiReasoning: `Error processing: ${error.message}`,
          mode: 'original',
          approved: false,
          hideAiResponse: false,
          debugInfo: {
            error: error.message
          }
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
  async function callAI(provider: string, model: string, prompt: string, commentText: string, responseType: 'analysis' | 'text') {
    if (provider === 'openai') {
      return await callOpenAI(model, prompt, commentText, responseType);
    } else if (provider === 'bedrock') {
      return await callBedrock(model, prompt, commentText, responseType);
    } else {
      throw new Error(`Unsupported AI provider: ${provider}`);
    }
  }

  // OpenAI API call
  async function callOpenAI(model: string, prompt: string, commentText: string, responseType: 'analysis' | 'text') {
    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    
    const messages = [
      { role: 'system', content: prompt },
      { role: 'user', content: commentText }
    ];

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;

    if (responseType === 'analysis') {
      try {
        return JSON.parse(content);
      } catch {
        // Fallback parsing
        return {
          concerning: content.toLowerCase().includes('true') && content.toLowerCase().includes('concerning'),
          identifiable: content.toLowerCase().includes('true') && content.toLowerCase().includes('identifiable'),
          reasoning: content
        };
      }
    } else {
      return content;
    }
  }

  // AWS Bedrock API call
  async function callBedrock(model: string, prompt: string, commentText: string, responseType: 'analysis' | 'text') {
    const awsAccessKey = Deno.env.get('AWS_ACCESS_KEY_ID');
    const awsSecretKey = Deno.env.get('AWS_SECRET_ACCESS_KEY');
    const awsRegion = Deno.env.get('AWS_REGION') || 'us-east-1'; // Default to us-east-1 for better Bedrock support

    console.log(`Bedrock call - Model: ${model}, Region: ${awsRegion}, AccessKey: ${awsAccessKey ? 'present' : 'missing'}`);

    if (!awsAccessKey || !awsSecretKey) {
      throw new Error('AWS credentials not configured');
    }

    // Use AWS SDK v3 style endpoint for Bedrock
    const endpoint = `https://bedrock-runtime.${awsRegion}.amazonaws.com/model/${model}/invoke`;

    let requestBody;
    if (model.startsWith('anthropic.claude')) {
      // For Claude 3.5+ models, use the messages API format
      if (model.includes('claude-3') || model.includes('sonnet-4') || model.includes('haiku-3') || model.includes('opus-3')) {
        requestBody = JSON.stringify({
          anthropic_version: "bedrock-2023-05-31",
          max_tokens: 1000,
          temperature: 0.1,
          messages: [
            {
              role: "user",
              content: `${prompt}\n\n${commentText}`
            }
          ]
        });
      } else {
        // Legacy Claude models
        requestBody = JSON.stringify({
          prompt: `\n\nHuman: ${prompt}\n\n${commentText}\n\nAssistant:`,
          max_tokens_to_sample: 1000,
          temperature: 0.1,
        });
      }
    } else if (model.startsWith('amazon.titan')) {
      requestBody = JSON.stringify({
        inputText: `${prompt}\n\n${commentText}`,
        textGenerationConfig: {
          maxTokenCount: 1000,
          temperature: 0.1,
        }
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
    console.log(`AWS Debug - Model: ${model}`);
    console.log(`AWS Debug - Region: ${awsRegion}`);
    console.log(`AWS Debug - Service: ${service}`);
    console.log(`AWS Debug - Host: ${host}`);
    console.log(`AWS Debug - CanonicalUri: ${canonicalUri}`);
    console.log(`AWS Debug - PayloadHash: ${payloadHash}`);
    console.log(`AWS Debug - StringToSign: ${stringToSign}`);
    console.log(`AWS Debug - Signature: ${signature}`);
    console.log(`AWS Debug - RequestBody: ${requestBody}`);
    
    // Create authorization header
    const authorizationHeader = `${algorithm} Credential=${awsAccessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    
    console.log(`Bedrock request to: ${endpoint}`);
    console.log(`Authorization: ${authorizationHeader}`);
    
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
      content = data.results[0].outputText;
    }

    if (responseType === 'analysis') {
      try {
        return JSON.parse(content);
      } catch {
        // Fallback parsing
        return {
          concerning: content.toLowerCase().includes('true') && content.toLowerCase().includes('concerning'),
          identifiable: content.toLowerCase().includes('true') && content.toLowerCase().includes('identifiable'),
          reasoning: content
        };
      }
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
