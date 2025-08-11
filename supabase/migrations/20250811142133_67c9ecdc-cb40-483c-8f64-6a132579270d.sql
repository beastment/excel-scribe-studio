-- Temporarily switch all configurations to OpenAI to avoid Bedrock authentication issues
UPDATE ai_configurations 
SET provider = 'openai',
    model = CASE 
      WHEN scanner_type = 'scan_a' THEN 'gpt-4o-mini'
      WHEN scanner_type = 'scan_b' THEN 'gpt-4o-mini' 
      WHEN scanner_type = 'adjudicator' THEN 'gpt-4o-mini'
    END
WHERE provider = 'aws_bedrock';