-- Create table for app configurations
CREATE TABLE public.app_configurations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  app_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.app_configurations ENABLE ROW LEVEL SECURITY;

-- Create policies for app configurations
CREATE POLICY "Anyone can view app configurations" 
ON public.app_configurations 
FOR SELECT 
USING (true);

CREATE POLICY "Only admins can manage app configurations" 
ON public.app_configurations 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_app_configurations_updated_at
BEFORE UPDATE ON public.app_configurations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert initial app configurations
INSERT INTO public.app_configurations (app_id, name, description, is_enabled) VALUES
('comment-de-identification', 'Comment De-Identification', 'Securely anonymize employee comments', true),
('thematic-analysis', 'Thematic Analysis', 'AI-powered topic modeling and sentiment analysis', true),
('action-planning-extension', 'Action Planning Extension', 'Turn feedback into actionable plans', true),
('report-writer', 'Report Writer', 'Generate executive summaries automatically', true);