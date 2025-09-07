-- Add RLS policies for admins to manage user credits
CREATE POLICY "Admins can update user credits" 
ON public.user_credits 
FOR UPDATE 
TO authenticated
USING (is_admin(auth.uid()))
WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Admins can insert user credits" 
ON public.user_credits 
FOR INSERT 
TO authenticated
WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Admins can delete user credits" 
ON public.user_credits 
FOR DELETE 
TO authenticated
USING (is_admin(auth.uid()));