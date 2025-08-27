-- Create AI logging table for tracking AI requests and responses
CREATE TABLE public.ai_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  scan_run_id text,
  function_name text NOT NULL, -- e.g., 'scan-comments', 'adjudicator', 'post-process-comments'
  provider text NOT NULL, -- e.g., 'openai', 'azure', 'bedrock'
  model text NOT NULL,
  request_type text NOT NULL, -- e.g., 'batch_analysis', 'adjudication', 'batch_text'
  phase text, -- e.g., 'redaction', 'rephrase', 'scan_a', 'scan_b'
  
  -- Request details
  request_prompt text NOT NULL,
  request_input text NOT NULL,
  request_tokens integer,
  request_temperature real,
  request_max_tokens integer,
  
  -- Response details
  response_text text,
  response_tokens integer,
  response_status text, -- 'success', 'error'
  response_error text,
  
  -- Metadata
  processing_time_ms integer, -- Time taken for the AI call
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  
  -- Indexes for efficient querying
  CONSTRAINT ai_logs_user_id_idx UNIQUE (user_id, created_at, function_name, phase)
);

-- Enable RLS
ALTER TABLE public.ai_logs ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own AI logs" 
ON public.ai_logs 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all AI logs" 
ON public.ai_logs 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "System can insert AI logs" 
ON public.ai_logs 
FOR INSERT 
WITH CHECK (true);

-- Create indexes for performance
CREATE INDEX idx_ai_logs_user_id ON public.ai_logs(user_id);
CREATE INDEX idx_ai_logs_scan_run_id ON public.ai_logs(scan_run_id);
CREATE INDEX idx_ai_logs_function_name ON public.ai_logs(function_name);
CREATE INDEX idx_ai_logs_created_at ON public.ai_logs(created_at);
CREATE INDEX idx_ai_logs_provider_model ON public.ai_logs(provider, model);

-- Add trigger for automatic timestamp updates
CREATE TRIGGER update_ai_logs_updated_at
BEFORE UPDATE ON public.ai_logs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
