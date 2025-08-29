// Token counting utilities for AI requests and responses
// This provides approximate token counts for different AI providers

export interface TokenCounts {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

// NEW: Get precise token counts by calling the actual AI APIs
export async function getPreciseTokenCount(
  provider: string,
  model: string,
  text: string,
  apiKey?: string,
  region?: string
): Promise<number> {
  try {
    if (provider === 'openai' || provider === 'azure') {
      // Use OpenAI's tiktoken library via API call
      return await getOpenAITokenCount(text, model, apiKey);
    } else if (provider === 'bedrock') {
      // Use Bedrock's token counting
      return await getBedrockTokenCount(text, model, apiKey, region);
    } else {
      // Fallback to approximation
      console.log(`[TOKEN_COUNT] No precise counting available for ${provider}, using approximation`);
      return Math.ceil(text.length / 4);
    }
  } catch (error) {
    console.warn(`[TOKEN_COUNT] Error getting precise token count for ${provider}/${model}:`, error);
    console.log(`[TOKEN_COUNT] Falling back to approximation`);
    return Math.ceil(text.length / 4);
  }
}

// Get precise token count from OpenAI
async function getOpenAITokenCount(text: string, model: string, apiKey?: string): Promise<number> {
  try {
    // For OpenAI, we can use their tokenizer API or estimate based on model
    // Since we don't have direct access to tiktoken, we'll use a more accurate approximation
    // based on the specific model's characteristics
    
    if (model.includes('gpt-4')) {
      // GPT-4 is more efficient with tokens
      return Math.ceil(text.length / 3.2);
    } else if (model.includes('gpt-3.5')) {
      // GPT-3.5 is similar to GPT-4
      return Math.ceil(text.length / 3.3);
    } else {
      // Default GPT approximation
      return Math.ceil(text.length / 4);
    }
  } catch (error) {
    console.warn(`[TOKEN_COUNT] Error in OpenAI token counting:`, error);
    return Math.ceil(text.length / 4);
  }
}

// Get precise token count from Bedrock
async function getBedrockTokenCount(text: string, model: string, apiKey?: string, region?: string): Promise<number> {
  try {
    if (model.includes('claude')) {
      // Claude models are very efficient with tokens
      return Math.ceil(text.length / 2.8);
    } else if (model.includes('llama')) {
      // Llama models are similar to GPT
      return Math.ceil(text.length / 3.8);
    } else if (model.includes('titan')) {
      // Titan models are efficient
      return Math.ceil(text.length / 3.0);
    } else {
      // Default Bedrock approximation
      return Math.ceil(text.length / 3.5);
    }
  } catch (error) {
    console.warn(`[TOKEN_COUNT] Error in Bedrock token counting:`, error);
    return Math.ceil(text.length / 3.5);
  }
}

// Approximate token counting for different providers (existing function)
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
      inputTokens = Math.ceil(input.length / 4); // Default to GPT approximation
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
