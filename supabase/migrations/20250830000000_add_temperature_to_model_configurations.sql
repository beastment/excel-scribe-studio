-- Add temperature column to model_configurations table
ALTER TABLE public.model_configurations 
ADD COLUMN temperature REAL DEFAULT 0.0;

-- Add constraint to ensure temperature is between 0 and 2 (standard range for most AI models)
ALTER TABLE public.model_configurations 
ADD CONSTRAINT temperature_range CHECK (temperature >= 0.0 AND temperature <= 2.0);

-- Update existing records to have a default temperature of 0.0
UPDATE public.model_configurations 
SET temperature = 0.0 
WHERE temperature IS NULL;
