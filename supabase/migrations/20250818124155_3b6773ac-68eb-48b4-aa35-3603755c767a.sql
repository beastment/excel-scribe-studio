-- Add input and output token limit columns to model_configurations table
ALTER TABLE public.model_configurations 
ADD COLUMN input_token_limit INTEGER,
ADD COLUMN output_token_limit INTEGER;