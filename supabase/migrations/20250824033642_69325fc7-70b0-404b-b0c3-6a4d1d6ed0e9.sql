-- Fix security vulnerability: Restrict content_edits table access to admins only
-- Drop the public SELECT policy that exposes user IDs and admin activity
DROP POLICY "Anyone can view content edits" ON public.content_edits;

-- Create a new policy that only allows admins to view content edits
CREATE POLICY "Only admins can view content edits" 
ON public.content_edits 
FOR SELECT 
USING (is_admin(auth.uid()));