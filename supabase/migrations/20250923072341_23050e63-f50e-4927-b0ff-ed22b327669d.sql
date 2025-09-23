-- Remove the consulting-services app from app_configurations
DELETE FROM public.app_configurations WHERE app_id = 'consulting-services';

-- Enable the consulting services section
UPDATE public.consulting_services_settings 
SET is_enabled = true, updated_at = now()
WHERE id = 'e513df3a-5ed4-42a7-a347-c0280c5bdb11';