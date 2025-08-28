-- Add safety_margin_percent column to ai_configurations table
ALTER TABLE public.ai_configurations
ADD COLUMN safety_margin_percent INTEGER DEFAULT 15;

COMMENT ON COLUMN public.ai_configurations.safety_margin_percent IS 'Safety margin percentage for batch sizing calculations (default 15%)';

-- Set default value for existing records
UPDATE public.ai_configurations
SET safety_margin_percent = 15
WHERE safety_margin_percent IS NULL;
