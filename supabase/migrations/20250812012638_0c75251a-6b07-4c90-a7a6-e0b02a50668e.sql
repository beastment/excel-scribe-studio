-- Switch back to Bedrock for testing
UPDATE ai_configurations 
SET provider = 'bedrock', model = 'anthropic.claude-3-haiku-20240307-v1:0'
WHERE scanner_type = 'scan_a';

UPDATE ai_configurations 
SET provider = 'bedrock', model = 'amazon.titan-text-lite-v1'
WHERE scanner_type = 'scan_b';