-- Create credit pricing tiers table
CREATE TABLE public.credit_pricing_tiers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tier_name TEXT NOT NULL,
  min_credits INTEGER NOT NULL,
  max_credits INTEGER, -- NULL means unlimited
  base_cost_cents INTEGER NOT NULL DEFAULT 0, -- Fixed cost for this tier
  price_per_credit_cents INTEGER NOT NULL, -- Price per credit in this tier
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.credit_pricing_tiers ENABLE ROW LEVEL SECURITY;

-- Create policy to allow anyone to view pricing tiers
CREATE POLICY "Anyone can view pricing tiers" 
ON public.credit_pricing_tiers 
FOR SELECT 
USING (true);

-- Insert the pricing tiers based on the user's requirements
INSERT INTO public.credit_pricing_tiers (tier_name, min_credits, max_credits, base_cost_cents, price_per_credit_cents) VALUES
('Tier 1', 1, 1000, 0, 100), -- $1.00 per credit
('Tier 2', 1001, 10000, 100000, 50), -- $1000 base + $0.50 per credit above 1000
('Tier 3', 10001, NULL, 550000, 25); -- $5500 base + $0.25 per credit above 10000