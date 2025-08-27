-- Add I/O ratio columns to ai_configurations table for dynamic batch sizing
ALTER TABLE public.ai_configurations 
ADD COLUMN scan_a_io_ratio DECIMAL(4,2) DEFAULT 1.00,
ADD COLUMN scan_b_io_ratio DECIMAL(4,2) DEFAULT 0.90,
ADD COLUMN adjudicator_io_ratio DECIMAL(4,2) DEFAULT 6.20,
ADD COLUMN redaction_io_ratio DECIMAL(4,2) DEFAULT 1.70,
ADD COLUMN rephrase_io_ratio DECIMAL(4,2) DEFAULT 2.30;

-- Add comments to document the purpose of these fields
COMMENT ON COLUMN public.ai_configurations.scan_a_io_ratio IS 'Expected ratio of input tokens to output tokens for Scan A phase (conservative estimate)';
COMMENT ON COLUMN public.ai_configurations.scan_b_io_ratio IS 'Expected ratio of input tokens to output tokens for Scan B phase (conservative estimate)';
COMMENT ON COLUMN public.ai_configurations.adjudicator_io_ratio IS 'Expected ratio of input tokens to output tokens for Adjudicator phase (conservative estimate)';
COMMENT ON COLUMN public.ai_configurations.redaction_io_ratio IS 'Expected ratio of input tokens to output tokens for Redaction phase (conservative estimate)';
COMMENT ON COLUMN public.ai_configurations.rephrase_io_ratio IS 'Expected ratio of input tokens to output tokens for Rephrase phase (conservative estimate)';
