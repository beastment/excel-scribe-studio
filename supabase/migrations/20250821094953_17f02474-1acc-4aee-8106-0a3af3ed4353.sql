-- Add is_blurred column to app_configurations table
ALTER TABLE public.app_configurations 
ADD COLUMN is_blurred boolean NOT NULL DEFAULT false;