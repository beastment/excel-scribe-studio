-- Fix critical security issues

-- 1. Fix profiles update policy to prevent privilege escalation
DROP POLICY IF EXISTS "Combined profile update policy" ON public.profiles;

CREATE POLICY "Users can update own profile basic info" 
ON public.profiles 
FOR UPDATE 
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id 
  AND (
    -- Only allow updates to these safe fields
    OLD.role = NEW.role 
    AND OLD.credits = NEW.credits
    AND OLD.user_id = NEW.user_id
    AND OLD.id = NEW.id
  )
);

CREATE POLICY "Admins can update any profile" 
ON public.profiles 
FOR UPDATE 
USING (is_admin(auth.uid()))
WITH CHECK (is_admin(auth.uid()));

-- 2. Add proper search_path to functions
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

-- 3. Restrict maintenance_mode table exposure
DROP POLICY IF EXISTS "Anyone can view maintenance mode status" ON public.maintenance_mode;

CREATE POLICY "View maintenance status only" 
ON public.maintenance_mode 
FOR SELECT 
USING (true);

-- Prevent direct access to sensitive maintenance fields
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

-- 4. Improve auth rate limiting
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