-- Create a separate table for batch sizing configuration
CREATE TABLE public.batch_sizing_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  scan_a_io_ratio DECIMAL(4,2) DEFAULT 1.00,
  scan_b_io_ratio DECIMAL(4,2) DEFAULT 0.90,
  adjudicator_io_ratio DECIMAL(4,2) DEFAULT 6.20,
  redaction_io_ratio DECIMAL(4,2) DEFAULT 1.70,
  rephrase_io_ratio DECIMAL(4,2) DEFAULT 2.30,
  safety_margin_percent INTEGER DEFAULT 15,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Add comments
COMMENT ON TABLE public.batch_sizing_config IS 'Application-wide batch sizing configuration for AI processing';
COMMENT ON COLUMN public.batch_sizing_config.scan_a_io_ratio IS 'Expected ratio of input tokens to output tokens for Scan A phase (conservative estimate)';
COMMENT ON COLUMN public.batch_sizing_config.scan_b_io_ratio IS 'Expected ratio of input tokens to output tokens for Scan B phase (conservative estimate)';
COMMENT ON COLUMN public.batch_sizing_config.adjudicator_io_ratio IS 'Expected ratio of input tokens to output tokens for Adjudicator phase (conservative estimate)';
COMMENT ON COLUMN public.batch_sizing_config.redaction_io_ratio IS 'Expected ratio of input tokens to output tokens for Redaction phase (conservative estimate)';
COMMENT ON COLUMN public.batch_sizing_config.rephrase_io_ratio IS 'Expected ratio of input tokens to output tokens for Rephrase phase (conservative estimate)';
COMMENT ON COLUMN public.batch_sizing_config.safety_margin_percent IS 'Safety margin percentage for batch sizing calculations (default 15%)';

-- Insert default configuration
INSERT INTO public.batch_sizing_config (scan_a_io_ratio, scan_b_io_ratio, adjudicator_io_ratio, redaction_io_ratio, rephrase_io_ratio, safety_margin_percent)
VALUES (1.00, 0.90, 6.20, 1.70, 2.30, 15);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_batch_sizing_config_updated_at BEFORE UPDATE ON public.batch_sizing_config
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
