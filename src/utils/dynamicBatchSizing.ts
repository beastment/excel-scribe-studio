/**
 * Dynamic Batch Sizing Utility
 * 
 * Calculates optimal batch sizes for different AI processing phases
 * based on I/O ratios and token limits to maximize efficiency.
 */

export interface IORatios {
  scan_a_io_ratio: number;
  scan_b_io_ratio: number;
  adjudicator_io_ratio: number;
  redaction_io_ratio: number;
  rephrase_io_ratio: number;
}

export interface TokenLimits {
  input_token_limit: number;
  output_token_limit: number;
}

export type ProcessingPhase = 'scan_a' | 'scan_b' | 'adjudicator' | 'redaction' | 'rephrase';

/**
 * Estimates the number of tokens in a text string
 * Uses a conservative estimate of 1 token = 4 characters
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Estimates the number of input tokens for a batch of comments
 * Includes the prompt and all comment texts
 */
export function estimateBatchInputTokens(
  comments: any[],
  prompt: string,
  additionalContext: string = ''
): number {
  const promptTokens = estimateTokens(prompt);
  const contextTokens = estimateTokens(additionalContext);
  
  // Estimate tokens for each comment
  const commentTokens = comments.reduce((total, comment) => {
    const commentText = comment.originalText || comment.text || '';
    return total + estimateTokens(commentText);
  }, 0);
  
  return promptTokens + contextTokens + commentTokens;
}

/**
 * Calculates the optimal batch size for a given processing phase
 * Takes into account I/O ratios, token limits, and safety margins
 */
export function calculateOptimalBatchSize(
  phase: ProcessingPhase,
  comments: any[],
  prompt: string,
  ioRatios: IORatios,
  tokenLimits: TokenLimits,
  additionalContext: string = '',
  safetyMarginPercent: number = 15
): number {
  const safetyMultiplier = 1 - (safetyMarginPercent / 100);
  
  // Get the I/O ratio for this phase
  let ioRatio: number;
  switch (phase) {
    case 'scan_a':
      ioRatio = ioRatios.scan_a_io_ratio;
      break;
    case 'scan_b':
      ioRatio = ioRatios.scan_b_io_ratio;
      break;
    case 'adjudicator':
      ioRatio = ioRatios.adjudicator_io_ratio;
      break;
    case 'redaction':
      ioRatio = ioRatios.redaction_io_ratio;
      break;
    case 'rephrase':
      ioRatio = ioRatios.rephrase_io_ratio;
      break;
    default:
      throw new Error(`Unknown processing phase: ${phase}`);
  }
  
  // Calculate maximum input tokens we can use
  const maxInputTokens = Math.floor(tokenLimits.input_token_limit * safetyMultiplier);
  
  // Calculate maximum output tokens we can generate
  const maxOutputTokens = Math.floor(tokenLimits.output_token_limit * safetyMultiplier);
  
  // Calculate the maximum input tokens we can use based on output limits
  const maxInputTokensByOutput = Math.floor(maxOutputTokens / ioRatio);
  
  // Use the more restrictive limit
  const effectiveMaxInputTokens = Math.min(maxInputTokens, maxInputTokensByOutput);
  
  // Estimate tokens for prompt and context
  const promptTokens = estimateTokens(prompt);
  const contextTokens = estimateTokens(additionalContext);
  const availableTokensForComments = effectiveMaxInputTokens - promptTokens - contextTokens;
  
  if (availableTokensForComments <= 0) {
    return 1; // Can only process one comment if prompt is too long
  }
  
  // Calculate how many comments we can fit
  let batchSize = 0;
  let totalTokens = 0;
  
  for (let i = 0; i < comments.length; i++) {
    const comment = comments[i];
    const commentText = comment.originalText || comment.text || '';
    const commentTokens = estimateTokens(commentText);
    
    if (totalTokens + commentTokens <= availableTokensForComments) {
      totalTokens += commentTokens;
      batchSize++;
    } else {
      break;
    }
  }
  
  return Math.max(1, batchSize); // Always return at least 1
}

/**
 * Calculates optimal batch sizes for all phases
 * Useful for planning the entire processing pipeline
 */
export function calculateAllPhaseBatchSizes(
  comments: any[],
  prompts: Record<ProcessingPhase, string>,
  ioRatios: IORatios,
  tokenLimits: TokenLimits,
  additionalContexts: Partial<Record<ProcessingPhase, string>> = {},
  safetyMarginPercent: number = 15
): Record<ProcessingPhase, number> {
  const result: Record<ProcessingPhase, number> = {} as Record<ProcessingPhase, number>;
  
  const phases: ProcessingPhase[] = ['scan_a', 'scan_b', 'adjudicator', 'redaction', 'rephrase'];
  
  for (const phase of phases) {
    const prompt = prompts[phase];
    const additionalContext = additionalContexts[phase] || '';
    
    result[phase] = calculateOptimalBatchSize(
      phase,
      comments,
      prompt,
      ioRatios,
      tokenLimits,
      additionalContext,
      safetyMarginPercent
    );
  }
  
  return result;
}

/**
 * Creates batches of comments based on optimal batch size
 * Ensures each batch fits within token limits
 */
export function createOptimalBatches(
  comments: any[],
  batchSize: number
): any[][] {
  const batches: any[][] = [];
  
  for (let i = 0; i < comments.length; i += batchSize) {
    batches.push(comments.slice(i, i + batchSize));
  }
  
  return batches;
}

/**
 * Logs batch sizing information for debugging
 */
export function logBatchSizingInfo(
  phase: ProcessingPhase,
  totalComments: number,
  batchSize: number,
  estimatedInputTokens: number,
  estimatedOutputTokens: number,
  tokenLimits: TokenLimits
): void {
  console.log(`[BATCH SIZING] ${phase.toUpperCase()}:`);
  console.log(`  Total comments: ${totalComments}`);
  console.log(`  Optimal batch size: ${batchSize}`);
  console.log(`  Estimated input tokens: ${estimatedInputTokens}`);
  console.log(`  Estimated output tokens: ${estimatedOutputTokens}`);
  console.log(`  Token limits: ${tokenLimits.input_token_limit} input, ${tokenLimits.output_token_limit} output`);
  console.log(`  Batches needed: ${Math.ceil(totalComments / batchSize)}`);
}
