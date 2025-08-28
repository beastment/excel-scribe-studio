-- Add temperature column to ai_configurations table for controlling AI response randomness
ALTER TABLE public.ai_configurations 
ADD COLUMN temperature DECIMAL(3,2) DEFAULT 0.00;

-- Add comment to document the purpose of this field
COMMENT ON COLUMN public.ai_configurations.temperature IS 'Temperature setting for AI responses (0.0 = deterministic, 1.0 = creative, default 0.0 for consistent results)';

-- Set reasonable default values for existing records
UPDATE public.ai_configurations 
SET temperature = 0.00 
WHERE temperature IS NULL;
