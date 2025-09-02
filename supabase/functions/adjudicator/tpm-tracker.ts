// TPM (Tokens Per Minute) and RPM (Requests Per Minute) tracker for rate limiting across AI functions
// This module tracks token usage and request counts per model to prevent API rate limit violations

interface TokenUsage {
  timestamp: number;
  tokens: number;
}

interface RequestUsage {
  timestamp: number;
  count: number;
}

interface ModelUsage {
  [modelKey: string]: TokenUsage[];
}

interface ModelRequestUsage {
  [modelKey: string]: RequestUsage[];
}

// Global token and request usage tracking (in-memory for this execution)
const tokenUsageTracker: ModelUsage = {};
const requestUsageTracker: ModelRequestUsage = {};

/**
 * Get the model key for tracking TPM usage
 */
function getModelKey(provider: string, model: string): string {
  return `${provider}:${model}`;
}

/**
 * Clean up old token usage records (older than 1 minute)
 */
function cleanupOldUsage(modelKey: string): void {
  const now = Date.now();
  const oneMinuteAgo = now - 60000; // 60 seconds
  
  if (tokenUsageTracker[modelKey]) {
    tokenUsageTracker[modelKey] = tokenUsageTracker[modelKey].filter(
      usage => usage.timestamp > oneMinuteAgo
    );
  }
}

/**
 * Clean up old request usage records (older than 1 minute)
 */
function cleanupOldRequestUsage(modelKey: string): void {
  const now = Date.now();
  const oneMinuteAgo = now - 60000; // 60 seconds
  
  if (requestUsageTracker[modelKey]) {
    requestUsageTracker[modelKey] = requestUsageTracker[modelKey].filter(
      usage => usage.timestamp > oneMinuteAgo
    );
  }
}

/**
 * Get current token usage for a model in the last minute
 */
function getCurrentUsage(provider: string, model: string): number {
  const modelKey = getModelKey(provider, model);
  cleanupOldUsage(modelKey);
  
  if (!tokenUsageTracker[modelKey]) {
    return 0;
  }
  
  return tokenUsageTracker[modelKey].reduce((total, usage) => total + usage.tokens, 0);
}

/**
 * Get current request count for a model in the last minute
 */
function getCurrentRequestCount(provider: string, model: string): number {
  const modelKey = getModelKey(provider, model);
  cleanupOldRequestUsage(modelKey);
  
  if (!requestUsageTracker[modelKey]) {
    return 0;
  }
  
  return requestUsageTracker[modelKey].reduce((total, usage) => total + usage.count, 0);
}

/**
 * Record token usage for a model
 */
function recordUsage(provider: string, model: string, tokens: number): void {
  const modelKey = getModelKey(provider, model);
  const now = Date.now();
  
  if (!tokenUsageTracker[modelKey]) {
    tokenUsageTracker[modelKey] = [];
  }
  
  tokenUsageTracker[modelKey].push({
    timestamp: now,
    tokens: tokens
  });
  
  // Clean up old records
  cleanupOldUsage(modelKey);
  
  console.log(`[TPM_TRACKER] Recorded ${tokens} tokens for ${modelKey}. Current usage: ${getCurrentUsage(provider, model)} tokens/min`);
}

/**
 * Record request count for a model
 */
function recordRequest(provider: string, model: string, count: number = 1): void {
  const modelKey = getModelKey(provider, model);
  const now = Date.now();
  
  if (!requestUsageTracker[modelKey]) {
    requestUsageTracker[modelKey] = [];
  }
  
  requestUsageTracker[modelKey].push({
    timestamp: now,
    count: count
  });
  
  // Clean up old records
  cleanupOldRequestUsage(modelKey);
  
  console.log(`[RPM_TRACKER] Recorded ${count} requests for ${modelKey}. Current usage: ${getCurrentRequestCount(provider, model)} requests/min`);
}

/**
 * Check if a request would exceed TPM limits
 */
function wouldExceedTPMLimit(
  provider: string, 
  model: string, 
  requestTokens: number, 
  tpmLimit: number | null
): boolean {
  if (!tpmLimit) {
    return false; // No TPM limit configured
  }
  
  const currentUsage = getCurrentUsage(provider, model);
  const projectedUsage = currentUsage + requestTokens;
  
  console.log(`[TPM_CHECK] ${provider}/${model}: Current usage: ${currentUsage}, Request tokens: ${requestTokens}, Projected: ${projectedUsage}, Limit: ${tpmLimit}`);
  
  return projectedUsage > tpmLimit;
}

/**
 * Check if a request would exceed RPM limits
 */
function wouldExceedRPMLimit(
  provider: string, 
  model: string, 
  requestCount: number, 
  rpmLimit: number | null
): boolean {
  if (!rpmLimit) {
    return false; // No RPM limit configured
  }
  
  const currentRequests = getCurrentRequestCount(provider, model);
  const projectedRequests = currentRequests + requestCount;
  
  console.log(`[RPM_CHECK] ${provider}/${model}: Current requests: ${currentRequests}, Request count: ${requestCount}, Projected: ${projectedRequests}, Limit: ${rpmLimit}`);
  
  return projectedRequests > rpmLimit;
}

/**
 * Calculate how long to wait before making a request that would exceed TPM limits
 */
function calculateWaitTime(
  provider: string, 
  model: string, 
  requestTokens: number, 
  tpmLimit: number | null
): number {
  if (!tpmLimit) {
    return 0; // No TPM limit configured
  }
  
  const modelKey = getModelKey(provider, model);
  cleanupOldUsage(modelKey);
  
  if (!tokenUsageTracker[modelKey] || tokenUsageTracker[modelKey].length === 0) {
    return 0; // No previous usage
  }
  
  const currentUsage = getCurrentUsage(provider, model);
  const projectedUsage = currentUsage + requestTokens;
  
  if (projectedUsage <= tpmLimit) {
    return 0; // Within limits
  }
  
  // Find the oldest usage record that we need to wait for to expire
  const now = Date.now();
  const usageRecords = tokenUsageTracker[modelKey].sort((a, b) => a.timestamp - b.timestamp);
  
  let accumulatedTokens = requestTokens;
  for (const usage of usageRecords) {
    accumulatedTokens += usage.tokens;
    if (accumulatedTokens > tpmLimit) {
      // We need to wait for this usage record to expire (1 minute after it was recorded)
      const expiryTime = usage.timestamp + 60000; // 60 seconds
      const waitTime = Math.max(0, expiryTime - now);
      
      console.log(`[TPM_WAIT] ${provider}/${model}: Need to wait ${waitTime}ms for TPM limit compliance`);
      return waitTime;
    }
  }
  
  return 0;
}

/**
 * Calculate how long to wait before making a request that would exceed RPM limits
 */
function calculateRPMWaitTime(
  provider: string, 
  model: string, 
  requestCount: number, 
  rpmLimit: number | null
): number {
  if (!rpmLimit) {
    return 0; // No RPM limit configured
  }
  
  const modelKey = getModelKey(provider, model);
  cleanupOldRequestUsage(modelKey);
  
  if (!requestUsageTracker[modelKey] || requestUsageTracker[modelKey].length === 0) {
    return 0; // No previous requests
  }
  
  const currentRequests = getCurrentRequestCount(provider, model);
  const projectedRequests = currentRequests + requestCount;
  
  if (projectedRequests <= rpmLimit) {
    return 0; // Within limits
  }
  
  // Find the oldest request record that we need to wait for to expire
  const now = Date.now();
  const requestRecords = requestUsageTracker[modelKey].sort((a, b) => a.timestamp - b.timestamp);
  
  let accumulatedRequests = requestCount;
  for (const request of requestRecords) {
    accumulatedRequests += request.count;
    if (accumulatedRequests > rpmLimit) {
      // We need to wait for this request record to expire (1 minute after it was recorded)
      const expiryTime = request.timestamp + 60000; // 60 seconds
      const waitTime = Math.max(0, expiryTime - now);
      
      console.log(`[RPM_WAIT] ${provider}/${model}: Need to wait ${waitTime}ms for RPM limit compliance`);
      return waitTime;
    }
  }
  
  return 0;
}

/**
 * Wait if necessary to comply with TPM and RPM limits, then record the usage
 */
async function enforceRateLimits(
  provider: string,
  model: string,
  requestTokens: number,
  requestCount: number,
  tpmLimit: number | null,
  rpmLimit: number | null,
  logPrefix: string = '[RATE_LIMIT]'
): Promise<void> {
  // Calculate wait times for both TPM and RPM
  const tpmWaitTime = calculateWaitTime(provider, model, requestTokens, tpmLimit);
  const rpmWaitTime = calculateRPMWaitTime(provider, model, requestCount, rpmLimit);
  
  // Use the longer wait time to comply with both limits
  const maxWaitTime = Math.max(tpmWaitTime, rpmWaitTime);
  
  if (maxWaitTime > 0) {
    const reason = [];
    if (tpmWaitTime > 0) reason.push(`TPM (${tpmWaitTime}ms)`);
    if (rpmWaitTime > 0) reason.push(`RPM (${rpmWaitTime}ms)`);
    
    console.log(`${logPrefix} Waiting ${maxWaitTime}ms to comply with ${reason.join(' and ')} limits for ${provider}/${model}`);
    await new Promise(resolve => setTimeout(resolve, maxWaitTime));
  }
  
  // Record both token usage and request count
  recordUsage(provider, model, requestTokens);
  recordRequest(provider, model, requestCount);
}

/**
 * Wait if necessary to comply with TPM limits, then record the usage
 * @deprecated Use enforceRateLimits instead for comprehensive rate limiting
 */
async function enforceTPMLimit(
  provider: string,
  model: string,
  requestTokens: number,
  tpmLimit: number | null,
  logPrefix: string = '[TPM]'
): Promise<void> {
  await enforceRateLimits(provider, model, requestTokens, 1, tpmLimit, null, logPrefix);
}

/**
 * Calculate optimal batch size considering TPM and RPM limits
 */
function calculateOptimalBatchSize(
  provider: string,
  model: string,
  estimatedTokensPerItem: number,
  maxItems: number,
  tpmLimit: number | null,
  rpmLimit: number | null,
  logPrefix: string = '[BATCH_CALC]',
  requestsPerBatch: number = 1
): number {
  let optimalBatchSize = maxItems;
  
  // Consider TPM limits
  if (tpmLimit) {
    const currentUsage = getCurrentUsage(provider, model);
    const availableTokens = Math.max(0, tpmLimit - currentUsage);
    const maxItemsByTPM = Math.floor(availableTokens / estimatedTokensPerItem);
    optimalBatchSize = Math.min(optimalBatchSize, maxItemsByTPM);
    
    console.log(`${logPrefix} [TPM] ${provider}/${model}: Current usage: ${currentUsage}/${tpmLimit}, Available: ${availableTokens}, Max items by TPM: ${maxItemsByTPM}`);
  } else {
    console.log(`${logPrefix} [TPM] No TPM limit configured for ${provider}/${model}`);
  }
  
  // Consider RPM limits
  if (rpmLimit) {
    const currentRequests = getCurrentRequestCount(provider, model);
    const availableRequests = Math.max(0, rpmLimit - currentRequests);
    // Calculate max items based on available requests and requests per batch
    const maxItemsByRPM = Math.floor(availableRequests / requestsPerBatch);
    optimalBatchSize = Math.min(optimalBatchSize, maxItemsByRPM);
    
    console.log(`${logPrefix} [RPM] ${provider}/${model}: Current requests: ${currentRequests}/${rpmLimit}, Available: ${availableRequests}, Requests per batch: ${requestsPerBatch}, Max items by RPM: ${maxItemsByRPM}`);
  } else {
    console.log(`${logPrefix} [RPM] No RPM limit configured for ${provider}/${model}`);
  }
  
  console.log(`${logPrefix} ${provider}/${model}: Final optimal batch size: ${optimalBatchSize} (from max: ${maxItems})`);
  
  return Math.max(1, optimalBatchSize); // Always return at least 1
}

/**
 * Calculate optimal batch size considering TPM limits only
 * @deprecated Use calculateOptimalBatchSize instead for comprehensive rate limiting
 */
function calculateTPMOptimalBatchSize(
  provider: string,
  model: string,
  estimatedTokensPerItem: number,
  maxItems: number,
  tpmLimit: number | null,
  logPrefix: string = '[TPM_BATCH]'
): number {
  return calculateOptimalBatchSize(provider, model, estimatedTokensPerItem, maxItems, tpmLimit, null, logPrefix, 1);
}

export {
  getCurrentUsage,
  getCurrentRequestCount,
  recordUsage,
  recordRequest,
  wouldExceedTPMLimit,
  wouldExceedRPMLimit,
  calculateWaitTime,
  calculateRPMWaitTime,
  enforceRateLimits,
  enforceTPMLimit, // @deprecated
  calculateOptimalBatchSize,
  calculateTPMOptimalBatchSize // @deprecated
};
