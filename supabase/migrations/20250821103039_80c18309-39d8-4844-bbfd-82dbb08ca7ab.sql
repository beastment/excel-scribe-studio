-- Create a table to store custom content edits
CREATE TABLE public.content_edits (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  content_key text NOT NULL UNIQUE,
  original_content text NOT NULL,
  edited_content text NOT NULL,
  edited_by uuid REFERENCES auth.users(id) NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.content_edits ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Anyone can view content edits" 
ON public.content_edits 
FOR SELECT 
USING (true);

CREATE POLICY "Only admins can manage content edits" 
ON public.content_edits 
FOR ALL 
USING (is_admin(auth.uid()))
WITH CHECK (is_admin(auth.uid()));

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_content_edits_updated_at
BEFORE UPDATE ON public.content_edits
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();