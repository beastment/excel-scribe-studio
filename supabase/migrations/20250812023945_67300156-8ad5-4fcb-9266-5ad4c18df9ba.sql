-- Update Bedrock model identifiers to valid ones
UPDATE ai_configurations 
SET model = 'anthropic.claude-3-haiku-20240307-v1:0'
WHERE scanner_type = 'scan_a' AND provider = 'bedrock';

UPDATE ai_configurations 
SET model = 'amazon.titan-text-lite-v1'  
WHERE scanner_type = 'scan_b' AND provider = 'bedrock';

UPDATE ai_configurations 
SET model = 'anthropic.claude-3-haiku-20240307-v1:0'
WHERE scanner_type = 'adjudicator' AND provider = 'bedrock';