-- Switch to OpenAI for production use while we fix Bedrock
UPDATE ai_configurations 
SET provider = 'openai', model = 'gpt-4o-mini'
WHERE scanner_type IN ('scan_a', 'scan_b');