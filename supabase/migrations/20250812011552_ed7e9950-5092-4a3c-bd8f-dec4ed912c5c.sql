-- Temporarily switch scan_a and scan_b to use OpenAI for testing
UPDATE ai_configurations 
SET provider = 'openai', model = 'gpt-4o-mini'
WHERE scanner_type IN ('scan_a', 'scan_b');