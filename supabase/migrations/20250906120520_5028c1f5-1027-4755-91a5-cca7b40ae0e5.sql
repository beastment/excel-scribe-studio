-- Fix remaining functions without search_path

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE((auth.jwt() ->> 'is_admin')::boolean, false);
$function$;

CREATE OR REPLACE FUNCTION public.is_admin_user()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
    SELECT has_role((SELECT auth.uid()), 'admin'::app_role);
$function$;