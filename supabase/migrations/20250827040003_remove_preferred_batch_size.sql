-- Remove preferred_batch_size column from ai_configurations table as it's no longer used
-- Dynamic batch sizing is now handled by token limits and I/O ratios
ALTER TABLE public.ai_configurations 
DROP COLUMN preferred_batch_size;
