-- Create an edge function to get user last login information
-- This will need to be implemented as an edge function since we can't query auth.users from the client

-- For now, let's add a last_login field to the profiles table that we can update via triggers or edge functions
ALTER TABLE public.profiles 
ADD COLUMN last_login_at timestamp with time zone;