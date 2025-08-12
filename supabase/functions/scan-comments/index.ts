// index.ts - Supabase Edge Function (Deno)
// Usage: POST JSON { comment: "single text" } or { comments: ["text1","text2", ...] }

const REGION = Deno.env.get("AWS_REGION") ?? "ap-southeast-2";
const ACCESS_KEY = Deno.env.get("AWS_ACCESS_KEY_ID")!;
const SECRET_KEY = Deno.env.get("AWS_SECRET_ACCESS_KEY")!;
const SESSION_TOKEN = Deno.env.get("AWS_SESSION_TOKEN") ?? ""; // optional

if (!ACCESS_KEY || !SECRET_KEY) {
  console.error("Missing AWS creds (set AWS_ACCESS_KEY_ID & AWS_SECRET_ACCESS_KEY)");
}

// -------------------------- helpers: crypto, hex, dates --------------------------
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toHex(buf: ArrayBuffer | Uint8Array) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(message: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(message));
  return toHex(digest);
}

async function hmacSha256(keyBytes: Uint8Array, msg: string | Uint8Array): Promise<Uint8Array> {
  // msg may be string or byte array
  const algoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const data = typeof msg === "string" ? encoder.encode(msg) : msg;
  const sig = await crypto.subtle.sign("HMAC", algoKey, data);
  return new Uint8Array(sig);
}

function amzDates() {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  const yyyy = now.getUTCFullYear();
  const mm = pad(now.getUTCMonth() + 1);
  const dd = pad(now.getUTCDate());
  const hh = pad(now.getUTCHours());
  const min = pad(now.getUTCMinutes());
  const ss = pad(now.getUTCSeconds());
  const amzDate = `${yyyy}${mm}${dd}T${hh}${min}${ss}Z`;
  const dateStamp = `${yyyy}${mm}${dd}`;
  return { amzDate, dateStamp };
}

// -------------------------- SigV4 signing for bedrock-runtime --------------------------
async function deriveSigningKey(secret: string, dateStamp: string, region: string, service: string) {
  const kSecret = encoder.encode("AWS4" + secret);
  const kDate = await hmacSha256(kSecret, dateStamp);
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, service);
  const kSigning = await hmacSha256(kService, "aws4_request");
  return kSigning;
}

function buildCanonicalQueryString(url: URL) {
  // canonicalize any query params (sorted by name)
  const params = Array.from(url.searchParams.entries());
  if (params.length === 0) return "";
  params.sort(([a], [b]) => a.localeCompare(b));
  return params.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
}

async function signFetch(
  method: "POST" | "GET" | "PUT" | "DELETE",
  urlStr: string,
  body: string,
  region: string,
  service: string,
  accessKey: string,
  secretKey: string,
  sessionToken?: string
) {
  const url = new URL(urlStr);
  const host = url.host;
  const { amzDate, dateStamp } = amzDates();
  const payloadHash = await sha256Hex(body || "");

  // headers used for canonicalization
  const headers: Record<string, string> = {
    "content-type": "application/json",
    host,
    "x-amz-date": amzDate,
    "x-amz-content-sha256": payloadHash,
    accept: "application/json",
  };
  if (sessionToken) headers["x-amz-security-token"] = sessionToken;

  // canonical headers: lowercase, trimmed, sorted by name
  const sortedHeaderNames = Object.keys(headers)
    .map(h => h.toLowerCase())
    .sort();

  const canonicalHeaders = sortedHeaderNames
    .map(h => `${h}:${headers[h].toString().trim().replace(/\s+/g, " ")}`)
    .join("\n") + "\n";

  const signedHeaders = sortedHeaderNames.join(";");

  const canonicalUri = url.pathname;
  const canonicalQueryString = buildCanonicalQueryString(url);

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const hashedCanonicalRequest = await sha256Hex(canonicalRequest);
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, hashedCanonicalRequest].join("\n");

  const signingKey = await deriveSigningKey(secretKey, dateStamp, region, service);
  const signatureBytes = await hmacSha256(signingKey, stringToSign);
  const signature = toHex(signatureBytes);

  const authorizationHeader =
    `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const finalHeaders: Record<string, string> = {
    ...headers,
    Authorization: authorizationHeader,
  };
  if (sessionToken) finalHeaders["x-amz-security-token"] = sessionToken;

  // Perform fetch
  const res = await fetch(urlStr, {
    method,
    headers: finalHeaders,
    body: body || undefined,
  });
  return res;
}

// -------------------------- model-specific request builders & response parsers --------------------------
function bodyForModel(modelId: string, prompt: string) {
  // Amazon Titan style
  if (modelId.startsWith("amazon.")) {
    return JSON.stringify({
      inputText: prompt,
      textGenerationConfig: { maxTokenCount: 1000, temperature: 0.1 },
    });
  }
  // Anthropic style (Claude)
  return JSON.stringify({
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: 500,
    temperature: 0.1,
    messages: [{ role: "user", content: prompt }],
  });
}

async function parseModelResponseBody(json: any) {
  // flexible extraction to handle different bedrock model shapes
  if (!json) return "";
  if (typeof json === "string") return json;
  if (json.outputText) return json.outputText;
  if (json.results?.[0]?.outputText) return json.results[0].outputText;
  if (json.content?.[0]?.text) return json.content[0].text;
  if (json.outputs?.[0]?.content?.[0]?.text) return json.outputs[0].content[0].text;
  // fallback: return stringified JSON (for debugging)
  return JSON.stringify(json);
}

// wrapper to invoke a model
async function invokeModel(modelId: string, prompt: string) {
  const endpoint = `https://bedrock-runtime.${REGION}.amazonaws.com/model/${modelId}/invoke`;
  const body = bodyForModel(modelId, prompt);

  const res = await signFetch(
    "POST",
    endpoint,
    body,
    REGION,
    "bedrock-runtime", // important: service is bedrock-runtime
    ACCESS_KEY,
    SECRET_KEY,
    SESSION_TOKEN || undefined
  );

  const text = await res.text();
  try {
    const parsed = JSON.parse(text);
    return await parseModelResponseBody(parsed);
  } catch (e) {
    return text;
  }
}

// -------------------------- similarity function & pipeline --------------------------
function normalizeText(s: string) {
  return s?.toLowerCase().trim().replace(/\s+/g, " ") ?? "";
}

function areSimilar(a: string, b: string) {
  if (!a || !b) return false;
  if (a === b) return true;
  return normalizeText(a) === normalizeText(b);
}

const FAST_MODEL_1 = "amazon.titan-text-lite-v1";
const FAST_MODEL_2 = "anthropic.claude-3-haiku-20240307-v1:0";
const SMART_MODEL   = "anthropic.claude-3-sonnet-20240307-v1:0";

async function processSingle(comment: string) {
  // craft a prompt that asks for de-identification only (returns cleaned text)
  const prompt = `You are an AI that removes all personally identifying information from text.
Return ONLY the cleaned text, with all identifiers replaced by [REDACTED].

Input:
${comment}
Output:`;

  const [r1, r2] = await Promise.all([
    invokeModel(FAST_MODEL_1, prompt),
    invokeModel(FAST_MODEL_2, prompt),
  ]);

  if (areSimilar(r1, r2)) {
    return { original: comment, fast1: r1, fast2: r2, final: r1, escalated: false };
  }

  const r3 = await invokeModel(SMART_MODEL, prompt);
  return { original: comment, fast1: r1, fast2: r2, final: r3, escalated: true };
}

// -------------------------- Supabase Edge handler --------------------------
Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response("POST JSON { comment | comments }", { status: 400 });
    }
    const payload = await req.json();
    let comments: string[] = [];

    if (payload.comment && typeof payload.comment === "string") {
      comments = [payload.comment];
    } else if (Array.isArray(payload.comments)) {
      comments = payload.comments;
    } else {
      return new Response(JSON.stringify({ error: "Provide `comment` or `comments`" }), { status: 400 });
    }

    // throttle concurrency if you like — simple sequential processing for safety
    const results = [];
    for (const c of comments) {
      // consider `await Promise.all([...])` for parallelism but watch rate/quotas
      const r = await processSingle(c);
      results.push(r);
    }

    return new Response(JSON.stringify({ results }), {
      headers: { "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("Handler error:", err);
    return new Response(JSON.stringify({ error: err?.message ?? String(err) }), { status: 500 });
  }
});