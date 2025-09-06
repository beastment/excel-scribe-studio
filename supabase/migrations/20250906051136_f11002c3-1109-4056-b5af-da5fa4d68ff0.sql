-- Phase 1: Block privilege escalation and self-crediting

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
  (OLD.role = NEW.role OR is_admin(auth.uid())) AND
  -- Prevent credit changes by non-admins  
  (OLD.credits = NEW.credits OR is_admin(auth.uid()))
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

-- 4. Harden SECURITY DEFINER functions with proper search_path
CREATE OR REPLACE FUNCTION public.deduct_credits(user_uuid uuid, amount integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  current_credits integer;
BEGIN
  -- Get current credits with row lock
  SELECT credits INTO current_credits
  FROM public.profiles
  WHERE user_id = user_uuid
  FOR UPDATE;
  
  -- Check if user exists and has enough credits
  IF current_credits IS NULL THEN
    RETURN false;
  END IF;
  
  IF current_credits < amount THEN
    RETURN false;
  END IF;
  
  -- Deduct credits
  UPDATE public.profiles
  SET credits = credits - amount,
      updated_at = now()
  WHERE user_id = user_uuid;
  
  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.add_credits(user_uuid uuid, amount integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Add credits
  UPDATE public.profiles
  SET credits = credits + amount,
      updated_at = now()
  WHERE user_id = user_uuid;
  
  RETURN FOUND;
END;
$function$;

CREATE OR REPLACE FUNCTION public.deduct_user_credits(user_uuid uuid, credits_to_deduct integer, scan_run_id text, comments_scanned integer, scan_type text DEFAULT 'comment_scan'::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  current_credits integer;
BEGIN
  -- Get current credits
  SELECT available_credits INTO current_credits
  FROM public.user_credits
  WHERE user_id = user_uuid;
  
  -- If no credits record exists, create one
  IF current_credits IS NULL THEN
    INSERT INTO public.user_credits (user_id, available_credits)
    VALUES (user_uuid, 100);
    current_credits := 100;
  END IF;
  
  -- Check if user has enough credits
  IF current_credits < credits_to_deduct THEN
    RETURN false;
  END IF;
  
  -- Deduct credits
  UPDATE public.user_credits
  SET 
    available_credits = available_credits - credits_to_deduct,
    total_credits_used = total_credits_used + credits_to_deduct
  WHERE user_id = user_uuid;
  
  -- Record usage
  INSERT INTO public.credit_usage (user_id, scan_run_id, credits_used, comments_scanned, scan_type)
  VALUES (user_uuid, scan_run_id, credits_to_deduct, comments_scanned, scan_type);
  
  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.add_user_credits(user_uuid uuid, credits_to_add integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.user_credits (user_id, available_credits)
  VALUES (user_uuid, credits_to_add)
  ON CONFLICT (user_id) 
  DO UPDATE SET 
    available_credits = user_credits.available_credits + credits_to_add;
  
  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_or_create_user_credits(user_uuid uuid)
 RETURNS user_credits
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result_record public.user_credits;
BEGIN
  -- Try to get existing credits
  SELECT * INTO result_record
  FROM public.user_credits 
  WHERE user_id = user_uuid;
  
  -- If no record exists, create one
  IF result_record IS NULL THEN
    INSERT INTO public.user_credits (user_id, available_credits, total_credits_used)
    VALUES (user_uuid, 100, 0)
    RETURNING * INTO result_record;
  END IF;
  
  RETURN result_record;
END;
$function$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE user_id = _user_id
      AND role = _role
  )
$function$;

CREATE OR REPLACE FUNCTION public.is_partner(user_uuid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = user_uuid AND role = 'partner'
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_admin(user_uuid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = user_uuid AND role = 'admin'
  );
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, role)
  VALUES (
    NEW.id, 
    NEW.raw_user_meta_data->>'full_name',
    CASE 
      WHEN NEW.email = 'admin@surveyjumper.com' THEN 'admin'::app_role
      ELSE 'user'::app_role
    END
  );
  RETURN NEW;
END;
$function$;