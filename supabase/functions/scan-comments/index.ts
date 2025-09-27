// @ts-ignore - Deno module imports
import "https://deno.land/x/xhr@0.1.0/mod.ts";
// @ts-ignore - Deno module imports
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-ignore - Deno module imports
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { AILogger } from './ai-logger.ts';
import { calculateWaitTime, calculateRPMWaitTime, recordUsage, recordRequest, calculateOptimalBatchSize as calculateRateLimitedBatchSize } from './tpm-tracker.ts';

// Declare Deno global for TypeScript
declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
  serveHttp(conn: any): any;
};

const buildCorsHeaders = (origin: string | null) => ({
  'Access-Control-Allow-Origin': origin || '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Max-Age': '86400',
  'Access-Control-Allow-Credentials': 'true',
  'Vary': 'Origin'
});

// Global precise token counter for use in top-level helpers (e.g., adjudicator sizing)
const getPreciseTokensGlobal = async (text: string, provider: string, model: string): Promise<number> => {
  try {
    const { getPreciseTokenCount } = await import('./token-counter.ts');
    return await getPreciseTokenCount(provider, model, text);
  } catch (error) {
    console.warn(`[RUNID-BATCH] Global fallback to approximation for ${provider}/${model}:`, error);
    return Math.ceil(text.length / 4);
  }
};

// Helper function to parse partial results and identify missing comments
const parsePartialResults = (responseText: string, totalComments: number, batchStart: number): {
  parsedResults: string[];
  missingIndices: number[];
  hasPartialResults: boolean;
} => {
  if (!responseText || responseText.trim().length === 0) {
    return { parsedResults: [], missingIndices: Array.from({ length: totalComments }, (_, i) => batchStart + i), hasPartialResults: false };
  }

  const lines = responseText.split('\n').map(l => l.trim()).filter(line => line.length > 0);
  const parsedResults: string[] = [];
  const foundIndices = new Set<number>();

  // State machine to support both single-line and multi-line formats
  let currentIndex: number | null = null;
  let aVal: 'Y' | 'N' | null = null;
  let bVal: 'Y' | 'N' | null = null;

  const commitIfComplete = () => {
    if (currentIndex !== null && aVal && bVal) {
      // Only accept indices within expected range
      if (currentIndex >= batchStart + 1 && currentIndex <= batchStart + totalComments) {
        const relativeIndex = currentIndex - batchStart - 1;
        if (relativeIndex >= 0 && relativeIndex < totalComments) {
          const line = `i:${currentIndex} A:${aVal} B:${bVal}`;
          parsedResults[relativeIndex] = line;
          foundIndices.add(relativeIndex);
        }
      }
      // Reset for next block
      currentIndex = null;
      aVal = null;
      bVal = null;
    }
  };

  for (const raw of lines) {
    const line = raw.replace(/\s+/g, ' ').trim();

    // Try single-line first: allow optional commas and flexible spacing/orders
    let m = line.match(/^i:\s*(\d+)\s*,?\s*A:\s*([YN])\s*,?\s*B:\s*([YN])$/i);
    if (!m) {
      // Some models might output B before A (rare) – handle that as well
      m = line.match(/^i:\s*(\d+)\s*,?\s*B:\s*([YN])\s*,?\s*A:\s*([YN])$/i);
      if (m) {
        // Swap capture groups to A,B order
        m = [m[0], m[1], m[3], m[2]] as unknown as RegExpMatchArray;
      }
    }
    if (m) {
      currentIndex = parseInt(m[1]);
      aVal = (m[2].toUpperCase() as 'Y' | 'N');
      bVal = (m[3].toUpperCase() as 'Y' | 'N');
      commitIfComplete();
      continue;
    }

    // Multi-line accumulation: i:NNN, then A:X, then B:Y in any order
    const iMatch = line.match(/^i:\s*(\d+)$/i);
    if (iMatch) {
      // If previous index was incomplete, discard and start anew
      currentIndex = parseInt(iMatch[1]);
      aVal = null;
      bVal = null;
      continue;
    }
    const aMatch = line.match(/^a:\s*([YN])$/i);
    if (aMatch) {
      aVal = (aMatch[1].toUpperCase() as 'Y' | 'N');
      commitIfComplete();
      continue;
    }
    const bMatch = line.match(/^b:\s*([YN])$/i);
    if (bMatch) {
      bVal = (bMatch[1].toUpperCase() as 'Y' | 'N');
      commitIfComplete();
      continue;
    }
    // Ignore any unrelated lines
  }

  // Find missing indices
  const missingIndices: number[] = [];
  for (let i = 0; i < totalComments; i++) {
    if (!foundIndices.has(i)) {
      missingIndices.push(batchStart + i);
    }
  }

  const completionRatio = parsedResults.length / totalComments;
  const isTruncated = completionRatio < 0.1;
  const hasPartialResults = parsedResults.length > 0 && !isTruncated;

  console.log(`[PARTIAL_PARSE] Found ${parsedResults.length} valid results out of ${totalComments} comments (${(completionRatio * 100).toFixed(1)}%)`);
  console.log(`[PARTIAL_PARSE] Missing indices: ${missingIndices.length > 0 ? missingIndices.join(', ') : 'none'}`);
  console.log(`[PARTIAL_PARSE] Is truncated: ${isTruncated} (completion ratio: ${completionRatio.toFixed(3)})`);

  return { parsedResults, missingIndices, hasPartialResults };
};

// Helper function to detect harmful content responses that should trigger batch splitting
const isHarmfulContentResponse = (responseText: string, provider: string, model: string, totalComments: number, batchStart: number): boolean => {
  if (!responseText || responseText.trim().length === 0) {
    return true; // Empty response means complete failure
  }
  
  // First, check if we have any valid partial results
  const { hasPartialResults, parsedResults } = parsePartialResults(responseText, totalComments, batchStart);
  const parsedCount = parsedResults.length;
  const completionRatio = totalComments > 0 ? (parsedCount / totalComments) : 0;

  // Note: do not early-return here; combine with refusal checks below
  
  console.log(`[HARMFUL_DETECTION] No partial results found, checking for harmful content patterns...`);
  
  const lowerResponse = responseText.toLowerCase();
  
  // Patterns that indicate actual harmful content detection (not normal analysis)
  const harmfulContentPatterns = [

    // Policy violations
    'this violates content policy',
    'this violates safety guidelines',
    'violates content policy',
    'violates safety guidelines',
    'content policy violation',
    'safety guidelines violation',
    
    // Content characterization
    'this content is inappropriate',
    'this content is harmful',
    'this content is concerning',
    'this content is unsafe',
    'this content is too sensitive',
    'this content is problematic',
    'this content is offensive',
    'this content is disturbing',
    'this content is graphic',
    'this content is explicit',
    'this content is violent',
    'this content is threatening',
    'this content is abusive',
    'this content is harassing',
    'this content is discriminatory',
    'this content is hateful',
    'this content is extremist',
    'this content is illegal',
    'this content is criminal',
    
    // Analysis refusals
    'cannot analyze',
    'will not analyze',
    'cannot provide',
    'will not provide',
    'refuse to analyze',
    'refuse to provide',
    'cannot respond',
    'will not respond',
    'refuse to respond',
    'cannot classify',
    'will not classify',
    'refuse to classify',
    'cannot generate',
    'will not generate',
    'refuse to generate',
    'cannot repeat',
    'will not repeat',
    'refuse to repeat',
    'cannot restate',
    'will not restate',
    'refuse to restate',
    'cannot comment',
    'will not comment',
    'refuse to comment',
    'cannot rephrase',
    'will not rephrase',
    'refuse to rephrase',
    'I apologize'
  ];
  
  // Check if response contains any of these specific patterns
  const containsHarmfulPattern = harmfulContentPatterns.some(pattern => 
    lowerResponse.includes(pattern)
  );
  
  // Additional check: if response is very short and contains specific refusal language
  const isShortRefusal = responseText.length < 150 && (
    lowerResponse.includes('i cannot analyze') || 
    lowerResponse.includes('i refuse to analyze') || 
    lowerResponse.includes('i cannot process') ||
    lowerResponse.includes('i cannot help') ||
    lowerResponse.includes('i cannot assist') ||
    lowerResponse.includes('i cannot comply') ||
    lowerResponse.includes('violates content policy') ||
    lowerResponse.includes('violates safety guidelines')
  );
  
  // Check if response doesn't contain expected analysis format (i:X, A:Y, B:Z)
  const hasExpectedFormat = lowerResponse.includes('i:') && (lowerResponse.includes('a:') || lowerResponse.includes('b:'));
  const isUnexpectedFormat = !hasExpectedFormat && responseText.length > 50;
  
  // Check for very short responses that might be refusals
  const isVeryShort = responseText.length < 100 && (
    lowerResponse.includes('cannot') || 
    lowerResponse.includes('refuse') || 
    lowerResponse.includes('unable') ||
    lowerResponse.includes('policy') ||
    lowerResponse.includes('violate') ||
    lowerResponse.includes('inappropriate') ||
    lowerResponse.includes('harmful') ||
    lowerResponse.includes('concerning') ||
    lowerResponse.includes('unsafe') ||
    lowerResponse.includes('sensitive')
  );
  
  // Consider longer refusals harmful if they include explicit refusal phrases
  const longRefusal = responseText.length >= 150 && (
    lowerResponse.includes('cannot generate') ||
    lowerResponse.includes('cannot restate') ||
    lowerResponse.includes('will not generate') ||
    lowerResponse.includes('will not restate')
  );

  const refusalDetected = containsHarmfulPattern || isShortRefusal || longRefusal;

  // If we have few partial results (< 30%), treat as truncation and split
  if (parsedCount > 0 && completionRatio < 0.3) {
    console.log(`[HARMFUL_DETECTION] Low coverage partials (${parsedCount}/${totalComments}, ${(completionRatio * 100).toFixed(1)}%), triggering split`);
    return true;
  }

  // If refusal detected and batch incomplete, split
  if (refusalDetected && parsedCount < totalComments) {
    console.log(`[HARMFUL_DETECTION] Refusal detected with incomplete coverage (${parsedCount}/${totalComments}), triggering split`);
    return true;
  }

  const isHarmful = refusalDetected || (isUnexpectedFormat && isVeryShort);
  
  console.log(`[HARMFUL_DETECTION] Analysis for ${provider}/${model}:`, {
    containsHarmfulPattern,
    isShortRefusal,
    isUnexpectedFormat,
    isVeryShort,
    isHarmful,
    responseLength: responseText.length,
    responsePreview: responseText.substring(0, 200) + '...'
  });
  
  if (isHarmful) {
    console.log(`[HARMFUL_DETECTION] Detected harmful content response from ${provider}/${model}:`, responseText.substring(0, 200) + '...');
  }
  
  return isHarmful;
};

// Recursive batch processing function that splits batches when harmful content is detected
const processBatchWithRecursiveSplitting = async (
  comments: any[],
  scanA: any,
  scanB: any,
  scanATokenLimits: any,
  scanBTokenLimits: any,
  user: any,
  scanRunId: string,
  aiLogger: AILogger,
  batchStart: number,
  maxSplits: number = 3, // Maximum number of splits to prevent infinite recursion
  currentSplit: number = 0,
  scanAFailed: boolean = false, // Whether Scan A failed in parent batch
  scanBFailed: boolean = false,  // Whether Scan B failed in parent batch
  parentScanAResults: any = null, // Successful Scan A results from parent batch
  parentScanBResults: any = null  // Successful Scan B results from parent batch
): Promise<{ scanAResults: any, scanBResults: any }> => {
  
  if (comments.length === 0) {
    return { scanAResults: null, scanBResults: null };
  }
  
  console.log(`[RECURSIVE_SPLIT] Processing batch of ${comments.length} comments (split ${currentSplit}/${maxSplits})`);
  console.log(`[RECURSIVE_SPLIT] Parent failure flags: scanAFailed=${scanAFailed}, scanBFailed=${scanBFailed}`);
  console.log(`[RECURSIVE_SPLIT] Parent results: scanAResults=${!!parentScanAResults}, scanBResults=${!!parentScanBResults}`);
  
  try {
    // Build batch input
    const batchInput = buildBatchInput(comments, batchStart);
    
    let scanAResults: any = null;
    let scanBResults: any = null;
    let currentScanAFailed = false;
    let currentScanBFailed = false;
    
    // Only call failed models, preserve successful results
    if (scanAFailed || scanBFailed) {
      console.log(`[RECURSIVE_SPLIT] Only calling failed models: ${scanAFailed ? 'Scan A' : ''}${scanAFailed && scanBFailed ? ' and ' : ''}${scanBFailed ? 'Scan B' : ''}`);
      
      // Use parent results for successful models
      if (!scanAFailed && parentScanAResults) {
        scanAResults = parentScanAResults;
        console.log(`[RECURSIVE_SPLIT] Using preserved Scan A results from parent batch`);
      }
      if (!scanBFailed && parentScanBResults) {
        scanBResults = parentScanBResults;
        console.log(`[RECURSIVE_SPLIT] Using preserved Scan B results from parent batch`);
      }
      
      const callsToMake: Promise<any>[] = [];
      if (scanAFailed) {
        callsToMake.push(callAI(scanA.provider, scanA.model, scanA.analysis_prompt, batchInput, 'batch_analysis', user.id, scanRunId, 'scan_a', aiLogger, scanATokenLimits.output_token_limit, scanA.temperature));
      }
      if (scanBFailed) {
        callsToMake.push(callAI(scanB.provider, scanB.model, scanB.analysis_prompt, batchInput, 'batch_analysis', user.id, scanRunId, 'scan_b', aiLogger, scanBTokenLimits.output_token_limit, scanB.temperature));
      }
      
      const settled = await Promise.allSettled(callsToMake);
      
      let settledIndex = 0;
      if (scanAFailed) {
        if (settled[settledIndex].status === 'fulfilled') {
          scanAResults = (settled[settledIndex] as PromiseFulfilledResult<any>).value;
          console.log(`[RECURSIVE_SPLIT] Scan A response (first 200 chars):`, scanAResults?.substring(0, 200));
          
          if (isHarmfulContentResponse(scanAResults, scanA.provider, scanA.model, comments.length, batchStart)) {
            console.log(`[RECURSIVE_SPLIT] Scan A still detected harmful content, will split batch`);
            currentScanAFailed = true;
          } else {
            console.log(`[RECURSIVE_SPLIT] Scan A response appears normal, no splitting needed`);
          }
        } else {
          console.log(`[RECURSIVE_SPLIT] Scan A failed with error, will split batch`);
          currentScanAFailed = true;
        }
        settledIndex++;
      }
      
      if (scanBFailed) {
        if (settled[settledIndex].status === 'fulfilled') {
          scanBResults = (settled[settledIndex] as PromiseFulfilledResult<any>).value;
          console.log(`[RECURSIVE_SPLIT] Scan B response (first 200 chars):`, scanBResults?.substring(0, 200));
          
          if (isHarmfulContentResponse(scanBResults, scanB.provider, scanB.model, comments.length, batchStart)) {
            console.log(`[RECURSIVE_SPLIT] Scan B still detected harmful content, will split batch`);
            currentScanBFailed = true;
          } else {
            console.log(`[RECURSIVE_SPLIT] Scan B response appears normal, no splitting needed`);
          }
        } else {
          console.log(`[RECURSIVE_SPLIT] Scan B failed with error, will split batch`);
          currentScanBFailed = true;
        }
      }
    } else {
      // First attempt - call both models
      console.log(`[RECURSIVE_SPLIT] First attempt - calling both models`);
      
      const settled = await Promise.allSettled([
        callAI(scanA.provider, scanA.model, scanA.analysis_prompt, batchInput, 'batch_analysis', user.id, scanRunId, 'scan_a', aiLogger, scanATokenLimits.output_token_limit, scanA.temperature),
        callAI(scanB.provider, scanB.model, scanB.analysis_prompt, batchInput, 'batch_analysis', user.id, scanRunId, 'scan_b', aiLogger, scanBTokenLimits.output_token_limit, scanB.temperature)
      ]);
      
      // Process Scan A results
      if (settled[0].status === 'fulfilled') {
        scanAResults = settled[0].value;
        console.log(`[RECURSIVE_SPLIT] Scan A response (first 200 chars):`, scanAResults?.substring(0, 200));
        console.log(`[RECURSIVE_SPLIT] Scan A response length: ${scanAResults?.length || 0} chars`);
        
        const isHarmful = isHarmfulContentResponse(scanAResults, scanA.provider, scanA.model, comments.length, batchStart);
        console.log(`[RECURSIVE_SPLIT] Scan A harmful content detection result: ${isHarmful}`);
        
        if (isHarmful) {
          console.log(`[RECURSIVE_SPLIT] Scan A detected harmful content, will split batch`);
          currentScanAFailed = true;
        } else {
          console.log(`[RECURSIVE_SPLIT] Scan A response appears normal, no splitting needed`);
        }
      } else {
        console.log(`[RECURSIVE_SPLIT] Scan A failed with error, will split batch`);
        currentScanAFailed = true;
      }
      
      // Process Scan B results
      if (settled[1].status === 'fulfilled') {
        scanBResults = settled[1].value;
        console.log(`[RECURSIVE_SPLIT] Scan B response (first 200 chars):`, scanBResults?.substring(0, 200));
        console.log(`[RECURSIVE_SPLIT] Scan B response length: ${scanBResults?.length || 0} chars`);
        
        const isHarmful = isHarmfulContentResponse(scanBResults, scanB.provider, scanB.model, comments.length, batchStart);
        console.log(`[RECURSIVE_SPLIT] Scan B harmful content detection result: ${isHarmful}`);
        
        if (isHarmful) {
          console.log(`[RECURSIVE_SPLIT] Scan B detected harmful content, will split batch`);
          currentScanBFailed = true;
        } else {
          console.log(`[RECURSIVE_SPLIT] Scan B response appears normal, no splitting needed`);
        }
      } else {
        console.log(`[RECURSIVE_SPLIT] Scan B failed with error, will split batch`);
        currentScanBFailed = true;
      }
    }
    
    // If both scans succeeded, return the results
    if (!currentScanAFailed && !currentScanBFailed) {
      console.log(`[RECURSIVE_SPLIT] Both scans succeeded, returning results`);
      return { scanAResults, scanBResults };
    }
    
    // Check for partial results before deciding to split
    let hasPartialResults = false;
    let missingComments: any[] = [];
    
    if (scanAResults || scanBResults) {
      // Check if we have partial results from either scan
      const scanAPartial = scanAResults ? parsePartialResults(scanAResults, comments.length, batchStart) : { hasPartialResults: false, missingIndices: [], parsedResults: [] };
      const scanBPartial = scanBResults ? parsePartialResults(scanBResults, comments.length, batchStart) : { hasPartialResults: false, missingIndices: [], parsedResults: [] };
      
      // Check for truncation (very few results)
      const scanATruncated = scanAResults && scanAPartial.parsedResults.length > 0 && scanAPartial.parsedResults.length < comments.length * 0.1;
      const scanBTruncated = scanBResults && scanBPartial.parsedResults.length > 0 && scanBPartial.parsedResults.length < comments.length * 0.1;
      
      if (scanAPartial.hasPartialResults || scanBPartial.hasPartialResults || scanATruncated || scanBTruncated) {
        hasPartialResults = true;
        console.log(`[RECURSIVE_SPLIT] Found partial results - Scan A: ${scanAPartial.hasPartialResults} (truncated: ${scanATruncated}), Scan B: ${scanBPartial.hasPartialResults} (truncated: ${scanBTruncated})`);
        
        // Find comments that are missing from both scans
        const missingIndices = new Set([...scanAPartial.missingIndices, ...scanBPartial.missingIndices]);
        missingComments = comments.filter((_, index) => missingIndices.has(batchStart + index));
        
        console.log(`[RECURSIVE_SPLIT] Missing ${missingComments.length} comments out of ${comments.length} total`);
        
        if (missingComments.length === 0) {
          console.log(`[RECURSIVE_SPLIT] All comments have results, no splitting needed`);
          return { scanAResults, scanBResults };
        }
      }
    }
    
    // If we have partial results and missing comments, only resubmit the missing ones
    if (hasPartialResults && missingComments.length > 0 && currentSplit < maxSplits) {
      console.log(`[RECURSIVE_SPLIT] Resubmitting only ${missingComments.length} missing comments`);
      
      // Process only the missing comments
      const missingResults = await processBatchWithRecursiveSplitting(
        missingComments, scanA, scanB, scanATokenLimits, scanBTokenLimits, user, scanRunId, aiLogger, batchStart, maxSplits, currentSplit + 1, currentScanAFailed, currentScanBFailed, scanAResults, scanBResults
      );
      
      // Combine partial results with missing results
      const combinedScanA = scanAResults && missingResults.scanAResults ? 
        `${scanAResults}\n${missingResults.scanAResults}` : 
        (scanAResults || missingResults.scanAResults);
      
      const combinedScanB = scanBResults && missingResults.scanBResults ? 
        `${scanBResults}\n${missingResults.scanBResults}` : 
        (scanBResults || missingResults.scanBResults);
      
      return {
        scanAResults: combinedScanA,
        scanBResults: combinedScanB
      };
    }
    
    // If we need to split and haven't reached max splits
    if ((currentScanAFailed || currentScanBFailed) && currentSplit < maxSplits && comments.length > 1) {
      console.log(`[RECURSIVE_SPLIT] Splitting batch of ${comments.length} comments due to ${currentScanAFailed ? 'Scan A' : ''}${currentScanAFailed && currentScanBFailed ? ' and ' : ''}${currentScanBFailed ? 'Scan B' : ''} failure`);
      
      // Split the batch in half
      const midPoint = Math.floor(comments.length / 2);
      const firstHalf = comments.slice(0, midPoint);
      const secondHalf = comments.slice(midPoint);
      
      console.log(`[RECURSIVE_SPLIT] Splitting into ${firstHalf.length} and ${secondHalf.length} comments`);
      
      // Process both halves recursively, but only resubmit failed models
      // Pass the failure flags so we only resubmit the models that actually failed
      const firstHalfResults = await processBatchWithRecursiveSplitting(
        firstHalf, scanA, scanB, scanATokenLimits, scanBTokenLimits, user, scanRunId, aiLogger, batchStart, maxSplits, currentSplit + 1, currentScanAFailed, currentScanBFailed, scanAResults, scanBResults
      );
      
      const secondHalfResults = await processBatchWithRecursiveSplitting(
        secondHalf, scanA, scanB, scanATokenLimits, scanBTokenLimits, user, scanRunId, aiLogger, batchStart + midPoint, maxSplits, currentSplit + 1, currentScanAFailed, currentScanBFailed, scanAResults, scanBResults
      );
      
      // Combine results safely
      const combinedScanA = [
        firstHalfResults.scanAResults,
        secondHalfResults.scanAResults
      ].filter(result => result !== null && result !== undefined).join('\n');
      
      const combinedScanB = [
        firstHalfResults.scanBResults,
        secondHalfResults.scanBResults
      ].filter(result => result !== null && result !== undefined).join('\n');
      
      return {
        scanAResults: combinedScanA || null,
        scanBResults: combinedScanB || null
      };
    } else {
      // Max splits reached or batch too small, use fallback
      console.warn(`[RECURSIVE_SPLIT] Max splits reached (${currentSplit}/${maxSplits}) or batch too small (${comments.length}), using fallback`);
      
      // Use fallback responses for failed scans
      if (currentScanAFailed) {
        scanAResults = `i:1\nA:N\nB:N`; // Default safe response
      }
      if (currentScanBFailed) {
        scanBResults = `i:1\nA:N\nB:N`; // Default safe response
      }
      
      return { scanAResults, scanBResults };
    }
    
  } catch (error) {
    console.error(`[RECURSIVE_SPLIT] Error processing batch:`, error);
    throw error;
  }
};

// Adjudication deduplication and batching utilities//
interface AdjudicationBatch {
  comments: any[];
  batchIndex: number;
  batchKey: string;
}

const createAdjudicationKey = (comments: any[]): string => {
  // Create a unique key based on comment indices and content hash
  const indices = comments.map(c => c.id || c.scannedIndex).sort();
  const contentHash = comments.map(c => c.originalText || c.text).join('|').length;
  return `${indices.join(',')}-${contentHash}`;
};

const buildAdjudicationInput = (comments: any[]): string => {
  // Build the input string that will be sent to adjudicator //
  return comments.map(comment => {
    const scanA = comment.scanAResult || {};
    const scanB = comment.scanBResult || {};
    const orowRaw = comment.originalRow;
    const sidxRaw = comment.scannedIndex;
    const orow = typeof orowRaw === 'string' ? parseInt(orowRaw, 10) : orowRaw;
    const sidx = typeof sidxRaw === 'string' ? parseInt(sidxRaw, 10) : sidxRaw;
    const itemId = (typeof orow === 'number' && Number.isFinite(orow)) ? orow : (typeof sidx === 'number' && Number.isFinite(sidx) ? sidx : (comment.id || 0));
    return `<<<ITEM ${itemId}>>>\nText: ${comment.originalText || comment.text}\nAI1:\nConcerning: ${scanA.concerning ? 'Y' : 'N'}\nIdentifiable: ${scanA.identifiable ? 'Y' : 'N'}\nAI2:\nConcerning: ${scanB.concerning ? 'Y' : 'N'}\nIdentifiable: ${scanB.identifiable ? 'Y' : 'N'}\n<<<END ${itemId}>>>`;
  }).join('\n\n');
};

const checkForDuplicateAdjudication = async (supabase: any, scanRunId: string, comments: any[]): Promise<boolean> => {
  try {
    const inputString = buildAdjudicationInput(comments);
    const existingAdjudication = await supabase
      .from('ai_logs')
      .select('id, response_status')
      .eq('scan_run_id', scanRunId)
      .eq('function_name', 'adjudicator')
      .eq('response_status', 'success')
      .eq('request_input', inputString)
      .limit(1);

    return existingAdjudication.data && existingAdjudication.data.length > 0;
  } catch (error) {
    console.error('[RUNID-BATCH] Error checking for duplicates:', error);
    return false; // If we can't check, proceed with the call
  }
};


const createAdjudicationBatches = (comments: any[], maxBatchSize: number): AdjudicationBatch[] => {
  const batches: AdjudicationBatch[] = [];
  
  for (let i = 0; i < comments.length; i += maxBatchSize) {
    const batchComments = comments.slice(i, i + maxBatchSize);
    const batchKey = createAdjudicationKey(batchComments);
    
    batches.push({
      comments: batchComments,
      batchIndex: Math.floor(i / maxBatchSize),
      batchKey: batchKey
    });
  }
  
  return batches;
};

const processAdjudicationBatches = async (
  supabase: any,
  scanRunId: string,
  commentsToAdjudicate: any[],
  adjudicatorConfig: any,
  authHeader: string,
  safetyMarginPercent: number = 10,
  aiLogger: AILogger,
  user: any,
  clientCalculatedAdjudicatorOutputTokens?: number
): Promise<any[]> => {
  // Calculate optimal batch size for adjudicator
  console.log(`[RUNID-BATCH] Calculating optimal batch size for ${commentsToAdjudicate.length} comments...`);
  
  // Get adjudicator model configuration
  const { data: adjudicatorModelConfig, error: modelError } = await supabase
    .from('model_configurations')
    .select('*')
    .eq('provider', adjudicatorConfig.provider)
    .eq('model', adjudicatorConfig.model)
    .single();
  
  if (modelError || !adjudicatorModelConfig) {
    console.error(`[RUNID-BATCH] Failed to fetch adjudicator model config:`, modelError);
    throw new Error(`Adjudicator model configuration not found for ${adjudicatorConfig.provider}/${adjudicatorConfig.model}`);
  }
  
  // Batch sizing is now handled client-side
  console.log(`[RUNID-BATCH] Processing ${commentsToAdjudicate.length} comments as single batch (client-managed batching)`);
  
  // Process all comments as a single batch
  const batches = [{ comments: commentsToAdjudicate, batchIndex: 0, batchKey: 'single-batch' }];
  const allResults: any[] = [];
  
  // Track completed batches for this run to prevent duplicates within the same execution
  const gAny: any = globalThis as any;
  const completedBatchKeys = gAny.__adjudicationBatchesCompleted || new Set<string>();
  
  console.log(`[RUNID-BATCH] Processing ${commentsToAdjudicate.length} comments in ${batches.length} batches`);
  
  let processedBatches = 0;
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    const { comments, batchKey } = batch;
    
    console.log(`[RUNID-BATCH] Processing batch ${batchIndex + 1}/${batches.length} (${comments.length} comments, key: ${batchKey})`);
    
    // Check for duplicate batch in memory (same execution)
    const batchKeyForRun = `${scanRunId}-${batchKey}`;
    if (completedBatchKeys.has(batchKeyForRun)) {
      console.log(`[RUNID-BATCH] Batch ${batchIndex + 1} already processed in this execution, skipping duplicate call`);
      continue;
    }
    
    // Check for duplicate batch in database (previous executions)
    // Proceed even if duplicate-like; rely on in-memory keys per run to avoid true re-submission
    try {
      const isDuplicate = await checkForDuplicateAdjudication(supabase, scanRunId, comments);
      if (isDuplicate) {
        console.log(`[RUNID-BATCH] Duplicate-like entry found for batch ${batchIndex + 1}, proceeding to ensure all batches are processed`);
      }
    } catch (dupErr) {
      console.warn(`[RUNID-BATCH] Duplicate check failed (non-fatal):`, dupErr);
    }
    
    try {
      // Transform comments to match adjudicator's expected format
      const adjudicatorComments = comments.map(comment => ({
        id: comment.id,
        originalText: comment.originalText || comment.text,
        originalRow: comment.originalRow,
        scannedIndex: comment.scannedIndex,
        scanAResult: {
          ...comment.adjudicationData.scanAResult,
          reasoning: comment.adjudicationData.scanAResult?.reasoning || 'No reasoning provided'
        },
        scanBResult: {
          ...comment.adjudicationData.scanBResult,
          reasoning: comment.adjudicationData.scanBResult?.reasoning || 'No reasoning provided'
        },
        agreements: comment.adjudicationData.agreements
      }));

      console.log(`[RUNID-BATCH] Calling adjudicator for batch ${batchIndex + 1} with ${comments.length} comments`);

      // Respect TPM/RPM: estimate tokens for this batch and wait if needed
      try {
        const promptTokensAdj = await getPreciseTokensGlobal(adjudicatorConfig.prompt || '', adjudicatorConfig.provider, adjudicatorConfig.model);
        let inputTokenSum = 0;
        for (const c of comments) {
          const ct = await getPreciseTokensGlobal(c.originalText || c.text || '', adjudicatorConfig.provider, adjudicatorConfig.model);
          inputTokenSum += ct;
        }
        const tokensPerCommentOut = adjudicatorConfig.tokens_per_comment || 13;
        const estimatedTotalTokens = promptTokensAdj + inputTokenSum + (comments.length * tokensPerCommentOut);
        const tpmLimitAdj = Number.isFinite(adjudicatorModelConfig?.tpm_limit) ? adjudicatorModelConfig.tpm_limit : undefined;
        const rpmLimitAdj = Number.isFinite(adjudicatorModelConfig?.rpm_limit) ? adjudicatorModelConfig.rpm_limit : undefined;
        if ((tpmLimitAdj && tpmLimitAdj > 0) || (rpmLimitAdj && rpmLimitAdj > 0)) {
          const tpmWaitMs = calculateWaitTime(adjudicatorConfig.provider, adjudicatorConfig.model, estimatedTotalTokens, tpmLimitAdj);
          const rpmWaitMs = calculateRPMWaitTime(adjudicatorConfig.provider, adjudicatorConfig.model, 1, rpmLimitAdj);
          const waitMs = Math.max(tpmWaitMs || 0, rpmWaitMs || 0);
          if (waitMs && waitMs > 0) {
            console.log(`[RUNID-BATCH][RATE_LIMIT] Waiting ${waitMs}ms before request to respect limits (TPM=${tpmLimitAdj || 'n/a'}, RPM=${rpmLimitAdj || 'n/a'}, estTokens=${estimatedTotalTokens})`);
            await new Promise(r => setTimeout(r, waitMs));
          }
        }
      } catch (rateErr) {
        console.warn(`[RUNID-BATCH][RATE_LIMIT] Failed to compute precise rate limits, proceeding without wait:`, rateErr);
      }

      const adjudicationResponse = await supabase.functions.invoke('adjudicator', {
        body: {
          comments: adjudicatorComments,
          adjudicatorConfig: {
            provider: adjudicatorConfig.provider,
            model: adjudicatorConfig.model,
            prompt: adjudicatorConfig.prompt,
            max_tokens: adjudicatorConfig.max_tokens,
            maxBatchesPerRequest: 1
          },
          scanRunId: scanRunId,
          batchIndex: batchIndex,
          batchKey: batchKey,
          clientCalculatedOutputTokens: clientCalculatedAdjudicatorOutputTokens
        },
        headers: {
          authorization: authHeader
        }
      });

      if (adjudicationResponse.error) {
        console.error(`[RUNID-BATCH] Error calling adjudicator for batch ${batchIndex + 1}:`, adjudicationResponse.error);
        throw new Error(`Adjudicator batch ${batchIndex + 1} failed: ${adjudicationResponse.error.message}`);
      }

      console.log(`[RUNID-BATCH] Batch ${batchIndex + 1} completed successfully`);
      // Record usage against TPM/RPM trackers if configured
      try {
        const tokensPerCommentOut = adjudicatorConfig.tokens_per_comment || 13;
        const promptTokensAdj = await getPreciseTokensGlobal(adjudicatorConfig.prompt || '', adjudicatorConfig.provider, adjudicatorConfig.model);
        let inputTokenSum = 0;
        for (const c of comments) {
          inputTokenSum += Math.ceil((c.originalText || c.text || '').length / 4);
        }
        const estimatedTotalTokens = promptTokensAdj + inputTokenSum + (comments.length * tokensPerCommentOut);
        recordUsage(adjudicatorConfig.provider, adjudicatorConfig.model, estimatedTotalTokens);
        recordRequest(adjudicatorConfig.provider, adjudicatorConfig.model, 1);
      } catch (recErr) {
        console.warn(`[RUNID-BATCH][RATE_LIMIT] Failed to record usage:`, recErr);
      }
      
      // Mark this batch as completed to prevent duplicates in this execution
      completedBatchKeys.add(batchKeyForRun);
      console.log(`[RUNID-BATCH] Marked batch ${batchIndex + 1} (key: ${batchKeyForRun}) as completed`);

      // Persist a success marker row to ai_logs to help cross-invocation dedupe
      try {
        await aiLogger.logResponse(user.id, scanRunId, 'adjudicator', adjudicatorConfig.provider, adjudicatorConfig.model, 'adjudication', 'adjudication', '[BATCH SUCCESS]', undefined);
      } catch (persistErr) {
        console.warn(`[RUNID-BATCH] Failed to persist success marker:`, persistErr);
      }

      processedBatches++;
      // Stop early if caller wants to split adjudication across invocations
      if (Number.isFinite((adjudicatorConfig as any)?.maxBatchesPerRequest) && (adjudicatorConfig as any).maxBatchesPerRequest > 0) {
        const cap = (adjudicatorConfig as any).maxBatchesPerRequest as number;
        if (processedBatches >= cap) {
          console.log(`[RUNID-BATCH] Reached adjudicator maxBatchesPerRequest=${cap}, stopping adjudication for this invocation`);
          break;
        }
      }
      
      // Add results to the collection
      if (adjudicationResponse.data?.adjudicatedComments) {
        allResults.push(...adjudicationResponse.data.adjudicatedComments);
      }
      
      // Add delay between batches to respect rate limits (if not the last batch)
      if (batchIndex < batches.length - 1) {
        const delayMs = 1000; // 1 second delay between batches
        console.log(`[RUNID-BATCH] Waiting ${delayMs}ms before next batch to respect rate limits`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
      
    } catch (batchError) {
      console.error(`[RUNID-BATCH] Failed to process batch ${batchIndex + 1}:`, batchError);
      throw batchError; // Re-throw to stop processing
    }
  }
  
  console.log(`[RUNID-BATCH] All batches completed. Total results: ${allResults.length}`);
  return allResults;
};

serve(async (req) => {
  // Top-level error handling to ensure CORS headers are always returned
  let corsHeaders: any;
  try {
    console.log('[SCAN-COMMENTS] Edge function called with method:', req.method);
    console.log('[SCAN-COMMENTS] Request URL:', req.url);
    console.log('[SCAN-COMMENTS] Request headers:', Object.fromEntries(req.headers.entries()));
    
    // Build CORS headers for this request
    const origin = req.headers.get('origin');
    corsHeaders = buildCorsHeaders(origin);
    console.log('[SCAN-COMMENTS] Origin:', origin);
    console.log('[SCAN-COMMENTS] CORS headers built successfully');

    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const overallStartTime = Date.now(); // Track overall process time
    const MAX_EXECUTION_TIME = 140 * 1000; // 140 seconds max execution time (2.33 minutes)

    try {
    console.log('[SCAN-COMMENTS] Starting main try block');
    const requestBody = await req.json();
    console.log('[SCAN-COMMENTS] Request body parsed successfully');
    // Generate a per-request scanRunId for log correlation
    const scanRunId = requestBody.scanRunId || String(Math.floor(1000 + Math.random() * 9000));
    (globalThis as any).__scanRunId = scanRunId;
    console.log('[SCAN-COMMENTS] Scan run ID set:', scanRunId);

    // Authenticate user first
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header provided');
    }

    const token = authHeader.replace('Bearer ', '');
    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_ANON_KEY') || ''
    );

    const { data: userData, error: userError } = await supabaseAuth.auth.getUser(token);
    if (userError || !userData.user) {
      throw new Error('User not authenticated');
    }

    const user = userData.user;
    console.log(`[RUNID-BATCH] Processing request for user: ${user.email}`);
    
    // Global run-guards to prevent duplicate analysis batches for the same run id
    const gAny: any = globalThis as any;
    gAny.__runInProgress = gAny.__runInProgress || new Set<string>();
    gAny.__runCompleted = gAny.__runCompleted || new Set<string>();
    gAny.__analysisStarted = gAny.__analysisStarted || new Set<string>();
    gAny.__adjudicationBatchesCompleted = gAny.__adjudicationBatchesCompleted || new Set<string>();
    
    // Log run id context
    console.log(`[RUNID-BATCH] Request started`);
    console.log(`[RUNID-BATCH] comments=${requestBody.comments?.length} defaultMode=${requestBody.defaultMode} batchStart=${requestBody.batchStart}`);

    // Allow incremental processing: only block duplicate initial requests (batchStart=0)
    const isCached = Boolean(requestBody.useCachedAnalysis);
    const batchStartValue = typeof requestBody.batchStart === 'number' ? requestBody.batchStart : 
                           typeof requestBody.batchStart === 'string' ? parseInt(requestBody.batchStart) : 0;
    const isIncrementalRequest = Number.isFinite(batchStartValue) && batchStartValue > 0;
    const checkStatusOnly = Boolean(requestBody.checkStatusOnly);
    const skipAdjudication = Boolean(requestBody.skipAdjudication);
    const clientManagedBatching = Boolean(requestBody.clientManagedBatching);
    const clientCalculatedAdjudicatorOutputTokens = Number.isFinite(requestBody.clientCalculatedAdjudicatorOutputTokens) ? Number(requestBody.clientCalculatedAdjudicatorOutputTokens) : undefined;
    // Optional runtime controls to ensure timely partial responses for large datasets
    const requestedMaxBatchesPerRequest = Number.isFinite(requestBody.maxBatchesPerRequest) ? Math.max(1, Math.min(50, Number(requestBody.maxBatchesPerRequest))) : undefined;
    const requestedMaxRunMs = Number.isFinite(requestBody.maxRunMs) ? Math.max(10000, Math.min(140000, Number(requestBody.maxRunMs))) : undefined;

    // Fast-path: status-only polling should not re-run scans
    if (checkStatusOnly) {
      try {
        const supabase = createClient(
          Deno.env.get('SUPABASE_URL') || '',
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
        );
        // Consider adjudication complete if we have a successful adjudicator log for this run
        const { data: adjLogs } = await supabase
          .from('ai_logs')
          .select('id')
          .eq('scan_run_id', scanRunId)
          .eq('function_name', 'adjudicator')
          .eq('response_status', 'success')
          .limit(1);

        const adjudicationCompleted = Array.isArray(adjLogs) && adjLogs.length > 0;
        const statusResponse = {
          comments: [],
          batchStart: batchStartValue,
          batchSize: 0,
          hasMore: false,
          totalComments: requestBody.comments?.length || 0,
          adjudicationCompleted
        };
        return new Response(JSON.stringify(statusResponse), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      } catch (_e) {
        // On any error, return a minimal status without re-running scans
        const statusResponse = {
          comments: [],
          batchStart: batchStartValue,
          batchSize: 0,
          hasMore: false,
          totalComments: requestBody.comments?.length || 0,
          adjudicationCompleted: false
        };
        return new Response(JSON.stringify(statusResponse), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }
    
    if (!clientManagedBatching && !isCached && !isIncrementalRequest) {
      // Only block duplicate initial requests (batchStart=0 or undefined)
      if (gAny.__analysisStarted.has(scanRunId)) {
        console.log(`[RUNID-BATCH] scanRunId=${scanRunId} received a second initial analysis request. Ignoring.`);
        return new Response(JSON.stringify({
          comments: [],
          batchStart: batchStartValue,
          batchSize: 0,
          hasMore: false,
          totalComments: requestBody.comments?.length || 0,
          summary: { total: 0, concerning: 0, identifiable: 0, needsAdjudication: 0 }
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      gAny.__analysisStarted.add(scanRunId);
    } else if (!clientManagedBatching && isIncrementalRequest) {
      console.log(`[RUNID-BATCH] Allowing incremental request for scanRunId=${scanRunId} with batchStart=${batchStartValue}`);
      // Deduplicate incremental batch processing per (runId,batchStart) within this function's lifecycle
      gAny.__processedBatchStarts = gAny.__processedBatchStarts || new Set<string>();
      const batchKey = `${scanRunId}:${batchStartValue}`;
      if (gAny.__processedBatchStarts.has(batchKey)) {
        console.log(`[RUNID-BATCH] Incremental batch already processed in this execution for key=${batchKey}. Skipping.`);
        return new Response(JSON.stringify({
          comments: [],
          batchStart: batchStartValue,
          batchSize: 0,
          hasMore: batchStartValue < (requestBody.comments?.length || 0),
          totalComments: requestBody.comments?.length || 0,
          summary: { total: 0, concerning: 0, identifiable: 0, needsAdjudication: 0 }
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      // Mark as processed early to prevent double-submission if concurrent calls arrive
      gAny.__processedBatchStarts.add(batchKey);
    }
    // If this run id has already completed, short-circuit to avoid duplicate model calls
    if (!clientManagedBatching && gAny.__runCompleted.has(scanRunId)) {
      console.log(`[RUNID-BATCH] scanRunId=${scanRunId} already completed. Skipping.`);
      return new Response(JSON.stringify({
        comments: [],
        batchStart: batchStartValue,
        batchSize: 0,
        hasMore: false,
        totalComments: requestBody.comments?.length || 0,
        summary: { total: 0, concerning: 0, identifiable: 0, needsAdjudication: 0 }
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    

    
    // Allow incremental processing: only block if this is a duplicate initial request
    if (!clientManagedBatching && gAny.__runInProgress.has(scanRunId) && !isIncrementalRequest) {
      console.log(`[RUNID-BATCH] scanRunId=${scanRunId} already in progress. Skipping duplicate call.`);
      return new Response(JSON.stringify({
        comments: [],
        batchStart: batchStartValue,
        batchSize: 0,
        hasMore: false,
        totalComments: requestBody.comments?.length || 0,
        summary: { total: 0, concerning: 0, identifiable: 0, needsAdjudication: 0 }
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    
    console.log(`[RUN STATUS] scanRunId=${scanRunId}, isIncrementalRequest=${isIncrementalRequest}, runInProgress=${gAny.__runInProgress.has(scanRunId)}`);
    
    // Mark run as in progress (only for non-client-managed batching)
    if (!clientManagedBatching) {
      gAny.__runInProgress.add(scanRunId);
      console.log(`[RUN STATUS] scanRunId=${scanRunId} marked as in progress`);
    }
    
    const { 
      comments: inputComments, 
      defaultMode = 'redact',
      useCachedAnalysis = false,
      isDemoScan = false
    } = requestBody;
    
    // Use the parsed batchStartValue instead of the raw requestBody.batchStart
    const batchStart = batchStartValue;

    console.log(`[REQUEST] Received request body:`, {
      commentsCount: inputComments?.length,
      defaultMode,
      batchStart,
      useCachedAnalysis,
      isDemoScan,
      skipAdjudication,
      maxBatchesPerRequest: requestedMaxBatchesPerRequest,
      maxRunMs: requestedMaxRunMs
    });

    console.log(`[REQUEST_DETAILS] phase=${useCachedAnalysis ? 'followup' : 'initial'} cached=${useCachedAnalysis} comments=${inputComments?.length} batchStart=${batchStart}`);

    // Initialize finalBatchSize early to prevent ReferenceError
    let finalBatchSize: number = 1; // Default fallback value
    console.log(`[DEBUG] finalBatchSize initialized to: ${finalBatchSize}`);

    if (!inputComments || !Array.isArray(inputComments) || inputComments.length === 0) {
      return new Response(JSON.stringify({ error: 'No comments provided' }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
        status: 400 
      });
    }

    // Get AI configurations from database
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    );
    
    // Check database for run status to prevent duplicates across function instances
    // IMPORTANT: Only apply this to duplicate INITIAL requests. Incremental follow-ups must not be blocked.
    if (!clientManagedBatching && !isIncrementalRequest && !isCached) {
      const { data: existingRun, error: runCheckError } = await supabase
        .from('ai_logs')
        .select('id, function_name, response_status, created_at')
        .eq('scan_run_id', scanRunId)
        .eq('function_name', 'scan-comments')
        .eq('response_status', 'success')
        .order('created_at', { ascending: false })
        .limit(1);
      
      if (runCheckError) {
        console.error('[RUN CHECK] Error checking run status:', runCheckError);
      } else if (existingRun && existingRun.length > 0) {
        const lastRun = existingRun[0];
        const runAge = Date.now() - new Date(lastRun.created_at).getTime();
        const maxRunAge = 5 * 60 * 1000; // 5 minutes
        
        if (runAge < maxRunAge) {
          console.log(`[RUNID-BATCH] scanRunId=${scanRunId} already completed recently (${Math.round(runAge/1000)}s ago). Skipping duplicate initial call.`);
          return new Response(JSON.stringify({
            comments: [],
            batchStart: batchStartValue,
            batchSize: 0,
            hasMore: false,
            totalComments: requestBody.comments?.length || 0,
            summary: { total: 0, concerning: 0, identifiable: 0, needsAdjudication: 0 }
          }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
      }
    } else if (!clientManagedBatching && isIncrementalRequest) {
      console.log(`[RUN CHECK] Skipping DB duplicate check for incremental request scanRunId=${scanRunId}`);
    } else if (clientManagedBatching) {
      console.log(`[RUN CHECK] Skipping DB duplicate check for client-managed batching scanRunId=${scanRunId}`);
    }

    const { data: configs, error: configError } = await supabase
      .from('ai_configurations')
      .select('*');

    if (configError) {
      console.error('Database error fetching AI configurations:', configError);
      throw new Error(`Database error: ${configError.message || JSON.stringify(configError)}`);
    }

    if (!configs || configs.length === 0) {
      console.error('No active AI configurations found');
      throw new Error('No active AI configurations found in database');
    }

    console.log(`[CONFIG] Found ${configs.length} active configurations:`, configs.map(c => `${c.scanner_type}:${c.provider}/${c.model}`));

    const scanA = configs.find(c => c.scanner_type === 'scan_a');
    const scanB = configs.find(c => c.scanner_type === 'scan_b');
    const adjudicator = configs.find(c => c.scanner_type === 'adjudicator');

    if (!scanA || !scanB) {
      throw new Error('Missing required AI configurations: scan_a and scan_b');
    }

    if (!adjudicator) {
      console.warn('No adjudicator configuration found - adjudication will be skipped');
    }

    console.log(`[CONFIG] Scan A: ${scanA.provider}/${scanA.model}, Scan B: ${scanB.provider}/${scanB.model}`);
    console.log(`[CONFIG] Scan A tokens_per_comment: ${scanA.tokens_per_comment || 13}, Scan B tokens_per_comment: ${scanB.tokens_per_comment || 13}`);
    if (adjudicator) {
      console.log(`[CONFIG] Adjudicator: ${adjudicator.provider}/${adjudicator.model}, tokens_per_comment: ${adjudicator.tokens_per_comment || 13}`);
    }

    // Fetch model configurations for token limits
    const { data: modelConfigs, error: modelError } = await supabase
      .from('model_configurations')
      .select('*');

    if (modelError) {
      console.error('Database error fetching model configurations:', modelError);
      throw new Error(`Database error: ${modelError.message || JSON.stringify(modelError)}`);
    }

    if (!modelConfigs || modelConfigs.length === 0) {
      console.warn('No model configurations found, using default token limits');
    }

    console.log(`[MODEL_CONFIG] Found ${modelConfigs?.length || 0} model configurations`);

    // Temperature will be configured when model configs are fetched later

    // Check user credits before processing (only for Scan A, unless it's a demo scan)
    const creditsPerComment = 1; // 1 credit per comment for Scan A
    
    // Always fetch user credits for display purposes (even for demo scans)
    let userCredits: any = null;
    try {
      console.log(`[CREDITS] Fetching credits for user: ${user.id}`);
      const { data: creditsData, error: creditsError } = await supabase
        .from('user_credits')
        .select('available_credits, total_credits_used')
        .eq('user_id', user.id)
        .single();
      
      console.log(`[CREDITS] Raw credits query result:`, { creditsData, creditsError });
      
      if (creditsError && creditsError.code !== 'PGRST116') { // PGRST116 = no rows returned
        console.error('Error fetching user credits:', creditsError);
        // Don't fail for demo scans, just log the error
        if (!isDemoScan) {
          throw new Error(`Failed to check user credits: ${creditsError.message}`);
        }
      } else {
        userCredits = creditsData;
        console.log(`[CREDITS] Successfully fetched user credits:`, userCredits);
      }
    } catch (error) {
      if (!isDemoScan) {
        throw error;
      }
      console.warn('[CREDITS] Could not fetch user credits for demo scan:', error);
    }
    
    if (isDemoScan) {
      console.log(`[CREDITS] Demo scan detected - no credits required`);
    } else {
      console.log(`[CREDITS] Checking credits for user: ${user.id} (Scan A only)`);
      
      // Calculate credits needed for Scan A only (1 credit per comment)
      const totalCreditsNeeded = inputComments.length * creditsPerComment;
      
      const availableCredits = userCredits?.available_credits || 100; // Default 100 if no record exists
      
      if (availableCredits < totalCreditsNeeded) {
        console.warn(`[CREDITS] Insufficient credits for Scan A: ${availableCredits} available, ${totalCreditsNeeded} needed`);
        const errorResponse = { 
          error: `Insufficient credits. You have ${availableCredits} credits available, but need ${totalCreditsNeeded} credits to scan ${inputComments.length} comments with Scan A.`,
          insufficientCredits: true,
          availableCredits,
          requiredCredits: totalCreditsNeeded,
          commentsCount: inputComments.length,
          status: 402,
          success: false
        };
        
        console.log(`[CREDITS] Returning insufficient credits response:`, errorResponse);
        
        // Return 200 status but include error info in body for better Supabase compatibility
        return new Response(JSON.stringify(errorResponse), { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
          status: 200
        });
      }
      
      console.log(`[CREDITS] Sufficient credits available for Scan A: ${availableCredits} >= ${totalCreditsNeeded}`);
    }

    // Get batch sizing configuration for dynamic batching
    const { data: batchSizingData } = await supabase
      .from('batch_sizing_config')
      .select('*')
      .single();
    
    if (!batchSizingData) {
      console.warn('[BATCH] No batch sizing configuration found, using defaults');
    }
    
    // Get I/O ratios for post-processing and safety margin from configuration
    const ioRatios = {
      redaction_io_ratio: batchSizingData?.redaction_io_ratio ?? 1.7,
      rephrase_io_ratio: batchSizingData?.rephrase_io_ratio ?? 2.3
    };
    
    const safetyMarginPercent = batchSizingData?.safety_margin_percent ?? 15;
    
    console.log(`[BATCH] Post-processing I/O Ratios:`, ioRatios);
    console.log(`[BATCH] Safety Margin: ${safetyMarginPercent}%`);
    console.log(`[BATCH] Scan and Adjudication: Using configurable tokens per comment estimation`);
    
    // Calculate dynamic batch sizes based on I/O ratios and token limits
    // Use precise token counting for more accurate batch sizing
    const getPreciseTokens = async (text: string, provider: string, model: string) => {
      try {
        const { getPreciseTokenCount } = await import('./token-counter.ts');
        return await getPreciseTokenCount(provider, model, text);
      } catch (error) {
        console.warn(`[RUNID-BATCH] Fallback to approximation for ${provider}/${model}:`, error);
        return Math.ceil(text.length / 4);
      }
    };
    
    const estimateBatchInputTokens = async (comments: any[], prompt: string, provider: string, model: string) => {
      const promptTokens = await getPreciseTokens(prompt, provider, model);
      let commentTokens = 0;
      
      for (const comment of comments) {
        const commentText = comment.originalText || comment.text || '';
        commentTokens += await getPreciseTokens(commentText, provider, model);
      }
      
      return promptTokens + commentTokens;
    };
    
    
    // Get token limits and temperature for the models being used
    const scanAModelConfig = modelConfigs?.find(m => m.provider === scanA.provider && m.model === scanA.model);
    const scanBModelConfig = modelConfigs?.find(m => m.provider === scanB.provider && m.model === scanB.model);
    
    console.log(`[MODEL_LOOKUP] Looking for Scan A: ${scanA.provider}/${scanA.model}`);
    console.log(`[MODEL_LOOKUP] Looking for Scan B: ${scanB.provider}/${scanB.model}`);
    console.log(`[MODEL_LOOKUP] Available models:`, modelConfigs?.map(m => `${m.provider}/${m.model}`));
    
    if (!scanAModelConfig?.output_token_limit) {
      console.error(`[ERROR] Scan A model config missing output_token_limit:`, scanAModelConfig);
      console.error(`[ERROR] Available model configs:`, modelConfigs);
      throw new Error(`Max Tokens is not defined for Scan A model (${scanA.provider}/${scanA.model}). Please check the Model Configuration section in your dashboard.`);
    }
    
    if (!scanBModelConfig?.output_token_limit) {
      console.error(`[ERROR] Scan B model config missing output_token_limit:`, scanBModelConfig);
      console.error(`[ERROR] Available model configs:`, modelConfigs);
      throw new Error(`Max Tokens is not defined for Scan B model (${scanB.provider}/${scanB.model}). Please check the Model Configuration section in your dashboard.`);
    }
    
    // Configure temperature for both scans
    // Prefer Dashboard AI Config (ai_configurations.temperature), fallback to model_configurations.temperature, else 0
    const aiTempA = (scanA as any)?.temperature;
    const aiTempB = (scanB as any)?.temperature;
    scanA.temperature = (aiTempA !== undefined && aiTempA !== null)
      ? aiTempA
      : (scanAModelConfig?.temperature ?? 0);
    scanB.temperature = (aiTempB !== undefined && aiTempB !== null)
      ? aiTempB
      : (scanBModelConfig?.temperature ?? 0);
    
    console.log(`[CONFIG] Scan A temperature: ${scanA.temperature}, Scan B temperature: ${scanB.temperature}`);
    
    const scanATokenLimits = {
      input_token_limit: scanAModelConfig?.input_token_limit || 128000,
      output_token_limit: scanAModelConfig.output_token_limit,
      tpm_limit: scanAModelConfig?.tpm_limit,
      rpm_limit: scanAModelConfig?.rpm_limit
    };
    
    const scanBTokenLimits = {
      input_token_limit: scanBModelConfig?.input_token_limit || 128000,
      output_token_limit: scanBModelConfig.output_token_limit,
      tpm_limit: scanBModelConfig?.tpm_limit,
      rpm_limit: scanBModelConfig?.rpm_limit
    };
    
    console.log(`[TOKEN LIMITS] Scan A:`, scanATokenLimits);
    console.log(`[TOKEN LIMITS] Scan B:`, scanBTokenLimits);
    
    // Batch sizing is now handled client-side
    console.log(`[CLIENT_MANAGED] Processing ${inputComments.length} comments as single batch (client-managed batching)`);
    finalBatchSize = inputComments.length;
    
    // Process comments in smaller chunks to avoid gateway timeout
    // Reduce batch limits to prevent edge function timeout
    const MAX_BATCHES_PER_REQUEST = requestedMaxBatchesPerRequest ?? 1; // Tunable; default conservative
    const MAX_EXECUTION_TIME = requestedMaxRunMs ?? 140 * 1000; // Tunable; default conservative 140s
    let allScannedComments: any[] = [];
    let totalSummary = { total: 0, concerning: 0, identifiable: 0, needsAdjudication: 0 };
    
    // Initialize AI logger for this scan run
    const aiLogger = new AILogger();
    aiLogger.setFunctionStartTime(overallStartTime);
    
    let batchesProcessed = 0;
    
    if (clientManagedBatching) {
      // For client-managed batching, process only the provided comments as a single batch
      console.log(`[CLIENT_MANAGED] Processing single batch: ${inputComments.length} comments starting from index ${batchStart}`);
      
      // Client-managed: the request already contains exactly one batch
      const batch = inputComments;
      const batchEnd = batchStart + batch.length;
      
      console.log(`[PROCESS] Batch ${batchStart + 1}-${batchEnd} of ${batchStart + batch.length} (finalBatchSize=${finalBatchSize})`);
      console.log(`[TOKENS] Scan A max_tokens: ${scanATokenLimits.output_token_limit}, Scan B max_tokens: ${scanBTokenLimits.output_token_limit}`);
      console.log(`[TOKENS] Scan A temperature: ${scanA.temperature}, Scan B temperature: ${scanB.temperature}`);

      // Process batch with Scan A and Scan B, enforcing TPM limits (mirrors server-managed path)
      const batchStartTime = Date.now();

      // Calculate estimated tokens for this batch
      const batchInput = buildBatchInput(batch, batchStart + 1);
      const estimatedInputTokens = Math.ceil(batchInput.length / 4);
      const estimatedOutputTokens = batch.length * Math.max(scanA.tokens_per_comment || 13, scanB.tokens_per_comment || 13);
      const totalEstimatedTokens = estimatedInputTokens + estimatedOutputTokens;

      console.log(`[BATCH ${batchStart + 1}-${batchEnd}] Estimated tokens: ${totalEstimatedTokens} (${estimatedInputTokens} input + ${estimatedOutputTokens} output)`);

      // Check rate limits and wait if necessary before making parallel calls
      if (scanATokenLimits.tpm_limit || scanATokenLimits.rpm_limit) {
        const tpmWaitTimeA = calculateWaitTime(scanA.provider, scanA.model, totalEstimatedTokens, scanATokenLimits.tpm_limit);
        const rpmWaitTimeA = calculateRPMWaitTime(scanA.provider, scanA.model, 1, scanATokenLimits.rpm_limit);
        const maxWaitTimeA = Math.max(tpmWaitTimeA, rpmWaitTimeA);
        if (maxWaitTimeA > 0) {
          const reason: string[] = [];
          if (tpmWaitTimeA > 0) reason.push(`TPM (${tpmWaitTimeA}ms)`);
          if (rpmWaitTimeA > 0) reason.push(`RPM (${rpmWaitTimeA}ms)`);
          console.log(`[BATCH ${batchStart + 1}-${batchEnd}] [SCAN_A] Waiting ${maxWaitTimeA}ms to comply with ${reason.join(' and ')} limits`);
          await new Promise(resolve => setTimeout(resolve, maxWaitTimeA));
        }
      }

      if (scanBTokenLimits.tpm_limit || scanBTokenLimits.rpm_limit) {
        const tpmWaitTimeB = calculateWaitTime(scanB.provider, scanB.model, totalEstimatedTokens, scanBTokenLimits.tpm_limit);
        const rpmWaitTimeB = calculateRPMWaitTime(scanB.provider, scanB.model, 1, scanBTokenLimits.rpm_limit);
        const maxWaitTimeB = Math.max(tpmWaitTimeB, rpmWaitTimeB);
        if (maxWaitTimeB > 0) {
          const reason: string[] = [];
          if (tpmWaitTimeB > 0) reason.push(`TPM (${tpmWaitTimeB}ms)`);
          if (rpmWaitTimeB > 0) reason.push(`RPM (${rpmWaitTimeB}ms)`);
          console.log(`[BATCH ${batchStart + 1}-${batchEnd}] [SCAN_B] Waiting ${maxWaitTimeB}ms to comply with ${reason.join(' and ')} limits`);
          await new Promise(resolve => setTimeout(resolve, maxWaitTimeB));
        }
      }

      // Use improved recursive splitting to handle harmful content detection
      console.log(`[RECURSIVE_SPLIT] Processing batch of ${batch.length} comments with improved harmful content detection`);
      
      const recursiveResults = await processBatchWithRecursiveSplitting(
        batch, scanA, scanB, scanATokenLimits, scanBTokenLimits, user, scanRunId, aiLogger, batchStart, 3, 0, false, false, null, null
      );
      
      const scanAResultsClient = recursiveResults.scanAResults;
      const scanBResultsClient = recursiveResults.scanBResults;
      const batchEndTimeClient = Date.now();
      console.log(`[PERFORMANCE] Batch ${batchStart + 1}-${batchEnd} processed in ${batchEndTimeClient - batchStartTime}ms (parallel AI calls)`);

      // Record usage AFTER the AI calls complete
      if (scanATokenLimits.tpm_limit || scanATokenLimits.rpm_limit) {
        recordUsage(scanA.provider, scanA.model, totalEstimatedTokens);
        recordRequest(scanA.provider, scanA.model, 1);
        console.log(`[BATCH ${batchStart + 1}-${batchEnd}] [SCAN_A] Recorded usage: ${totalEstimatedTokens} tokens, 1 request`);
      }
      if (scanBTokenLimits.tpm_limit || scanBTokenLimits.rpm_limit) {
        recordUsage(scanB.provider, scanB.model, totalEstimatedTokens);
        recordRequest(scanB.provider, scanB.model, 1);
        console.log(`[BATCH ${batchStart + 1}-${batchEnd}] [SCAN_B] Recorded usage: ${totalEstimatedTokens} tokens, 1 request`);
      }

      console.log(`[RESULT] Scan A ${scanA.provider}/${scanA.model}: type=${typeof scanAResultsClient} len=${Array.isArray(scanAResultsClient) ? scanAResultsClient.length : 'n/a'}`);
      console.log(`[RESULT] Scan B ${scanB.provider}/${scanB.model}: type=${typeof scanBResultsClient} len=${Array.isArray(scanBResultsClient) ? scanBResultsClient.length : 'n/a'}`);

      // Parse and validate results
      const scanAResultsArray = parseBatchResults(scanAResultsClient, batch.length, 'Scan A', batchStart + 1);
      const scanBResultsArray = parseBatchResults(scanBResultsClient, batch.length, 'Scan B', batchStart + 1);
      // Index-aligned lookup by returned index to avoid order mismatches
      const scanAByIndex = new Map<number, any>(scanAResultsArray.filter(r => typeof r?.index === 'number').map(r => [r.index as number, r]));
      const scanBByIndex = new Map<number, any>(scanBResultsArray.filter(r => typeof r?.index === 'number').map(r => [r.index as number, r]));

      if (scanAResultsArray.length !== batch.length || scanBResultsArray.length !== batch.length) {
        console.error(`[ERROR] Incomplete batch results detected for client-managed batch ${batchStart + 1}-${batchEnd}`);
        console.error(`[ERROR] Expected ${batch.length} results, got Scan A: ${scanAResultsArray.length}, Scan B: ${scanBResultsArray.length}`);
      }

      // Process each comment in this batch
      const maxResults = Math.max(scanAResultsArray.length, scanBResultsArray.length);
      console.log(`[BATCH_DEBUG] Processing batch ${batchStart + 1}-${batchEnd}: batch.length=${batch.length}, maxResults=${maxResults}`);
      for (let i = 0; i < maxResults && i < batch.length; i++) {
        const comment = batch[i];
        const stableIndexCandidate = (typeof (comment as any)?.originalRow === 'number' && (comment as any).originalRow > 0)
          ? (comment as any).originalRow
          : (typeof (comment as any)?.scannedIndex === 'number' && (comment as any).scannedIndex > 0)
            ? (comment as any).scannedIndex
            : (batchStart + i + 1);
        const expectedIndex = Number.isFinite(stableIndexCandidate) ? stableIndexCandidate : (batchStart + i + 1);
        const scanAResultRaw = scanAByIndex.get(expectedIndex) || scanAResultsArray[i];
        const scanBResultRaw = scanBByIndex.get(expectedIndex) || scanBResultsArray[i];
        const scanAResult = scanAResultRaw ? { ...scanAResultRaw, model: `${scanA.provider}/${scanA.model}` } : scanAResultRaw;
        const scanBResult = scanBResultRaw ? { ...scanBResultRaw, model: `${scanB.provider}/${scanB.model}` } : scanBResultRaw;
        if (!scanAResult || !scanBResult) {
          console.warn(`Missing scan results for comment ${expectedIndex}, skipping`);
          continue;
        }
        if (scanAResult.index !== expectedIndex) {
          console.warn(`[WARNING] Scan A returned index ${scanAResult.index} for comment ${expectedIndex}`);
        }
        if (scanBResult.index !== expectedIndex) {
          console.warn(`[WARNING] Scan B returned index ${scanBResult.index} for comment ${expectedIndex}`);
        }
        const concerningDisagreement = scanAResult.concerning !== scanBResult.concerning;
        const identifiableDisagreement = scanAResult.identifiable !== scanBResult.identifiable;
        const needsAdjudication = concerningDisagreement || identifiableDisagreement;
        if (needsAdjudication) {
          totalSummary.needsAdjudication++;
        }
        const concerning = Boolean(scanAResult.concerning || scanBResult.concerning);
        const identifiable = Boolean(scanAResult.identifiable || scanBResult.identifiable);
        if (concerning) totalSummary.concerning++;
        if (identifiable) totalSummary.identifiable++;
        // Mode mapping policy:
        // - identifiable => redact (higher priority)
        // - concerning-only => rephrase
        // - else => original
        let mode: 'redact' | 'rephrase' | 'original';
        if (identifiable) {
          mode = 'redact';
        } else if (concerning) {
          mode = 'rephrase';
        } else {
          mode = 'original';
        }
        const processedComment = {
          id: comment.id,
          originalText: comment.text,
          originalRow: comment.originalRow || expectedIndex,
          scannedIndex: comment.scannedIndex || expectedIndex,
          scanAResult: scanAResult,
          scanBResult: scanBResult,
          concerning: concerning,
          identifiable: identifiable,
          mode: mode,
          needsAdjudication: needsAdjudication,
          adjudicationReason: needsAdjudication ? (concerningDisagreement ? 'concerning_disagreement' : 'identifiable_disagreement') : null
        };
        allScannedComments.push(processedComment);
      }
      
      batchesProcessed = 1;
      
      console.log(`[RUNID-BATCH] Processed batch: rows ${batchStart} to ${batchEnd - 1} (${allScannedComments.length} comments)`);
    } else {
      // Original server-managed batching logic
      for (let currentBatchStart = batchStart; currentBatchStart < inputComments.length; currentBatchStart += finalBatchSize) {
      // Check for timeout before processing each batch
      const currentTime = Date.now();
      const elapsedTime = currentTime - overallStartTime;
      
      // Check if we've processed enough batches for this request
      if (batchesProcessed >= MAX_BATCHES_PER_REQUEST) {
        console.log(`[BATCH_LIMIT] Processed ${batchesProcessed} batches, returning partial results to avoid gateway timeout`);
        
        const partialResponse = {
          comments: allScannedComments,
          batchStart: currentBatchStart, // Next batch to process
          batchSize: finalBatchSize,
          hasMore: currentBatchStart < inputComments.length,
          totalComments: inputComments.length,
          summary: totalSummary,
          totalRunTimeMs: elapsedTime,
          batchesProcessed: batchesProcessed,
          nextBatchStart: currentBatchStart
        };
        
        console.log('Returning partial response due to batch limit:', `Processed ${allScannedComments.length}/${inputComments.length} comments in ${batchesProcessed} batches`);
        return new Response(JSON.stringify(partialResponse), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }
      
      if (elapsedTime > MAX_EXECUTION_TIME) {
        console.warn(`[TIMEOUT] Function execution time (${elapsedTime}ms) exceeded maximum (${MAX_EXECUTION_TIME}ms)`);
        console.warn(`[TIMEOUT] Stopping processing to prevent gateway timeout. Processed ${allScannedComments.length}/${inputComments.length} comments`);
        
        // Return partial results with timeout warning
        const partialResponse = {
          comments: allScannedComments,
          batchStart: currentBatchStart,
          batchSize: finalBatchSize,
          hasMore: currentBatchStart < inputComments.length,
          totalComments: inputComments.length,
          summary: totalSummary,
          totalRunTimeMs: elapsedTime,
          timeoutWarning: `Processing stopped after ${elapsedTime}ms to prevent gateway timeout. Processed ${allScannedComments.length}/${inputComments.length} comments.`
        };
        
        console.log('Returning partial response due to timeout:', partialResponse.timeoutWarning);
        return new Response(JSON.stringify(partialResponse), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }
      
      const batch = inputComments.slice(currentBatchStart, currentBatchStart + finalBatchSize);
      const batchEnd = Math.min(currentBatchStart + finalBatchSize, inputComments.length);
      
      console.log(`[PROCESS] Batch ${currentBatchStart + 1}-${batchEnd} of ${inputComments.length} (finalBatchSize=${finalBatchSize}) - Elapsed: ${elapsedTime}ms`);
      console.log(`[TOKENS] Scan A max_tokens: ${scanATokenLimits.output_token_limit}, Scan B max_tokens: ${scanBTokenLimits.output_token_limit}`);
      console.log(`[TOKENS] Scan A temperature: ${scanA.temperature}, Scan B temperature: ${scanB.temperature}`);

            // Process batch with Scan A and Scan B, enforcing TPM limits
      const batchStartTime = Date.now();
      
      // Calculate estimated tokens for this batch
      const batchInput = buildBatchInput(batch, currentBatchStart + 1);
      const estimatedInputTokens = Math.ceil(batchInput.length / 4);
      const estimatedOutputTokens = batch.length * Math.max(scanA.tokens_per_comment || 13, scanB.tokens_per_comment || 13);
      const totalEstimatedTokens = estimatedInputTokens + estimatedOutputTokens;
      
      console.log(`[BATCH ${currentBatchStart + 1}-${batchEnd}] Estimated tokens: ${totalEstimatedTokens} (${estimatedInputTokens} input + ${estimatedOutputTokens} output)`);
      
      // Check rate limits and wait if necessary before making parallel calls
      if (scanATokenLimits.tpm_limit || scanATokenLimits.rpm_limit) {
        const tpmWaitTimeA = calculateWaitTime(scanA.provider, scanA.model, totalEstimatedTokens, scanATokenLimits.tpm_limit);
        const rpmWaitTimeA = calculateRPMWaitTime(scanA.provider, scanA.model, 1, scanATokenLimits.rpm_limit);
        const maxWaitTimeA = Math.max(tpmWaitTimeA, rpmWaitTimeA);
        
        if (maxWaitTimeA > 0) {
          const reason: string[] = [];
          if (tpmWaitTimeA > 0) reason.push(`TPM (${tpmWaitTimeA}ms)`);
          if (rpmWaitTimeA > 0) reason.push(`RPM (${rpmWaitTimeA}ms)`);
          
          console.log(`[BATCH ${currentBatchStart + 1}-${batchEnd}] [SCAN_A] Waiting ${maxWaitTimeA}ms to comply with ${reason.join(' and ')} limits`);
          await new Promise(resolve => setTimeout(resolve, maxWaitTimeA));
        }
      }
      
      if (scanBTokenLimits.tpm_limit || scanBTokenLimits.rpm_limit) {
        const tpmWaitTimeB = calculateWaitTime(scanB.provider, scanB.model, totalEstimatedTokens, scanBTokenLimits.tpm_limit);
        const rpmWaitTimeB = calculateRPMWaitTime(scanB.provider, scanB.model, 1, scanBTokenLimits.rpm_limit);
        const maxWaitTimeB = Math.max(tpmWaitTimeB, rpmWaitTimeB);
        
        if (maxWaitTimeB > 0) {
          const reason: string[] = [];
          if (tpmWaitTimeB > 0) reason.push(`TPM (${tpmWaitTimeB}ms)`);
          if (rpmWaitTimeB > 0) reason.push(`RPM (${rpmWaitTimeB}ms)`);
          
          console.log(`[BATCH ${currentBatchStart + 1}-${batchEnd}] [SCAN_B] Waiting ${maxWaitTimeB}ms to comply with ${reason.join(' and ')} limits`);
          await new Promise(resolve => setTimeout(resolve, maxWaitTimeB));
        }
      }
      
      // Use improved recursive splitting to handle harmful content detection
      console.log(`[RECURSIVE_SPLIT] Processing server-managed batch of ${batch.length} comments with improved harmful content detection`);
      
      const recursiveResults = await processBatchWithRecursiveSplitting(
        batch, scanA, scanB, scanATokenLimits, scanBTokenLimits, user, scanRunId, aiLogger, currentBatchStart, 3, 0, false, false, null, null
      );
      
      const scanAResults = recursiveResults.scanAResults;
      const scanBResults = recursiveResults.scanBResults;
      const batchEndTime = Date.now();
      console.log(`[PERFORMANCE] Batch ${currentBatchStart + 1}-${batchEnd} processed in ${batchEndTime - batchStartTime}ms (parallel AI calls)`);
      
      // Record usage AFTER the AI calls complete
      if (scanATokenLimits.tpm_limit || scanATokenLimits.rpm_limit) {
        recordUsage(scanA.provider, scanA.model, totalEstimatedTokens);
        recordRequest(scanA.provider, scanA.model, 1);
        console.log(`[BATCH ${currentBatchStart + 1}-${batchEnd}] [SCAN_A] Recorded usage: ${totalEstimatedTokens} tokens, 1 request`);
      }
      
      if (scanBTokenLimits.tpm_limit || scanBTokenLimits.rpm_limit) {
        recordUsage(scanB.provider, scanB.model, totalEstimatedTokens);
        recordRequest(scanB.provider, scanB.model, 1);
        console.log(`[BATCH ${currentBatchStart + 1}-${batchEnd}] [SCAN_B] Recorded usage: ${totalEstimatedTokens} tokens, 1 request`);
      }

      console.log(`[RESULT] Scan A ${scanA.provider}/${scanA.model}: type=${typeof scanAResults} len=${Array.isArray(scanAResults) ? scanAResults.length : 'n/a'}`);
      console.log(`[RESULT] Scan B ${scanB.provider}/${scanB.model}: type=${typeof scanBResults} len=${Array.isArray(scanBResults) ? scanBResults.length : 'n/a'}`);
      
      // Log the row ranges being processed
      console.log(`[BATCH_ROWS] Processing comments from rows ${currentBatchStart + 1} to ${batchEnd}`);

      // Parse and validate results
      const scanAResultsArray = parseBatchResults(scanAResults, batch.length, 'Scan A', currentBatchStart + 1);
      const scanBResultsArray = parseBatchResults(scanBResults, batch.length, 'Scan B', currentBatchStart + 1);
      // Index-aligned lookup by returned index to avoid order mismatches
      const scanAByIndex = new Map<number, any>(scanAResultsArray.filter(r => typeof r?.index === 'number').map(r => [r.index as number, r]));
      const scanBByIndex = new Map<number, any>(scanBResultsArray.filter(r => typeof r?.index === 'number').map(r => [r.index as number, r]));

      // CRITICAL FIX: Validate that we got complete results for all comments
      if (scanAResultsArray.length !== batch.length) {
        console.error(`[ERROR] Scan A returned ${scanAResultsArray.length} results for ${batch.length} comments - response may be truncated`);
        console.error(`[ERROR] Scan A response length: ${scanAResults.length} characters`);
        console.error(`[ERROR] Scan A response preview: ${scanAResults.substring(0, 500)}...`);
      }
      
      if (scanBResultsArray.length !== batch.length) {
        console.error(`[ERROR] Scan B returned ${scanBResultsArray.length} results for ${batch.length} comments - response may be truncated`);
        console.error(`[ERROR] Scan B response length: ${scanBResults.length} characters`);
        console.error(`[ERROR] Scan B response preview: ${scanBResults.substring(0, 500)}...`);
      }

      // CRITICAL FIX: Log incomplete results but continue processing
      if (scanAResultsArray.length !== batch.length || scanBResultsArray.length !== batch.length) {
        console.error(`[ERROR] Incomplete batch results detected for batch ${currentBatchStart + 1}-${batchEnd}`);
        console.error(`[ERROR] Expected ${batch.length} results, got Scan A: ${scanAResultsArray.length}, Scan B: ${scanBResultsArray.length}`);
        console.warn(`[WARNING] Continuing with padded results - missing items will be filled with defaults`);
      }

      // Process each comment in this batch
      const maxResults = Math.max(scanAResultsArray.length, scanBResultsArray.length);
      console.log(`[BATCH_DEBUG] Processing batch ${currentBatchStart + 1}-${batchEnd}: batch.length=${batch.length}, maxResults=${maxResults}`);
      
      for (let i = 0; i < maxResults && i < batch.length; i++) {
        const comment = batch[i];
        const stableIndexCandidate = (typeof (comment as any)?.originalRow === 'number' && (comment as any).originalRow > 0)
          ? (comment as any).originalRow
          : (typeof (comment as any)?.scannedIndex === 'number' && (comment as any).scannedIndex > 0)
            ? (comment as any).scannedIndex
            : (currentBatchStart + i + 1);
        const expectedIndex = Number.isFinite(stableIndexCandidate) ? stableIndexCandidate : (currentBatchStart + i + 1);
        const scanAResultRaw = scanAByIndex.get(expectedIndex) || scanAResultsArray[i];
        const scanBResultRaw = scanBByIndex.get(expectedIndex) || scanBResultsArray[i];
        const scanAResult = scanAResultRaw ? { ...scanAResultRaw, model: `${scanA.provider}/${scanA.model}` } : scanAResultRaw;
        const scanBResult = scanBResultRaw ? { ...scanBResultRaw, model: `${scanB.provider}/${scanB.model}` } : scanBResultRaw;

        if (!scanAResult || !scanBResult) {
          console.warn(`Missing scan results for comment ${expectedIndex}, skipping`);
          continue;
        }

        // Validate that the AI returned the correct index
        if (scanAResult.index !== expectedIndex) {
          console.warn(`[WARNING] Scan A returned index ${scanAResult.index} for comment ${expectedIndex}`);
        }
        if (scanBResult.index !== expectedIndex) {
          console.warn(`[WARNING] Scan B returned index ${scanBResult.index} for comment ${expectedIndex}`);
        }

        // Determine if adjudication is needed
        const concerningDisagreement = scanAResult.concerning !== scanBResult.concerning;
        const identifiableDisagreement = scanAResult.identifiable !== scanBResult.identifiable;
        const needsAdjudication = concerningDisagreement || identifiableDisagreement;

        if (needsAdjudication) {
          totalSummary.needsAdjudication++;
          //console.log(`[RUNID-BATCH] Comment ${comment.id} needs adjudication: concerning disagreement=${concerningDisagreement} (A:${scanAResult.concerning}, B:${scanBResult.concerning}), identifiable disagreement=${identifiableDisagreement} (A:${scanAResult.identifiable}, B:${scanBResult.identifiable})`);
        }

        // Set flags based on OR across Scan A and B (adjudicator resolves disagreements later)
        const concerning = Boolean(scanAResult.concerning || scanBResult.concerning);
        const identifiable = Boolean(scanAResult.identifiable || scanBResult.identifiable);

        if (concerning) totalSummary.concerning++;
        if (identifiable) totalSummary.identifiable++;

        // Mode mapping policy:
        // - identifiable => redact (higher priority)
        // - concerning-only => rephrase
        // - else => original
        let mode: 'redact' | 'rephrase' | 'original';
        if (identifiable) {
          mode = 'redact';
        } else if (concerning) {
          mode = 'rephrase';
        } else {
          mode = 'original';
        }

        // Create comment result with adjudication flags
        const processedComment = {
          ...comment,
          text: comment.originalText || comment.text,
          concerning,
          identifiable,
          mode, // Add the mode field
          needsAdjudication,
          adjudicationData: {
            scanAResult: { ...scanAResult, model: `${scanA.provider}/${scanA.model}` },
            scanBResult: { ...scanBResult, model: `${scanB.provider}/${scanB.model}` },
            agreements: {
              concerning: !concerningDisagreement ? scanAResult.concerning : null,
              identifiable: !identifiableDisagreement ? scanBResult.identifiable : null
            }
          },
          debugInfo: {
            scanAResult: { ...scanAResult, model: `${scanA.provider}/${scanA.model}` },
            scanBResult: { ...scanBResult, model: `${scanB.provider}/${scanB.model}` },
            needsAdjudication,
            scanRunId
          }
        };

        allScannedComments.push(processedComment);
      }
      
      console.log(`[BATCH] Completed batch ${currentBatchStart + 1}-${batchEnd}, processed ${Math.min(maxResults, batch.length)} comments`);
      console.log(`[BATCH] Results: Scan A: ${scanAResultsArray.length}, Scan B: ${scanBResultsArray.length}, Batch: ${batch.length}`);
      console.log(`[BATCH] Comments processed: rows ${currentBatchStart + 1} to ${currentBatchStart + Math.min(maxResults, batch.length)}`);
      console.log(`[BATCH] Total comments processed so far: ${allScannedComments.length}/${inputComments.length}`);
      
      // Increment batch counter
      batchesProcessed++;

      // Cleanup: clear stale pending logs for this run so they don't block adjudication
      try {
        const staleCutoff = new Date(Date.now() - 60_000).toISOString();
        const { data: cleared, error: clearErr } = await supabase
          .from('ai_logs')
          .update({
            response_status: 'error',
            response_error: 'stale pending cleared by scan-comments',
            time_finished: new Date().toISOString()
          })
          .eq('scan_run_id', scanRunId)
          .eq('function_name', 'scan-comments')
          .eq('response_status', 'pending')
          .lte('time_started', staleCutoff);
        if (clearErr) {
          console.warn(`[CLEANUP] Failed to clear stale pending logs:`, clearErr);
        } else if (cleared) {
          console.log(`[CLEANUP] Cleared stale pending logs older than ${staleCutoff}`);
        }
      } catch (cleanupErr) {
        console.warn(`[CLEANUP] Exception while clearing stale pending logs:`, cleanupErr);
      }
    }
      
      totalSummary.total = allScannedComments.length;
    console.log(`Successfully scanned ${allScannedComments.length}/${inputComments.length} comments across ${Math.ceil(inputComments.length / finalBatchSize)} batches`);
    
    // Log detailed breakdown of what was processed
    
    if (isIncrementalRequest) {
      // For incremental requests, we only process a subset of the total comments
      const firstCommentIndex = allScannedComments[0]?.originalRow || (batchStartValue + 1);
      const lastCommentIndex = allScannedComments[allScannedComments.length - 1]?.originalRow || (batchStartValue + allScannedComments.length);
      console.log(`[RUNID-BATCH] Processed batch: rows ${firstCommentIndex} to ${lastCommentIndex} (${allScannedComments.length} comments)`);
    } else {
      // For initial requests, check if we processed all comments in this invocation
      if (allScannedComments.length < inputComments.length) {
        console.warn(`[WARNING] Missing ${inputComments.length - allScannedComments.length} comments!`);
        console.warn(`[WARNING] This suggests some batches were not fully processed`);
        
        // Log the range of comments we have
        const firstCommentIndex = allScannedComments[0]?.originalRow || 1;
        const lastCommentIndex = allScannedComments[allScannedComments.length - 1]?.originalRow || allScannedComments.length;
        console.warn(`[WARNING] Comment range: ${firstCommentIndex} to ${lastCommentIndex}`);
      } else {
        // Log successful processing range
        const firstCommentIndex = allScannedComments[0]?.originalRow || 1;
        const lastCommentIndex = allScannedComments[allScannedComments.length - 1]?.originalRow || allScannedComments.length;
        console.log(`[SUCCESS] All comments processed successfully: rows ${firstCommentIndex} to ${lastCommentIndex}`);
      }
    }
    } // End of server-managed batching else block
    
    const totalRunTimeMs = Date.now() - overallStartTime;
    
    // Check for missing tail comments and retry if needed
    const expectedTotal = inputComments.length;
    const actualTotal = allScannedComments.length;
    
    // Determine if there are more batches to process (must be defined before first use)
    const lastProcessedIndex = batchStart + (batchesProcessed * finalBatchSize);
    const hasMoreBatches = !clientManagedBatching && lastProcessedIndex < inputComments.length;
    
    if (!clientManagedBatching && !hasMoreBatches && actualTotal < expectedTotal) {
      const missingCount = expectedTotal - actualTotal;
      console.log(`[TAIL_RETRY] Missing ${missingCount} comments (${actualTotal}/${expectedTotal}), attempting tail retry...`);
      
      // Find the highest processed index
      const processedIndices = allScannedComments.map(c => c.originalRow || 0);
      const lastProcessedIndex = processedIndices.length > 0 ? Math.max(...processedIndices) : -1;
      
      // Calculate what comments are missing
      const tailStartIndex = lastProcessedIndex;
      const tailComments = inputComments.slice(tailStartIndex);
      
      if (tailComments.length > 0 && tailComments.length <= 100) { // Only retry for reasonable sizes
        console.log(`[TAIL_RETRY] Processing ${tailComments.length} tail comments starting from index ${tailStartIndex}`);
        try {
          const tailBatch = tailComments;
          const tailBatchInput = buildBatchInput(tailBatch, tailStartIndex + 1);
          const estIn = Math.ceil(tailBatchInput.length / 4);
          const estOut = tailBatch.length * Math.max(scanA.tokens_per_comment || 13, scanB.tokens_per_comment || 13);
          const estTotal = estIn + estOut;
          if (scanATokenLimits.tpm_limit || scanATokenLimits.rpm_limit) {
            const wtA = Math.max(
              calculateWaitTime(scanA.provider, scanA.model, estTotal, scanATokenLimits.tpm_limit),
              calculateRPMWaitTime(scanA.provider, scanA.model, 1, scanATokenLimits.rpm_limit)
            );
            if (wtA > 0) await new Promise(r => setTimeout(r, wtA));
          }
          if (scanBTokenLimits.tpm_limit || scanBTokenLimits.rpm_limit) {
            const wtB = Math.max(
              calculateWaitTime(scanB.provider, scanB.model, estTotal, scanBTokenLimits.tpm_limit),
              calculateRPMWaitTime(scanB.provider, scanB.model, 1, scanBTokenLimits.rpm_limit)
            );
            if (wtB > 0) await new Promise(r => setTimeout(r, wtB));
          }
          // Use improved recursive splitting for tail batch as well
          console.log(`[RECURSIVE_SPLIT] Processing tail batch of ${tailBatch.length} comments with improved harmful content detection`);
          
          const tailRecursiveResults = await processBatchWithRecursiveSplitting(
            tailBatch, scanA, scanB, scanATokenLimits, scanBTokenLimits, user, scanRunId, aiLogger, tailStartIndex, 3, 0, false, false, null, null
          );
          
          const tailA = tailRecursiveResults.scanAResults;
          const tailB = tailRecursiveResults.scanBResults;
          const tailAArray = parseBatchResults(tailA, tailBatch.length, 'Scan A (tail)', tailStartIndex + 1);
          const tailBArray = parseBatchResults(tailB, tailBatch.length, 'Scan B (tail)', tailStartIndex + 1);
          const maxTail = Math.max(tailAArray.length, tailBArray.length);
          const adjustedTailComments: any[] = [];
          for (let i = 0; i < maxTail && i < tailBatch.length; i++) {
            const comment = tailBatch[i];
            const aRes = tailAArray[i];
            const bRes = tailBArray[i];
            if (!aRes || !bRes) continue;
            const expectedIndex = tailStartIndex + i + 1;
            const concerning = aRes.concerning;
            const identifiable = aRes.identifiable;
            const needsAdj = (aRes.concerning !== bRes.concerning) || (aRes.identifiable !== bRes.identifiable);
            adjustedTailComments.push({
              id: comment.id,
              originalText: comment.text,
              originalRow: comment.originalRow || expectedIndex,
              scannedIndex: comment.scannedIndex || expectedIndex,
              scanAResult: aRes,
              scanBResult: bRes,
              concerning,
              identifiable,
              mode: concerning ? 'redact' : (identifiable ? 'rephrase' : 'original'),
              needsAdjudication: needsAdj,
              adjudicationReason: needsAdj ? (aRes.concerning !== bRes.concerning ? 'concerning_disagreement' : 'identifiable_disagreement') : null
            });
          }
          allScannedComments.push(...adjustedTailComments);
          console.log(`[TAIL_RETRY] Successfully processed ${adjustedTailComments.length} tail comments`);
        } catch (tailError) {
          console.error(`[TAIL_RETRY] Failed to process tail comments:`, tailError);
          // Continue without failing the entire request
        }
      }
    }
    
    // Call adjudicator if there are comments that need adjudication and no more batches// //
    console.log(`[RUNID-BATCH] Checking conditions: hasMoreBatches=${hasMoreBatches}, needsAdjudication=${totalSummary.needsAdjudication}, adjudicator=${!!adjudicator}, skip=${skipAdjudication}`);
    
    if (!clientManagedBatching && !skipAdjudication && !hasMoreBatches && totalSummary.needsAdjudication > 0 && adjudicator) {
      // Safety gate: ensure ALL scan-comments calls have finished (no pending logs for this run)
      try {
        const { data: pendingScanLogs, error: pendingErr } = await supabase
          .from('ai_logs')
          .select('id')
          .eq('scan_run_id', scanRunId)
          .eq('function_name', 'scan-comments')
          .eq('response_status', 'pending')
          .limit(1);
        if (pendingErr) {
          console.warn(`[RUNID-BATCH] Pending check failed, proceeding cautiously:`, pendingErr);
        } else if (pendingScanLogs && pendingScanLogs.length > 0) {
          console.log(`[RUNID-BATCH] Deferring adjudication: found pending scan-comments logs for run ${scanRunId}`);
          // Skip adjudication for this invocation; frontend will call again on next batch/refresh
          return new Response(JSON.stringify({
            comments: allScannedComments,
            batchStart: batchStart,
            batchSize: finalBatchSize,
            hasMore: hasMoreBatches,
            totalComments: inputComments.length,
            summary: totalSummary,
            totalRunTimeMs: totalRunTimeMs,
            batchesProcessed: batchesProcessed,
            nextBatchStart: hasMoreBatches ? lastProcessedIndex : inputComments.length,
            adjudicationDeferred: true
          }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
      } catch (gateErr) {
        console.warn(`[RUNID-BATCH] Error during pending scan check, proceeding:`, gateErr);
      }
      // Process adjudication for all comments that need it
      console.log(`[RUNID-BATCH] Starting adjudication for ${totalSummary.needsAdjudication} comments that need resolution`);

      // Client-driven adjudication: skip server-side adjudication to avoid long-running edge invocations
      const CLIENT_MANAGED_ADJUDICATION = true;
      if (CLIENT_MANAGED_ADJUDICATION) {
        console.log('[RUNID-BATCH] Skipped: client-managed adjudication enabled');
      } else {
        try {
          // Filter comments that need adjudication
          const commentsNeedingAdjudication = allScannedComments.filter(comment => {
            const scanAResult = comment.adjudicationData?.scanAResult;
            const scanBResult = comment.adjudicationData?.scanBResult;
            
            if (!scanAResult || !scanBResult) return false;
            
            const concerningDisagreement = scanAResult.concerning !== scanBResult.concerning;
            const identifiableDisagreement = scanAResult.identifiable !== scanBResult.identifiable;
            
            return concerningDisagreement || identifiableDisagreement;
          });

          console.log(`[RUNID-BATCH] Found ${commentsNeedingAdjudication.length} comments that need adjudication`);

          // Check for duplicate adjudication call (cross-invocation, via DB logs)
          const isDuplicate = await checkForDuplicateAdjudication(supabase, scanRunId, commentsNeedingAdjudication);
          
          if (isDuplicate) {
            console.log(`[RUNID-BATCH] These comments have already been processed, skipping duplicate call`);
            // Continue without calling adjudicator again
          } else {
            // Process adjudication with proper batching
            const adjudicatorConfig = {
              provider: adjudicator.provider,
              model: adjudicator.model,
              prompt: adjudicator.analysis_prompt,
              max_tokens: adjudicator.max_tokens,
              tokens_per_comment: adjudicator.tokens_per_comment || 13
            };

            console.log(`[RUNID-BATCH] Sending adjudicator config:`, {
              provider: adjudicator.provider,
              model: adjudicator.model,
              promptLength: adjudicator.analysis_prompt?.length || 0,
              maxTokens: adjudicator.max_tokens,
              tokensPerComment: adjudicator.tokens_per_comment || 13
            });

            // Use the new batching system
            const adjudicatedResults = await processAdjudicationBatches(
              supabase,
              scanRunId,
              commentsNeedingAdjudication,
              adjudicatorConfig,
              authHeader || '',
              safetyMarginPercent, // Use the same safety margin as scan-comments
              aiLogger,
              user,
              clientCalculatedAdjudicatorOutputTokens
            );

            // Update the comments with adjudicated results
            if (adjudicatedResults.length > 0) {
              const adjudicatedMap = new Map(adjudicatedResults.map(adj => [adj.id, adj]));
              
              allScannedComments = allScannedComments.map(comment => {
                const adjudicated = adjudicatedMap.get(comment.id);
                if (adjudicated) {
                  return {
                    ...comment,
                    concerning: Boolean(adjudicated.concerning),
                    identifiable: Boolean(adjudicated.identifiable),
                    mode: adjudicated.concerning ? 'redact' : adjudicated.identifiable ? 'rephrase' : 'original',
                    needsAdjudication: false,
                    isAdjudicated: true,
                    aiReasoning: adjudicated.reasoning || comment.aiReasoning
                  };
                }
                return comment;
              });
            }
          }
        } catch (adjudicationError) {
          console.error('[RUNID-BATCH] Failed to call adjudicator:', adjudicationError);
          // Continue without failing the entire scan
        }
      }

        const response: any = { 
          comments: allScannedComments,
          batchStart: batchStart, // Starting batch for this request
          batchSize: finalBatchSize, // Batch size used for processing
          hasMore: hasMoreBatches, // True if there are more batches to process
          totalComments: inputComments.length,
          summary: totalSummary,
          totalRunTimeMs: totalRunTimeMs,
          batchesProcessed: batchesProcessed,
          nextBatchStart: hasMoreBatches ? lastProcessedIndex : inputComments.length, // Next batch to process or all done
          adjudicationStarted: Boolean((globalThis as any).__adjudicationStarted && (globalThis as any).__adjudicationStarted.has(scanRunId)),
          adjudicationCompleted: Boolean((globalThis as any).__adjudicationCompleted && (globalThis as any).__adjudicationCompleted.has(scanRunId))
        };
        
        console.log('Returning response with comments count:', response.comments.length);
        console.log('Response summary:', response.summary);
        console.log(`[FINAL] Processed ${response.comments.length}/${inputComments.length} comments in ${Math.ceil(inputComments.length / finalBatchSize)} batches`);
        console.log(`[TIMING] Total run time: ${totalRunTimeMs}ms (${(totalRunTimeMs / 1000).toFixed(1)}s)`);
        
        // Performance summary
        const avgBatchTime = totalRunTimeMs / batchesProcessed;
        const commentsPerSecond = (response.comments.length / (totalRunTimeMs / 1000)).toFixed(1);
        console.log(`[PERFORMANCE] Average batch time: ${avgBatchTime.toFixed(0)}ms`);
        console.log(`[PERFORMANCE] Processing rate: ${commentsPerSecond} comments/second`);
        console.log(`[PERFORMANCE] Parallel AI calls enabled: Scan A and Scan B run concurrently`);
        console.log(`[PERFORMANCE] Precise batch sizing: Optimized batch sizes using I/O ratios and token limits`);
        
        // Deduct credits after successful scan completion (only for Scan A, unless it's a demo scan)
        if (isDemoScan) {
      console.log(`[CREDITS] Demo scan completed - no credits deducted`);
      response.creditInfo = {
        creditsDeducted: 0,
        remainingCredits: userCredits?.available_credits || 0,
        totalCreditsUsed: userCredits?.total_credits_used || 0,
        note: 'Demo scan - no credits charged. Demo files are free to use.'
      };
    } else {
      try {
        const creditsToDeduct = allScannedComments.length * creditsPerComment;
        console.log(`[CREDITS] Deducting ${creditsToDeduct} credits for Scan A processing of ${allScannedComments.length} comments`);
        
        const { data: deductionResult, error: deductionError } = await supabase
          .rpc('deduct_user_credits', {
            user_uuid: user.id,
            credits_to_deduct: creditsToDeduct,
            scan_run_id: scanRunId,
            comments_scanned: allScannedComments.length,
            scan_type: 'comment_scan'
          });
        
        if (deductionError) {
          console.error('[CREDITS] Error deducting credits for Scan A:', deductionError);
          // Don't fail the scan if credit deduction fails, just log it
        } else {
          console.log(`[CREDITS] Successfully deducted ${creditsToDeduct} credits for Scan A. Result:`, deductionResult);
          
          // Get updated credit balance
          const { data: updatedCredits, error: updateError } = await supabase
            .from('user_credits')
            .select('available_credits, total_credits_used')
            .eq('user_id', user.id)
            .single();
          
          if (!updateError && updatedCredits) {
            console.log(`[CREDITS] Updated balance: ${updatedCredits.available_credits} available, ${updatedCredits.total_credits_used} total used`);
            
            // Add credit information to response
            response.creditInfo = {
              creditsDeducted: creditsToDeduct,
              remainingCredits: updatedCredits.available_credits,
              totalCreditsUsed: updatedCredits.total_credits_used,
              note: 'Credits charged only for Scan A. Scan B, adjudication, and post-processing are free.'
            };
          }
        }
      } catch (creditError) {
        console.error('[CREDITS] Unexpected error during credit deduction for Scan A:', creditError);
        // Don't fail the scan if credit deduction fails
      }
    }
    
    // Only mark run as completed if we've processed all comments (and not client-managed)
    if (!clientManagedBatching && !hasMoreBatches) {
      console.log(`[COMPLETION] All comments processed for scanRunId=${scanRunId}, marking as completed`);
      gAny.__runCompleted.add(scanRunId);
      console.log(`[RUN STATUS] scanRunId=${scanRunId} marked as completed`);
    }
    if (!clientManagedBatching) {
      gAny.__runInProgress.delete(scanRunId);
      console.log(`[RUN STATUS] scanRunId=${scanRunId} removed from in progress`);
    }

        console.log('Returning successful response with CORS headers:', corsHeaders);
        return new Response(JSON.stringify(response), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }
    // If we skipped adjudication or none was needed, return scan results now
    const responseNoAdj: any = {
      comments: allScannedComments,
      batchStart: batchStart,
      batchSize: finalBatchSize,
      hasMore: clientManagedBatching ? false : hasMoreBatches, // Client-managed batching always returns hasMore: false
      totalComments: inputComments.length,
      summary: totalSummary,
      totalRunTimeMs: Date.now() - overallStartTime,
      batchesProcessed: batchesProcessed,
      nextBatchStart: clientManagedBatching ? inputComments.length : (hasMoreBatches ? lastProcessedIndex : inputComments.length),
      adjudicationStarted: false,
      adjudicationCompleted: false
    };
    return new Response(JSON.stringify(responseNoAdj), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    } catch (error) {
      console.error('Error in scan-comments function:', error);
      
      // Ensure we always have CORS headers, even if there was an error building them
      const fallbackCorsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Max-Age': '86400',
        'Access-Control-Allow-Credentials': 'true',
        'Vary': 'Origin'
      };
      
      console.log('Returning error response with CORS headers:', fallbackCorsHeaders);
      return new Response(JSON.stringify({ 
        error: `Error in scan-comments function: ${error.message}` 
      }), { 
        headers: { ...fallbackCorsHeaders, 'Content-Type': 'application/json' }, 
        status: 500 
      });
    }
  } catch (topLevelError) {
    // Top-level error handling for function setup issues
    console.error('Top-level error in scan-comments function:', topLevelError);
    
    const fallbackCorsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Max-Age': '86400',
      'Access-Control-Allow-Credentials': 'true',
      'Vary': 'Origin'
    };
    
    return new Response(JSON.stringify({ 
      error: `Top-level error in scan-comments function: ${topLevelError.message}` 
    }), { 
      headers: { ...fallbackCorsHeaders, 'Content-Type': 'application/json' }, 
      status: 500 
    });
  }
});

// Utility functions
function buildBatchInput(comments: any[], globalStartIndex: number): string {
  // Prefer stable per-comment indices if provided; else fall back to sequential numbering
  const items = comments.map((comment, i) => {
    const idxCandidate = (typeof (comment as any)?.originalRow === 'number' && (comment as any).originalRow > 0)
      ? (comment as any).originalRow
      : (typeof (comment as any)?.scannedIndex === 'number' && (comment as any).scannedIndex > 0)
        ? (comment as any).scannedIndex
        : (globalStartIndex + i);
    const idx = Number.isFinite(idxCandidate) ? idxCandidate : (globalStartIndex + i);
    return `<<<ITEM ${idx}>>>
${(comment as any).originalText || (comment as any).text}
<<<END ${idx}>>>`;
  }).join('\n\n');

  return `Comments to analyze (each bounded by sentinels):\n\n${items}`;
}

function parseBatchResults(response: any, expectedCount: number, source: string, globalStartIndex: number): any[] {
  try {
    console.log(`${source}: parseBatchResults called with expectedCount: ${expectedCount}`);
    console.log(`${source}: Response type: ${typeof response}`);
    if (typeof response === 'string') {
      console.log(`${source}: Response length: ${response.length} characters`);
    }
    
    if (!response) {
      throw new Error('Empty response');
    }

    // Use response as-is since it appears to be valid JSON
    let decodedResponse = response;

    // Helper to extract the first balanced JSON array from arbitrary text
    const extractJsonArray = (str: string): string | null => {
      let start = -1;
      let depth = 0;
      let inString = false;
      let escape = false;
      for (let i = 0; i < str.length; i++) {
        const ch = str[i];
        if (inString) {
          if (escape) { escape = false; continue; }
          if (ch === '\\') { escape = true; continue; }
          if (ch === '"') { inString = false; continue; }
          continue;
        }
        if (ch === '"') { inString = true; continue; }
        if (ch === '[') {
          if (depth === 0) start = i;
          depth++;
        } else if (ch === ']') {
          if (depth > 0) depth--;
          if (depth === 0 && start !== -1) {
            return str.slice(start, i + 1);
          }
        }
      }
      return null;
    };





    // First try to parse the simple key-value format (i:1\nA:N\nB:Y)
    let parsed: any;
    let cleanedJson = decodedResponse; // Define cleanedJson at the top level
    
    // Check if response is in the simple format
    if (decodedResponse.includes('i:') && decodedResponse.includes('A:') && decodedResponse.includes('B:')) {
      console.log(`${source}: Detected simple key-value format, parsing directly`);
      console.log(`${source}: Simple format response preview: ${decodedResponse.substring(0, 200)}...`);
      
      try {
        const lines = decodedResponse.split('\n').filter(line => line.trim().length > 0);
        const results: any[] = [];
        let currentItem: any = {};
        
        for (const line of lines) {
          const trimmedLine = line.trim();
          if (trimmedLine.startsWith('i:')) {
            // Save previous item if exists
            if (currentItem.index !== undefined) {
              results.push(currentItem);
            }
            // Start new item
            const index = parseInt(trimmedLine.substring(2));
            currentItem = { index };
          } else if (trimmedLine.startsWith('A:')) {
            const value = trimmedLine.substring(2).trim();
            currentItem.concerning = value === 'Y';
          } else if (trimmedLine.startsWith('B:')) {
            const value = trimmedLine.substring(2).trim();
            currentItem.identifiable = value === 'Y';
          }
        }
        
        // Add the last item
        if (currentItem.index !== undefined) {
          results.push(currentItem);
        }
        
        // Check if the response appears to be truncated
        if (results.length > 0) {
          const lastResult = results[results.length - 1];
          const expectedLastIndex = globalStartIndex + expectedCount - 1;
          if (lastResult.index < expectedLastIndex) {
            console.warn(`${source}: Response appears truncated. Last result index: ${lastResult.index}, expected last index: ${expectedLastIndex}`);
          }
        }
        
        if (results.length > 0) {
          console.log(`${source}: Successfully parsed ${results.length} items from simple format`);
          console.log(`${source}: Parsed results:`, results);
          
          // Handle cases where AI returns fewer results than expected
          if (results.length < expectedCount) {
            const missingCount = expectedCount - results.length;
            const missingPercentage = Math.round((missingCount / expectedCount) * 100);
            console.warn(`${source}: Expected ${expectedCount} items, got ${results.length}. Missing ${missingCount} items (${missingPercentage}%). This may indicate the AI response was truncated due to output token limits. Padding with default results.`);
            
            // Create default results for missing items
            const paddedResults: any[] = [];
            for (let i = 0; i < expectedCount; i++) {
              const existingResult = results[i];
              if (existingResult) {
                paddedResults.push({
                  index: existingResult.index || (globalStartIndex + i),
                  concerning: Boolean(existingResult.concerning),
                  identifiable: Boolean(existingResult.identifiable)
                });
              } else {
                // Add default result for missing item
                paddedResults.push({
                  index: globalStartIndex + i,
                  concerning: false,
                  identifiable: false
                });
              }
            }
            
            console.log(`${source}: Returning ${paddedResults.length} padded results (${results.length} original + ${paddedResults.length - results.length} defaults)`);
            return paddedResults;
          }
          
          console.log(`${source}: Returning ${results.length} parsed results (exactly as expected)`);
          return results;
        } else {
          console.warn(`${source}: No valid items found in simple format. Lines processed:`, lines.length);
          console.warn(`${source}: Lines:`, lines);
          throw new Error('No valid items found in simple format');
        }
      } catch (simpleParseError) {
        console.warn(`${source}: Simple format parsing failed: ${simpleParseError.message}`);
        // Fall back to JSON parsing
      }
    }
    
    // If simple format parsing failed or wasn't detected, try JSON parsing
    if (!parsed) {
      try {
        parsed = JSON.parse(cleanedJson);
        console.log(`${source}: Response is valid JSON directly`);
      } catch (directParseError) {
        console.log(`${source}: Direct parse failed; attempting balanced array extraction: ${directParseError.message}`);
        const arr = extractJsonArray(decodedResponse);
        if (!arr) {
          console.error(`${source}: No JSON array found in response`);
          console.log(`${source}: Response preview: ${decodedResponse.substring(0, 500)}...`);
          
          // Try to extract individual JSON objects as fallback
          const objectMatches = decodedResponse.match(/\{[^{}]*\}/g);
          if (objectMatches && objectMatches.length > 0) {
            console.log(`${source}: Found ${objectMatches.length} potential JSON objects, attempting extraction`);
            const extractedObjects: any[] = [];
            for (let i = 0; i < objectMatches.length && i < expectedCount; i++) {
              try {
                const obj = JSON.parse(objectMatches[i]);
                extractedObjects.push({
                  index: obj.index || (globalStartIndex + i),
                  concerning: Boolean(obj.concerning),
                  identifiable: Boolean(obj.identifiable)
                });
              } catch (objError) {
                console.warn(`${source}: Failed to parse object ${i}: ${objError.message}`);
              }
            }
            
            if (extractedObjects.length > 0) {
              console.log(`${source}: Successfully extracted ${extractedObjects.length} objects, using as fallback`);
              return extractedObjects.length < expectedCount ? 
                [...extractedObjects, ...Array(expectedCount - extractedObjects.length).fill(null).map((_, i) => ({
                  index: globalStartIndex + extractedObjects.length + i,
                  concerning: false,
                  identifiable: false
                }))] : extractedObjects;
            }
          }
          
          throw new Error('No valid format found in response');
        }
        cleanedJson = arr;
        console.log(`${source}: Extracted JSON array from response`);
      }
    }

    if (typeof cleanedJson === 'string') {
      console.log(`${source}: Response length: ${cleanedJson.length} characters`);
      console.log(`${source}: JSON starts with: ${cleanedJson.substring(0, 100)}...`);
      console.log(`${source}: JSON ends with: ...${cleanedJson.substring(cleanedJson.length - 100)}`);
      
      // Check for common truncation indicators
      if (cleanedJson.includes('...') || cleanedJson.includes('…') || cleanedJson.includes('truncated')) {
        console.warn(`${source}: Response appears to be truncated`);
      }
      
      // Check if the JSON is properly closed
      const openBraces = (cleanedJson.match(/\{/g) || []).length;
      const closeBraces = (cleanedJson.match(/\}/g) || []).length;
      const openBrackets = (cleanedJson.match(/\[/g) || []).length;
      const closeBrackets = (cleanedJson.match(/\]/g) || []).length;
      
      console.log(`${source}: JSON structure check - Braces: ${openBraces}/${closeBraces}, Brackets: ${openBrackets}/${closeBrackets}`);
      
      if (openBraces !== closeBraces || openBrackets !== closeBrackets) {
        console.warn(`${source}: JSON structure is unbalanced - this may indicate truncation`);
      }
    }

    try {
      parsed = JSON.parse(cleanedJson);
    } catch (parseError) {
      // Attempt sanitization for unescaped quotes in reasoning fields, then parse again
      console.warn(`${source}: JSON parse error, attempting sanitization: ${parseError.message}`);
      console.log(`${source}: [DEBUG] Original JSON length: ${cleanedJson.length}`);
      
      // Show the area around the error position for debugging
      if (parseError.message.includes('position')) {
        const positionMatch = parseError.message.match(/position (\d+)/);
        if (positionMatch) {
          const position = parseInt(positionMatch[1]);
          const start = Math.max(0, position - 100);
          const end = Math.min(cleanedJson.length, position + 100);
          console.log(`${source}: [DEBUG] Error area around position ${position}:`);
          console.log(`${source}: [DEBUG] ...${cleanedJson.substring(start, end)}...`);
          
          // Check if this looks like a truncation issue
          if (position > cleanedJson.length * 0.9) {
            console.warn(`${source}: [DEBUG] Error is near the end of the JSON (position ${position} of ${cleanedJson.length}) - possible truncation`);
          }
          
          // Check if this is a very long response that might be hitting token limits
          if (cleanedJson.length > 10000) {
            console.warn(`${source}: [DEBUG] Very long response (${cleanedJson.length} chars) - may be hitting token limits`);
          }
        }
      }
      
      try {
        parsed = JSON.parse(cleanedJson);
        console.log(`${source}: JSON parse succeeded`);
      } catch (e2) {
        // If JSON parse fails, try JSON completion logic
        console.warn(`${source}: JSON parse failed, attempting JSON completion: ${e2.message}`);
        
        // Try the JSON completion logic directly
        try {
          // Final attempt: check if JSON is truncated and try to complete it
          console.warn(`${source}: Checking for truncation after JSON parse failed: ${e2.message}`);
          
          let completedJson = cleanedJson; // Use original version
          let needsCompletion = false;
          
          // Count brackets and braces to see if they're balanced
          const openBraces = (cleanedJson.match(/\{/g) || []).length;
          let closeBraces = (cleanedJson.match(/\}/g) || []).length;
          const openBrackets = (cleanedJson.match(/\[/g) || []).length;
          let closeBrackets = (cleanedJson.match(/\]/g) || []).length;
          
          // If we have more opening than closing, try to complete the JSON
          if (openBraces > closeBraces || openBrackets > closeBrackets) {
            needsCompletion = true;
            // Add missing closing characters
            while (openBraces > closeBraces) {
              completedJson += '}';
              closeBraces++;
            }
            while (openBrackets > closeBrackets) {
              completedJson += ']';
              closeBrackets++;
            }
            console.log(`${source}: Attempting to complete truncated JSON by adding ${openBraces - (cleanedJson.match(/\{/g) || []).length} braces and ${openBrackets - (cleanedJson.match(/\[/g) || []).length} brackets`);
          }
          
          if (needsCompletion) {
            try {
              parsed = JSON.parse(completedJson);
              console.log(`${source}: JSON completion succeeded`);
            } catch (e4) {
              console.error(`${source}: JSON completion failed: ${e4.message}`);
              // Show the error area for debugging
              if (e2.message.includes('position')) {
                const positionMatch = e2.message.match(/position (\d+)/);
                if (positionMatch) {
                  const position = parseInt(positionMatch[1]);
                  const start = Math.max(0, position - 100);
                  const end = Math.min(cleanedJson.length, position + 100);
                  console.error(`${source}: Error area around position ${position}:`);
                  console.error(`${source}: ...${cleanedJson.substring(start, end)}...`);
                }
              }
              throw new Error(`Invalid JSON in response: ${e2.message}`);
            }
          } else {
            console.error(`${source}: JSON parse error:`, e2);
            console.error(`${source}: Attempted to parse: ${cleanedJson.substring(0, 500)}...`);
            
            // If we have a position error, show the area around that position
            if (e2.message.includes('position')) {
              const positionMatch = e2.message.match(/position (\d+)/);
              if (positionMatch) {
                const position = parseInt(positionMatch[1]);
                const start = Math.max(0, position - 100);
                const end = Math.min(cleanedJson.length, position + 100);
                console.error(`${source}: Error area around position ${position}:`);
                console.error(`${source}: ...${cleanedJson.substring(start, end)}...`);
              }
            }
            
            throw new Error(`Invalid JSON in response: ${e2.message}`);
          }
        } catch (e3) {
          console.error(`${source}: JSON completion logic failed: ${e3.message}`);
          throw new Error(`Invalid JSON in response: ${e2.message}`);
        }
      }
    }
    
    if (!Array.isArray(parsed)) {
      throw new Error('Response is not an array');
    }

    console.log(`${source}: Successfully parsed JSON array with ${parsed.length} items`);

    // Handle cases where AI returns fewer results than expected
    if (parsed.length < expectedCount) {
      console.warn(`${source}: Expected ${expectedCount} items, got ${parsed.length}. Padding with default results.`);
      console.warn(`${source}: This suggests the AI response was truncated or incomplete`);
      
      // Create default results for missing items
      const paddedResults: any[] = [];
      for (let i = 0; i < expectedCount; i++) {
        const existingResult = parsed[i];
        if (existingResult) {
          paddedResults.push({
            index: existingResult.index || (globalStartIndex + i),
            concerning: Boolean(existingResult.concerning),
            identifiable: Boolean(existingResult.identifiable)
          });
                  } else {
            // Add default result for missing item
            paddedResults.push({
              index: globalStartIndex + i,
              concerning: false,
              identifiable: false
            });
          }
      }
      
      console.log(`${source}: Returning ${paddedResults.length} padded results (${parsed.length} original + ${paddedResults.length - parsed.length} defaults)`);
      return paddedResults;
    }

    console.log(`${source}: Returning ${parsed.length} parsed results (exactly as expected)`);
    return parsed;
  } catch (error) {
    console.error(`${source}: Error in parseBatchResults:`, error);
    throw error;
  }
}

async function callAI(provider: string, model: string, prompt: string, input: string, responseType: string, userId: string, scanRunId: string, phase: string, aiLogger?: AILogger, maxTokens?: number, temperature?: number) {
  const payload = {
    model: model, // Add the model parameter for OpenAI
    messages: [
      { role: 'system', content: prompt },
      { role: 'user', content: input }
    ],
    temperature: temperature || 0,
    max_tokens: maxTokens || 8192  // Use provided token limit or fallback to 8192
  };

  console.log(`[CALL_AI] ${provider}/${model} max_tokens=${maxTokens || 8192}, temperature=${temperature || 0}`);

      // Log the AI request if logger is provided (best-effort)
      try {
        if (aiLogger) {
          await aiLogger.logRequest({
            userId,
            scanRunId,
            functionName: 'scan-comments',
            provider,
            model,
            requestType: responseType,
            phase,
            requestPrompt: prompt,
            requestInput: input,
            requestTemperature: temperature || 0,
            requestMaxTokens: maxTokens // Use the actual max_tokens from model_configurations
          });
        }
      } catch (logReqErr) {
        console.warn(`[LOGGER] Failed to log request (${phase}):`, logReqErr);
      }

  // Configurable timeouts (use function-specific env overrides if provided)
  const SCAN_COMMENTS_TIMEOUT_MS = Number(Deno.env.get('SCAN_COMMENTS_AI_REQUEST_TIMEOUT_MS')) > 0 ? Math.floor(Number(Deno.env.get('SCAN_COMMENTS_AI_REQUEST_TIMEOUT_MS'))) : 140000; // 140s default
  const toSeconds = (ms: number) => Math.round(ms / 1000);

  if (provider === 'azure') {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), SCAN_COMMENTS_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(`${Deno.env.get('AZURE_OPENAI_ENDPOINT')}/openai/deployments/${model}/chat/completions?api-version=2024-02-15-preview`, {
        method: 'POST',
        headers: {
          'api-key': Deno.env.get('AZURE_OPENAI_API_KEY') || '',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
    } catch (e: any) {
      clearTimeout(timeoutId);
      const errorMessage = e && e.name === 'AbortError' ? `Azure OpenAI API timeout after ${toSeconds(SCAN_COMMENTS_TIMEOUT_MS)} seconds` : `Azure OpenAI API fetch failed: ${String(e && e.message || e)}`;
      if (aiLogger) {
        await aiLogger.logResponse(userId, scanRunId, 'scan-comments', provider, model, responseType, phase, '', errorMessage, undefined);
      }
      throw new Error(errorMessage);
    }
    clearTimeout(timeoutId);
    if (!response.ok) {
      const errorMessage = `Azure OpenAI API error: ${response.status} ${response.statusText}`;
      if (aiLogger) {
        await aiLogger.logResponse(userId, scanRunId, 'scan-comments', provider, model, responseType, phase, '', errorMessage, undefined);
      }
      throw new Error(errorMessage);
    }

    const result = await response.json();
    const responseText = result.choices[0]?.message?.content || '';
    console.log(`[AZURE] Response length: ${responseText.length} characters`);
    
    // Check for truncation indicators in Azure responses
    if (responseText.includes('...') || responseText.includes('…') || responseText.includes('truncated')) {
      console.warn(`[AZURE] Response contains truncation indicators`);
    }
    
    // Check if response ends abruptly (common truncation pattern)
    const trimmedResponse = responseText.trim();
    
    // Check if this is the simple format (i:1\nA:N\nB:Y)
    const isSimpleFormat = trimmedResponse.includes('i:') && trimmedResponse.includes('A:') && trimmedResponse.includes('B:');
    
    if (!isSimpleFormat && !trimmedResponse.endsWith(']') && !trimmedResponse.endsWith('}')) {
      console.warn(`[AZURE] Response does not end with proper JSON closing character - may be truncated`);
      console.warn(`[AZURE] Response ends with: ...${trimmedResponse.substring(trimmedResponse.length - 50)}`);
    } else if (isSimpleFormat) {
      console.log(`[AZURE] Response appears to be in simple format, skipping JSON completion check`);
    }
    
    // Check if we hit the token limit (common cause of truncation)
    if (result.choices?.[0]?.finish_reason === 'length' || result.choices?.[0]?.finish_reason === 'max_tokens') {
      console.warn(`[AZURE] Response stopped due to token limit (${result.choices[0].finish_reason}) - this may cause truncation`);
    }
    
    if (responseText.length > 8000) {
      console.warn(`[AZURE] Response is very long (${responseText.length} chars), may be approaching token limits`);
    }
    
    // Log the AI response
    if (aiLogger) {
      await aiLogger.logResponse(userId, scanRunId, 'scan-comments', provider, model, responseType, phase, responseText, undefined, undefined);
    }
    
    return responseText;
  } else if (provider === 'openai') {
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    console.log(`[OPENAI] API Key: ${openaiApiKey ? '***' + openaiApiKey.slice(-4) : 'NOT SET'}`);
    console.log(`[OPENAI] Request payload:`, JSON.stringify(payload, null, 2));
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), SCAN_COMMENTS_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
    } catch (e: any) {
      clearTimeout(timeoutId);
      const errorMessage = e && e.name === 'AbortError' ? `OpenAI API timeout after ${toSeconds(SCAN_COMMENTS_TIMEOUT_MS)} seconds` : `OpenAI API fetch failed: ${String(e && e.message || e)}`;
      if (aiLogger) {
        await aiLogger.logResponse(userId, scanRunId, 'scan-comments', provider, model, responseType, phase, '', errorMessage, undefined);
      }
      throw new Error(errorMessage);
    }
    clearTimeout(timeoutId);
    console.log(`[OPENAI] Response status: ${response.status} ${response.statusText}`);
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[OPENAI] Error response:`, errorText);
      const errorMessage = `OpenAI API error: ${response.status} ${response.statusText}`;
      if (aiLogger) {
        await aiLogger.logResponse(userId, scanRunId, 'scan-comments', provider, model, responseType, phase, '', errorMessage, undefined);
      }
      throw new Error(errorMessage);
    }

    const result = await response.json();
    const responseText = result.choices[0]?.message?.content || '';
    console.log(`[OPENAI] Response length: ${responseText.length} characters`);
    
    // Check for truncation indicators in OpenAI responses
    if (responseText.includes('...') || responseText.includes('truncated')) {
      console.warn(`[OPENAI] Response contains truncation indicators`);
    }
    
    // Check if response ends abruptly (common truncation pattern)
    const trimmedResponse = responseText.trim();
    
    // Check if this is the simple format (i:1\nA:N\nB:Y)
    const isSimpleFormat = trimmedResponse.includes('i:') && trimmedResponse.includes('A:') && trimmedResponse.includes('B:');
    
    if (!isSimpleFormat && !trimmedResponse.endsWith(']') && !trimmedResponse.endsWith('}')) {
      console.warn(`[OPENAI] Response does not end with proper JSON closing character - may be truncated`);
      console.warn(`[OPENAI] Response ends with: ...${trimmedResponse.substring(trimmedResponse.length - 50)}`);
    } else if (isSimpleFormat) {
      console.log(`[OPENAI] Response appears to be in simple format, skipping JSON completion check`);
    }
    
    // Check if we hit the token limit (common cause of truncation)
    if (result.choices?.[0]?.finish_reason === 'length' || result.choices?.[0]?.finish_reason === 'max_tokens') {
      console.warn(`[OPENAI] Response stopped due to token limit (${result.choices[0].finish_reason}) - this may cause truncation`);
    }
    
    if (responseText.length > 8000) {
      console.warn(`[OPENAI] Response is very long (${responseText.length} chars), may be approaching token limits`);
    }
    
    // Log the AI response
    if (aiLogger) {
      await aiLogger.logResponse(userId, scanRunId, 'scan-comments', provider, model, responseType, phase, responseText, undefined, undefined);
    }
    
    return responseText;
  } else if (provider === 'bedrock') {
    // AWS Bedrock implementation
    const region = Deno.env.get('AWS_REGION') || 'us-east-1';
    const accessKeyId = Deno.env.get('AWS_ACCESS_KEY_ID');
    const secretAccessKey = Deno.env.get('AWS_SECRET_ACCESS_KEY');
    
    console.log(`[BEDROCK] AWS Region: ${region}`);
    console.log(`[BEDROCK] Access Key ID: ${accessKeyId ? '***' + accessKeyId.slice(-4) : 'NOT SET'}`);
    console.log(`[BEDROCK] Secret Access Key: ${secretAccessKey ? '***' + secretAccessKey.slice(-4) : 'NOT SET'}`);
    
    if (!accessKeyId || !secretAccessKey) {
      throw new Error('AWS credentials not configured');
    }

    // Extract model identifier from provider:model format
    const modelId = model.includes('/') ? model.split('/')[1] : model;
    
    // Create AWS signature v4
    const host = `bedrock-runtime.${region}.amazonaws.com`;
    const endpoint = `https://${host}/model/${encodeURIComponent(modelId)}/invoke`;
    
    console.log(`[BEDROCK] Original model string: ${model}`);
    console.log(`[BEDROCK] Extracted model ID: ${modelId}`);
    console.log(`[BEDROCK] Encoded model ID: ${encodeURIComponent(modelId)}`);
    console.log(`[BEDROCK] Using model: ${modelId}, region: ${region}, endpoint: ${endpoint}`);
    
    // For Anthropic Claude models in Bedrock, system message should be top-level, not in messages array
    const systemMessage = payload.messages.find(msg => msg.role === 'system')?.content || '';
    const userMessage = payload.messages.find(msg => msg.role === 'user')?.content || '';
    
    const bedrockPayload = {
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: payload.max_tokens,  // Use actual AI configuration value
      system: systemMessage,
      messages: [
        {
          role: 'user',
          content: userMessage
        }
      ],
      temperature: payload.temperature
    };

    const date = new Date();
    const amzDate = date.toISOString().replace(/[:\-]|\.\d{3}/g, '');
    
    console.log(`[BEDROCK] Request timestamp: ${date.toISOString()}, AMZ date: ${amzDate}`);
    
    console.log(`[BEDROCK] Request payload:`, JSON.stringify(bedrockPayload, null, 2));
    console.log(`[BEDROCK] Using max_tokens: ${bedrockPayload.max_tokens}, temperature: ${bedrockPayload.temperature}`);
    
    // Create signature using raw endpoint (without encoding) for canonical request
    const rawEndpoint = `https://${host}/model/${modelId}/invoke`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), SCAN_COMMENTS_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Host': host,
          'X-Amz-Date': amzDate,
          'Authorization': await createAWSSignature(
            'POST',
            rawEndpoint, // Use raw endpoint for signature calculation
            JSON.stringify(bedrockPayload),
            accessKeyId,
            secretAccessKey,
            region,
            amzDate
          ),
        },
        body: JSON.stringify(bedrockPayload),
        signal: controller.signal
      });
    } catch (e: any) {
      clearTimeout(timeoutId);
      const errorMessage = e && e.name === 'AbortError' ? 'Bedrock API timeout after 5 minutes' : `Bedrock API fetch failed: ${String(e && e.message || e)}`;
      if (aiLogger) {
        await aiLogger.logResponse(userId, scanRunId, 'scan-comments', provider, model, responseType, phase, '', errorMessage, undefined);
      }
      throw new Error(errorMessage);
    }
    clearTimeout(timeoutId);
    console.log(`[BEDROCK] Response status: ${response.status} ${response.statusText}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[BEDROCK] Error response:`, errorText);
      const errorMessage = `Bedrock API error: ${response.status} ${response.statusText}`;
      if (aiLogger) {
        await aiLogger.logResponse(userId, scanRunId, 'scan-comments', provider, model, responseType, phase, '', errorMessage, undefined);
      }
      throw new Error(errorMessage);
    }

    const result = await response.json();
    const responseText = result.content[0]?.text || '';
    console.log(`[BEDROCK] Response length: ${responseText.length} characters`);
    
    // Check for truncation indicators in Bedrock responses
    if (responseText.includes('...') || responseText.includes('…') || responseText.includes('truncated')) {
      console.warn(`[BEDROCK] Response contains truncation indicators`);
    }
    
    // Check if response ends abruptly (common truncation pattern)
    const trimmedResponse = responseText.trim();
    
    // Check if this is the simple format (i:1\nA:N\nB:Y)
    const isSimpleFormat = trimmedResponse.includes('i:') && trimmedResponse.includes('A:') && trimmedResponse.includes('B:');
    
    if (!isSimpleFormat && !trimmedResponse.endsWith(']') && !trimmedResponse.endsWith('}')) {
      console.warn(`[BEDROCK] Response does not end with proper JSON closing character - may be truncated`);
      console.warn(`[BEDROCK] Response ends with: ...${trimmedResponse.substring(trimmedResponse.length - 50)}`);
    } else if (isSimpleFormat) {
      console.log(`[BEDROCK] Response appears to be in simple format, skipping JSON completion check`);
    }
    
    // Check if we hit the token limit (common cause of truncation)
    if (result.stop_reason === 'max_tokens' || result.stop_reason === 'length') {
      console.warn(`[BEDROCK] Response stopped due to token limit (${result.stop_reason}) - this may cause truncation`);
    }
    
    if (responseText.length > 8000) {
      console.warn(`[BEDROCK] Response is very long (${responseText.length} chars), may be approaching token limits`);
    }
    
    // Log the AI response
    if (aiLogger) {
      await aiLogger.logResponse(userId, scanRunId, 'scan-comments', provider, model, responseType, phase, responseText, undefined, undefined);
    }
    
    return responseText;
  } else {
    throw new Error(`Unsupported provider: ${provider}`);
  }
}

// AWS Signature V4 implementation for Bedrock
async function createAWSSignature(
  method: string,
  url: string,
  body: string,
  accessKeyId: string,
  secretAccessKey: string,
  region: string,
  amzDate: string
): Promise<string> {
  const { hostname, pathname, search } = new URL(url);
  const dateStamp = amzDate.substring(0, 8);
  
  // For Bedrock, AWS expects the path to have double-encoded colons (%253A instead of %3A or :)
  // This is specific to how Bedrock handles model names with colons
  const canonicalPath = pathname.replace(/:/g, '%3A').replace(/%3A/g, '%253A');
  
  // Create canonical request
  const canonicalHeaders = `content-type:application/json\nhost:${hostname}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = 'content-type;host;x-amz-date';
  const payloadHash = await sha256(body);
  const canonicalRequest = `${method}\n${canonicalPath}${search}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
  
  console.log(`[SIGNATURE] Canonical request:`, canonicalRequest);
  
  // Create string to sign
  const algorithm = 'AWS4-HMAC-SHA256';
  const credentialScope = `${dateStamp}/${region}/bedrock/aws4_request`;
  const stringToSign = `${algorithm}\n${amzDate}\n${credentialScope}\n${await sha256(canonicalRequest)}`;
  
  console.log(`[SIGNATURE] String to sign:`, stringToSign);
  
  // Calculate signature
  const kDate = await hmacSha256(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, 'bedrock');
  const kSigning = await hmacSha256(kService, 'aws4_request');
  const signature = await hmacSha256(kSigning, stringToSign);
  
  // Create authorization header
  const authorization = `${algorithm} Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${arrayBufferToHex(signature)}`;
  
  console.log(`[SIGNATURE] Authorization header:`, authorization);
  
  return authorization;
}

async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  return arrayBufferToHex(hashBuffer);
}

async function hmacSha256(key: string | ArrayBuffer | Uint8Array, message: string): Promise<Uint8Array> {
  let keyBuffer: ArrayBuffer;
  if (typeof key === 'string') {
    keyBuffer = new TextEncoder().encode(key).buffer;
  } else if (key instanceof Uint8Array) {
    keyBuffer = key.buffer.slice(key.byteOffset, key.byteOffset + key.byteLength) as ArrayBuffer;
  } else {
    keyBuffer = key as ArrayBuffer;
  }
  
  const msgBuffer = new TextEncoder().encode(message);
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const result = await crypto.subtle.sign('HMAC', cryptoKey, msgBuffer);
  return new Uint8Array(result);
}

function arrayBufferToHex(buffer: ArrayBuffer | Uint8Array): string {
  const uint8Array = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return Array.from(uint8Array)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
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
      const cutoffIdx = Math.max(0, recent.length - rpmLimit);
      const windowStart = new Date(recent[cutoffIdx].created_at).getTime();
      const waitMs = Math.max(0, windowMs - (Date.now() - windowStart)) + jitter();
      if (waitMs <= 0) return;
      console.log(`${logPrefix || ''} [RPM_DB] Throttling ${provider}/${model}: recent=${recent.length} >= rpm=${rpmLimit}, sleeping ${waitMs}ms`);
      await new Promise(r => setTimeout(r, waitMs));
    } catch (e) {
      console.warn(`${logPrefix || ''} [RPM_DB] Unexpected error, proceeding:`, e instanceof Error ? e.message : String(e));
      return;
    }
  }
}

