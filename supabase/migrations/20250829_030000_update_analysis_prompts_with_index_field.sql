-- Update AI configuration prompts to include index field requirement
UPDATE ai_configurations 
SET analysis_prompt = 'Analyze the following list of comments. For each comment, determine: 1) Concerning content (harassment, threats, illegal activity, safety violations) 2) Personally identifiable information (names, employee IDs, contact info, specific locations). Return a parallel list of JSON objects in the exact same order: [{"index": number, "concerning": boolean, "identifiable": boolean, "reasoning": "explanation"}, {"index": number, "concerning": boolean, "identifiable": boolean, "reasoning": "explanation"}, ...] where "index" is the original comment number from the prompt (e.g., 1, 2, 3, etc.)'
WHERE scanner_type IN ('scan_a', 'scan_b');
