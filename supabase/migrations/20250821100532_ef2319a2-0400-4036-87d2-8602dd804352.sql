-- Add status column to app_configurations table
ALTER TABLE public.app_configurations 
ADD COLUMN status text NOT NULL DEFAULT 'In Development';

-- Update existing records with appropriate statuses
UPDATE public.app_configurations 
SET status = CASE 
  WHEN app_id = 'comment-de-identification' THEN 'Currently in Beta'
  ELSE 'In Development'
END;