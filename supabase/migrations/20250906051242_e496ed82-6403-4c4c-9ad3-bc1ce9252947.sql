-- Fix remaining SECURITY DEFINER functions with proper search_path

CREATE OR REPLACE FUNCTION public.cleanup_auth_rate_limits()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Delete records older than 24 hours
  DELETE FROM public.auth_rate_limits 
  WHERE created_at < now() - interval '24 hours';
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$function$;

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