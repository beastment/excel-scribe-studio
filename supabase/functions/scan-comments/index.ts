// Import Bedrock Runtime client for model inference
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "https://esm.sh/@aws-sdk/client-bedrock-runtime@3.569.0";

// Setup AWS Bedrock runtime client in Sydney region
const client = new BedrockRuntimeClient({
  region: "ap-southeast-2",
  credentials: {
    accessKeyId: Deno.env.get("AWS_ACCESS_KEY_ID")!,
    secretAccessKey: Deno.env.get("AWS_SECRET_ACCESS_KEY")!,
  },
});

// Generic Bedrock call
async function runModel(comment: string, modelId: string): Promise<string> {
  const prompt = `
You are an AI that removes all personally identifying information (PII) from text.
Return ONLY the cleaned text, with all identifiers replaced by [REDACTED].

Input:
${comment}
Output:
`;

  const command = new InvokeModelCommand({
    modelId,
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify({
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 500,
      temperature: 0.1,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  const { body } = await client.send(command);
  const json = JSON.parse(new TextDecoder().decode(body));
  return json.content?.[0]?.text?.trim() || "";
}

// Simple similarity check
function areSimilar(a: string, b: string): boolean {
  if (a === b) return true;
  const normA = a.toLowerCase().replace(/\s+/g, " ");
  const normB = b.toLowerCase().replace(/\s+/g, " ");
  return normA === normB;
}

// Main pipeline: two fast models, then escalate if needed
async function deidentify(comment: string): Promise<string> {
  const [fast1, fast2] = await Promise.all([
    runModel(comment, "amazon.titan-text-lite-v1"),
    runModel(comment, "anthropic.claude-3-haiku-20240307-v1:0"),
  ]);

  if (areSimilar(fast1, fast2)) {
    return fast1;
  }

  // Escalate to smarter model
  const smart = await runModel(comment, "anthropic.claude-3-sonnet-20240307-v1:0");
  return smart;
}

// Supabase Edge Function handler
Deno.serve(async (req) => {
  try {
    const { comment } = await req.json();
    if (!comment) {
      return new Response(JSON.stringify({ error: "Missing 'comment'" }), { status: 400 });
    }

    const result = await deidentify(comment);
    return new Response(JSON.stringify({ result }), {
      headers: { "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});