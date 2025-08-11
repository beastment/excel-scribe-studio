-- Create table for AI configuration settings
CREATE TABLE public.ai_configurations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'openai',
  model TEXT NOT NULL DEFAULT 'gpt-4o-mini',
  analysis_prompt TEXT NOT NULL DEFAULT 'Analyze this employee feedback comment and determine:

1. Is it CONCERNING? (threats, violence, self-harm mentions, serious accusations of criminal behavior, extreme harassment)
2. Is it IDENTIFIABLE? (contains personal details that could identify someone like names, specific roles, personal details like age/tenure, specific events)

IMPORTANT EXCEPTION: If the identification is POSITIVE (praise, recognition, appreciation), do NOT mark as identifiable.

Comment: "{comment}"

Respond with JSON only:
{
  "concerning": boolean,
  "identifiable": boolean,
  "reasoning": "brief explanation"
}',
  redact_prompt TEXT NOT NULL DEFAULT 'Take this comment and replace any sensitive, identifying, or concerning information with "XXXX" while keeping the overall structure and meaning clear:

Comment: "{comment}"

Return only the redacted text, no explanation.',
  rephrase_prompt TEXT NOT NULL DEFAULT 'Rephrase this comment to preserve the original intent and sentiment while removing any identifying or concerning information:

Comment: "{comment}"

Return only the rephrased text, no explanation.',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.ai_configurations ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Anyone can view AI configurations" 
ON public.ai_configurations 
FOR SELECT 
USING (true);

CREATE POLICY "Only admins can manage AI configurations" 
ON public.ai_configurations 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_ai_configurations_updated_at
BEFORE UPDATE ON public.ai_configurations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default configuration
INSERT INTO public.ai_configurations (provider, model) VALUES ('openai', 'gpt-4o-mini');