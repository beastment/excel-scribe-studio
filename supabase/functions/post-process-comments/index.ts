/// <reference path="./types.cursor.d.ts" />
// @ts-nocheck
// Prefer deno.json imports. Fallback to URL imports if editor ignores mappings.
// @ts-ignore - Editor-only: URL/bare imports are resolved by Deno at runtime
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// @ts-ignore - Editor-only: URL imports are resolved by Deno at runtime
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1"
import { AILogger } from './ai-logger.ts';

// Editor-only ambient type to suppress "Cannot find name 'Deno'" in non-Deno TS servers
declare const Deno: { env: { get: (key: string) => string | undefined } };

// Ambient declarations for Cursor TS to understand Deno URL imports and globals
// These do not affect runtime in Deno; they only quiet local TypeScript in the editor
declare module "https://deno.land/std@0.168.0/http/server.ts" {
  export const serve: any;
}
declare module "https://esm.sh/@supabase/supabase-js@2" {
  export const createClient: any;
}
declare module "https://esm.sh/@supabase/supabase-js@2.7.1" {
  export const createClient: any;
}

const buildCorsHeaders = (origin: string | null) => ({
  'Access-Control-Allow-Origin': origin || '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Max-Age': '86400',
  'Access-Control-Allow-Credentials': 'true',
  'Vary': 'Origin'
});

// Timeout utilities (configurable via environment) //
function getTimeoutMs(envKey: string, fallbackMs: number): number {
  const raw = (((globalThis as any).Deno?.env?.get(envKey) as string) || undefined);
  const parsed = raw ? Number(raw) : NaN;
  if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed);
  return fallbackMs;
}

function seconds(ms: number): number {
  return Math.round(ms / 1000);
}

// Default timeouts can be overridden via env vars
// Using 140s as default to remain below 150s edge caps
const POSTPROCESS_REQUEST_TIMEOUT_MS = getTimeoutMs("POSTPROCESS_AI_REQUEST_TIMEOUT_MS", 140000);
const POSTPROCESS_BEDROCK_TIMEOUT_MS = getTimeoutMs("POSTPROCESS_BEDROCK_REQUEST_TIMEOUT_MS", 140000);

// Simple delay utility
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// RPM pacing tracker per provider/model
const lastCallStartByModel: Map<string, number> = new Map();
async function enforceRpmDelay(provider: string, model: string, rpmLimit?: number): Promise<void> {
  if (!rpmLimit || rpmLimit <= 0) return;
  const key = `${provider}/${model}`;
  const minIntervalMs = Math.ceil(60000 / rpmLimit);
  const now = Date.now();
  const last = lastCallStartByModel.get(key) ?? 0;
  const waitMs = Math.max(0, minIntervalMs - (now - last));
  if (waitMs > 0) {
    console.log(`[RPM] ${key} waiting ${waitMs}ms (rpm=${rpmLimit})`);
    await delay(waitMs);
  }
  lastCallStartByModel.set(key, Date.now());
}

// Utility functions
function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
/////

function getEffectiveMaxTokens(config: any, logPrefix?: string): number {
  const explicit = config?.max_tokens;
  const lp = logPrefix ? `${logPrefix} ` : '';
  console.log(`${lp}[getEffectiveMaxTokens] Input config:`, { 
    provider: config?.provider, 
    model: config?.model, 
    explicit_max_tokens: explicit 
  });
  if (explicit && explicit > 0) {
    console.log(`${lp}[getEffectiveMaxTokens] Using explicit max_tokens:`, explicit);
    return Math.floor(explicit);
  }
  const provider = String(config?.provider || '').toLowerCase();
  const model = String(config?.model || '').toLowerCase();
  if (provider === 'bedrock') {
    if (model.includes('anthropic.claude')) {
      return 4096;
    }
    if (model.startsWith('mistral.')) return 4096;
    if (model.startsWith('amazon.titan')) return 2000; // Fallback only - should use output_token_limit from model config
  }
  if (provider === 'openai' || provider === 'azure') return 4096;
  console.log(`${lp}[getEffectiveMaxTokens] Using default fallback: 2000`);
  return 2000; // Fallback only - should use output_token_limit from model config
}

// Default batch size for post-processing - will be dynamically calculated based on model limits //
// Note: Hard cap removed - batch size now determined purely by token limits and RPM constraints

const buildBatchTextPrompt = (basePrompt: string, expectedLen: number): string => {
  const sentinels = `BOUNDING AND ORDER RULES:\n- Each comment is delimited by explicit sentinels: <<<ITEM k>>> ... <<<END k>>>.\n- Treat EVERYTHING between these sentinels as ONE single comment, even if multi-paragraph or contains lists/headings.\n- Do NOT split or merge any comment segments.\nOUTPUT RULES:\n- Return ONLY a JSON array of ${expectedLen} strings, aligned to ids (1..${expectedLen}).\n- CRITICAL: Each string MUST BEGIN with the exact prefix <<<ITEM k>>> followed by a space, then the full text for k.\n- Do NOT output any headers such as "Rephrased comment:" or "Here are...".\n- Do NOT include any <<<END k>>> markers in the output.\n- Do NOT emit standalone array tokens like "[" or "]" as array items.\n- No prose, no code fences, no explanations before/after the JSON array.\n- IMPORTANT: The <<<ITEM k>>> prefix is ONLY for identification - do NOT include <<<END k>>> markers anywhere in your output.\n`;
  return `${basePrompt}\n\n${sentinels}`;
};

const buildSentinelInput = (texts: string[], comments?: any[]): string => {
  if (comments && comments.length > 0) {
    // Use the same ID system as scan-comments: originalRow if available, otherwise scannedIndex, fallback to i+1
    return `Comments to analyze (each bounded by sentinels):\n\n${texts.map((t, i) => {
      const comment = comments[i];
      const orowRaw = comment?.originalRow;
      const sidxRaw = comment?.scannedIndex;
      const orow = typeof orowRaw === 'string' ? parseInt(orowRaw, 10) : orowRaw;
      const sidx = typeof sidxRaw === 'string' ? parseInt(sidxRaw, 10) : sidxRaw;
      const itemId = (typeof orow === 'number' && Number.isFinite(orow)) ? orow : (typeof sidx === 'number' && Number.isFinite(sidx) ? sidx : (i + 1));
      return `<<<ITEM ${itemId}>>>\n${t}\n<<<END ${itemId}>>>`;
    }).join('\n\n')}`;
  } else {
    // Fallback to sequential numbering if no comment objects provided
    // Align with UI row numbers starting at 2 (header at 1)
    return `Comments to analyze (each bounded by sentinels):\n\n${texts.map((t, i) => `<<<ITEM ${i + 2}>>>\n${t}\n<<<END ${i + 2}>>>`).join('\n\n')}`;
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
async function callAI(provider: string, model: string, prompt: string, input: string, responseType: string, maxTokens?: number, userId?: string, scanRunId?: string, phase?: string, aiLogger?: AILogger, temperature?: number, logPrefix?: string, timeoutOverrideMs?: number) {
  const lp = logPrefix ? `${logPrefix} ` : '';
  const payload = {
    messages: [
      { role: 'system', content: prompt },
      { role: 'user', content: input }
    ],
    temperature: temperature || 0,
    max_tokens: maxTokens || 4096
  };

  console.log(`${lp}[CALL_AI] ${provider}/${model} max_tokens=${maxTokens || 4096}, temperature=${temperature || 0}`);
  console.log(`${lp}[CALL_AI_DEBUG] Provider: ${provider}, Model: ${model}, MaxTokens: ${maxTokens}, Temperature: ${temperature}`);

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
    const effectiveTimeoutMs = Math.max(1000, Math.min(POSTPROCESS_REQUEST_TIMEOUT_MS, timeoutOverrideMs || POSTPROCESS_REQUEST_TIMEOUT_MS));
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), effectiveTimeoutMs); // configurable
    
    const callStart = Date.now();
    console.log(`${lp}[CALL_AI_TIMING] azure/${model} start`);
    const heartbeatId = setInterval(() => {
      try {
        console.log(`${lp}[CALL_AI_TIMING] azure/${model} heartbeat ${Date.now() - callStart}ms`);
      } catch (_) {
        // ignore logging errors
      }
    }, 15000);
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
      clearInterval(heartbeatId);
      console.log(`${lp}[CALL_AI_TIMING] azure/${model} took ${Date.now() - callStart}ms`);

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
      clearInterval(heartbeatId);
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
    const effectiveTimeoutMs = Math.max(1000, Math.min(POSTPROCESS_REQUEST_TIMEOUT_MS, timeoutOverrideMs || POSTPROCESS_REQUEST_TIMEOUT_MS));
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), effectiveTimeoutMs); // configurable
    
    let response;
    const callStart = Date.now();
    console.log(`${lp}[CALL_AI_TIMING] openai/${model} start`);
    const heartbeatId = setInterval(() => {
      try {
        console.log(`${lp}[CALL_AI_TIMING] openai/${model} heartbeat ${Date.now() - callStart}ms`);
      } catch (_) {
        // ignore logging errors
      }
    }, 15000);
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
      clearInterval(heartbeatId);
      console.log(`${lp}[CALL_AI_TIMING] openai/${model} took ${Date.now() - callStart}ms`);

      if (!response.ok) {
        const errorMessage = `OpenAI API error: ${response.status} ${response.statusText}`;
        if (aiLogger && userId && scanRunId && phase) {
          await aiLogger.logResponse(userId, scanRunId, 'post-process-comments', provider, model, responseType, phase, '', errorMessage, undefined);
        }
        throw new Error(errorMessage);
      }
    } catch (error) {
      clearTimeout(timeoutId);
      clearInterval(heartbeatId);
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
    const effectiveTimeoutMs = Math.max(1000, Math.min(POSTPROCESS_BEDROCK_TIMEOUT_MS, timeoutOverrideMs || POSTPROCESS_BEDROCK_TIMEOUT_MS));
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), effectiveTimeoutMs); // configurable
    const callStart = Date.now();
    console.log(`${lp}[CALL_AI_TIMING] bedrock/${model} start`);
    const heartbeatId = setInterval(() => {
      try {
        console.log(`${lp}[CALL_AI_TIMING] bedrock/${model} heartbeat ${Date.now() - callStart}ms`);
      } catch (_) {
        // ignore logging errors
      }
    }, 15000);
    try {
      const region = (((globalThis as any).Deno?.env?.get('AWS_REGION') as string) || 'us-east-1');
      const accessKeyId = (((globalThis as any).Deno?.env?.get('AWS_ACCESS_KEY_ID') as string) || undefined);
      const secretAccessKey = (((globalThis as any).Deno?.env?.get('AWS_SECRET_ACCESS_KEY') as string) || undefined);
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
      clearInterval(heartbeatId);
      console.log(`${lp}[CALL_AI_TIMING] bedrock/${modelId} took ${Date.now() - callStart}ms`);
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
      clearInterval(heartbeatId);
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

  
  // Helper function to clean up any remaining sentinel markers
  const cleanSentinels = (text: string): string => {
    return text
      .replace(/<<<END\s+\d+>>>/gi, '') // Remove END markers
      .trim();
  };

  // Check for the specific sequence "\n as comment boundary FIRST - before any other processing
  const content = String(parsed || '');
  if (content.includes('"\n')) {
    
    // Split on "\n to separate comments
    const commentParts = content.split('"\n');
    
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
          return cleaned;
        }
        
        return null;
      })
      .filter((s): s is string => typeof s === 'string' && s.length > 0);
    
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
      .filter((s): s is string => typeof s === 'string' && s.length > 0)
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
  
  // Check if this is a JSON array (the AI might return the entire array as a string) //
  if (content.trim().startsWith('[')) {
    try {
      const jsonArray = JSON.parse(content);
      if (Array.isArray(jsonArray)) {
        const result = jsonArray.map(item => {
          if (typeof item === 'string') {
            const cleaned = cleanSentinels(item.trim());
            return cleaned;
          } else if (typeof item === 'object' && item !== null) {
            // Handle JSON objects with redacted/rephrased/text fields
            if (item.redacted) {
              const cleaned = cleanSentinels(item.redacted);
              return cleaned;
            }
            if (item.rephrased) {
              const cleaned = cleanSentinels(item.rephrased);
              return cleaned;
            }
            if (item.text) {
              const cleaned = cleanSentinels(item.text);
              return cleaned;
            }
            // Fallback to stringifying the object
            const cleaned = cleanSentinels(JSON.stringify(item));
            return cleaned;
          } else {
            const cleaned = cleanSentinels(String(item));
            return cleaned;
          }
        }).filter(s => s.length > 0);
        return result;
      }
    } catch (e) {
      
      // Try to parse incomplete JSON by recognizing comment boundaries
      // Pattern to match JSON objects with index and redacted/rephrased fields
      // Handles cases where the JSON is truncated mid-sentence
      const incompleteJsonPattern = /{\s*"index"\s*:\s*\d+\s*,\s*"(?:redacted|rephrased)"\s*:\s*"([^"]*(?:\\.[^"]*)*)"\s*}(?:\s*,|\s*$)/g;
      const matches = [...content.matchAll(incompleteJsonPattern)];
      
      if (matches.length > 0) {
        const result = matches.map(match => {
          const text = match[1].replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\t/g, '\t');
          const cleaned = cleanSentinels(text);
          return cleaned;
        }).filter(s => s.length > 0);
        return result;
      }
      
      // Alternative pattern for cases where the JSON structure is more broken
      // Look for patterns like: "rephrased": "text content here"
      const alternativePattern = /"(?:redacted|rephrased)"\s*:\s*"([^"]*(?:\\.[^"]*)*)"\s*(?:,|\s*})/g;
      const altMatches = [...content.matchAll(alternativePattern)];
      
      if (altMatches.length > 0) {
        const result = altMatches.map(match => {
          const text = match[1].replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\t/g, '\t');
          const cleaned = cleanSentinels(text);
          return cleaned;
        }).filter(s => s.length > 0);
        return result;
      }
    }
  }

  const result = [String(parsed || '')];
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
    temperature?: number;
    // New: choose redaction output mode: "full_text" (default) or "spans" to return substring lists
    redaction_output_mode?: 'full_text' | 'spans';
    // Optional: minimum substring length to accept when applying spans
    span_min_length?: number;
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

async function waitForDbRpmGate(supabase: any, provider: string, model: string, rpmLimit?: number, logPrefix?: string): Promise<void> {
  if (!rpmLimit || rpmLimit <= 0) return;
  const windowMs = 60000;
  const jitter = () => Math.floor(50 + Math.random() * 100);
  while (true) {
    try {
      const sinceIso = new Date(Date.now() - windowMs).toISOString();
      const { data, error } = await supabase
        .from('ai_logs')
        .select('id, created_at')
        .eq('provider', provider)
        .eq('model', model)
        .gte('created_at', sinceIso)
        .in('response_status', ['pending', 'success'])
        .order('created_at', { ascending: true });
      if (error) {
        console.warn(`${logPrefix || ''} [RPM_DB] Query error, proceeding without gate:`, error.message);
        return;
      }
      const recent = Array.isArray(data) ? data : [];
      if (recent.length < rpmLimit) return;
      // Compute wait time until the oldest of the last rpmLimit entries exits the window
      const cutoffIdx = Math.max(0, recent.length - rpmLimit);
      const windowStart = new Date(recent[cutoffIdx].created_at).getTime();
      const waitMs = Math.max(0, windowMs - (Date.now() - windowStart)) + jitter();
      if (waitMs <= 0) return;
      console.log(`${logPrefix || ''} [RPM_DB] Throttling ${provider}/${model}: recent=${recent.length} >= rpm=${rpmLimit}, sleeping ${waitMs}ms`);
      await delay(waitMs);
    } catch (e) {
      console.warn(`${logPrefix || ''} [RPM_DB] Unexpected error, proceeding:`, e instanceof Error ? e.message : String(e));
      return;
    }
  }
}

// Recent-duplicate finder: skip identical request_input within a short TTL window, regardless of scanRunId
async function findRecentDuplicateLog(
  supabase: any,
  provider: string,
  model: string,
  phase: string,
  requestInput: string,
  ttlMs: number,
  logPrefix?: string
): Promise<{ id: string } | null> {
  try {
    const sinceIso = new Date(Date.now() - Math.max(1000, ttlMs)).toISOString();
    const { data, error } = await supabase
      .from('ai_logs')
      .select('id, created_at, response_status')
      .eq('function_name', 'post-process-comments')
      .eq('provider', provider)
      .eq('model', model)
      .eq('phase', phase)
      .eq('request_type', 'batch_text')
      .eq('request_input', requestInput)
      .gte('created_at', sinceIso)
      .in('response_status', ['pending', 'success'])
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) {
      console.warn(`${logPrefix || ''} [DEDUP_DB] Query failed; proceeding without dedup:`, error.message);
      return null;
    }
    if (Array.isArray(data) && data.length > 0) {
      return { id: String((data[0] as any).id) };
    }
  } catch (e) {
    console.warn(`${logPrefix || ''} [DEDUP_DB] Unexpected error; proceeding:`, e instanceof Error ? e.message : String(e));
  }
  return null;
}

serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = buildCorsHeaders(origin);
  // CORS: origin logging removed to reduce noise
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
    const effectiveRunId = String(scanRunId ?? runId);
    const logPrefix = `[RUN ${runId}]`;
    // Global per-process de-duplication set for batches within the same edge isolate
    const gAny: any = globalThis as any;
    if (!gAny.__ppBatches) gAny.__ppBatches = new Set<string>();
    const ppBatches: Set<string> = gAny.__ppBatches as Set<string>;

    // Reduced scanConfig debug logging

    // Test database connection and verify we're hitting the right database
    const { data: testData, error: testError } = await supabase
      .from('model_configurations')
      .select('provider, model, output_token_limit')
      .eq('provider', 'bedrock')
      .limit(5);
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

    // Get batch sizing configuration for safety margin and IO ratios
    const { data: batchSizingData } = await supabase
      .from("batch_sizing_config")
      .select("*")
      .single();
    
    const safetyMarginPercent = typeof batchSizingData?.safety_margin_percent === "number" ? batchSizingData.safety_margin_percent : 10;
    const redactionIoRatio = typeof batchSizingData?.redaction_io_ratio === "number" ? batchSizingData.redaction_io_ratio : 1.7;
    const rephraseIoRatio = typeof batchSizingData?.rephrase_io_ratio === "number" ? batchSizingData.rephrase_io_ratio : 2.3;
    console.log(`${logPrefix} [POSTPROCESS] Safety margin: ${safetyMarginPercent}%`);
    console.log(`${logPrefix} [POSTPROCESS] I/O ratios: redaction=${redactionIoRatio}, rephrase=${rephraseIoRatio}`);

    let actualMaxTokens = getEffectiveMaxTokens(scanConfig, logPrefix);
    // Initial token estimation logs reduced
    if (modelCfgError) {
      console.warn(`${logPrefix} [POSTPROCESS] Warning: Could not fetch model_configurations, using defaults:`, modelCfgError.message);
    } else {
      actualMaxTokens = modelCfg?.output_token_limit || getEffectiveMaxTokens(scanConfig, logPrefix);
      console.log(`${logPrefix} [POSTPROCESS] Using max_tokens from model_configurations: ${actualMaxTokens}, model_temperature=${modelCfg?.temperature}`);
    }

    const effectiveTemperature = (aiCfg && typeof aiCfg.temperature === 'number')
      ? aiCfg.temperature
      : (typeof modelCfg?.temperature === 'number' ? modelCfg.temperature : (typeof (scanConfig as any).temperature === 'number' ? (scanConfig as any).temperature : 0));

    // Determine shared conservative output limit across BOTH scan models (scan_a and scan_b)
    // regardless of which model is being processed in this request
    const parseProviderModel = (modelStr: string | undefined): { provider: string | null; model: string | null } => {
      if (!modelStr) return { provider: null, model: null };
      const parts = modelStr.split('/');
      if (parts.length === 2) return { provider: parts[0], model: parts[1] };
      const lower = modelStr.toLowerCase();
      if (lower.startsWith('anthropic.') || lower.startsWith('mistral.') || lower.startsWith('amazon.titan')) {
        return { provider: 'bedrock', model: modelStr };
      }
      if (lower.startsWith('gpt') || lower.includes('gpt-4') || lower.includes('gpt-4o')) {
        return { provider: 'openai', model: modelStr };
      }
      return { provider: null, model: modelStr };
    };

    const uniqueModels = new Map<string, { provider: string; model: string }>();
    for (const c of comments) {
      const a = parseProviderModel(c.scanAResult?.model);
      const b = parseProviderModel(c.scanBResult?.model);
      if (a.provider && a.model) uniqueModels.set(`${a.provider}/${a.model}`, { provider: a.provider, model: a.model });
      if (b.provider && b.model) uniqueModels.set(`${b.provider}/${b.model}`, { provider: b.provider, model: b.model });
    }
    // Always include the incoming scanConfig too
    uniqueModels.set(`${scanConfig.provider}/${scanConfig.model}`, { provider: scanConfig.provider, model: scanConfig.model });

    let sharedConservativeOutputLimit = Infinity;
    for (const { provider, model } of uniqueModels.values()) {
      const { data: mc, error: mcErr } = await supabase
        .from('model_configurations')
        .select('*')
        .eq('provider', provider)
        .eq('model', model)
        .single();
      const limit = (mc && typeof mc.output_token_limit === 'number')
        ? mc.output_token_limit
        : getEffectiveMaxTokens({ provider, model });
      sharedConservativeOutputLimit = Math.min(sharedConservativeOutputLimit, limit);
    }
    if (!Number.isFinite(sharedConservativeOutputLimit)) {
      sharedConservativeOutputLimit = getEffectiveMaxTokens(scanConfig);
    }
    const sharedOutputLimitSafe = Math.max(1, Math.floor(sharedConservativeOutputLimit * (1 - (safetyMarginPercent / 100))));
    console.log(`${logPrefix} [BATCH_CALC] Shared conservative output limit across models: ${sharedConservativeOutputLimit}, safe=${sharedOutputLimitSafe}`);

    const tokensPerComment = aiCfg?.tokens_per_comment || 13;
    console.log(`${logPrefix} [POSTPROCESS] Using tokens_per_comment: ${tokensPerComment} (for reference, post-processing uses I/O ratios)`);

    // Get rate limits
    const tpmLimit = modelCfg?.tpm_limit;
    const rpmLimit = modelCfg?.rpm_limit;
    console.log(`${logPrefix} [POSTPROCESS] TPM limit: ${tpmLimit || 'none'}, RPM limit: ${rpmLimit || 'none'} for ${scanConfig.provider}/${scanConfig.model}`);

    // Use the actual max_tokens from model_configurations
    const effectiveConfig = {
      ...scanConfig,
      // Force the max_tokens to the shared conservative safe limit so both models use the same cap
      max_tokens: sharedOutputLimitSafe,
      temperature: effectiveTemperature,
      tpm_limit: tpmLimit,
      rpm_limit: rpmLimit
    };

    // Filter comments that need post-processing
    const flaggedComments = comments.filter(c => c.concerning || c.identifiable)
    const needsProcessing = flaggedComments.length > 0

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
    const processedComments: PostProcessResponse["processedComments"] = []
    let redactedCount = 0
    let rephrasedCount = 0
    let originalCount = 0

    try {
      // Calculate optimal batch size based on model limits and actual comment sizes //
      let optimalBatchSize = 1; // Initialize with minimum value, will be updated based on token limits
      
      // Calculate actual token usage for better batch sizing
      const avgCommentLength = flaggedComments.reduce((sum, c) => sum + (c.originalText || c.text || '').length, 0) / flaggedComments.length;
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
      
      // Use token-based limit directly (no hard cap)
      optimalBatchSize = maxBatchByTokens;
      

      
      // Apply configurable safety margin
      const safetyMultiplier = 1 - (safetyMarginPercent / 100);
      const safetyBatchSize = Math.floor(optimalBatchSize * safetyMultiplier);
      if (safetyBatchSize < optimalBatchSize) {
        console.log(`${logPrefix} [BATCH_CALC] Applied safety margin: ${optimalBatchSize} → ${safetyBatchSize} (${safetyMarginPercent}% of max)`);
        optimalBatchSize = safetyBatchSize;
      }
      
      console.log(`${logPrefix} [BATCH_CALC] Final optimal batch size: ${optimalBatchSize}`);
      console.log(`${logPrefix} [BATCH_CALC] Calculation breakdown: maxBatchByTokens=${maxBatchByTokens}, safetyMarginPercent=${safetyMarginPercent}%`);
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
      for (const c of flaggedComments) {
        const { provider, model } = pickModelForComment(c);
        const key = `${provider}/${model}`;
        if (!groups.has(key)) groups.set(key, { provider, model, items: [] });
        groups.get(key)!.items.push(c);
      }

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

      // Build per-model state with contexts and chunks first
      type Ctx = { chunk: any[]; sentinelRed: string; sentinelReph: string; promptRed: string; promptReph: string; rawRed?: string|null; rawReph?: string|null };
      const groupStates: Array<{ key: string; group: Group; groupModelCfg: any; contexts: Ctx[] }> = [];

      for (const [key, group] of groups.entries()) {
        const cached = groupCfgCache.get(key) as { cfg: any, err: any } | undefined;
        const groupModelCfg = cached?.cfg;
        const groupModelCfgError = cached?.err;
        let groupMaxTokens = getEffectiveMaxTokens({ provider: group.provider, model: group.model });
        if (!groupModelCfgError && groupModelCfg) {
          groupMaxTokens = groupModelCfg.output_token_limit || groupMaxTokens;
        } else if (groupModelCfgError) {
          console.warn(`${logPrefix} [POSTPROCESS] Warning: Could not fetch model_configurations for ${key}:`, groupModelCfgError?.message);
        }

        const buildTokenAwareChunks = (
          items: any[],
          phaseMode: 'both' | 'redaction' | 'rephrase',
          inputLimit: number,
          outputLimit: number,
          basePromptReserve: number,
          inputTokensPerCharEstimate: number,
          ioRedact: number,
          ioRephrase: number,
          maxItemsCap: number,
          perItemPromptOverhead: number
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
              const inputTokens = Math.ceil(text.length / 5);
              const outRedact = Math.ceil(inputTokens * ioRedact);
              const outRephrase = Math.ceil(inputTokens * ioRephrase);
              const nextSumInput = sumInput + inputTokens;
              const nextSumOutRedact = sumOutRedact + outRedact;
              const nextSumOutRephrase = sumOutRephrase + outRephrase;
              const dynamicPromptReserve = basePromptReserve + (chunk.length + 1) * perItemPromptOverhead;
              const inputOk = (nextSumInput + dynamicPromptReserve) <= inputLimit;
              const redactOk = (phaseMode !== 'rephrase') ? (nextSumOutRedact <= outputLimit) : true;
              const rephraseOk = (phaseMode !== 'redaction') ? (nextSumOutRephrase <= outputLimit) : true;
              const bothOk = phaseMode === 'both' ? (nextSumOutRedact <= outputLimit && nextSumOutRephrase <= outputLimit) : true;
              if (inputOk && redactOk && rephraseOk && bothOk) {
                chunk.push(item);
                sumInput = nextSumInput;
                sumOutRedact = nextSumOutRedact;
                sumOutRephrase = nextSumOutRephrase;
                i += 1;
                if (chunk.length >= maxItemsCap) break;
              } else {
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
        let maxItemsCap = Math.max(1, Math.min(optimalBatchSize, capItemsByOutput));
        const inputDerivedLimitSafe = (() => {
          const redIn = Math.floor(sharedOutputLimitSafe / Math.max(1, redactionIoRatio));
          const repIn = Math.floor(sharedOutputLimitSafe / Math.max(1, rephraseIoRatio));
          if (phaseMode === 'both') return Math.min(conservativeInputLimitSafe, redIn, repIn);
          if (phaseMode === 'redaction') return Math.min(conservativeInputLimitSafe, redIn);
          return Math.min(conservativeInputLimitSafe, repIn);
        })();

        const isClaude = group.model.toLowerCase().includes('claude');
        const charsPerToken = isClaude ? 3.5 : 4;
        const basePromptReserve = Math.min(1000, Math.max(300, Math.ceil(scanConfig.redact_prompt.length / charsPerToken)));
        const perItemPromptOverhead = 8;

        let chunks = buildTokenAwareChunks(
          group.items,
          phaseMode,
          inputDerivedLimitSafe,
          sharedOutputLimitSafe,
          basePromptReserve,
          5,
          redactionIoRatio,
          rephraseIoRatio,
          maxItemsCap,
          perItemPromptOverhead
        );
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

        const redactionMode = (scanConfig.redaction_output_mode === 'spans') ? 'spans' : 'full_text';
        const contexts: Ctx[] = chunks.map((ch) => {
          const baseSentinel = buildSentinelInput(ch.map((c: any) => c.originalText || c.text), ch);
          const promptRed = (() => {
            if (redactionMode === 'spans') {
              // Request JSON spans format per item index to minimize output tokens
              const instruction = `For each <<<ITEM k>>> return JSON array objects only with fields index and redact (array of exact substrings). Do not return rewritten text. Example: [{"index": 1, "redact": ["substring 1", "substring 2"]}, ...]`;
              return buildBatchTextPrompt(`${scanConfig.redact_prompt}\n\n${instruction}\nReturn only valid JSON with no extra commentary.`, ch.length);
            }
            return buildBatchTextPrompt(scanConfig.redact_prompt, ch.length);
          })();
          return {
            chunk: ch,
            sentinelRed: baseSentinel,
            sentinelReph: baseSentinel,
            promptRed,
            promptReph: buildBatchTextPrompt(scanConfig.rephrase_prompt, ch.length)
          };
        });

        groupStates.push({ key, group, groupModelCfg, contexts });
      }

      // Determine requested phase behavior (guard execution of phases)
      const requestPhaseMode: 'redaction' | 'rephrase' | 'both' = (phase === 'redaction' || phase === 'rephrase') ? phase : 'both';
      const runRedactionPhase = requestPhaseMode !== 'rephrase';
      const runRephrasePhase = requestPhaseMode !== 'redaction';

      // Phase 1: run redactions for all models in parallel (sequential within each model)
      if (runRedactionPhase) {
      await Promise.all(groupStates.map(async (state) => {
        const aiLogger = new AILogger();
        aiLogger.setFunctionStartTime(overallStartTime);
        for (const ctx of state.contexts) {
          const elapsedMs = Date.now() - overallStartTime;
          const HARD_CAP_MS = 148000;
          const remainingMs = Math.max(0, HARD_CAP_MS - elapsedMs);
          const dynamicTimeoutMs = Math.max(8000, Math.min(POSTPROCESS_BEDROCK_TIMEOUT_MS, remainingMs - 5000));
          await waitForDbRpmGate(supabase, state.group.provider, state.group.model, state.groupModelCfg?.rpm_limit ?? effectiveConfig.rpm_limit, logPrefix);
          try {
            const dup = await findRecentDuplicateLog(
              supabase,
              state.group.provider,
              state.group.model,
              'redaction',
              ctx.sentinelRed,
              2 * 60 * 1000,
              logPrefix
            );
            if (dup) {
              console.log(`${logPrefix} [DEDUP] Skipping duplicate redaction for ${state.group.provider}/${state.group.model}; recent log id=${dup.id}`);
              ctx.rawRed = null;
              continue;
            }
            ctx.rawRed = await callAI(
              state.group.provider,
              state.group.model,
              ctx.promptRed,
              ctx.sentinelRed,
              'batch_text',
              sharedOutputLimitSafe,
              user.id,
              scanRunId,
              'redaction',
              aiLogger,
              state.groupModelCfg?.temperature ?? effectiveConfig.temperature,
              logPrefix,
              dynamicTimeoutMs
            );
          } catch (_) {
            ctx.rawRed = null;
          }
        }
      }));
      } else {
        console.log(`${logPrefix} [POSTPROCESS] Skipping redaction phase per requestPhaseMode='${requestPhaseMode}'`);
      }

      // Phase 2: after all redactions complete, run rephrases for all models in parallel (sequential within each model)
      if (runRephrasePhase) {
      await Promise.all(groupStates.map(async (state) => {
        const aiLogger = new AILogger();
        aiLogger.setFunctionStartTime(overallStartTime);
        for (const ctx of state.contexts) {
          const elapsedMs = Date.now() - overallStartTime;
          const HARD_CAP_MS = 148000;
          const remainingMs = Math.max(0, HARD_CAP_MS - elapsedMs);
          const dynamicTimeoutMs = Math.max(8000, Math.min(POSTPROCESS_BEDROCK_TIMEOUT_MS, remainingMs - 5000));
          await waitForDbRpmGate(supabase, state.group.provider, state.group.model, state.groupModelCfg?.rpm_limit ?? effectiveConfig.rpm_limit, logPrefix);
          try {
            const dup = await findRecentDuplicateLog(
              supabase,
              state.group.provider,
              state.group.model,
              'rephrase',
              ctx.sentinelReph,
              2 * 60 * 1000,
              logPrefix
            );
            if (dup) {
              console.log(`${logPrefix} [DEDUP] Skipping duplicate rephrase for ${state.group.provider}/${state.group.model}; recent log id=${dup.id}`);
              ctx.rawReph = null;
              continue;
            }
            ctx.rawReph = await callAI(
              state.group.provider,
              state.group.model,
              ctx.promptReph,
              ctx.sentinelReph,
              'batch_text',
              sharedOutputLimitSafe,
              user.id,
              scanRunId,
              'rephrase',
              aiLogger,
              state.groupModelCfg?.temperature ?? effectiveConfig.temperature,
              logPrefix,
              dynamicTimeoutMs
            );
          } catch (_) {
            ctx.rawReph = null;
          }
        }
      }));
      } else {
        console.log(`${logPrefix} [POSTPROCESS] Skipping rephrase phase per requestPhaseMode='${requestPhaseMode}'`);
      }

      // Phase 3: parse/align and push results for all groups
      {
        const idTag = /^\s*<<<(?:ID|ITEM)\s+(\d+)>>>\s*/i;
        const stripAndIndex = (arr: string[]) => arr.map(s => {
          const m = idTag.exec(s || '');
          return { idx: m ? parseInt(m[1], 10) : null, text: m ? s.replace(idTag, '').trim() : (s || '').trim() };
        });
        /**
         * Apply redaction spans to a text using layered matching:
         * - Filter out very short strings
         * - Sort by length desc to reduce nested collisions
         * - Try literal replacement; then case-insensitive; then whitespace-normalized regex
         */
        const applyRedactionSpansToText = (original: string, spans: string[], minLen: number): string => {
          let out = String(original || "");
          const filtered = spans
            .map(s => String(s || "").trim())
            .filter(s => s.length >= Math.max(1, minLen));
          const sorted = filtered.sort((a, b) => b.length - a.length);
          const quoteClass = "[\"\u201C\u201D]"; // straight and curly double quotes
          const aposClass = "['\u2018\u2019]"; // straight and curly single quotes
          const wsClass = "[\\s\\u00A0\\u202F\\u2007]+"; // include common unicode spaces
          const buildFlexibleRegex = (text: string): RegExp => {
            // Escape regex meta
            let esc = text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            // Normalize whitespace to a Unicode-aware class
            esc = esc.replace(/\s+/g, wsClass);
            // Allow either straight or curly quotes/apostrophes
            esc = esc.replace(/\\\"/g, quoteClass); // escaped double quote becomes class
            esc = esc.replace(/'/g, aposClass);
            // Make surrounding quotes optional if present at both ends
            if (/^\s*".*"\s*$/i.test(text)) {
              esc = esc.replace(new RegExp(`^${quoteClass}`), `${quoteClass}?`).replace(new RegExp(`${quoteClass}$`), `${quoteClass}?`);
            }
            return new RegExp(esc, "gi");
          };
          const normalizeWithMap = (s: string): { norm: string; map: number[] } => {
            const map: number[] = [];
            let norm = "";
            for (let i = 0; i < s.length; i++) {
              const ch = s[i];
              const stripped = ch.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
              const lower = stripped.toLowerCase();
              norm += lower;
              for (let k = 0; k < lower.length; k++) map.push(i);
            }
            return { norm, map };
          };
          const replaceNormalizedOnce = (orig: string, target: string): string => {
            const { norm: nOrig, map } = normalizeWithMap(orig);
            const { norm: nTgt } = normalizeWithMap(target);
            const idx = nOrig.indexOf(nTgt);
            if (idx < 0) return orig;
            const start = map[idx] ?? 0;
            const end = (map[idx + nTgt.length - 1] ?? (start - 1)) + 1;
            if (end > start) {
              return orig.slice(0, start) + "XXXX" + orig.slice(end);
            }
            return orig;
          };
          for (const span of sorted) {
            if (!span) continue;
            // 1) Literal exact
            if (out.includes(span)) {
              out = out.split(span).join("XXXX");
              continue;
            }
            // 2) Case-insensitive
            const esc = span.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const ci = new RegExp(esc, "gi");
            if (ci.test(out)) {
              out = out.replace(ci, "XXXX");
              continue;
            }
            // 3) Flexible regex: whitespace/quotes tolerant
            const flex = buildFlexibleRegex(span);
            if (flex.test(out)) {
              out = out.replace(flex, "XXXX");
              continue;
            }
            // 3b) Diacritic-insensitive normalized find/replace
            const replaced = replaceNormalizedOnce(out, span);
            if (replaced !== out) {
              out = replaced;
              continue;
            }
            // 4) Token fallback: redact significant tokens when multi-word fails (longest-first)
            const tokens = span
              .split(/\s+/)
              .filter(t => t.length >= Math.max(minLen + 1, 4))
              .sort((a, b) => b.length - a.length);
            if (tokens.length >= 1) {
              for (const tok of tokens) {
                const tokEsc = tok.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                const tokRe = new RegExp(tokEsc, "gi");
                if (tokRe.test(out)) {
                  out = out.replace(tokRe, "XXXX");
                  continue;
                }
                // 4b) Unicode-tolerant token match: allow combining marks and zero-width chars between letters
                const chars = tok.split("");
                const between = "[\\u0300-\\u036f\\u200B\\u200C\\u200D]*"; // combining marks + zero-width chars
                const uniPattern = chars.map(ch => ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(between);
                try {
                  const uniRe = new RegExp(uniPattern, "giu");
                  if (uniRe.test(out)) {
                    out = out.replace(uniRe, "XXXX");
                  }
                } catch (_) {
                  // ignore malformed unicode regex (shouldn't happen)
                }
              }
            }
            // 5) Boundary safety for first/last token of any multi-word span
            const words = span.trim().split(/\s+/);
            if (words.length >= 2) {
              const firstTok = words[0];
              const lastTok = words[words.length - 1];
              const bEsc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
              if (firstTok.length >= minLen) {
                const re = new RegExp(`(^|[^A-Za-z])${bEsc(firstTok)}(?=[^A-Za-z]|$)`, "gi");
                out = out.replace(re, (m, p1) => `${p1}XXXX`);
              }
              if (lastTok.length >= minLen) {
                const re = new RegExp(`(^|[^A-Za-z])${bEsc(lastTok)}(?=[^A-Za-z]|$)`, "gi");
                out = out.replace(re, (m, p1) => `${p1}XXXX`);
              }
            }
            // 6) Last-chance word-level fallback: replace alphabetic words from span (length>=3)
            try {
              const alphaWords = (span.match(/[A-Za-z]{3,}/g) || []).sort((a, b) => b.length - a.length);
              const esc2 = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
              for (const w of alphaWords) {
                // ASCII word boundary
                const asciiRe = new RegExp(`(^|[^A-Za-z])${esc2(w)}(?=[^A-Za-z]|$)`, "gi");
                out = out.replace(asciiRe, (m, p1) => `${p1}XXXX`);
                // Unicode-tolerant boundary with allowed zero-width/combining between letters
                const between = "[\\u0300-\\u036f\\u200B\\u200C\\u200D]*";
                const chars = w.split("").map(c => esc2(c)).join(between);
                try {
                  const uniRe = new RegExp(`(^|[^\\p{L}])${chars}(?=[^\\p{L}]|$)`, "giu");
                  out = out.replace(uniRe, (m, p1) => `${p1}XXXX`);
                } catch (_) {
                  const uniAsciiRe = new RegExp(`(^|[^A-Za-z])${chars}(?=[^A-Za-z]|$)`, "gi");
                  out = out.replace(uniAsciiRe, (m, p1) => `${p1}XXXX`);
                }
              }
            } catch (_) {
              // ignore
            }
          }
          return out;
        };

        const redactionMode = (scanConfig.redaction_output_mode === 'spans') ? 'spans' : 'full_text';
        const spanMinLen = Number.isFinite(scanConfig.span_min_length) && (scanConfig.span_min_length as number) >= 1 ? (scanConfig.span_min_length as number) : 2;

        // Aggregate best results per id to avoid weaker redactions overwriting stronger ones across providers
        const bestById = new Map<string, { id: string; originalRow?: number; scannedIndex?: number; redactedText?: string; rephrasedText?: string; baseText: string; mode: string }>();
        const scoreRedaction = (orig: string, red?: string): number => {
          if (!red) return -1;
          const x = (red.match(/XXXX/g) || []).length;
          // prefer more XXXX, then larger edit distance proxy (length difference)
          const delta = Math.max(0, orig.length - red.length);
          return x * 1000 + delta;
        };

        for (const state of groupStates) {
          for (const ctx of state.contexts) {
            let redTexts: string[] = [];
            if (redactionMode === 'spans') {
              // Parse JSON of the form [{ index: k, redact: ["substring", ...] }, ...]
              let spansByIdx = new Map<number, string[]>();
              try {
                const rawAny = ctx.rawRed;
                let rawText = String(rawAny ?? "");
                if (!rawText) {
                  console.warn('[POSTPROCESS][SPANS][DEBUG] No raw redaction content (ctx.rawRed is empty or null)');
                } else {
                  const preview = rawText.length > 600 ? (rawText.slice(0, 600) + '…') : rawText;
                  console.log(`[POSTPROCESS][SPANS][DEBUG] Raw redaction content length=${rawText.length} preview=`, preview);
                }
                // Attempt direct JSON.parse
                try {
                  const parsedAny = JSON.parse(rawText);
                  if (Array.isArray(parsedAny)) {
                    console.log(`[POSTPROCESS][SPANS][DEBUG] Direct JSON.parse succeeded with array length=${parsedAny.length}`);
                    for (const obj of parsedAny as Array<{ index?: number|string; redact?: string[] }>) {
                      const idxVal = typeof obj?.index === 'string' ? parseInt(obj.index as unknown as string, 10) : obj?.index;
                      const idx = (typeof idxVal === 'number' && Number.isFinite(idxVal)) ? idxVal : -1;
                      const arr = Array.isArray(obj?.redact) ? obj?.redact.filter((s): s is string => typeof s === 'string') : [];
                      if (idx >= 0 && arr.length > 0) spansByIdx.set(idx, arr);
                    }
                  } else if (typeof parsedAny === 'string') {
                    rawText = parsedAny;
                    console.log('[POSTPROCESS][SPANS][DEBUG] Direct parse returned string; will continue with extracted string.');
                  }
                } catch (e) {
                  console.warn('[POSTPROCESS][SPANS][DEBUG] Direct JSON.parse failed:', e);
                }

                // If still empty, extract JSON array region
                if (spansByIdx.size === 0) {
                  const start = rawText.indexOf("[");
                  const end = rawText.lastIndexOf("]");
                  let jsonStr = (start >= 0 && end > start) ? rawText.substring(start, end + 1) : rawText;
                  const jsonPreview = jsonStr.length > 600 ? (jsonStr.slice(0, 600) + '…') : jsonStr;
                  console.log(`[POSTPROCESS][SPANS][DEBUG] Candidate JSON slice length=${jsonStr.length} preview=`, jsonPreview);
                  // Sanitize common issues
                  jsonStr = jsonStr
                    .replace(/^[\u200B\s`]*json\s*/i, "")
                    .replace(/^```|```$/g, "")
                    .replace(/[\u201C\u201D]/g, '"')
                    .replace(/[\u2018\u2019]/g, "'")
                    .replace(/,(\s*[}\]])/g, '$1');
                  try {
                    const parsed = JSON.parse(jsonStr) as Array<{ index?: number|string; redact?: string[] }>;
                    console.log(`[POSTPROCESS][SPANS][DEBUG] Sanitized JSON.parse succeeded with array length=${Array.isArray(parsed) ? parsed.length : 0}`);
                    if (Array.isArray(parsed)) {
                      for (const obj of parsed) {
                        const idxVal = typeof obj?.index === 'string' ? parseInt(obj.index as unknown as string, 10) : obj?.index;
                        const idx = (typeof idxVal === 'number' && Number.isFinite(idxVal)) ? idxVal : -1;
                        const arr = Array.isArray(obj?.redact) ? obj?.redact.filter((s): s is string => typeof s === 'string') : [];
                        if (idx >= 0 && arr.length > 0) spansByIdx.set(idx, arr);
                      }
                    }
                  } catch (e1) {
                    console.warn('[POSTPROCESS][SPANS][DEBUG] Sanitized JSON.parse failed:', e1);
                    // If it looks like a JSON string containing an array (escaped quotes), unescape and retry
                    const looksEscaped = /\\"index\\"|\\"redact\\"/.test(jsonStr) || /\\\[/.test(jsonStr);
                    if (looksEscaped) {
                      const unescaped = jsonStr
                        .replace(/\\"/g, '"')
                        .replace(/\\n/g, ' ')
                        .replace(/\\r/g, ' ')
                        .replace(/\\t/g, ' ')
                        .replace(/\\\\/g, '\\');
                      const unescPreview = unescaped.length > 600 ? (unescaped.slice(0, 600) + '…') : unescaped;
                      console.log('[POSTPROCESS][SPANS][DEBUG] Trying unescaped JSON parse. preview=', unescPreview);
                      try {
                        const parsed2 = JSON.parse(unescaped) as Array<{ index?: number|string; redact?: string[] }>;
                        console.log(`[POSTPROCESS][SPANS][DEBUG] Unescaped JSON.parse succeeded with length=${Array.isArray(parsed2) ? parsed2.length : 0}`);
                        if (Array.isArray(parsed2)) {
                          for (const obj of parsed2) {
                            const idxVal = typeof obj?.index === 'string' ? parseInt(obj.index as unknown as string, 10) : obj?.index;
                            const idx = (typeof idxVal === 'number' && Number.isFinite(idxVal)) ? idxVal : -1;
                            const arr = Array.isArray(obj?.redact) ? obj?.redact.filter((s): s is string => typeof s === 'string') : [];
                            if (idx >= 0 && arr.length > 0) spansByIdx.set(idx, arr);
                          }
                        }
                      } catch (e2) {
                        console.warn('[POSTPROCESS][SPANS][DEBUG] Unescaped JSON.parse failed:', e2);
                      }
                    }
                  }
                }
              } catch (e) {
                console.warn("[POSTPROCESS][SPANS] Failed to parse JSON spans; attempting regex fallback.", e);
              }
              // Regex fallback if parse failed or empty – run on both raw and an unescaped view
              if (spansByIdx.size === 0) {
                const tryRegexExtract = (source: string, tag: string) => {
                  let found = 0;
                  const objRe = /\{[\s\S]*?\}/g;
                  const matches = source.match(objRe) || [];
                  for (const m of matches) {
                    const idxMatch = /\b"?index"?\s*:\s*(\d+)/i.exec(m);
                    const redactMatch = /\b"?redact"?\s*:\s*\[(.*?)\]/is.exec(m);
                    if (!idxMatch || !redactMatch) continue;
                    const idx = parseInt(idxMatch[1], 10);
                    if (!Number.isFinite(idx)) continue;
                    const inner = redactMatch[1];
                    const strRe = /"([^"\\]*(?:\\.[^"\\]*)*)"/g;
                    const arr: string[] = [];
                    let sm: RegExpExecArray | null;
                    while ((sm = strRe.exec(inner)) !== null) {
                      try {
                        const s = JSON.parse('"' + sm[1] + '"');
                        if (typeof s === 'string' && s.trim().length > 0) arr.push(s);
                      } catch (_) {
                        const unescaped = sm[1].replace(/\\"/g, '"');
                        if (unescaped.trim().length > 0) arr.push(unescaped);
                      }
                    }
                    if (arr.length > 0) {
                      spansByIdx.set(idx, arr);
                      found += 1;
                    }
                  }
                  console.log(`[POSTPROCESS][SPANS][DEBUG] Regex extractor(${tag}) matched objects=${found}`);
                };
                const rawAll = String(ctx.rawRed || "");
                tryRegexExtract(rawAll, 'raw');
                if (spansByIdx.size === 0) {
                  const unesc = rawAll.replace(/\\"/g, '"');
                  tryRegexExtract(unesc, 'unescaped');
                }
                if (spansByIdx.size === 0) {
                  console.warn('[POSTPROCESS][SPANS] Regex fallback found no spans. Falling back to policy only.');
                }
              }
              // Build per-item redacted outputs by applying spans to the original text
              redTexts = ctx.chunk.map((comment: any) => {
                const orowRaw = comment?.originalRow;
                const sidxRaw = comment?.scannedIndex;
                const orow = typeof orowRaw === 'string' ? parseInt(orowRaw, 10) : orowRaw;
                const sidx = typeof sidxRaw === 'string' ? parseInt(sidxRaw, 10) : sidxRaw;
                const key = (typeof orow === 'number' && Number.isFinite(orow)) ? orow : ((typeof sidx === 'number' && Number.isFinite(sidx)) ? sidx : null);
                const spans = (key !== null && spansByIdx.has(key)) ? (spansByIdx.get(key) as string[]) : [];
                const applied = spans.length > 0 ? applyRedactionSpansToText(String(comment.originalText || comment.text || ""), spans, spanMinLen) : String(comment.originalText || comment.text || "");
                // Always enforce deterministic policy last
                return enforceRedactionPolicy(applied) as string;
              });
              // Fallback: if none changed and spansByIdx looks like chunk ordinals, apply by ordinal (1-based)
              const anyChanged = redTexts.some((t, i) => (t || '').trim() !== String((ctx.chunk[i]?.text) || '').trim());
              if (!anyChanged && spansByIdx.size > 0) {
                const ordinalKeys = Array.from(spansByIdx.keys());
                const maxKey = Math.max(...ordinalKeys);
                const minKey = Math.min(...ordinalKeys);
                const looksOrdinal = minKey >= 1 && maxKey <= ctx.chunk.length;
                if (looksOrdinal) {
                  console.warn('[POSTPROCESS][SPANS][DEBUG] Applying ordinal index fallback for chunk of length', ctx.chunk.length);
                  redTexts = ctx.chunk.map((comment: any, idx: number) => {
                    const spans = spansByIdx.get(idx + 1) || [];
                    const applied = (spans.length > 0)
                      ? applyRedactionSpansToText(String(comment.originalText || comment.text || ''), spans as string[], spanMinLen)
                      : String(comment.originalText || comment.text || '');
                    return enforceRedactionPolicy(applied) as string;
                  });
                }
              }
              // Fallback: if still no change, apply spans to any comment whose text contains any span substring
              if (!redTexts.some((t, i) => (t || '').trim() !== String((ctx.chunk[i]?.text) || '').trim()) && spansByIdx.size > 0) {
                console.warn('[POSTPROCESS][SPANS][DEBUG] Applying substring fallback within chunk');
                redTexts = ctx.chunk.map((comment: any) => {
                  const base = String(comment.originalText || comment.text || '');
                  // Merge all spans arrays
                  const allSpans: string[] = Array.from(spansByIdx.values()).flat();
                  const hasHit = allSpans.some(s => base.includes(String(s)));
                  const applied = hasHit ? applyRedactionSpansToText(base, allSpans, spanMinLen) : base;
                  return enforceRedactionPolicy(applied) as string;
                });
              }
            } else {
              redTexts = ctx.rawRed ? normalizeBatchTextParsed(ctx.rawRed) : [];
            }
            let repTexts = ctx.rawReph ? normalizeBatchTextParsed(ctx.rawReph) : [];
            const redIdx = stripAndIndex(redTexts);
            const rephIdx = stripAndIndex(repTexts);
            const redHasIds = redIdx.length > 0 && redIdx.every(x => x.idx != null);
            const rephHasIds = rephIdx.length > 0 && rephIdx.every(x => x.idx != null);
            const expected = ctx.chunk.length;
            const byId = (list: { idx: number|null; text: string }[]) => {
              const out: string[] = Array(expected).fill('');
              for (const it of list) {
                if (it.idx != null) {
                  const matchIdx = (() => {
                    for (let j = 0; j < ctx.chunk.length; j++) {
                      const orowRaw = (ctx.chunk[j] as any).originalRow;
                      const sidxRaw = (ctx.chunk[j] as any).scannedIndex;
                      const orow = typeof orowRaw === 'string' ? parseInt(orowRaw, 10) : orowRaw;
                      const sidx = typeof sidxRaw === 'string' ? parseInt(sidxRaw, 10) : sidxRaw;
                      const orowMatches = typeof orow === 'number' && Number.isFinite(orow) && orow === it.idx;
                      const sidxMatches = typeof sidx === 'number' && Number.isFinite(sidx) && sidx === it.idx;
                      if (orowMatches || sidxMatches) return j;
                    }
                    return -1;
                  })();
                  if (matchIdx >= 0 && matchIdx < expected) out[matchIdx] = it.text;
                }
              }
              return out;
            };
            if (redHasIds) {
              let aligned = byId(redIdx);
              const remaining = redIdx.map(x => x.text);
              for (let i = 0; i < aligned.length; i++) if (!aligned[i] && remaining.length > 0) aligned[i] = remaining.shift() || '';
              redTexts = aligned.map(enforceRedactionPolicy) as string[];
            } else {
              redTexts = redTexts.map(enforceRedactionPolicy);
            }
            if (rephHasIds) {
              let aligned = byId(rephIdx);
              const remaining = rephIdx.map(x => x.text);
              for (let i = 0; i < aligned.length; i++) if (!aligned[i] && remaining.length > 0) aligned[i] = remaining.shift() || '';
              repTexts = aligned;
            }
            for (let i = 0; i < ctx.chunk.length; i++) {
              const comment = ctx.chunk[i];
              const red = redTexts[i] || comment.text;
              const rep = repTexts[i] || comment.text;
              let mode = comment.mode || ((comment.concerning || comment.identifiable) ? defaultMode : 'original');
              const id = String(comment.id);
              const existing = bestById.get(id);
              const baseText = String(comment.text || '');
              if (!existing) {
                bestById.set(id, {
                  id,
                  originalRow: comment.originalRow,
                  scannedIndex: comment.scannedIndex,
                  redactedText: red && red !== baseText ? red : undefined,
                  rephrasedText: rep && rep !== baseText ? rep : undefined,
                  baseText,
                  mode
                });
              } else {
                // Choose better redaction
                const currentBest = existing.redactedText;
                const candBest = red && red !== baseText ? red : undefined;
                const best = (() => {
                  const sCur = scoreRedaction(baseText, currentBest);
                  const sNew = scoreRedaction(baseText, candBest);
                  return sNew > sCur ? candBest : currentBest;
                })();
                existing.redactedText = best;
                // Keep first available rephrase if none yet
                if (!existing.rephrasedText && rep && rep !== baseText) existing.rephrasedText = rep;
                // Preserve mode; no change
              }
            }
          }
        }
        // Emit aggregated results
        for (const v of bestById.values()) {
          const hasAIRedaction = typeof v.redactedText === 'string' && v.redactedText.trim().length > 0 && v.redactedText.trim() !== v.baseText.trim();
          const hasAIRephrase = typeof v.rephrasedText === 'string' && v.rephrasedText.trim().length > 0 && v.rephrasedText.trim() !== v.baseText.trim();
          // Compute finalText from available fields and mode
          let finalText = v.baseText;
          if (v.mode === 'redact' && hasAIRedaction) finalText = v.redactedText as string;
          else if (v.mode === 'rephrase' && hasAIRephrase) finalText = v.rephrasedText as string;
          processedComments.push({
            id: v.id,
            originalRow: v.originalRow,
            scannedIndex: v.scannedIndex,
            redactedText: hasAIRedaction ? v.redactedText : undefined,
            rephrasedText: hasAIRephrase ? v.rephrasedText : undefined,
            finalText,
            mode: v.mode
          });
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
