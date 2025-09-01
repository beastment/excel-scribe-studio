-- Add tokens_per_comment column to ai_configurations table
ALTER TABLE public.ai_configurations 
ADD COLUMN tokens_per_comment INTEGER DEFAULT 13;

-- Add constraint to ensure tokens_per_comment is a positive integer
ALTER TABLE public.ai_configurations 
ADD CONSTRAINT tokens_per_comment_positive CHECK (tokens_per_comment > 0);

-- Add comment
COMMENT ON COLUMN public.ai_configurations.tokens_per_comment IS 'Estimated tokens per comment for output token calculations in batch sizing (default 13)';

-- Update existing records to have the default value of 13
UPDATE public.ai_configurations 
SET tokens_per_comment = 13 
WHERE tokens_per_comment IS NULL;
