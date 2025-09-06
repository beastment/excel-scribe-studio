-- Security Fix: Remove permissive INSERT policy from credit_usage
-- This prevents clients from inserting arbitrary usage records
DROP POLICY IF EXISTS "System can insert usage records" ON public.credit_usage;

-- Only allow service role and SECURITY DEFINER functions to insert
-- No direct client INSERT access to prevent DoS via fake usage records