-- Fix remaining search_path warnings and other security issues

-- 1. Fix remaining functions with missing search_path
CREATE OR REPLACE FUNCTION public.get_maintenance_status()
 RETURNS TABLE(is_enabled boolean, message text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT is_enabled, message 
  FROM public.maintenance_mode 
  ORDER BY updated_at DESC 
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.cleanup_auth_rate_limits()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Delete records older than 24 hours and reset counters for expired lockouts
  DELETE FROM public.auth_rate_limits 
  WHERE created_at < now() - interval '24 hours'
     OR (is_locked = true AND lockout_until < now());
     
  -- Reset attempts for IPs that haven't attempted in the last hour
  UPDATE public.auth_rate_limits 
  SET attempts = 0, is_locked = false, lockout_until = null
  WHERE updated_at < now() - interval '1 hour' 
    AND is_locked = false;
END;
$function$;

-- Fix other functions that may be missing search_path
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

CREATE OR REPLACE FUNCTION public.get_or_create_user_credits(user_uuid uuid)
 RETURNS user_credits
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result_record public.user_credits;
BEGIN
  -- Security check: only allow access to own credits or if admin
  IF auth.uid() != user_uuid AND NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: can only access own credits';
  END IF;

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