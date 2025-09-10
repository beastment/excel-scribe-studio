// @ts-nocheck
// @ts-ignore - Editor-only: URL imports are resolved by Deno at runtime
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// @ts-ignore - Editor-only: URL imports are resolved by Deno at runtime
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { AILogger } from './ai-logger.ts';

// Editor-only ambient type to suppress "Cannot find name 'Deno'" in non-Deno TS servers
declare const Deno: { env: { get: (key: string) => string | undefined } };


const buildCorsHeaders = (origin: string | null) => ({
  'Access-Control-Allow-Origin': origin || '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Max-Age': '86400',
  'Access-Control-Allow-Credentials': 'true',
  'Vary': 'Origin'
});

// Timeout utilities (configurable via environment)
function getTimeoutMs(envKey: string, fallbackMs: number): number {
  const raw = ((globalThis as any).Deno?.env?.get(envKey) as string) || undefined;
  const parsed = raw ? Number(raw) : NaN;
  if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed);
  return fallbackMs;
}

function seconds(ms: number): number {
  return Math.round(ms / 1000);
}

// Default timeouts can be overridden per function via env vars
// Using 140s for OpenAI/Azure to remain below common 150s edge caps
const POSTPROCESS_REQUEST_TIMEOUT_MS = getTimeoutMs("POSTPROCESS_AI_REQUEST_TIMEOUT_MS", 140000);
// Bedrock often sits behind 120s caps on some platforms; keep conservative default
const POSTPROCESS_BEDROCK_TIMEOUT_MS = getTimeoutMs("POSTPROCESS_BEDROCK_REQUEST_TIMEOUT_MS", 140000);

// Utility functions
function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
/////

function getEffectiveMaxTokens(config: any): number {
  const explicit = config?.max_tokens;
  console.log('[getEffectiveMaxTokens] Input config:', { 
    provider: config?.provider, 
    model: config?.model, 
    explicit_max_tokens: explicit 
  });
  if (explicit && explicit > 0) {
    console.log('[getEffectiveMaxTokens] Using explicit max_tokens:', explicit);
    return Math.floor(explicit);
  }
  const provider = String(config?.provider || '').toLowerCase();
  const model = String(config?.model || '').toLowerCase();
  if (provider === 'bedrock') {
    if (model.includes('anthropic.claude')) {
      console.log('[getEffectiveMaxTokens] Claude model detected, returning 4096');
      return 4096;
    }
    if (model.startsWith('mistral.')) return 4096;
    if (model.startsWith('amazon.titan')) return 2000; // Fallback only - should use output_token_limit from model config
  }
  if (provider === 'openai' || provider === 'azure') return 4096;
  console.log('[getEffectiveMaxTokens] Using default fallback: 2000');
  return 2000; // Fallback only - should use output_token_limit from model config
}

// Default batch size for post-processing - will be dynamically calculated based on model limits //
const DEFAULT_POST_PROCESS_BATCH_SIZE = 100;

const buildBatchTextPrompt = (basePrompt: string, expectedLen: number): string => {
  const sentinels = `BOUNDING AND ORDER RULES:\n- Each comment is delimited by explicit sentinels: <<<ITEM k>>> ... <<<END k>>>.\n- Treat EVERYTHING between these sentinels as ONE single comment, even if multi-paragraph or contains lists/headings.\n- Do NOT split or merge any comment segments.\nOUTPUT RULES:\n- Return ONLY a JSON array of ${expectedLen} strings, aligned to ids (1..${expectedLen}).\n- CRITICAL: Each string MUST BEGIN with the exact prefix <<<ITEM k>>> followed by a space, then the full text for k.\n- Do NOT output any headers such as "Rephrased comment:" or "Here are...".\n- Do NOT include any <<<END k>>> markers in the output.\n- Do NOT emit standalone array tokens like "[" or "]" as array items.\n- No prose, no code fences, no explanations before/after the JSON array.\n- IMPORTANT: The <<<ITEM k>>> prefix is ONLY for identification - do NOT include <<<END k>>> markers anywhere in your output.\n- ALTERNATIVE FORMAT: If you prefer, you can also return results in this simple format:\n  <<<ITEM 1>>> [redacted/rephrased text]\n  <<<ITEM 2>>> [redacted/rephrased text]\n  ...\n  <<<ITEM ${expectedLen}>>> [redacted/rephrased text]`;
  return `${basePrompt}\n\n${sentinels}`;
};

const buildSentinelInput = (texts: string[], comments?: any[]): string => {
  if (comments && comments.length > 0) {
    // Use the same ID system as scan-comments: originalRow if available, otherwise scannedIndex, fallback to i+1
    return `Comments to analyze (each bounded by sentinels):\n\n${texts.map((t, i) => {
      const comment = comments[i];
      const itemId = comment?.originalRow || comment?.scannedIndex || (i + 1);
      return `<<<ITEM ${itemId}>>>\n${t}\n<<<END ${itemId}>>>`;
    }).join('\n\n')}`;
  } else {
    // Fallback to sequential numbering if no comment objects provided
    return `Comments to analyze (each bounded by sentinels):\n\n${texts.map((t, i) => `<<<ITEM ${i + 1}>>>\n${t}\n<<<END ${i + 1}>>>`).join('\n\n')}`;
  }
};

// Deterministic redaction enforcement to catch items models may miss
function enforceRedactionPolicy(text: string | null | undefined): string {
  if (!text) return '';
  let out = String(text);
  
  // Names (more comprehensive pattern to catch names that AI might miss)
  // Match common name patterns: First Last, First M. Last, etc.
  out = out.replace(/\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/g, 'XXXX');
  out = out.replace(/\b[A-Z][a-z]+\s+[A-Z]\.\s+[A-Z][a-z]+\b/g, 'XXXX');
  // Also catch single names that might be identifiable in context (simpler approach)
  //out = out.replace(/\b[A-Z][a-z]+(?=\s+(?:in|from|at|of|with|to|for|by|manager|supervisor|employee|staff|worker|operator|director|head|lead|chief|senior|junior|assistant|coordinator|specialist|analyst|engineer|developer|designer|consultant|advisor|trainer|instructor|teacher|professor|doctor|nurse|officer|agent|representative|associate|clerk|receptionist|secretary|administrator))/g, '[NAME]');
  
  // Employee IDs, badge numbers, etc.
  out = out.replace(/\b(?:employee\s+)?ID\s+\d+\b/gi, 'XXXX');
  out = out.replace(/\bbadge\s*#\s*\d+\b/gi, 'XXXX');
  
  // Phone numbers
  out = out.replace(/\b\d{3}-\d{3}-\d{4}\b/g, 'XXXX');
  out = out.replace(/\b\d{3}-\d{4}\b/g, 'XXXX');
  
  // Social Security Numbers
  out = out.replace(/\bSSN\s*:\s*\d{3}-\d{2}-\d{4}\b/gi, 'XXXX');
  
  // Email addresses
  out = out.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, 'XXXX');
  
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

// AI calling function (simplified version for post-processing)
async function callAI(provider: string, model: string, prompt: string, input: string, responseType: string, maxTokens?: number, userId?: string, scanRunId?: string, phase?: string, aiLogger?: AILogger, temperature?: number) {
  const payload = {
    messages: [
      { role: 'system', content: prompt },
      { role: 'user', content: input }
    ],
    temperature: temperature || 0,
    max_tokens: maxTokens || 4096
  };

  console.log(`[CALL_AI] ${provider}/${model} max_tokens=${maxTokens || 4096}, temperature=${temperature || 0}`);
  console.log(`[CALL_AI_DEBUG] Provider: ${provider}, Model: ${model}, MaxTokens: ${maxTokens}, Temperature: ${temperature}`);

        // Log the AI request if logger is provided
      if (aiLogger && userId && scanRunId && phase) {
        await aiLogger.logRequest({
          userId,
          scanRunId: scanRunId,
          functionName: 'post-process-comments',
          provider,
          model,
          requestType: responseType,
          phase,
          requestPrompt: prompt,
          requestInput: input,
          requestTemperature: temperature || 0,
          requestMaxTokens: maxTokens // Use the actual max_tokens passed from model_configurations
        });
      }

  if (provider === 'azure') {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), POSTPROCESS_REQUEST_TIMEOUT_MS); // configurable
    
    try {
      const AZ_ENDPOINT = ((globalThis as any).Deno?.env?.get('AZURE_OPENAI_ENDPOINT') as string) || '';
      const AZ_KEY = ((globalThis as any).Deno?.env?.get('AZURE_OPENAI_API_KEY') as string) || '';
      const response = await fetch(`${AZ_ENDPOINT}/openai/deployments/${model}/chat/completions?api-version=2024-02-15-preview`, {
        method: 'POST',
        headers: {
          'api-key': AZ_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorMessage = `Azure OpenAI API error: ${response.status} ${response.statusText}`;
        if (aiLogger && userId && scanRunId && phase) {
          await aiLogger.logResponse(userId, scanRunId, 'post-process-comments', provider, model, responseType, phase, '', errorMessage, undefined);
        }
        throw new Error(errorMessage);
      }

      const result = await response.json();
      const responseText = result.choices?.[0]?.message?.content || null;
      
      // Log the AI response if logger is provided
      if (aiLogger && userId && scanRunId && phase) {
        if (responseText) {
          await aiLogger.logResponse(userId, scanRunId, 'post-process-comments', provider, model, responseType, phase, responseText, undefined, undefined);
        } else {
          await aiLogger.logResponse(userId, scanRunId, 'post-process-comments', provider, model, responseType, phase, '', 'Azure returned empty content', undefined);
        }
      }
      
      return responseText;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        const timeoutMessage = `Azure OpenAI API timeout after ${seconds(POSTPROCESS_REQUEST_TIMEOUT_MS)} seconds`;
        if (aiLogger && userId && scanRunId && phase) {
          await aiLogger.logResponse(userId, scanRunId, 'post-process-comments', provider, model, responseType, phase, '', timeoutMessage, undefined);
        }
        throw new Error(timeoutMessage);
      }
      throw error;
    }
  } else if (provider === 'openai') {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), POSTPROCESS_REQUEST_TIMEOUT_MS); // configurable
    
    let response;
    try {
      response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${(((globalThis as any).Deno?.env?.get('OPENAI_API_KEY') as string) || '')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: model,
          ...payload
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorMessage = `OpenAI API error: ${response.status} ${response.statusText}`;
        if (aiLogger && userId && scanRunId && phase) {
          await aiLogger.logResponse(userId, scanRunId, 'post-process-comments', provider, model, responseType, phase, '', errorMessage, undefined);
        }
        throw new Error(errorMessage);
      }
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        const timeoutMessage = `OpenAI API timeout after ${seconds(POSTPROCESS_REQUEST_TIMEOUT_MS)} seconds`;
        if (aiLogger && userId && scanRunId && phase) {
          await aiLogger.logResponse(userId, scanRunId, 'post-process-comments', provider, model, responseType, phase, '', timeoutMessage, undefined);
        }
        throw new Error(timeoutMessage);
      }
      // Log unexpected errors (e.g., network) before rethrow
      if (aiLogger && userId && scanRunId && phase) {
        const errMsg = (error instanceof Error) ? error.message : String(error);
        await aiLogger.logResponse(userId, scanRunId, 'post-process-comments', provider, model, responseType, phase, '', errMsg, undefined);
      }
      throw error;
    }
    try {
      const result = await response.json();
      const responseText = result.choices?.[0]?.message?.content || null;
      
      // Log the AI response if logger is provided
      if (aiLogger && userId && scanRunId && phase) {
        if (responseText) {
          await aiLogger.logResponse(userId, scanRunId, 'post-process-comments', provider, model, responseType, phase, responseText, undefined, undefined);
        } else {
          await aiLogger.logResponse(userId, scanRunId, 'post-process-comments', provider, model, responseType, phase, '', 'OpenAI returned empty content', undefined);
        }
      }
      
      return responseText;
    } catch (parseError) {
      const errMsg = (parseError instanceof Error) ? parseError.message : String(parseError);
      if (aiLogger && userId && scanRunId && phase) {
        await aiLogger.logResponse(userId, scanRunId, 'post-process-comments', provider, model, responseType, phase, '', `OpenAI JSON parse error: ${errMsg}`, undefined);
      }
      throw (parseError instanceof Error) ? parseError : new Error(errMsg);
    }
  } else if (provider === 'bedrock') {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), POSTPROCESS_BEDROCK_TIMEOUT_MS); // configurable
    try {
      const region = Deno.env.get('AWS_REGION') || 'us-east-1';
      const accessKeyId = Deno.env.get('AWS_ACCESS_KEY_ID');
      const secretAccessKey = Deno.env.get('AWS_SECRET_ACCESS_KEY');
      if (!accessKeyId || !secretAccessKey) {
        throw new Error('AWS credentials not configured');
      }

      // Extract model identifier (e.g., anthropic.claude-3-haiku-20240307-v1:0)
      const modelId = model.includes('/') ? model.split('/')[1] : model;
      const host = `bedrock-runtime.${region}.amazonaws.com`;
      const endpoint = `https://${host}/model/${encodeURIComponent(modelId)}/invoke`;

      // For Anthropic Claude via Bedrock, system message is top-level; user content goes in messages
      const systemMessage = (payload as any).messages.find((m: any) => m.role === 'system')?.content || '';
      const userMessage = (payload as any).messages.find((m: any) => m.role === 'user')?.content || '';
      const bedrockPayload = {
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: (payload as any).max_tokens,
        system: systemMessage,
        messages: [
          { role: 'user', content: userMessage }
        ],
        temperature: (payload as any).temperature
      };

      const date = new Date();
      const amzDate = date.toISOString().replace(/[:\-]|\.\d{3}/g, '');
      const rawEndpoint = `https://${host}/model/${modelId}/invoke`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Host': host,
          'X-Amz-Date': amzDate,
          'Authorization': await createAWSSignature(
            'POST',
            rawEndpoint,
            JSON.stringify(bedrockPayload),
            accessKeyId,
            secretAccessKey,
            region,
            amzDate
          )
        },
        body: JSON.stringify(bedrockPayload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      if (!response.ok) {
        const errorText = await response.text();
        const errorMessage = `Bedrock API error: ${response.status} ${response.statusText} ${errorText}`;
        if (aiLogger && userId && scanRunId && phase) {
          await aiLogger.logResponse(userId, scanRunId, 'post-process-comments', provider, model, responseType, phase, '', errorMessage, undefined);
        }
        throw new Error(errorMessage);
      }

      const result = await response.json();
      const responseText = result.content?.[0]?.text || null;
      if (aiLogger && userId && scanRunId && phase) {
        if (responseText) {
          await aiLogger.logResponse(userId, scanRunId, 'post-process-comments', provider, model, responseType, phase, responseText, undefined, undefined);
        } else {
          await aiLogger.logResponse(userId, scanRunId, 'post-process-comments', provider, model, responseType, phase, '', 'Bedrock returned empty content', undefined);
        }
      }
      return responseText;
    } catch (error) {
      clearTimeout(timeoutId);
      if ((error as any)?.name === 'AbortError') {
        const timeoutMessage = `Bedrock API timeout after ${seconds(POSTPROCESS_BEDROCK_TIMEOUT_MS)} seconds`;
        if (aiLogger && userId && scanRunId && phase) {
          await aiLogger.logResponse(userId, scanRunId, 'post-process-comments', provider, model, responseType, phase, '', timeoutMessage, undefined);
        }
        throw new Error(timeoutMessage);
      }
      // Log unexpected errors as well
      if (aiLogger && userId && scanRunId && phase) {
        const errMsg = (error instanceof Error) ? error.message : String(error);
        await aiLogger.logResponse(userId, scanRunId, 'post-process-comments', provider, model, responseType, phase, '', errMsg, undefined);
      }
      throw error;
    }
  }

  throw new Error(`Unsupported provider: ${provider}`);
}

// AWS Signature V4 utilities for Bedrock (used by callAI for provider 'bedrock')
async function createAWSSignature(
  method: string,
  url: string,
  body: string,
  accessKeyId: string,
  secretAccessKey: string,
  region: string,
  amzDate: string
): Promise<string> {
  const parsed = new URL(url);
  const hostname = parsed.hostname;
  const pathname = parsed.pathname;
  const search = parsed.search;
  const dateStamp = amzDate.substring(0, 8);

  // Bedrock requires the model path segment to have colons double-encoded
  const canonicalPath = pathname.replace(/:/g, '%3A').replace(/%3A/g, '%253A');
  const canonicalHeaders = `content-type:application/json\nhost:${hostname}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = 'content-type;host;x-amz-date';
  const payloadHash = await sha256(body);
  const canonicalRequest = `${method}\n${canonicalPath}${search}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

  const algorithm = 'AWS4-HMAC-SHA256';
  const credentialScope = `${dateStamp}/${region}/bedrock/aws4_request`;
  const stringToSign = `${algorithm}\n${amzDate}\n${credentialScope}\n${await sha256(canonicalRequest)}`;

  const kDate = await hmacSha256(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, 'bedrock');
  const kSigning = await hmacSha256(kService, 'aws4_request');
  const signature = await hmacSha256(kSigning, stringToSign);
  const authorization = `${algorithm} Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${arrayBufferToHex(signature)}`;
  return authorization;
}

async function sha256(message: string): Promise<string> {
  const encoder = new TextEncoder();
  const msgBuffer = encoder.encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  return arrayBufferToHex(hashBuffer);
}

async function hmacSha256(key: string | ArrayBuffer, message: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const keyBuffer: ArrayBuffer = typeof key === 'string' ? encoder.encode(key) : key;
  const msgBuffer = encoder.encode(message);
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
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// Parse and normalize batch text responses
function normalizeBatchTextParsed(parsed: any): string[] {
  console.log('[NORMALIZE] Input type:', typeof parsed);
  console.log('[NORMALIZE] Input content:', typeof parsed === 'string' ? parsed.substring(0, 200) : parsed);
  
  // Helper function to clean up any remaining sentinel markers
  const cleanSentinels = (text: string): string => {
    return text
      .replace(/<<<END\s+\d+>>>/gi, '') // Remove END markers
      .trim();
  };

  // Check for the specific sequence "\n as comment boundary FIRST - before any other processing
  const content = String(parsed || '');
  if (content.includes('"\n')) {
    console.log('[NORMALIZE] Found "\\n sequence, parsing as comment boundaries');
    console.log('[NORMALIZE] Full content with "\\n:', content);
    
    // Split on "\n to separate comments
    const commentParts = content.split('"\n');
    console.log('[NORMALIZE] Split into', commentParts.length, 'parts');
    
    const result = commentParts
      .map((part, index) => {
        // Extract text content from each part
        // Look for patterns like: "rephrased": "text content here
        const textMatch = part.match(/"(?:redacted|rephrased)"\s*:\s*"([^"]*(?:\\.[^"]*)*)$/);
        if (textMatch) {
          const text = textMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\t/g, '\t');
          const cleaned = cleanSentinels(text);
          return cleaned;
        }
        
        // Alternative: look for any quoted text at the end
        const quotedMatch = part.match(/"([^"]*(?:\\.[^"]*)*)$/);
        if (quotedMatch) {
          const text = quotedMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\t/g, '\t');
          const cleaned = cleanSentinels(text);
          console.log('[NORMALIZE] Quoted text match cleaned:', cleaned.substring(0, 100));
          return cleaned;
        }
        
        console.log(`[NORMALIZE] No match found for part ${index}`);
        return null;
      })
      .filter(s => s && s.length > 0);
    
    console.log('[NORMALIZE] Comment boundary parsing result:', result);
    if (result.length > 0) {
      return result;
    }
  }

  // Only proceed with other parsing if \"\n check didn't work
  if (Array.isArray(parsed)) {
    const cleaned = parsed
      .filter((v) => v != null)
      .map((v) => {
        if (typeof v === 'string') {
          return cleanSentinels(v.trim());
        } else if (typeof v === 'object' && v !== null) {
          // Handle JSON objects with redacted/rephrased/text fields
          if (v.redacted) return cleanSentinels(v.redacted);
          if (v.rephrased) return cleanSentinels(v.rephrased);
          if (v.text) return cleanSentinels(v.text);
          // Fallback to stringifying the object
          return cleanSentinels(JSON.stringify(v));
        } else {
          return cleanSentinels(String(v));
        }
      })
      .filter((s) => s.length > 0)
      .filter((s) => !/^here\s+(?:is|are)[\s\S]*?:\s*$/i.test(s));

    // Handle ID-tagged responses
    const idStart = /^\s*<<<(?:ID|ITEM)\s+(\d+)>>>\s*/i;
    const hasIds = cleaned.some(s => idStart.test(s));
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
        if (currentId != null) buffer.push(s);
      }
      if (currentId != null) merged.push(buffer.join(' ').trim());
      if (merged.length > 0) return merged;
    }

    return cleaned;
  }

  // Fallback: try to parse as string (content already defined above)
  
  // Check if this is the simple format with ITEM markers
  if (content.includes('<<<ITEM')) {
    // Extract content between ITEM markers
    const itemRegex = /<<<ITEM\s+\d+>>>\s*([\s\S]*?)(?=<<<ITEM\s+\d+>>>|$)/g;
    const matches = [...content.matchAll(itemRegex)];
    return matches.map(m => m[1].trim()).filter(s => s.length > 0);
  }
  
  // Check if this is a JSON array (the AI might return the entire array as a string)
  if (content.trim().startsWith('[')) {
    console.log('[NORMALIZE] Attempting JSON parse of:', content.substring(0, 200));
    try {
      const jsonArray = JSON.parse(content);
      console.log('[NORMALIZE] JSON parse successful, type:', typeof jsonArray, 'isArray:', Array.isArray(jsonArray));
      if (Array.isArray(jsonArray)) {
        const result = jsonArray.map(item => {
          console.log('[NORMALIZE] Processing item:', item);
          if (typeof item === 'string') {
            const cleaned = cleanSentinels(item.trim());
            console.log('[NORMALIZE] String item cleaned:', cleaned.substring(0, 100));
            return cleaned;
          } else if (typeof item === 'object' && item !== null) {
            // Handle JSON objects with redacted/rephrased/text fields
            if (item.redacted) {
              console.log('[NORMALIZE] Found redacted field:', item.redacted.substring(0, 50));
              const cleaned = cleanSentinels(item.redacted);
              console.log('[NORMALIZE] Redacted field cleaned:', cleaned.substring(0, 100));
              return cleaned;
            }
            if (item.rephrased) {
              console.log('[NORMALIZE] Found rephrased field:', item.rephrased.substring(0, 50));
              const cleaned = cleanSentinels(item.rephrased);
              console.log('[NORMALIZE] Rephrased field cleaned:', cleaned.substring(0, 100));
              return cleaned;
            }
            if (item.text) {
              const cleaned = cleanSentinels(item.text);
              console.log('[NORMALIZE] Text field cleaned:', cleaned.substring(0, 100));
              return cleaned;
            }
            // Fallback to stringifying the object
            const cleaned = cleanSentinels(JSON.stringify(item));
            console.log('[NORMALIZE] Object stringified and cleaned:', cleaned.substring(0, 100));
            return cleaned;
          } else {
            const cleaned = cleanSentinels(String(item));
            console.log('[NORMALIZE] Other type cleaned:', cleaned.substring(0, 100));
            return cleaned;
          }
        }).filter(s => s.length > 0);
        console.log('[NORMALIZE] JSON array result:', result);
        return result;
      }
    } catch (e) {
      console.warn('[NORMALIZE] Failed to parse JSON array, attempting to parse incomplete JSON:', e);
      
      // Try to parse incomplete JSON by recognizing comment boundaries
      // Pattern to match JSON objects with index and redacted/rephrased fields
      // Handles cases where the JSON is truncated mid-sentence
      const incompleteJsonPattern = /{\s*"index"\s*:\s*\d+\s*,\s*"(?:redacted|rephrased)"\s*:\s*"([^"]*(?:\\.[^"]*)*)"\s*}(?:\s*,|\s*$)/g;
      const matches = [...content.matchAll(incompleteJsonPattern)];
      
      if (matches.length > 0) {
        console.log('[NORMALIZE] Found', matches.length, 'incomplete JSON matches');
        const result = matches.map(match => {
          const text = match[1].replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\t/g, '\t');
          const cleaned = cleanSentinels(text);
          console.log('[NORMALIZE] Incomplete JSON match cleaned:', cleaned.substring(0, 100));
          return cleaned;
        }).filter(s => s.length > 0);
        console.log('[NORMALIZE] Incomplete JSON result:', result);
        return result;
      }
      
      // Alternative pattern for cases where the JSON structure is more broken
      // Look for patterns like: "rephrased": "text content here"
      const alternativePattern = /"(?:redacted|rephrased)"\s*:\s*"([^"]*(?:\\.[^"]*)*)"\s*(?:,|\s*})/g;
      const altMatches = [...content.matchAll(alternativePattern)];
      
      if (altMatches.length > 0) {
        console.log('[NORMALIZE] Found', altMatches.length, 'alternative pattern matches');
        const result = altMatches.map(match => {
          const text = match[1].replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\t/g, '\t');
          const cleaned = cleanSentinels(text);
          console.log('[NORMALIZE] Alternative pattern match cleaned:', cleaned.substring(0, 100));
          return cleaned;
        }).filter(s => s.length > 0);
        console.log('[NORMALIZE] Alternative pattern result:', result);
        return result;
      }
      
      console.warn('[NORMALIZE] No incomplete JSON patterns found, falling back to string parsing');
      console.warn('[NORMALIZE] Content that failed to parse:', content.substring(0, 500));
      console.warn('[NORMALIZE] Content length:', content.length);
    }
  }

  const result = [String(parsed || '')];
  console.log('[NORMALIZE] Final result (fallback):', result);
  console.log('[NORMALIZE] This means JSON parsing failed or input was not JSON array');
  return result;
}

interface PostProcessRequest {
  comments: Array<{
    id: string;
    originalRow?: number; // Add originalRow for proper ID tracking
    scannedIndex?: number; // Add scannedIndex for proper lookup
    originalText: string;
    text: string;
    concerning: boolean;
    identifiable: boolean;
    mode: 'redact' | 'rephrase' | 'original';
    scanAResult: any;
    scanBResult?: any;
    adjudicationResult?: any;
  }>;
  scanConfig: {
    provider: string;
    model: string;
    redact_prompt: string;
    rephrase_prompt: string;
    max_tokens?: number;
  };
  defaultMode: 'redact' | 'rephrase';
  scanRunId?: string; // Add scanRunId to the interface
  phase?: 'redaction' | 'rephrase' | 'both';
  routingMode?: 'scan_a' | 'scan_b' | 'both';
}

interface PostProcessResponse {
  success: boolean;
  processedComments: Array<{
    id: string;
    originalRow?: number; // Preserve originalRow for proper ID tracking
    scannedIndex?: number; // Preserve scannedIndex for proper lookup
    redactedText?: string;
    rephrasedText?: string;
    finalText: string;
    mode: 'redact' | 'rephrase' | 'original';
  }>;
  summary: {
    total: number;
    redacted: number;
    rephrased: number;
    original: number;
  };
  totalRunTimeMs?: number;
  error?: string;
}

serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = buildCorsHeaders(origin);
  console.log('[CORS] Origin:', origin);
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const overallStartTime = Date.now(); // Track overall process time

  try {
    const { comments, scanConfig, defaultMode, scanRunId, phase = 'both', routingMode = 'both' }: PostProcessRequest = await req.json()
    
    if (!comments || !Array.isArray(comments) || comments.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'No comments provided' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Check user authentication
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Authorization header required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }
    
    const token = authHeader.replace('Bearer ', '');
    const SUPABASE_URL = (((globalThis as any).Deno?.env?.get('SUPABASE_URL') as string) || '');
    const SUPABASE_SERVICE_ROLE_KEY = (((globalThis as any).Deno?.env?.get('SUPABASE_SERVICE_ROLE_KEY') as string) || '');
    const supabase = createClient(
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY
    );
    
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid authentication token' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    // Use scanRunId if provided, otherwise generate a new one
    const runId = scanRunId || Math.floor(Math.random() * 10000);
    const logPrefix = `[RUN ${runId}]`;

    console.log(`${logPrefix} [POSTPROCESS] Processing ${comments.length} comments with ${scanConfig.provider}/${scanConfig.model}`)
    console.log(`${logPrefix} [DEBUG] scanConfig details:`, {
      provider: scanConfig.provider,
      model: scanConfig.model,
      max_tokens: scanConfig.max_tokens,
      full_scanConfig: scanConfig
    });

    // Test database connection and verify we're hitting the right database
    console.log(`${logPrefix} [DEBUG] Testing database connection...`);
    const { data: testData, error: testError } = await supabase
      .from('model_configurations')
      .select('provider, model, output_token_limit')
      .eq('provider', 'bedrock')
      .limit(5);
    console.log(`${logPrefix} [DEBUG] Test query result:`, { testData, testError });
    console.log(`${logPrefix} [DEBUG] Looking up model config for: provider=${scanConfig.provider}, model=${scanConfig.model}`);
    console.log(`${logPrefix} [DEBUG] Query: SELECT * FROM model_configurations WHERE provider='${scanConfig.provider}' AND model='${scanConfig.model}'`);
    const { data: modelCfg, error: modelCfgError } = await supabase
      .from('model_configurations')
      .select('*')
      .eq('provider', scanConfig.provider)
      .eq('model', scanConfig.model)
      .single();
    
    console.log(`${logPrefix} [DEBUG] Model config lookup result:`, { 
      found: !!modelCfg, 
      error: modelCfgError?.message, 
      output_token_limit: modelCfg?.output_token_limit,
      full_record: modelCfg
    });

    const { data: aiCfg, error: aiCfgError } = await supabase
      .from('ai_configurations')
      .select('temperature, tokens_per_comment')
      .eq('provider', scanConfig.provider)
      .eq('model', scanConfig.model)
      .limit(1)
      .single();

    // Get batch sizing configuration for safety margin
    const { data: batchSizingData } = await supabase
      .from('batch_sizing_config')
      .select('*')
      .single();
    
    const safetyMarginPercent = batchSizingData?.safety_margin_percent || 15;
    const redactionIoRatio = typeof batchSizingData?.redaction_io_ratio === 'number' ? batchSizingData.redaction_io_ratio : 1.7;
    const rephraseIoRatio = typeof batchSizingData?.rephrase_io_ratio === 'number' ? batchSizingData.rephrase_io_ratio : 2.3;
    console.log(`${logPrefix} [POSTPROCESS] Safety margin: ${safetyMarginPercent}%`);
    console.log(`${logPrefix} [POSTPROCESS] I/O ratios: redaction=${redactionIoRatio}, rephrase=${rephraseIoRatio}`);

    let actualMaxTokens = getEffectiveMaxTokens(scanConfig);
    console.log(`${logPrefix} [DEBUG] Initial actualMaxTokens from getEffectiveMaxTokens: ${actualMaxTokens}`);
    console.log(`${logPrefix} [DEBUG] scanConfig.max_tokens: ${scanConfig.max_tokens}`);
    if (modelCfgError) {
      console.warn(`${logPrefix} [POSTPROCESS] Warning: Could not fetch model_configurations, using defaults:`, modelCfgError.message);
    } else {
      console.log(`${logPrefix} [DEBUG] modelCfg?.output_token_limit: ${modelCfg?.output_token_limit}`);
      console.log(`${logPrefix} [DEBUG] Full modelCfg object:`, JSON.stringify(modelCfg, null, 2));
      console.log(`${logPrefix} [DEBUG] Full scanConfig object:`, JSON.stringify(scanConfig, null, 2));
      actualMaxTokens = modelCfg?.output_token_limit || getEffectiveMaxTokens(scanConfig);
      console.log(`${logPrefix} [POSTPROCESS] Using max_tokens from model_configurations: ${actualMaxTokens}, model_temperature=${modelCfg?.temperature}`);
    }

    const effectiveTemperature = (aiCfg && aiCfg.temperature !== null && aiCfg.temperature !== undefined)
      ? aiCfg.temperature
      : (modelCfg?.temperature ?? 0);

    const tokensPerComment = aiCfg?.tokens_per_comment || 13;
    console.log(`${logPrefix} [POSTPROCESS] Using tokens_per_comment: ${tokensPerComment} (for reference, post-processing uses I/O ratios)`);

    // Get rate limits
    const tpmLimit = modelCfg?.tpm_limit;
    const rpmLimit = modelCfg?.rpm_limit;
    console.log(`${logPrefix} [POSTPROCESS] TPM limit: ${tpmLimit || 'none'}, RPM limit: ${rpmLimit || 'none'} for ${scanConfig.provider}/${scanConfig.model}`);

    // Use the actual max_tokens from model_configurations
    const effectiveConfig = {
      ...scanConfig,
      max_tokens: actualMaxTokens,
      temperature: effectiveTemperature,
      tpm_limit: tpmLimit,
      rpm_limit: rpmLimit
    };

    console.log(`${logPrefix} [POSTPROCESS] Effective config: max_tokens=${effectiveConfig.max_tokens}, temperature=${effectiveConfig.temperature}`);
    console.log(`${logPrefix} [POSTPROCESS] Token limit for AI calls: ${effectiveConfig.max_tokens} tokens (from model config: ${modelCfg?.output_token_limit || 'not set'})`);
    console.log(`${logPrefix} [POSTPROCESS] Model config output_token_limit: ${modelCfg?.output_token_limit || 'not set'}`);

    // Filter comments that need post-processing
    const flaggedComments = comments.filter(c => c.concerning || c.identifiable)
    // De-duplicate by id to avoid processing the same comment multiple times
    const uniqueMap = new Map<string, any>();
    for (const c of flaggedComments) {
      if (!uniqueMap.has(c.id)) uniqueMap.set(c.id, c);
    }
    const workComments = Array.from(uniqueMap.values());
    if (workComments.length !== flaggedComments.length) {
      console.log(`[POSTPROCESS] De-duplicated flagged comments: ${flaggedComments.length} → ${workComments.length}`);
    }
    const needsProcessing = workComments.length > 0

    if (!needsProcessing) {
      console.log(`${logPrefix} [POSTPROCESS] No comments need post-processing`)
      return new Response(
        JSON.stringify({
          success: true,
          processedComments: comments.map(c => ({
            id: c.id,
            finalText: c.text,
            mode: c.mode
          })),
          summary: {
            total: comments.length,
            redacted: 0,
            rephrased: 0,
            original: comments.length
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Process flagged comments using AI-powered redaction and rephrasing
    const processedComments: Array<{ id: string; originalRow?: number; scannedIndex?: number; redactedText?: string; rephrasedText?: string; finalText: string; mode: 'redact' | 'rephrase' | 'original'; }> = []
    let redactedCount = 0
    let rephrasedCount = 0
    let originalCount = 0

    try {
      // Calculate optimal batch size based on model limits and actual comment sizes
      let optimalBatchSize = DEFAULT_POST_PROCESS_BATCH_SIZE;
      
      // Calculate actual token usage for better batch sizing
      const avgCommentLength = workComments.reduce((sum, c) => sum + (c.originalText || c.text || '').length, 0) / workComments.length;
      const estimatedInputTokensPerComment = Math.ceil(avgCommentLength / 5); // ~5 chars per token (more realistic for post-processing)
      // Estimate outputs using configured I/O ratios (not scan-comments constants)
      const estimatedOutputTokensPerCommentRedact = Math.ceil(estimatedInputTokensPerComment * redactionIoRatio);
      const estimatedOutputTokensPerCommentRephrase = Math.ceil(estimatedInputTokensPerComment * rephraseIoRatio);
      const estimatedTotalTokensPerCommentRedact = estimatedInputTokensPerComment + estimatedOutputTokensPerCommentRedact;
      const estimatedTotalTokensPerCommentRephrase = estimatedInputTokensPerComment + estimatedOutputTokensPerCommentRephrase;
      
      console.log(`${logPrefix} [BATCH_CALC] Average comment length: ${Math.round(avgCommentLength)} chars`);
      console.log(`${logPrefix} [BATCH_CALC] Estimated tokens per comment (redact): ${estimatedInputTokensPerComment} in + ${estimatedOutputTokensPerCommentRedact} out = ${estimatedTotalTokensPerCommentRedact}`);
      console.log(`${logPrefix} [BATCH_CALC] Estimated tokens per comment (rephrase): ${estimatedInputTokensPerComment} in + ${estimatedOutputTokensPerCommentRephrase} out = ${estimatedTotalTokensPerCommentRephrase}`);
      
      // Calculate batch size based on input token limits - use proper defaults for modern models
      const inputTokenLimit = modelCfg?.input_token_limit || 128000;
      const outputTokenLimit = modelCfg?.output_token_limit || getEffectiveMaxTokens(scanConfig); // Use same fallback logic as AI calls
      
      // Reserve tokens for prompt (estimate ~2000 tokens for post-processing prompts)
      const promptTokens = 2000;
      const availableInputTokens = inputTokenLimit - promptTokens;
      
      // Calculate max batch size by input tokens
      const maxBatchByInput = Math.floor(availableInputTokens / estimatedInputTokensPerComment);
      
      // Calculate max batch size by output tokens per phase (use stricter when both phases requested)
      const maxBatchByOutputRedact = Math.max(1, Math.floor(outputTokenLimit / Math.max(1, estimatedOutputTokensPerCommentRedact)));
      const maxBatchByOutputRephrase = Math.max(1, Math.floor(outputTokenLimit / Math.max(1, estimatedOutputTokensPerCommentRephrase)));
      const phasesToRun = (phase === 'both') ? 'both' : phase;
      const maxBatchByOutput = phasesToRun === 'both' ? Math.min(maxBatchByOutputRedact, maxBatchByOutputRephrase)
        : (phase === 'redaction' ? maxBatchByOutputRedact : maxBatchByOutputRephrase);
      
      // Use the more restrictive limit
      const maxBatchByTokens = Math.min(maxBatchByInput, maxBatchByOutput);
      
      console.log(`${logPrefix} [BATCH_CALC] Input limit: ${inputTokenLimit}, Output limit: ${outputTokenLimit}`);
      console.log(`${logPrefix} [BATCH_CALC] Available input tokens: ${availableInputTokens} (after ${promptTokens} prompt tokens)`);
      console.log(`${logPrefix} [BATCH_CALC] Max batch by input: ${maxBatchByInput}, Max batch by output: ${maxBatchByOutput} (redact=${maxBatchByOutputRedact}, rephrase=${maxBatchByOutputRephrase})`);
      console.log(`${logPrefix} [BATCH_CALC] Max batch by tokens: ${maxBatchByTokens}`);
      
      // Start with token-based limit
      optimalBatchSize = Math.min(DEFAULT_POST_PROCESS_BATCH_SIZE, maxBatchByTokens);
      

      
      // Apply configurable safety margin
      const safetyMultiplier = 1 - (safetyMarginPercent / 100);
      const safetyBatchSize = Math.floor(optimalBatchSize * safetyMultiplier);
      if (safetyBatchSize < optimalBatchSize) {
        console.log(`${logPrefix} [BATCH_CALC] Applied safety margin: ${optimalBatchSize} → ${safetyBatchSize} (${safetyMarginPercent}% of max)`);
        optimalBatchSize = safetyBatchSize;
      }
      
      console.log(`${logPrefix} [BATCH_CALC] Final optimal batch size: ${optimalBatchSize}`);
      console.log(`${logPrefix} [BATCH_CALC] Calculation breakdown: DEFAULT_POST_PROCESS_BATCH_SIZE=${DEFAULT_POST_PROCESS_BATCH_SIZE}, maxBatchByTokens=${maxBatchByTokens}, safetyMarginPercent=${safetyMarginPercent}%`);
      console.log(`${logPrefix} [BATCH_CALC] Token estimation summary: avgCommentLength=${Math.round(avgCommentLength)}, inputTokensPerComment=${estimatedInputTokensPerComment}, outputTokensPerCommentRedact=${estimatedOutputTokensPerCommentRedact}, outputTokensPerCommentRephrase=${estimatedOutputTokensPerCommentRephrase}`);
      
      // Route each comment to Scan A/B model based on identifiable flags; random if both; for concerning-only use concerning flags, else random
      type GroupKey = string;
      interface Group { provider: string; model: string; items: any[] }
      const parseProviderModel = (modelStr: string | undefined): { provider: string | null; model: string | null } => {
        if (!modelStr) return { provider: null, model: null };
        const parts = modelStr.split('/');
        if (parts.length === 2) return { provider: parts[0], model: parts[1] };
        const lower = modelStr.toLowerCase();
        if (lower.startsWith('anthropic.') || lower.startsWith('mistral.') || lower.startsWith('amazon.titan')) {
          return { provider: 'bedrock', model: modelStr };
        }
        if (lower.startsWith('gpt') || lower.includes('gpt-4')) {
          return { provider: 'openai', model: modelStr };
        }
        return { provider: null, model: modelStr };
      };
      const pickModelForComment = (c: any): { provider: string; model: string } => {
        const aIdent = Boolean(c.scanAResult?.identifiable);
        const bIdent = Boolean(c.scanBResult?.identifiable);
        const aConc = Boolean(c.scanAResult?.concerning);
        const bConc = Boolean(c.scanBResult?.concerning);
        const aPM = parseProviderModel(c.scanAResult?.model);
        const bPM = parseProviderModel(c.scanBResult?.model);

        // Determine the primary flag type based on adjudicated result
        const preferIdent = Boolean(c.identifiable);
        const preferConc = !preferIdent && Boolean(c.concerning);

        // If routingMode is forced, prefer that branch when possible
        if (routingMode === 'scan_a' && (aPM.provider && aPM.model)) {
          return { provider: aPM.provider, model: aPM.model };
        }
        if (routingMode === 'scan_b' && (bPM.provider && bPM.model)) {
          return { provider: bPM.provider, model: bPM.model };
        }

        // Choose by primary flag type
        if (preferIdent) {
          if (aIdent && !bIdent && aPM.provider && aPM.model) return { provider: aPM.provider, model: aPM.model };
          if (!aIdent && bIdent && bPM.provider && bPM.model) return { provider: bPM.provider, model: bPM.model };
          if (aIdent && bIdent) {
            const pm = (Math.random() < 0.5) ? aPM : bPM;
            if (pm.provider && pm.model) return { provider: pm.provider, model: pm.model };
          }
        }
        if (preferConc) {
          if (aConc && !bConc && aPM.provider && aPM.model) return { provider: aPM.provider, model: aPM.model };
          if (!aConc && bConc && bPM.provider && bPM.model) return { provider: bPM.provider, model: bPM.model };
          if (aConc && bConc) {
            const pm = (Math.random() < 0.5) ? aPM : bPM;
            if (pm.provider && pm.model) return { provider: pm.provider, model: pm.model };
          }
        }

        // Fallbacks: if adjudication says flagged but neither scanner marked that specific flag
        // try the other flag type
        if (preferIdent && (aConc || bConc)) {
          const pm = aConc ? aPM : bPM;
          if (pm.provider && pm.model) return { provider: pm.provider, model: pm.model };
        }
        if (preferConc && (aIdent || bIdent)) {
          const pm = aIdent ? aPM : bPM;
          if (pm.provider && pm.model) return { provider: pm.provider, model: pm.model };
        }

        // Final fallback to effective config
        return { provider: effectiveConfig.provider, model: effectiveConfig.model };
      };

      const groups = new Map<GroupKey, Group>();
      for (const c of workComments) {
        const { provider, model } = pickModelForComment(c);
        const key = `${provider}/${model}`;
        if (!groups.has(key)) groups.set(key, { provider, model, items: [] });
        groups.get(key)!.items.push(c);
      }
      console.log(`${logPrefix} [ROUTING] Routed ${workComments.length} comments into ${groups.size} groups`);

      // Pre-fetch model configurations for all groups to compute conservative limits
      const groupCfgCache = new Map<string, any>();
      let conservativeInputLimit = Infinity;
      let conservativeOutputLimit = Infinity;
      for (const [key, group] of groups.entries()) {
        const { data: groupModelCfg, error: groupModelCfgError } = await supabase
          .from('model_configurations')
          .select('*')
          .eq('provider', group.provider)
          .eq('model', group.model)
          .single();
        groupCfgCache.set(key, { cfg: groupModelCfg, err: groupModelCfgError });
        const grpInput = (groupModelCfg && typeof groupModelCfg.input_token_limit === 'number') ? groupModelCfg.input_token_limit : 128000;
        const grpOutput = (groupModelCfg && typeof groupModelCfg.output_token_limit === 'number') ? groupModelCfg.output_token_limit : getEffectiveMaxTokens({ provider: group.provider, model: group.model });
        conservativeInputLimit = Math.min(conservativeInputLimit, grpInput);
        conservativeOutputLimit = Math.min(conservativeOutputLimit, grpOutput);
      }
      if (!Number.isFinite(conservativeInputLimit)) conservativeInputLimit = 128000;
      if (!Number.isFinite(conservativeOutputLimit)) conservativeOutputLimit = getEffectiveMaxTokens(effectiveConfig);
      // Apply the same safety margin used elsewhere to conservative limits
      const safetyMultiplierConservative = 1 - (safetyMarginPercent / 100);
      const conservativeInputLimitSafe = Math.floor(conservativeInputLimit * safetyMultiplierConservative);
      const conservativeOutputLimitSafe = Math.floor(conservativeOutputLimit * safetyMultiplierConservative);
      console.log(`${logPrefix} [BATCH_CALC] Conservative limits across models: input=${conservativeInputLimit}, output=${conservativeOutputLimit}`);
      console.log(`${logPrefix} [BATCH_CALC] Safety-adjusted conservative limits: input=${conservativeInputLimitSafe}, output=${conservativeOutputLimitSafe} (margin=${safetyMarginPercent}%)`);

      for (const [key, group] of groups.entries()) {
        const cached = groupCfgCache.get(key) as { cfg: any, err: any } | undefined;
        const groupModelCfg = cached?.cfg;
        const groupModelCfgError = cached?.err;
        let groupMaxTokens = getEffectiveMaxTokens({ provider: group.provider, model: group.model });
        if (!groupModelCfgError && groupModelCfg) {
          groupMaxTokens = groupModelCfg.output_token_limit || groupMaxTokens;
          console.log(`${logPrefix} [POSTPROCESS] Group ${key} token limit from model_configurations: ${groupMaxTokens}`);
          console.log(`${logPrefix} [DEBUG] Group ${key} modelCfg details:`, {
            provider: groupModelCfg.provider,
            model: groupModelCfg.model,
            output_token_limit: groupModelCfg.output_token_limit,
            temperature: groupModelCfg.temperature
          });
        } else {
          console.log(`${logPrefix} [POSTPROCESS] Group ${key} using fallback token limit: ${groupMaxTokens}`);
          if (groupModelCfgError) {
            console.warn(`${logPrefix} [POSTPROCESS] Warning: Could not fetch model_configurations for ${key}:`, groupModelCfgError?.message);
          }
        }

        // Build token-aware chunks: greedily pack items until input/output token limits would be exceeded (using conservative limits)
        const buildTokenAwareChunks = (
          items: any[],
          phaseMode: 'both' | 'redaction' | 'rephrase',
          inputLimit: number,
          outputLimit: number,
          promptTokenReserve: number,
          inputTokensPerCharEstimate: number,
          ioRedact: number,
          ioRephrase: number,
          maxItemsCap: number
        ): any[][] => {
          const chunksOut: any[][] = [];
          let i = 0;
          while (i < items.length) {
            let chunk: any[] = [];
            let sumInput = 0;
            let sumOutRedact = 0;
            let sumOutRephrase = 0;
            while (i < items.length) {
              const item = items[i];
              const text = String(item.originalText || item.text || "");
              const inputTokens = Math.ceil(text.length / 5); // consistent with earlier estimate
              const outRedact = Math.ceil(inputTokens * ioRedact);
              const outRephrase = Math.ceil(inputTokens * ioRephrase);
              const nextSumInput = sumInput + inputTokens;
              const nextSumOutRedact = sumOutRedact + outRedact;
              const nextSumOutRephrase = sumOutRephrase + outRephrase;
              const inputOk = (nextSumInput + promptTokenReserve) <= inputLimit;
              const redactOk = (phaseMode !== 'rephrase') ? (nextSumOutRedact <= outputLimit) : true;
              const rephraseOk = (phaseMode !== 'redaction') ? (nextSumOutRephrase <= outputLimit) : true;
              const bothOk = phaseMode === 'both' ? (nextSumOutRedact <= outputLimit && nextSumOutRephrase <= outputLimit) : true;
              if (inputOk && redactOk && rephraseOk && bothOk) {
                // Add item to chunk
                chunk.push(item);
                sumInput = nextSumInput;
                sumOutRedact = nextSumOutRedact;
                sumOutRephrase = nextSumOutRephrase;
                i += 1;
                // Guardrail to prevent overly large chunks even if limits are high
                if (chunk.length >= maxItemsCap) break;
              } else {
                // If chunk is empty, force single item to avoid infinite loop
                if (chunk.length === 0) {
                  chunk.push(item);
                  i += 1;
                }
                break;
              }
            }
            chunksOut.push(chunk);
          }
          return chunksOut;
        };

        const phaseMode: 'both' | 'redaction' | 'rephrase' = (phase === 'both' || phase === 'redaction' || phase === 'rephrase') ? phase : 'both';
        const capItemsByOutput = Math.max(1, Math.floor(conservativeOutputLimitSafe / Math.max(estimatedOutputTokensPerCommentRedact, estimatedOutputTokensPerCommentRephrase)));
        const maxItemsCap = Math.max(1, Math.min(optimalBatchSize, capItemsByOutput));
        let chunks = buildTokenAwareChunks(
          group.items,
          phaseMode,
          conservativeInputLimitSafe,
          conservativeOutputLimitSafe,
          2000,
          5,
          redactionIoRatio,
          rephraseIoRatio,
          maxItemsCap
        );
        // As an extra guard, if both phases are requested, further split any chunk whose estimated phase output exceeds the model output limit
        if (phaseMode === 'both') {
          const guarded: any[][] = [];
          for (const ch of chunks) {
            let start = 0;
            while (start < ch.length) {
              let end = start;
              let sumOutR = 0;
              let sumOutP = 0;
              while (end < ch.length) {
                const ti = Math.ceil(String(ch[end].originalText || ch[end].text || '').length / 5);
                const addR = Math.ceil(ti * redactionIoRatio);
                const addP = Math.ceil(ti * rephraseIoRatio);
                if ((sumOutR + addR) <= groupMaxTokens && (sumOutP + addP) <= groupMaxTokens) {
                  sumOutR += addR;
                  sumOutP += addP;
                  end += 1;
                } else {
                  break;
                }
              }
              guarded.push(ch.slice(start, end > start ? end : (start + 1)));
              start = end > start ? end : (start + 1);
            }
          }
          chunks = guarded;
        }
        console.log(`${logPrefix} [POSTPROCESS] Processing group ${key}: ${group.items.length} comments in ${chunks.length} token-aware chunks (conservative limits applied, cap=${maxItemsCap})`);
        for (const chunk of chunks) {
        console.log(`${logPrefix} [POSTPROCESS] Processing chunk of ${chunk.length} comments`);

        // Determine which items should be processed by redaction vs rephrase
        // Per requirements: every flagged comment should be processed for BOTH redaction and rephrase.
        // Routing to a model is handled at the group level (chunk). For phase control, we just choose which calls to make.
        const redactItems = chunk;
        const rephraseItems = chunk;

        // Build sentinel inputs separately for each phase to honor concerning-only = rephrase-only
        const sentinelInputRedact = buildSentinelInput(redactItems.map((c: any) => c.originalText || c.text), redactItems);
        const sentinelInputRephrase = buildSentinelInput(rephraseItems.map((c: any) => c.originalText || c.text), rephraseItems);
        
        // Build prompts with expected lengths matching each phase's item count
        const redactPrompt = buildBatchTextPrompt(scanConfig.redact_prompt, redactItems.length);
        const rephrasePrompt = buildBatchTextPrompt(scanConfig.rephrase_prompt, rephraseItems.length);
        
        // Determine which phases to request for this chunk, respecting single-pass policy
        const requestRedaction = (phase === 'both' || phase === 'redaction') && redactItems.length > 0;
        const requestRephrase = (phase === 'both' || phase === 'rephrase') && rephraseItems.length > 0;

        if (requestRedaction) {
          console.log(`${logPrefix} [AI REQUEST] ${group.provider}/${group.model} type=batch_text phase=redaction`);
          console.log(`${logPrefix} [AI REQUEST] payload=${JSON.stringify({
            provider: group.provider,
            model: group.model,
            prompt_length: redactPrompt.length,
            input_length: sentinelInputRedact.length,
            chunk_size: chunk.length
          }).substring(0, 500)}...`);
        }
        if (requestRephrase) {
          console.log(`${logPrefix} [AI REQUEST] ${group.provider}/${group.model} type=batch_text phase=rephrase`);
          console.log(`${logPrefix} [AI REQUEST] payload=${JSON.stringify({
            provider: group.provider,
            model: group.model,
            prompt_length: rephrasePrompt.length,
            input_length: sentinelInputRephrase.length,
            chunk_size: chunk.length
          }).substring(0, 500)}...`);
        }
        
                 // Initialize AI logger
         const aiLogger = new AILogger();
         aiLogger.setFunctionStartTime(overallStartTime);
        
        // Estimate per-chunk tokens using configured I/O ratios (and include prompt reserve for input)
        const chunkInputTokensNoPrompt = chunk.reduce((sum, c) => sum + Math.ceil(String(c.originalText || c.text || '').length / 5), 0);
        const chunkEstimatedInputTokens = chunkInputTokensNoPrompt + 2000;
        const chunkEstimatedOutputRedact = chunk.reduce((sum, c) => {
          const ti = Math.ceil(String(c.originalText || c.text || '').length / 5);
          return sum + Math.ceil(ti * redactionIoRatio);
        }, 0);
        const chunkEstimatedOutputRephrase = chunk.reduce((sum, c) => {
          const ti = Math.ceil(String(c.originalText || c.text || '').length / 5);
          return sum + Math.ceil(ti * rephraseIoRatio);
        }, 0);
        console.log(`${logPrefix} [CHUNK] Tokens (input≈${chunkEstimatedInputTokens} incl. prompt, output redact≈${chunkEstimatedOutputRedact}, rephrase≈${chunkEstimatedOutputRephrase}) limits (in=${conservativeInputLimitSafe}, out=${conservativeOutputLimitSafe})`);
        

        
        const calls: Promise<string | null>[] = [];

        // If nothing to do for this chunk under current phase, skip to next chunk
        if (!requestRedaction && !requestRephrase) {
          console.log(`${logPrefix} [POSTPROCESS] Skipping chunk: no items for current phase (${phase})`);
          continue;
        }

        if (requestRedaction) {
          console.log(`${logPrefix} [AI_CALL_DEBUG] Redaction call: ${group.provider}/${group.model} max_tokens=${groupMaxTokens} temperature=${groupModelCfg?.temperature ?? effectiveConfig.temperature}`);
          calls.push(
            callAI(
              group.provider,
              group.model,
              redactPrompt,
              sentinelInputRedact,
              'batch_text',
              conservativeOutputLimitSafe,
              user.id,
              scanRunId,
              'redaction',
              aiLogger,
              groupModelCfg?.temperature ?? effectiveConfig.temperature
            )
          );
        }
        if (requestRephrase) {
          console.log(`${logPrefix} [AI_CALL_DEBUG] Rephrase call: ${group.provider}/${group.model} max_tokens=${groupMaxTokens} temperature=${groupModelCfg?.temperature ?? effectiveConfig.temperature}`);
          calls.push(
            callAI(
              group.provider,
              group.model,
              rephrasePrompt,
              sentinelInputRephrase,
              'batch_text',
              conservativeOutputLimitSafe,
              user.id,
              scanRunId,
              'rephrase',
              aiLogger,
              groupModelCfg?.temperature ?? effectiveConfig.temperature
            )
          );
        }
        const settled = await Promise.allSettled(calls);
        let rawRedacted: string | null = null;
        let rawRephrased: string | null = null;
        let idx = 0;
        if (requestRedaction) {
          const s = settled[idx++];
          if (s.status === 'fulfilled') {
            rawRedacted = s.value as string;
          } else {
            const errMsg = s.reason instanceof Error ? s.reason.message : String(s.reason);
            console.error(`${logPrefix} [POSTPROCESS][REDACTION] Error: ${errMsg}`);
            if (aiLogger && user && scanRunId) {
              await aiLogger.logResponse(user.id, scanRunId, 'post-process-comments', effectiveConfig.provider, effectiveConfig.model, 'batch_text', 'redaction', '', errMsg, undefined);
            }
          }
        }
        if (requestRephrase) {
          const s = settled[idx++];
          if (s && s.status === 'fulfilled') {
            rawRephrased = s.value as string;
          } else if (s) {
            const errMsg = s.reason instanceof Error ? s.reason.message : String(s.reason);
            console.error(`${logPrefix} [POSTPROCESS][REPHRASE] Error: ${errMsg}`);
            if (aiLogger && user && scanRunId) {
              await aiLogger.logResponse(user.id, scanRunId, 'post-process-comments', effectiveConfig.provider, effectiveConfig.model, 'batch_text', 'rephrase', '', errMsg, undefined);
            }
          }
        }
        
        console.log(`${logPrefix} [AI RESPONSE] ${group.provider}/${group.model} type=batch_text phase=redaction`);
        console.log(`${logPrefix} [AI RESPONSE] rawRedacted=${JSON.stringify(rawRedacted).substring(0, 500)}...`);
        console.log(`${logPrefix} [AI RESPONSE] ${group.provider}/${group.model} type=batch_text phase=rephrase`);
        console.log(`${logPrefix} [AI RESPONSE] rawRephrased=${JSON.stringify(rawRephrased).substring(0, 500)}...`);
        console.log(`${logPrefix} [AI RESPONSE] rawRephrased length: ${rawRephrased?.length || 0} characters`);
        if (rawRephrased) {
          console.log(`${logPrefix} [AI RESPONSE] rawRephrased ends with: "${rawRephrased.substring(Math.max(0, rawRephrased.length - 100))}"`);
        }
        
        // Parse and normalize the responses
        console.log(`${logPrefix} [POSTPROCESS] Parsing AI responses...`);
        
        // Validate AI responses before parsing
        if ((!requestRedaction || rawRedacted) || (!requestRephrase || rawRephrased)) {
          // At least one requested phase returned data (or phase not requested)
        } else {
          console.error(`${logPrefix} [POSTPROCESS] ERROR: Both AI responses are empty or null`);
          throw new Error('AI responses are empty or null');
        }
        
        const expectedRedactCount = redactItems.length;
        const expectedRephraseCount = rephraseItems.length;
        console.log(`${logPrefix} [DEBUG] rawRedacted type:`, typeof rawRedacted);
        console.log(`${logPrefix} [DEBUG] rawRedacted content:`, rawRedacted?.substring(0, 200));
        let redactedTexts = rawRedacted ? normalizeBatchTextParsed(rawRedacted) : [];
        let rephrasedTexts = rawRephrased ? normalizeBatchTextParsed(rawRephrased) : [];
        // Debug: Log the parsed results (after initialization to avoid ReferenceError)
        console.log(`${logPrefix} [DEBUG] Parsed redactedTexts:`, redactedTexts.map((text, idx) => ({ idx, text: text?.substring(0, 50) })));
        console.log(`${logPrefix} [DEBUG] Parsed rephrasedTexts:`, rephrasedTexts.map((text, idx) => ({ idx, text: text?.substring(0, 50) })));
        if (requestRedaction && redactedTexts.length === 0) {
          console.warn(`${logPrefix} [POSTPROCESS] Redaction parse returned 0 items; filling ${expectedRedactCount} blanks`);
          redactedTexts = new Array(expectedRedactCount).fill('');
        }
        if (requestRephrase && rephrasedTexts.length === 0) {
          console.warn(`${logPrefix} [POSTPROCESS] Rephrase parse returned 0 items; filling ${expectedRephraseCount} blanks`);
          rephrasedTexts = new Array(expectedRephraseCount).fill('');
        }
        
        console.log(`${logPrefix} [POSTPROCESS] Parsed redactedTexts: ${redactedTexts.length} items`);
        console.log(`${logPrefix} [POSTPROCESS] Parsed rephrasedTexts: ${rephrasedTexts.length} items`);
        
        // Validate parsed results
        if ((requestRedaction && redactedTexts.length === 0) || (requestRephrase && rephrasedTexts.length === 0)) {
          console.warn(`${logPrefix} [POSTPROCESS] WARNING: Parsed results empty after fill; proceeding with fallbacks`);
        }

        // Handle ID-tagged responses and realign by index
        console.log(`${logPrefix} [POSTPROCESS] Handling ID-tagged responses...`);
        const idTag = /^\s*<<<(?:ID|ITEM)\s+(\d+)>>>\s*/i;
        const stripAndIndex = (arr: string[]) => arr.map(s => {
          const m = idTag.exec(s || '');
          return { idx: m ? parseInt(m[1], 10) : null, text: m ? s.replace(idTag, '').trim() : (s || '').trim() };
        });
        
        const redIdx = stripAndIndex(redactedTexts);
        const rephIdx = stripAndIndex(rephrasedTexts);
        const allRedHaveIds = !requestRedaction || redIdx.length === 0 || redIdx.every(x => x.idx != null);
        const allRephHaveIds = !requestRephrase || rephIdx.length === 0 || rephIdx.every(x => x.idx != null);
        const allHaveIds = allRedHaveIds && allRephHaveIds;
        
        console.log(`${logPrefix} [POSTPROCESS] ID handling - allHaveIds: ${allHaveIds}, redIdx: ${redIdx.length}, rephIdx: ${rephIdx.length}`);
        
        // Build full-length arrays aligned to chunk positions
        const expected = chunk.length;
        let redactedTextsAligned: string[] = Array(expected).fill('');
        let rephrasedTextsAligned: string[] = Array(expected).fill('');
        if (allHaveIds) {
          const byId = (list: { idx: number|null; text: string }[]) => {
            const out: string[] = Array(expected).fill('');
            for (const it of list) {
              if (it.idx != null) {
                const commentIndex = chunk.findIndex(c => 
                  (c.originalRow && c.originalRow === it.idx) || 
                  (c.scannedIndex && c.scannedIndex === it.idx)
                );
                if (commentIndex >= 0 && commentIndex < expected) {
                  out[commentIndex] = it.text;
                }
              }
            }
            return out;
          };
          if (requestRedaction) {
            redactedTextsAligned = byId(redIdx).map(enforceRedactionPolicy) as string[];
          }
          if (requestRephrase) {
            rephrasedTextsAligned = byId(rephIdx);
          }
          console.log(`${logPrefix} [POSTPROCESS] Realigned by ID - redactedTextsAligned: ${redactedTextsAligned.length}, rephrasedTextsAligned: ${rephrasedTextsAligned.length}`);
        } else {
          // Sequential alignment per subset order: map outputs to the subset item positions
          if (requestRedaction) {
            let k = 0;
            for (let i = 0; i < expected; i++) {
              if (chunk[i]?.identifiable || chunk[i]?.concerning) {
                const val = redactedTexts[k++] ?? '';
                redactedTextsAligned[i] = enforceRedactionPolicy(val) as string;
              }
            }
          }
          if (requestRephrase) {
            let k = 0;
            for (let i = 0; i < expected; i++) {
              if (chunk[i]?.identifiable || chunk[i]?.concerning) {
                rephrasedTextsAligned[i] = rephrasedTexts[k++] ?? '';
              }
            }
          }
          console.log(`${logPrefix} [POSTPROCESS] Sequential subset alignment applied`);
        }

        // Process each comment in the chunk
        console.log(`${logPrefix} [POSTPROCESS] Processing ${chunk.length} comments in chunk...`);
        console.log(`${logPrefix} [DEBUG] redactedTextsAligned:`, redactedTextsAligned.map((text, idx) => ({ idx, text: text?.substring(0, 50) })));
        console.log(`${logPrefix} [DEBUG] rephrasedTextsAligned:`, rephrasedTextsAligned.map((text, idx) => ({ idx, text: text?.substring(0, 50) })));
        for (let i = 0; i < chunk.length; i++) {
          const comment = chunk[i];
          // Capture AI outputs for both phases for all flagged comments
          const redCandidate = redactedTextsAligned[i] || '';
          let redactedText = redCandidate.trim().length > 0
            ? redCandidate
            : (comment.identifiable ? (enforceRedactionPolicy(comment.text) || comment.text) : comment.text);
          const rephCandidate = rephrasedTextsAligned[i] || '';
          const rephrasedText = rephCandidate.trim().length > 0 ? rephCandidate : comment.text;
          const hasAIRedaction = requestRedaction && redCandidate.trim().length > 0;
          const hasAIRephrase = requestRephrase && rephCandidate.trim().length > 0;
          
          // Enforce policy-driven mode regardless of incoming mode
          let mode: 'redact' | 'rephrase' | 'original';
          if (comment.identifiable) {
            mode = defaultMode; // honor user preference for identifiable
          } else if (comment.concerning) {
            mode = 'rephrase'; // concerning-only must be rephrase-only
          } else {
            mode = 'original';
          }

          let finalText = comment.text;
          
          // Apply the appropriate transformation based on enforced mode
          if (mode === 'redact') {
            finalText = redactedText;
            redactedCount++;
          } else if (mode === 'rephrase') {
            finalText = rephrasedText;
            rephrasedCount++;
          } else {
            originalCount++;
          }

          processedComments.push({
            id: comment.id,
            originalRow: comment.originalRow, // Preserve originalRow for proper ID tracking
            scannedIndex: comment.scannedIndex, // Preserve scannedIndex
            // Only include AI-derived fields to prevent fallback from overwriting better results later
            redactedText: hasAIRedaction ? redactedText : undefined,
            rephrasedText: hasAIRephrase ? rephrasedText : undefined,
            finalText,
            mode
          });
        }
        }
      }
    } catch (error) {
      console.error('[POSTPROCESS] Error during AI processing:', error);
      
      // Fallback: process comments individually without AI
      console.log('[POSTPROCESS] Falling back to individual processing due to AI error');
      for (const comment of flaggedComments) {
        let mode = comment.mode;
        if (!mode) {
          if (comment.identifiable) {
            mode = defaultMode;
          } else if (comment.concerning) {
            mode = 'rephrase';
          } else {
            mode = 'original';
          }
        }

        let finalText = comment.text;
        let redactedText = comment.text;
        let rephrasedText = comment.text;

        if (mode === 'redact' && (comment.identifiable || comment.concerning)) {
          // Deterministic minimal redaction fallback
          redactedText = enforceRedactionPolicy(comment.text) || comment.text;
          finalText = redactedText;
          redactedCount++;
        } else if (mode === 'rephrase' && (comment.identifiable || comment.concerning)) {
          // Fallback: keep original text; in UI user can switch modes
          rephrasedText = comment.text;
          finalText = rephrasedText;
          rephrasedCount++;
        } else {
          originalCount++;
        }

        processedComments.push({
          id: comment.id,
          originalRow: comment.originalRow, // Preserve originalRow for proper ID tracking
          scannedIndex: comment.scannedIndex, // Preserve scannedIndex for proper lookup
          redactedText,
          rephrasedText,
          finalText,
          mode
        });
      }
    }

    // Add unprocessed comments
    const unprocessedComments = comments.filter(c => !c.concerning && !c.identifiable)
    for (const comment of unprocessedComments) {
      processedComments.push({
        id: comment.id,
        originalRow: comment.originalRow, // Preserve originalRow for proper ID tracking
        scannedIndex: comment.scannedIndex, // Preserve scannedIndex for proper lookup
        finalText: comment.text,
        mode: 'original'
      })
      originalCount++
    }

         const totalRunTimeMs = Date.now() - overallStartTime;
     
     const response: PostProcessResponse = {
       success: true,
       processedComments,
       summary: {
         total: comments.length,
         redacted: redactedCount,
         rephrased: rephrasedCount,
         original: originalCount
       },
       totalRunTimeMs: totalRunTimeMs
     }

     console.log(`${logPrefix} [POSTPROCESS] Completed: ${redactedCount} redacted, ${rephrasedCount} rephrased, ${originalCount} original`)
     console.log(`${logPrefix} [TIMING] Total run time: ${totalRunTimeMs}ms (${(totalRunTimeMs / 1000).toFixed(1)}s)`)

     return new Response(
       JSON.stringify(response),
       { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
     )

  } catch (error) {
    console.error('[POSTPROCESS] Error:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
