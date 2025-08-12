-- Update AI configurations to use AWS Bedrock with Claude Sonnet 4
UPDATE ai_configurations 
SET provider = 'bedrock',
    model = 'anthropic.claude-3-5-sonnet-20241022-v2:0'
WHERE scanner_type IN ('scan_a', 'scan_b', 'adjudicator');