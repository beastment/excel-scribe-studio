-- Fix the invalid model identifier for the adjudicator
UPDATE ai_configurations 
SET model = 'anthropic.claude-3-haiku-20240307-v1:0'
WHERE scanner_type = 'adjudicator' AND model = 'anthropic.claude-v2:1';