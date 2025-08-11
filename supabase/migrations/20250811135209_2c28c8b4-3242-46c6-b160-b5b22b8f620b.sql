-- Drop existing ai_configurations table if it exists
DROP TABLE IF EXISTS public.ai_configurations;

-- Create new ai_configurations table with support for multiple scanner types
CREATE TABLE public.ai_configurations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scanner_type TEXT NOT NULL CHECK (scanner_type IN ('scan_a', 'scan_b', 'adjudicator')),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  analysis_prompt TEXT NOT NULL,
  redact_prompt TEXT NOT NULL,
  rephrase_prompt TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(scanner_type)
);

-- Enable Row Level Security
ALTER TABLE public.ai_configurations ENABLE ROW LEVEL SECURITY;

-- Create policies for admin access only
CREATE POLICY "Only admins can view AI configurations" 
ON public.ai_configurations 
FOR SELECT 
USING (public.is_admin(auth.uid()));

CREATE POLICY "Only admins can insert AI configurations" 
ON public.ai_configurations 
FOR INSERT 
WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Only admins can update AI configurations" 
ON public.ai_configurations 
FOR UPDATE 
USING (public.is_admin(auth.uid()));

CREATE POLICY "Only admins can delete AI configurations" 
ON public.ai_configurations 
FOR DELETE 
USING (public.is_admin(auth.uid()));

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_ai_configurations_updated_at
BEFORE UPDATE ON public.ai_configurations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default configurations
INSERT INTO public.ai_configurations (scanner_type, provider, model, analysis_prompt, redact_prompt, rephrase_prompt) VALUES 
(
  'scan_a',
  'openai',
  'gpt-4o-mini',
  'Analyze the following comment for concerning content (harassment, threats, illegal activity, safety violations) and personally identifiable information (names, employee IDs, contact info, specific locations). Return your analysis in JSON format: {"concerning": boolean, "identifiable": boolean, "reasoning": "explanation"}',
  'Remove all personally identifiable information from this comment while preserving the core message and tone. Replace names with generic terms like "a colleague" or "the manager". Remove specific IDs, contact information, and identifying details.',
  'Rephrase this comment to remove personally identifiable information while maintaining the original meaning, tone, and level of concern. Use generic terms instead of specific names or identifying details.'
),
(
  'scan_b', 
  'openai',
  'gpt-4o-mini',
  'Review this comment to identify: 1) Concerning content (harassment, threats, illegal activities, safety violations) 2) Personally identifiable information (names, IDs, contact details, specific locations). Respond in JSON: {"concerning": boolean, "identifiable": boolean, "reasoning": "detailed explanation"}',
  'Redact all personally identifiable information from this comment. Replace names with [NAME], IDs with [ID], contact info with [CONTACT], while keeping the essential message intact.',
  'Rewrite this comment to eliminate personally identifiable information while preserving the original sentiment and urgency. Use placeholder terms for any identifying information.'
),
(
  'adjudicator',
  'openai', 
  'gpt-4o',
  'Two AI systems have analyzed this comment and reached different conclusions about whether it contains concerning content or personally identifiable information. Review the comment and the conflicting analyses, then provide a final determination in JSON format: {"concerning": boolean, "identifiable": boolean, "reasoning": "explanation of final decision", "scan_a_analysis": "summary", "scan_b_analysis": "summary"}',
  'Based on the adjudication analysis, remove all personally identifiable information from this comment while preserving the essential message and appropriate level of concern.',
  'Based on the adjudication analysis, rephrase this comment to remove personally identifiable information while maintaining the original meaning and appropriate tone.'
);