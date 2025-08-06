-- Create table for authentication rate limiting
CREATE TABLE public.auth_rate_limits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ip INET NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  first_attempt TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  is_locked BOOLEAN NOT NULL DEFAULT false,
  lockout_until TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for efficient IP lookups
CREATE INDEX idx_auth_rate_limits_ip ON public.auth_rate_limits(ip);

-- Create index for cleanup queries
CREATE INDEX idx_auth_rate_limits_created_at ON public.auth_rate_limits(created_at);

-- Enable RLS (no policies needed as this will be managed by service role)
ALTER TABLE public.auth_rate_limits ENABLE ROW LEVEL SECURITY;

-- Add trigger for automatic timestamp updates
CREATE TRIGGER update_auth_rate_limits_updated_at
  BEFORE UPDATE ON public.auth_rate_limits
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to clean up old rate limit records (run this periodically)
CREATE OR REPLACE FUNCTION public.cleanup_auth_rate_limits()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Delete records older than 24 hours
  DELETE FROM public.auth_rate_limits 
  WHERE created_at < now() - interval '24 hours';
END;
$$;