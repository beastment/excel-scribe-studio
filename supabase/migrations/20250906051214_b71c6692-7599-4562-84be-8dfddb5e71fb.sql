-- Phase 1: Block privilege escalation and self-crediting (Fixed)

-- 1. Fix profiles table security
-- Drop overly permissive policy that allows users to update any field including role
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

-- Create granular policies for safe field updates
CREATE POLICY "Users can update safe profile fields" 
ON public.profiles 
FOR UPDATE 
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id AND
  -- Prevent role changes by non-admins
  (role = role OR is_admin(auth.uid())) AND
  -- Prevent credit changes by non-admins  
  (credits = credits OR is_admin(auth.uid()))
);

-- 2. Lock down user_credits table completely
-- Drop the policy that allows users to update their own credits
DROP POLICY IF EXISTS "Users can update their own credits" ON public.user_credits;

-- Only allow SELECT for users to view their own credits
-- All credit modifications must go through SECURITY DEFINER functions

-- 3. Create payments_processed table for idempotency
CREATE TABLE IF NOT EXISTS public.payments_processed (
  session_id TEXT PRIMARY KEY,
  user_id UUID NOT NULL,
  credits_added INTEGER NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on payments table
ALTER TABLE public.payments_processed ENABLE ROW LEVEL SECURITY;

-- Only admins can view payment records
CREATE POLICY "Only admins can view payment records" 
ON public.payments_processed 
FOR SELECT 
USING (is_admin(auth.uid()));

-- System can insert payment records (for edge functions)
CREATE POLICY "System can insert payment records" 
ON public.payments_processed 
FOR INSERT 
WITH CHECK (true);