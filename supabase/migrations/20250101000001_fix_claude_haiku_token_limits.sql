-- Fix token limits for Claude-3-Haiku to prevent context window issues
-- Claude-3-Haiku has a 200K total context window with 4K output limit
-- Available for input: 200K - 4K = 196K tokens

UPDATE model_configurations 
SET 
  input_token_limit = 196000,
  output_token_limit = 4096
WHERE model = 'anthropic.claude-3-haiku-20240307-v1:0';

-- Add a comment to explain the configuration
COMMENT ON COLUMN model_configurations.input_token_limit IS 'Maximum input tokens (prompt + comments). For models with limited context windows, set conservatively to reserve tokens for output.';
COMMENT ON COLUMN model_configurations.output_token_limit IS 'Maximum output tokens. Should be set to leave room for input tokens within the model''s total context window.';
