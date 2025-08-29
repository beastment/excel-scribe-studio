-- Update AI configuration prompts to handle batch processing
UPDATE ai_configurations 
SET analysis_prompt = 'Analyze the following list of comments. For each comment, determine: 1) Concerning content (harassment, threats, illegal activity, safety violations) 2) Personally identifiable information (names, employee IDs, contact info, specific locations). Return a parallel list of JSON objects in the exact same order: [{"index": number, "concerning": boolean, "identifiable": boolean, "reasoning": "explanation"}, {"index": number, "concerning": boolean, "identifiable": boolean, "reasoning": "explanation"}, ...] where "index" is the original comment number from the prompt (e.g., 1, 2, 3, etc.)'
WHERE scanner_type IN ('scan_a', 'scan_b');

UPDATE ai_configurations 
SET analysis_prompt = 'Two AI systems have analyzed these comments and reached different conclusions. Review each comment and the conflicting analyses, then provide a parallel list of final determinations in the exact same order: [{"concerning": boolean, "identifiable": boolean, "reasoning": "explanation of final decision", "scan_a_analysis": "summary", "scan_b_analysis": "summary"}, ...]'
WHERE scanner_type = 'adjudicator';

UPDATE ai_configurations 
SET redact_prompt = 'Remove all personally identifiable information from these comments while preserving the core message and tone. Return a parallel list of redacted comments in the exact same order as the input.'
WHERE scanner_type IN ('scan_a', 'scan_b', 'adjudicator');

UPDATE ai_configurations 
SET rephrase_prompt = 'Rephrase these comments to remove personally identifiable information while maintaining the original meaning, tone, and level of concern. Return a parallel list of rephrased comments in the exact same order as the input.'
WHERE scanner_type IN ('scan_a', 'scan_b', 'adjudicator');