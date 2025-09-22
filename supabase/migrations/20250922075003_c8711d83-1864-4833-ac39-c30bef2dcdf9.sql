-- Ensure RLS is enabled (harmless if already enabled)
ALTER TABLE public.app_configurations ENABLE ROW LEVEL SECURITY;

-- Add an always-true SELECT policy to guarantee visibility for clients
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'app_configurations' 
      AND policyname = 'View app configurations (anyone)'
  ) THEN
    CREATE POLICY "View app configurations (anyone)"
    ON public.app_configurations
    FOR SELECT
    USING (true);
  END IF;
END $$;
