-- CRITICAL SECURITY FIXES
-- Phase 1: Block privilege escalation and credit fraud

-- 1. Fix profiles table - prevent role/credit escalation
DROP POLICY IF EXISTS "Users can update safe profile fields" ON public.profiles;

CREATE POLICY "Users can update safe profile fields" 
ON public.profiles 
FOR UPDATE 
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id 
  AND role = role  -- Prevent role changes
  AND credits = credits  -- Prevent credit changes
);

-- Revoke broad UPDATE and grant column-specific permissions
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE(full_name, avatar_url, last_login_at) ON public.profiles TO authenticated;

-- 2. Lock down credit functions - prevent fraud
REVOKE EXECUTE ON FUNCTION public.add_user_credits(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.deduct_user_credits(uuid, integer, text, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.add_credits(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.deduct_credits(uuid, integer) FROM PUBLIC, anon, authenticated;

-- Grant EXECUTE only to service_role and postgres
GRANT EXECUTE ON FUNCTION public.add_user_credits(uuid, integer) TO service_role, postgres;
GRANT EXECUTE ON FUNCTION public.deduct_user_credits(uuid, integer, text, integer, text) TO service_role, postgres;
GRANT EXECUTE ON FUNCTION public.add_credits(uuid, integer) TO service_role, postgres;
GRANT EXECUTE ON FUNCTION public.deduct_credits(uuid, integer) TO service_role, postgres;

-- Update get_or_create_user_credits to enforce ownership/admin check
DROP FUNCTION IF EXISTS public.get_or_create_user_credits(uuid);

CREATE OR REPLACE FUNCTION public.get_or_create_user_credits(user_uuid uuid)
RETURNS user_credits
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
$$;

-- Adjust permissions for get_or_create_user_credits
REVOKE EXECUTE ON FUNCTION public.get_or_create_user_credits(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_or_create_user_credits(uuid) TO authenticated, service_role, postgres;

-- 3. Remove public INSERT from payments_processed - prevent DoS
DROP POLICY IF EXISTS "System can insert payment records" ON public.payments_processed;

-- 4. Remove public INSERT from ai_logs - edge functions use service_role
DROP POLICY IF EXISTS "System can insert AI logs" ON public.ai_logs;

-- 5. Fix maintenance_mode to not expose admin IDs
REVOKE SELECT ON public.maintenance_mode FROM anon, authenticated;
GRANT SELECT(is_enabled, message, updated_at) ON public.maintenance_mode TO anon, authenticated;

-- 6. Add trigger for reliable profile creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER 
SET search_path TO 'public'
AS $$
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
$$;

-- Ensure trigger exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 7. Defense-in-depth: Add trigger to prevent non-admin role/credit changes
CREATE OR REPLACE FUNCTION public.prevent_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only admins can change roles or credits
  IF (OLD.role != NEW.role OR OLD.credits != NEW.credits) AND NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: only admins can modify roles or credits';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER prevent_profiles_privilege_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_privilege_escalation();