-- Enable Row Level Security on batch_sizing_config table
ALTER TABLE public.batch_sizing_config ENABLE ROW LEVEL SECURITY;

-- Create policies for batch_sizing_config
-- This table contains system configuration, so only admins should access it
CREATE POLICY "Only admins can view batch sizing config" 
ON public.batch_sizing_config 
FOR SELECT 
USING (is_admin(auth.uid()));

CREATE POLICY "Only admins can insert batch sizing config" 
ON public.batch_sizing_config 
FOR INSERT 
WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Only admins can update batch sizing config" 
ON public.batch_sizing_config 
FOR UPDATE 
USING (is_admin(auth.uid()));

CREATE POLICY "Only admins can delete batch sizing config" 
ON public.batch_sizing_config 
FOR DELETE 
USING (is_admin(auth.uid()));