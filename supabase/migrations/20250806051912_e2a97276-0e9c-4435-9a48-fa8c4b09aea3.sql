-- Fix critical security issue: Add RLS policies for auth_rate_limits table
-- This table should only be accessible by service role (edge functions)
-- and protected from regular user access

-- Create policies for auth_rate_limits table
-- Service role policy (for edge functions to manage rate limits)
CREATE POLICY "Service role can manage rate limits" 
ON public.auth_rate_limits 
FOR ALL 
TO service_role 
USING (true)
WITH CHECK (true);

-- Deny all access to authenticated and anonymous users
CREATE POLICY "Deny user access to rate limits" 
ON public.auth_rate_limits 
FOR ALL 
TO authenticated, anon
USING (false)
WITH CHECK (false);

-- Update database functions with explicit search_path for security
CREATE OR REPLACE FUNCTION public.cleanup_auth_rate_limits()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Delete records older than 24 hours
  DELETE FROM public.auth_rate_limits 
  WHERE created_at < now() - interval '24 hours';
END;
$$;

-- Update handle_new_user function with explicit search_path
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name');
  RETURN NEW;
END;
$$;