-- Seed default app configurations if they don't exist (idempotent)
-- Each insert only runs when the specific app_id is not present yet

-- 1) Comment De-Identification
INSERT INTO public.app_configurations (
  app_id, name, description, position, is_enabled, is_hidden, is_blurred, status
)
SELECT 
  'comment-de-identification',
  'Comment De-Identification',
  'Remove personally identifiable information from employee comments safely and efficiently.',
  1,
  true,
  false,
  false,
  'Live'
WHERE NOT EXISTS (
  SELECT 1 FROM public.app_configurations WHERE app_id = 'comment-de-identification'
);

-- 2) Thematic Analysis
INSERT INTO public.app_configurations (
  app_id, name, description, position, is_enabled, is_hidden, is_blurred, status
)
SELECT 
  'thematic-analysis',
  'Thematic Analysis',
  'Automatically cluster comments into themes and quantify key drivers.',
  2,
  true,
  false,
  false,
  'Live'
WHERE NOT EXISTS (
  SELECT 1 FROM public.app_configurations WHERE app_id = 'thematic-analysis'
);

-- 3) Action Planning Extension
INSERT INTO public.app_configurations (
  app_id, name, description, position, is_enabled, is_hidden, is_blurred, status
)
SELECT 
  'action-planning-extension',
  'Action Planning Extension',
  'Turn insights into action with guided planning workflows.',
  3,
  true,
  false,
  false,
  'Currently in Beta'
WHERE NOT EXISTS (
  SELECT 1 FROM public.app_configurations WHERE app_id = 'action-planning-extension'
);

-- 4) Report Writer
INSERT INTO public.app_configurations (
  app_id, name, description, position, is_enabled, is_hidden, is_blurred, status
)
SELECT 
  'report-writer',
  'Report Writer',
  'Generate executive-ready summaries and presentations from survey results.',
  4,
  true,
  false,
  false,
  'In Development'
WHERE NOT EXISTS (
  SELECT 1 FROM public.app_configurations WHERE app_id = 'report-writer'
);
