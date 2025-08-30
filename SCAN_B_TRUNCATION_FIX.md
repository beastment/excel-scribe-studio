# Fixing Scan B JSON Truncation Issue

## Problem Identified
Scan B is returning truncated JSON responses, causing parsing errors like:
```
Expected ',' or '}' after property value in JSON at position 7271 (line 168 column 130)
```

## Root Cause
The AI model (likely Claude-3-Haiku) is hitting its output token limit and truncating the response. This happens because:

1. **I/O Ratio Too Optimistic**: The current `scan_b_io_ratio` is set to 0.9, which assumes Scan B generates output that's 90% of input size
2. **Detailed Reasoning**: Scan B generates detailed reasoning for each comment, which can be much longer than the input
3. **Batch Size Too Large**: The calculated batch size doesn't account for the actual output length

## Immediate Fixes

### 1. Reduce Scan B I/O Ratio
In your Admin Dashboard → AI Configuration → Batch Sizing Configuration:

**Current setting:**
```
scan_b_io_ratio: 0.9
```

**Recommended setting:**
```
scan_b_io_ratio: 0.6
```

This tells the system that Scan B generates output that's about 60% of input size, which is more realistic for detailed reasoning.

### 2. Increase Safety Margin
**Current setting:**
```
safety_margin_percent: 15
```

**Recommended setting:**
```
safety_margin_percent: 25
```

This provides more buffer against hitting token limits.

## Why This Happens

Looking at your error logs, Scan B was processing 32 comments but only returned results up to index 29. The JSON was cut off mid-response, indicating the AI model hit its output token limit.

The I/O ratio of 0.9 assumes that if you send 1000 input tokens, Scan B will generate 900 output tokens. However, Scan B generates detailed reasoning like:

```json
{
  "index": 15,
  "concerning": false,
  "identifiable": true,
  "reasoning": "The comment suggests reclassification of the person's position to a higher level considering their 27 years of work experience and education, which could be considered identifying information."
}
```

This reasoning can be much longer than the input comment, making the 0.9 ratio too optimistic.

## Recommended Configuration

```json
{
  "scan_a_io_ratio": 1.0,
  "scan_b_io_ratio": 0.6,
  "adjudicator_io_ratio": 6.2,
  "redaction_io_ratio": 1.7,
  "rephrase_io_ratio": 2.3,
  "safety_margin_percent": 25
}
```

## What This Fixes

1. **Smaller Batch Sizes**: Scan B will process fewer comments per batch, reducing the chance of hitting token limits
2. **More Accurate Token Estimation**: The system will better predict how many output tokens Scan B needs
3. **Prevents Truncation**: Smaller batches mean complete responses within token limits
4. **Better Error Messages**: The improved logging will help identify truncation issues

## Testing

After making these changes:
1. Run a new scan with a small dataset (10-20 comments)
2. Check the logs for the new batch sizing warnings
3. Verify that Scan B completes all results without truncation
4. Gradually increase dataset size to find the optimal batch size

## Alternative Solutions

If reducing the I/O ratio doesn't work:
1. **Reduce batch size manually** by setting a lower maximum in the configuration
2. **Increase output token limit** for the Scan B model (if your plan allows)
3. **Simplify the Scan B prompt** to generate shorter reasoning
4. **Use a different model** for Scan B that has higher token limits

The I/O ratio adjustment should resolve the issue in most cases.
