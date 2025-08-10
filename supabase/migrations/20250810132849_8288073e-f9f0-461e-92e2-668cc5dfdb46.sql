-- Create comment sessions table for saving progress
CREATE TABLE public.comment_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  session_name TEXT NOT NULL,
  comments_data JSONB NOT NULL,
  has_scan_run BOOLEAN NOT NULL DEFAULT false,
  default_mode TEXT NOT NULL DEFAULT 'redact',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.comment_sessions ENABLE ROW LEVEL SECURITY;

-- Create policies for user access to their own sessions
CREATE POLICY "Users can view their own comment sessions" 
ON public.comment_sessions 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own comment sessions" 
ON public.comment_sessions 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own comment sessions" 
ON public.comment_sessions 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own comment sessions" 
ON public.comment_sessions 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_comment_sessions_updated_at
BEFORE UPDATE ON public.comment_sessions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();