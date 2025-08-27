-- Create consulting services table for managing human intelligence services
CREATE TABLE public.consulting_services (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  service_id text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  is_enabled boolean NOT NULL DEFAULT true,
  is_hidden boolean NOT NULL DEFAULT false,
  is_blurred boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'Available',
  position integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.consulting_services ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Anyone can view consulting services" 
ON public.consulting_services 
FOR SELECT 
USING (true);

CREATE POLICY "Only admins can manage consulting services" 
ON public.consulting_services 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Add trigger for automatic timestamp updates
CREATE TRIGGER update_consulting_services_updated_at
BEFORE UPDATE ON public.consulting_services
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert the six consulting services
INSERT INTO public.consulting_services (service_id, name, description, position) VALUES
('survey-results-presentation', 'Presentation of Survey Results', 'Professional presentation and interpretation of your survey findings with expert insights and recommendations.', 1),
('written-recommendations', 'Written Recommendations for Action', 'Comprehensive written reports with actionable recommendations based on your survey data and organizational context.', 2),
('bespoke-survey-design', 'Bespoke Survey Structure & Question Design', 'Custom survey design tailored to your specific organizational needs and research objectives.', 3),
('project-management', 'End to End Survey Project Management', 'Complete survey project management from initial planning through final reporting and implementation.', 4),
('360-debrief-sessions', '360-Degree Debrief Sessions for CEOs, Executives, and Senior Managers', 'Confidential one-on-one debrief sessions with senior leadership to discuss survey results and development opportunities.', 5),
('action-planning-workshops', 'Action Planning Workshops', 'Facilitated workshops to help your team develop concrete action plans based on survey insights.', 6);

-- Create a settings table for the consulting services section
CREATE TABLE public.consulting_services_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  is_enabled boolean NOT NULL DEFAULT true,
  section_title text NOT NULL DEFAULT 'When AI is not enough, and you need HI: Human Intelligence',
  section_subtitle text NOT NULL DEFAULT 'Our professional consultants are registered workplace psychologists, specialising in working with you to obtain maximum value from your survey results.',
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid
);

-- Enable RLS for settings
ALTER TABLE public.consulting_services_settings ENABLE ROW LEVEL SECURITY;

-- Create policies for settings
CREATE POLICY "Anyone can view consulting services settings" 
ON public.consulting_services_settings 
FOR SELECT 
USING (true);

CREATE POLICY "Only admins can manage consulting services settings" 
ON public.consulting_services_settings 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Add trigger for settings timestamp updates
CREATE TRIGGER update_consulting_services_settings_updated_at
BEFORE UPDATE ON public.consulting_services_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default settings
INSERT INTO public.consulting_services_settings (is_enabled) VALUES (true);