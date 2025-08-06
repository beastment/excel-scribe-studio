-- Create maintenance mode table
CREATE TABLE public.maintenance_mode (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  is_enabled boolean NOT NULL DEFAULT false,
  message text DEFAULT 'SurveyJumper is currently under maintenance. Please check back again soon.',
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

-- Enable RLS on maintenance_mode table
ALTER TABLE public.maintenance_mode ENABLE ROW LEVEL SECURITY;

-- Create policies for maintenance_mode
CREATE POLICY "Anyone can view maintenance mode status" 
ON public.maintenance_mode 
FOR SELECT 
USING (true);

CREATE POLICY "Only admins can update maintenance mode" 
ON public.maintenance_mode 
FOR ALL 
USING (EXISTS (
  SELECT 1 FROM public.profiles 
  WHERE user_id = auth.uid() AND role = 'admin'::app_role
));

-- Insert initial maintenance mode record
INSERT INTO public.maintenance_mode (is_enabled) VALUES (false);

-- Create trigger for maintenance_mode updated_at
CREATE TRIGGER update_maintenance_mode_updated_at
  BEFORE UPDATE ON public.maintenance_mode
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to get maintenance status
CREATE OR REPLACE FUNCTION public.get_maintenance_status()
RETURNS TABLE(is_enabled boolean, message text)
LANGUAGE sql
STABLE
AS $$
  SELECT is_enabled, message 
  FROM public.maintenance_mode 
  ORDER BY updated_at DESC 
  LIMIT 1;
$$;