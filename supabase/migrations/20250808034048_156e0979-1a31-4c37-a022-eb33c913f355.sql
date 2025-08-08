-- Add position column to app_configurations table for ordering
ALTER TABLE public.app_configurations 
ADD COLUMN position INTEGER DEFAULT 0;

-- Update existing records with initial positions
UPDATE public.app_configurations 
SET position = CASE app_id
  WHEN 'action-planning-extension' THEN 1
  WHEN 'thematic-analysis' THEN 2
  WHEN 'comment-de-identification' THEN 3
  WHEN 'report-writer' THEN 4
  ELSE 999
END;