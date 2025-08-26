-- Migration to sync credits from profiles table to user_credits table
-- Migration: 20250824000000_migrate_credits_to_user_credits

-- Function to migrate existing credits from profiles to user_credits
CREATE OR REPLACE FUNCTION public.migrate_credits_from_profiles()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  profile_record RECORD;
BEGIN
  -- Loop through all profiles that have credits
  FOR profile_record IN 
    SELECT user_id, credits 
    FROM public.profiles 
    WHERE credits IS NOT NULL AND credits > 0
  LOOP
    -- Insert or update user_credits record
    INSERT INTO public.user_credits (user_id, available_credits, total_credits_used)
    VALUES (profile_record.user_id, profile_record.credits, 0)
    ON CONFLICT (user_id) 
    DO UPDATE SET 
      available_credits = EXCLUDED.available_credits,
      updated_at = now();
    
    RAISE NOTICE 'Migrated % credits for user %', profile_record.credits, profile_record.user_id;
  END LOOP;
  
  RAISE NOTICE 'Credit migration completed';
END;
$$;

-- Execute the migration
SELECT public.migrate_credits_from_profiles();

-- Clean up the migration function
DROP FUNCTION public.migrate_credits_from_profiles();

-- Add a comment to the profiles table indicating credits are deprecated
COMMENT ON COLUMN public.profiles.credits IS 'DEPRECATED: Credits are now managed in the user_credits table. This column will be removed in a future migration.';

