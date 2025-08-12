-- Add RPM and TPM limit columns to ai_configurations table
ALTER TABLE ai_configurations 
ADD COLUMN rpm_limit INTEGER DEFAULT NULL,
ADD COLUMN tpm_limit INTEGER DEFAULT NULL;