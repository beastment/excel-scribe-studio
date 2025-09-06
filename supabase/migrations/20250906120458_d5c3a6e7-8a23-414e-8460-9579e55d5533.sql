-- Fix remaining search_path issues

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