-- Fix critical security issues

-- 1. Fix profiles update policy to prevent privilege escalation
DROP POLICY IF EXISTS "Combined profile update policy" ON public.profiles;

-- Create a trigger function to prevent privilege escalation
CREATE OR REPLACE FUNCTION public.prevent_privilege_escalation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Only admins can change roles or credits
  IF (OLD.role != NEW.role OR OLD.credits != NEW.credits) AND NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: only admins can modify roles or credits';
  END IF;
  RETURN NEW;
END;
$function$;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS prevent_privilege_escalation_trigger ON public.profiles;

-- Create new trigger
CREATE TRIGGER prevent_privilege_escalation_trigger
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_privilege_escalation();

-- Create separate policies for users and admins
CREATE POLICY "Users can update own profile basic info" 
ON public.profiles 
FOR UPDATE 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

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