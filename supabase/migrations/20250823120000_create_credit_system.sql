-- Create credit system tables
-- Migration: 20250823120000_create_credit_system

-- Table to store user credits
CREATE TABLE public.user_credits (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) NOT NULL UNIQUE,
  available_credits integer NOT NULL DEFAULT 100, -- Default 100 credits for new users
  total_credits_used integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table to track credit usage from scans
CREATE TABLE public.credit_usage (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  scan_run_id text NOT NULL, -- References the scan run from scan-comments function
  credits_used integer NOT NULL,
  comments_scanned integer NOT NULL,
  scan_type text NOT NULL DEFAULT 'comment_scan', -- comment_scan, adjudication, etc.
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table to store credit packages/purchases
CREATE TABLE public.credit_packages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  credits integer NOT NULL,
  price_usd decimal(10,2) NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Insert default credit packages
INSERT INTO public.credit_packages (name, credits, price_usd, description) VALUES
  ('Starter', 100, 0.00, 'Free starter package'),
  ('Basic', 500, 9.99, 'Basic package for regular users'),
  ('Professional', 2000, 29.99, 'Professional package for power users'),
  ('Enterprise', 10000, 99.99, 'Enterprise package for large organizations');

-- Enable RLS
ALTER TABLE public.user_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_packages ENABLE ROW LEVEL SECURITY;

-- Create policies for user_credits
CREATE POLICY "Users can view their own credits" 
ON public.user_credits 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own credits" 
ON public.user_credits 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all credits" 
ON public.user_credits 
FOR ALL 
USING (is_admin(auth.uid()));

-- Create policies for credit_usage
CREATE POLICY "Users can view their own usage" 
ON public.credit_usage 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "System can insert usage records" 
ON public.credit_usage 
FOR INSERT 
WITH CHECK (true); -- Allow system functions to insert

CREATE POLICY "Admins can view all usage" 
ON public.credit_usage 
FOR SELECT 
USING (is_admin(auth.uid()));

-- Create policies for credit_packages
CREATE POLICY "Anyone can view credit packages" 
ON public.credit_packages 
FOR SELECT 
USING (true);

CREATE POLICY "Only admins can manage credit packages" 
ON public.credit_packages 
FOR ALL 
USING (is_admin(auth.uid()));

-- Create indexes for performance
CREATE INDEX idx_user_credits_user_id ON public.user_credits(user_id);
CREATE INDEX idx_credit_usage_user_id ON public.credit_usage(user_id);
CREATE INDEX idx_credit_usage_scan_run_id ON public.credit_usage(scan_run_id);
CREATE INDEX idx_credit_usage_created_at ON public.credit_usage(created_at);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_user_credits_updated_at
BEFORE UPDATE ON public.user_credits
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Function to get or create user credits
CREATE OR REPLACE FUNCTION public.get_or_create_user_credits(user_uuid uuid)
RETURNS public.user_credits
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.user_credits (user_id, available_credits)
  VALUES (user_uuid, 100)
  ON CONFLICT (user_id) DO NOTHING;
  
  RETURN (SELECT * FROM public.user_credits WHERE user_id = user_uuid);
END;
$$;

-- Function to deduct credits from a user
CREATE OR REPLACE FUNCTION public.deduct_user_credits(
  user_uuid uuid,
  credits_to_deduct integer,
  scan_run_id text,
  comments_scanned integer,
  scan_type text DEFAULT 'comment_scan'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
$$;

-- Function to add credits to a user
CREATE OR REPLACE FUNCTION public.add_user_credits(
  user_uuid uuid,
  credits_to_add integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.user_credits (user_id, available_credits)
  VALUES (user_uuid, credits_to_add)
  ON CONFLICT (user_id) 
  DO UPDATE SET 
    available_credits = user_credits.available_credits + credits_to_add;
  
  RETURN true;
END;
$$;
