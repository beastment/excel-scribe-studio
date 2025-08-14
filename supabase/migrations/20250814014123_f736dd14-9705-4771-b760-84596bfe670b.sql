-- Create a new table to store model-specific settings for all models
CREATE TABLE public.model_configurations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  rpm_limit INTEGER,
  tpm_limit INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(provider, model)
);

-- Enable RLS
ALTER TABLE public.model_configurations ENABLE ROW LEVEL SECURITY;

-- Create policies for admin-only access
CREATE POLICY "Only admins can view model configurations" 
ON public.model_configurations 
FOR SELECT 
USING (is_admin(auth.uid()));

CREATE POLICY "Only admins can insert model configurations" 
ON public.model_configurations 
FOR INSERT 
WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Only admins can update model configurations" 
ON public.model_configurations 
FOR UPDATE 
USING (is_admin(auth.uid()));

CREATE POLICY "Only admins can delete model configurations" 
ON public.model_configurations 
FOR DELETE 
USING (is_admin(auth.uid()));

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_model_configurations_updated_at
BEFORE UPDATE ON public.model_configurations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();