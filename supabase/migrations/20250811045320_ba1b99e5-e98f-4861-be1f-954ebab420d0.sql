-- Add is_hidden column to app_configurations table
ALTER TABLE public.app_configurations 
ADD COLUMN is_hidden boolean NOT NULL DEFAULT false;