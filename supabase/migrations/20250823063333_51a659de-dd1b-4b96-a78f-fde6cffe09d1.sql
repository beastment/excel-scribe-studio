-- Add credits column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN credits INTEGER NOT NULL DEFAULT 20;

-- Update existing users to have 20 credits
UPDATE public.profiles 
SET credits = 20 
WHERE credits IS NULL;

-- Create function to safely deduct credits
CREATE OR REPLACE FUNCTION public.deduct_credits(user_uuid uuid, amount integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

-- Create function to add credits (for admin use)
CREATE OR REPLACE FUNCTION public.add_credits(user_uuid uuid, amount integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Add credits
  UPDATE public.profiles
  SET credits = credits + amount,
      updated_at = now()
  WHERE user_id = user_uuid;
  
  RETURN FOUND;
END;
$$;

-- Create RLS policy for credits functions (admins only)
CREATE POLICY "Admins can manage credits" ON public.profiles
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));