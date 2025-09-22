-- Add RLS policies for app_configurations to allow admin management
CREATE POLICY "Only admins can insert app configurations" 
ON public.app_configurations 
FOR INSERT 
WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Only admins can update app configurations" 
ON public.app_configurations 
FOR UPDATE 
USING (is_admin(auth.uid()))
WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Only admins can delete app configurations" 
ON public.app_configurations 
FOR DELETE 
USING (is_admin(auth.uid()));