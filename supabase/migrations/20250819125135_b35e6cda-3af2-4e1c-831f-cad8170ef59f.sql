-- Add preferred_batch_size column to ai_configurations table
ALTER TABLE public.ai_configurations 
ADD COLUMN preferred_batch_size integer;

-- Set a reasonable default value for existing records
UPDATE public.ai_configurations 
SET preferred_batch_size = 20 
WHERE preferred_batch_size IS NULL;