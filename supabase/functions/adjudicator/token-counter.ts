// Token counting utilities for AI requests and responses
// This provides approximate token counts for different AI providers

export interface TokenCounts {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

// Approximate token counting for different providers
export async function countTokens(
  provider: string, 
  model: string, 
  input: string, 
  output?: string
): Promise<TokenCounts> {
  
  // For OpenAI models, we can use a rough approximation
  // GPT models typically use ~4 characters per token for English text
  // Claude models use ~3.5 characters per token
  
  let inputTokens = 0;
  let outputTokens = 0;
  
  if (provider === 'openai') {
    if (model.includes('gpt-4') || model.includes('gpt-3.5')) {
      inputTokens = Math.ceil(input.length / 4);
      if (output) outputTokens = Math.ceil(output.length / 4);
    } else {
      inputTokens = Math.ceil(input.length / 4); // Default to GPT approximation//
      if (output) outputTokens = Math.ceil(output.length / 4);
    }
  } else if (provider === 'azure') {
    // Azure OpenAI uses the same models as OpenAI
    if (model.includes('gpt-4') || model.includes('gpt-3.5')) {
      inputTokens = Math.ceil(input.length / 4);
      if (output) outputTokens = Math.ceil(output.length / 4);
    } else {
      inputTokens = Math.ceil(input.length / 4);
      if (output) outputTokens = Math.ceil(output.length / 4);
    }
  } else if (provider === 'bedrock') {
    if (model.includes('claude')) {
      // Claude models use ~3.5 characters per token
      inputTokens = Math.ceil(input.length / 3.5);
      if (output) outputTokens = Math.ceil(output.length / 3.5);
    } else if (model.includes('llama')) {
      // Llama models use ~4 characters per token
      inputTokens = Math.ceil(input.length / 4);
      if (output) outputTokens = Math.ceil(output.length / 4);
    } else {
      // Default approximation for other Bedrock models
      inputTokens = Math.ceil(input.length / 4);
      if (output) outputTokens = Math.ceil(output.length / 4);
    }
  } else {
    // Default approximation for unknown providers
    inputTokens = Math.ceil(input.length / 4);
    if (output) outputTokens = Math.ceil(output.length / 4);
  }
  
  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens
  };
}

// Log token usage to console with [AI REQUEST] and [AI RESPONSE] prefixes
export function logTokenUsage(
  provider: string,
  model: string,
  requestType: string,
  phase: string,
  inputTokens: number,
  outputTokens: number,
  totalTokens: number
) {
  console.log(`[AI REQUEST] ${provider}/${model} type=${requestType} phase=${phase} input_tokens=${inputTokens}`);
  console.log(`[AI RESPONSE] ${provider}/${model} type=${requestType} phase=${phase} output_tokens=${outputTokens} total_tokens=${totalTokens}`);
}
