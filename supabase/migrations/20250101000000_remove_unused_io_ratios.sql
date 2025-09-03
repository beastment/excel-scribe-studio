-- Remove unused I/O ratio columns from batch_sizing_config table
-- These columns are no longer used since scan and adjudication phases now use a simple 4 tokens per comment estimation

ALTER TABLE public.batch_sizing_config 
DROP COLUMN IF EXISTS scan_a_io_ratio,
DROP COLUMN IF EXISTS scan_b_io_ratio,
DROP COLUMN IF EXISTS adjudicator_io_ratio;

-- Update the default values for the remaining columns
UPDATE public.batch_sizing_config 
SET 
  redaction_io_ratio = COALESCE(redaction_io_ratio, 1.7),
  rephrase_io_ratio = COALESCE(rephrase_io_ratio, 2.3),
  safety_margin_percent = COALESCE(safety_margin_percent, 15)
WHERE id IS NOT NULL;

