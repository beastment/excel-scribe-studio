-- Add scroll_position column to comment_sessions table
ALTER TABLE public.comment_sessions 
ADD COLUMN scroll_position integer DEFAULT 0;