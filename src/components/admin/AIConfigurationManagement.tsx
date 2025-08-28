import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { BrainCircuit, Save, RotateCcw } from 'lucide-react';

interface AIConfiguration {
  id: string;
  scanner_type: string;
  provider: string;
  model: string;
  analysis_prompt: string;
  redact_prompt: string;
  rephrase_prompt: string;
  rpm_limit?: number;
  tpm_limit?: number;
  input_token_limit?: number;
  output_token_limit?: number;
  preferred_batch_size?: number;
}

const PROVIDERS = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'azure', label: 'Azure OpenAI' },
  { value: 'bedrock', label: 'AWS Bedrock' }
];

const MODELS = {
  openai: [
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
    { value: 'gpt-4o', label: 'GPT-4o' }
  ],
  azure: [
    { value: 'gpt-4o', label: 'GPT-4o' },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini' }
  ],
  bedrock: [
    { value: 'amazon.titan-text-lite-v1', label: 'Titan Text G1 - Lite' },
    { value: 'amazon.titan-text-express-v1', label: 'Titan Text G1 - Express' },
    { value: 'anthropic.claude-3-haiku-20240307-v1:0', label: 'Claude 3 Haiku' },
    { value: 'anthropic.claude-3-5-sonnet-20241022-v2:0', label: 'Claude 3.5 Sonnet v2' },
    { value: 'mistral.mistral-large-2402-v1:0', label: 'Mistral Large (24.02)' }
  ]
};

const SCANNER_CONFIGS = [
  { type: 'scan_a', label: 'Scan A', description: 'Primary AI scanner for comment analysis' },
  { type: 'scan_b', label: 'Scan B', description: 'Secondary AI scanner for validation' },
  { type: 'adjudicator', label: 'Adjudicator', description: 'AI system to resolve conflicts between scanners' }
];

export const AIConfigurationManagement = () => {
  const { toast } = useToast();
  const [configs, setConfigs] = useState<Record<string, AIConfiguration>>({});
  const [modelLimits, setModelLimits] = useState<Record<string, { rpm_limit?: number; tpm_limit?: number; input_token_limit?: number; output_token_limit?: number }>>({});
  const [batchSizingConfig, setBatchSizingConfig] = useState<{
    scan_a_io_ratio?: number;
    scan_b_io_ratio?: number;
    adjudicator_io_ratio?: number;
    redaction_io_ratio?: number;
    rephrase_io_ratio?: number;
    safety_margin_percent?: number;
  }>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('scan_a');

  useEffect(() => {
    fetchConfigurations();
  }, []);

  const fetchConfigurations = async () => {
    try {
      // Fetch scanner configurations
      const { data: scannerData, error: scannerError } = await supabase
        .from('ai_configurations')
        .select('*')
        .order('scanner_type');

      if (scannerError) {
        console.error('Error fetching AI configurations:', scannerError);
        toast({
          title: "Error",
          description: "Failed to load AI configurations",
          variant: "destructive",
        });
        return;
      }

      // Fetch model configurations
      const { data: modelData, error: modelError } = await supabase
        .from('model_configurations')
        .select('*');

      if (modelError) {
        console.error('Error fetching model configurations:', modelError);
        toast({
          title: "Error",
          description: "Failed to load model configurations",
          variant: "destructive",
        });
        return;
      }

      // Fetch batch sizing configuration
      const { data: batchSizingData, error: batchSizingError } = await supabase
        .from('batch_sizing_config')
        .select('*')
        .single();

      if (batchSizingError && batchSizingError.code !== 'PGRST116') { // PGRST116 = no rows returned
        console.error('Error fetching batch sizing configuration:', batchSizingError);
        toast({
          title: "Error",
          description: "Failed to load batch sizing configuration",
          variant: "destructive",
        });
        return;
      }

      const configMap: Record<string, AIConfiguration> = {};
      const limitsMap: Record<string, { rpm_limit?: number; tpm_limit?: number; input_token_limit?: number; output_token_limit?: number }> = {};
      
      // Process scanner configurations
      scannerData?.forEach(config => {
        configMap[config.scanner_type] = {
          ...config,
          rpm_limit: config.rpm_limit || undefined,
          tpm_limit: config.tpm_limit || undefined,
          input_token_limit: undefined,
          output_token_limit: undefined,
          preferred_batch_size: config.preferred_batch_size || undefined
        };
      });

      // Process model configurations and populate limitsMap
      modelData?.forEach(modelConfig => {
        const modelKey = `${modelConfig.provider}:${modelConfig.model}`;
        limitsMap[modelKey] = {
          rpm_limit: modelConfig.rpm_limit || undefined,
          tpm_limit: modelConfig.tpm_limit || undefined,
          input_token_limit: modelConfig.input_token_limit || undefined,
          output_token_limit: modelConfig.output_token_limit || undefined
        };
      });
      
      // Ensure all models have entries in limitsMap, even if no saved data
      Object.keys(MODELS).forEach(provider => {
        MODELS[provider as keyof typeof MODELS].forEach(model => {
          const modelKey = `${provider}:${model.value}`;
          if (!limitsMap[modelKey]) {
            limitsMap[modelKey] = {
              rpm_limit: undefined,
              tpm_limit: undefined,
              input_token_limit: undefined,
              output_token_limit: undefined
            };
          }
        });
      });

      // Update scanner configs with model limits
      Object.keys(configMap).forEach(scannerType => {
        const config = configMap[scannerType];
        const modelKey = `${config.provider}:${config.model}`;
        const modelLimits = limitsMap[modelKey];
        if (modelLimits) {
          configMap[scannerType] = {
            ...config,
            rpm_limit: modelLimits.rpm_limit,
            tpm_limit: modelLimits.tpm_limit,
            input_token_limit: modelLimits.input_token_limit,
            output_token_limit: modelLimits.output_token_limit
          };
        }
      });
      
      setConfigs(configMap);
      setModelLimits(limitsMap);
      setBatchSizingConfig(batchSizingData || {});
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (scannerType: string) => {
    const config = configs[scannerType];
    if (!config) return;

    setSaving(true);
    try {
      // Save model limits to the new model_configurations table
      const modelKey = `${config.provider}:${config.model}`;
      const { error: modelError } = await supabase
        .from('model_configurations')
        .upsert({
          provider: config.provider,
          model: config.model,
          rpm_limit: config.rpm_limit,
          tpm_limit: config.tpm_limit,
          input_token_limit: config.input_token_limit,
          output_token_limit: config.output_token_limit,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'provider,model'
        });

      if (modelError) {
        console.error('Error saving model configuration:', modelError);
        toast({
          title: "Error",
          description: "Failed to save model limits",
          variant: "destructive",
        });
        return;
      }

      // Update this scanner's configuration (without limits - they're stored separately now)
      const { error } = await supabase
        .from('ai_configurations')
        .upsert({
          id: config.id,
          scanner_type: config.scanner_type,
          provider: config.provider,
          model: config.model,
          analysis_prompt: config.analysis_prompt,
          redact_prompt: config.redact_prompt,
          rephrase_prompt: config.rephrase_prompt,
          preferred_batch_size: config.preferred_batch_size,
          updated_at: new Date().toISOString(),
        });

      if (error) {
        console.error('Error saving AI configuration:', error);
        toast({
          title: "Error",
          description: `Failed to save ${SCANNER_CONFIGS.find(s => s.type === scannerType)?.label} configuration`,
          variant: "destructive",
        });
        return;
      }

      // Update the model limits lookup
      setModelLimits(prev => ({
        ...prev,
        [modelKey]: {
          rpm_limit: config.rpm_limit,
          tpm_limit: config.tpm_limit,
          input_token_limit: config.input_token_limit,
          output_token_limit: config.output_token_limit
        }
      }));

      // Apply the same limits to other scanners using the same model in the UI
      setConfigs(prev => {
        const updated = { ...prev };
        Object.keys(updated).forEach(key => {
          if (updated[key].provider === config.provider && updated[key].model === config.model) {
            updated[key] = {
              ...updated[key],
              rpm_limit: config.rpm_limit,
              tpm_limit: config.tpm_limit,
              input_token_limit: config.input_token_limit,
              output_token_limit: config.output_token_limit
            };
          }
        });
        return updated;
      });

      toast({
        title: "Success",
        description: `${SCANNER_CONFIGS.find(s => s.type === scannerType)?.label} configuration saved successfully`,
      });
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: "Error",
        description: "Failed to save AI configuration",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveBatchSizing = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('batch_sizing_config')
        .upsert({
          ...batchSizingConfig,
          updated_at: new Date().toISOString(),
        });

      if (error) {
        console.error('Error saving batch sizing configuration:', error);
        toast({
          title: "Error",
          description: "Failed to save batch sizing configuration",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Success",
        description: "Batch sizing configuration saved successfully",
      });
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: "Error",
        description: "Failed to save batch sizing configuration",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = (scannerType: string) => {
    fetchConfigurations();
    toast({
      title: "Reset",
      description: `${SCANNER_CONFIGS.find(s => s.type === scannerType)?.label} configuration reset to saved values`,
    });
  };

  const updateConfig = (scannerType: string, updates: Partial<AIConfiguration>) => {
    setConfigs(prev => {
      const updated = {
        ...prev,
        [scannerType]: {
          ...prev[scannerType],
          ...updates
        }
      };
      
      // If limit values are being updated, also update the modelLimits lookup
      if (updates.rpm_limit !== undefined || updates.tpm_limit !== undefined || updates.input_token_limit !== undefined || updates.output_token_limit !== undefined) {
        const config = updated[scannerType];
        const modelKey = `${config.provider}:${config.model}`;
        setModelLimits(prevLimits => ({
          ...prevLimits,
          [modelKey]: {
            rpm_limit: config.rpm_limit,
            tpm_limit: config.tpm_limit,
            input_token_limit: config.input_token_limit,
            output_token_limit: config.output_token_limit
          }
        }));
      }
      
      return updated;
    });
  };

  const updateBatchSizingConfig = (updates: Partial<typeof batchSizingConfig>) => {
    setBatchSizingConfig(prev => ({
      ...prev,
      ...updates
    }));
  };

  const handleModelChange = (scannerType: string, newModel: string) => {
    const currentConfig = configs[scannerType];
    if (!currentConfig) return;

    const modelKey = `${currentConfig.provider}:${newModel}`;
    const savedLimits = modelLimits[modelKey];

    const updates: Partial<AIConfiguration> = { model: newModel };
    
    // Apply saved limits if they exist for this model, otherwise clear them
    if (savedLimits) {
      updates.rpm_limit = savedLimits.rpm_limit;
      updates.tpm_limit = savedLimits.tpm_limit;
      updates.input_token_limit = savedLimits.input_token_limit;
      updates.output_token_limit = savedLimits.output_token_limit;
    } else {
      updates.rpm_limit = undefined;
      updates.tpm_limit = undefined;
      updates.input_token_limit = undefined;
      updates.output_token_limit = undefined;
    }

    updateConfig(scannerType, updates);
  };

  const renderConfigurationTab = (scannerConfig: typeof SCANNER_CONFIGS[0]) => {
    const config = configs[scannerConfig.type];
    
    if (!config) {
      return (
        <div className="space-y-4">
          <p className="text-muted-foreground">No configuration found for {scannerConfig.label}</p>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <p className="text-sm text-muted-foreground">{scannerConfig.description}</p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor={`provider-${scannerConfig.type}`}>AI Provider</Label>
            <Select
              value={config.provider}
              onValueChange={(value) => {
                const newModel = MODELS[value as keyof typeof MODELS]?.[0]?.value || '';
                updateConfig(scannerConfig.type, { provider: value, model: newModel });
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select provider" />
              </SelectTrigger>
              <SelectContent>
                {PROVIDERS.map((provider) => (
                  <SelectItem key={provider.value} value={provider.value}>
                    {provider.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor={`model-${scannerConfig.type}`}>Model</Label>
            <Select
              value={config.model}
              onValueChange={(value) => handleModelChange(scannerConfig.type, value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select model" />
              </SelectTrigger>
              <SelectContent>
                {MODELS[config.provider as keyof typeof MODELS]?.map((model) => (
                  <SelectItem key={model.value} value={model.value}>
                    {model.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor={`rpm-${scannerConfig.type}`}>RPM Limit</Label>
            <Input
              id={`rpm-${scannerConfig.type}`}
              type="number"
              value={config.rpm_limit || ''}
              onChange={(e) => updateConfig(scannerConfig.type, { rpm_limit: e.target.value ? parseInt(e.target.value) : undefined })}
              placeholder="Requests per minute"
              min="0"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor={`tpm-${scannerConfig.type}`}>TPM Limit</Label>
            <Input
              id={`tpm-${scannerConfig.type}`}
              type="number"
              value={config.tpm_limit || ''}
              onChange={(e) => updateConfig(scannerConfig.type, { tpm_limit: e.target.value ? parseInt(e.target.value) : undefined })}
              placeholder="Tokens per minute"
              min="0"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor={`input-token-${scannerConfig.type}`}>Input Token Limit</Label>
            <Input
              id={`input-token-${scannerConfig.type}`}
              type="number"
              value={config.input_token_limit || ''}
              onChange={(e) => updateConfig(scannerConfig.type, { input_token_limit: e.target.value ? parseInt(e.target.value) : undefined })}
              placeholder="Maximum input tokens"
              min="0"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor={`output-token-${scannerConfig.type}`}>Output Token Limit</Label>
            <Input
              id={`output-token-${scannerConfig.type}`}
              type="number"
              value={config.output_token_limit || ''}
              onChange={(e) => updateConfig(scannerConfig.type, { output_token_limit: e.target.value ? parseInt(e.target.value) : undefined })}
              placeholder="Maximum output tokens"
              min="0"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`batch-size-${scannerConfig.type}`}>Preferred Batch Size</Label>
          <Input
            id={`batch-size-${scannerConfig.type}`}
            type="number"
            value={config.preferred_batch_size || ''}
            onChange={(e) => updateConfig(scannerConfig.type, { preferred_batch_size: e.target.value ? parseInt(e.target.value) : undefined })}
            placeholder="Number of comments to process in batch"
            min="1"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`analysis_prompt-${scannerConfig.type}`}>Analysis Prompt</Label>
          <Textarea
            id={`analysis_prompt-${scannerConfig.type}`}
            value={config.analysis_prompt}
            onChange={(e) => updateConfig(scannerConfig.type, { analysis_prompt: e.target.value })}
            rows={8}
            placeholder="Enter the prompt used for analyzing comments..."
            className="font-mono text-sm"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`redact_prompt-${scannerConfig.type}`}>Redaction Prompt</Label>
          <Textarea
            id={`redact_prompt-${scannerConfig.type}`}
            value={config.redact_prompt}
            onChange={(e) => updateConfig(scannerConfig.type, { redact_prompt: e.target.value })}
            rows={4}
            placeholder="Enter the prompt used for redacting comments..."
            className="font-mono text-sm"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`rephrase_prompt-${scannerConfig.type}`}>Rephrase Prompt</Label>
          <Textarea
            id={`rephrase_prompt-${scannerConfig.type}`}
            value={config.rephrase_prompt}
            onChange={(e) => updateConfig(scannerConfig.type, { rephrase_prompt: e.target.value })}
            rows={4}
            placeholder="Enter the prompt used for rephrasing comments..."
            className="font-mono text-sm"
          />
        </div>

        <div className="flex gap-3 pt-4">
          <Button onClick={() => handleSave(scannerConfig.type)} disabled={saving}>
            <Save className="w-4 h-4 mr-2" />
            {saving ? 'Saving...' : `Save ${scannerConfig.label}`}
          </Button>
          <Button variant="outline" onClick={() => handleReset(scannerConfig.type)}>
            <RotateCcw className="w-4 h-4 mr-2" />
            Reset
          </Button>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BrainCircuit className="w-5 h-5" />
            AI Configuration
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BrainCircuit className="w-5 h-5" />
          AI Configuration
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Batch Sizing Configuration - Application-wide settings */}
        <div className="space-y-6 mb-6 p-4 bg-muted/50 rounded-lg">
          <div>
            <h4 className="font-medium mb-2">Batch Sizing Configuration</h4>
            <p className="text-sm text-muted-foreground mb-4">
              These settings control how the system calculates optimal batch sizes for AI processing.
              I/O ratios estimate the relationship between input and output tokens for each phase.
              Safety margin provides a buffer to prevent hitting token limits.
            </p>
            
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="scan-a-io-ratio">Scan A I/O Ratio</Label>
                <Input
                  id="scan-a-io-ratio"
                  type="number"
                  step="0.01"
                  value={batchSizingConfig.scan_a_io_ratio || ''}
                  onChange={(e) => updateBatchSizingConfig({ scan_a_io_ratio: e.target.value ? parseFloat(e.target.value) : undefined })}
                  placeholder="1.00"
                  min="0.1"
                  max="10.0"
                />
                <p className="text-xs text-muted-foreground">Expected ratio for Scan A phase</p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="scan-b-io-ratio">Scan B I/O Ratio</Label>
                <Input
                  id="scan-b-io-ratio"
                  type="number"
                  step="0.01"
                  value={batchSizingConfig.scan_b_io_ratio || ''}
                  onChange={(e) => updateBatchSizingConfig({ scan_b_io_ratio: e.target.value ? parseFloat(e.target.value) : undefined })}
                  placeholder="0.90"
                  min="0.1"
                  max="10.0"
                />
                <p className="text-xs text-muted-foreground">Expected ratio for Scan B phase</p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="adjudicator-io-ratio">Adjudicator I/O Ratio</Label>
                <Input
                  id="adjudicator-io-ratio"
                  type="number"
                  step="0.01"
                  value={batchSizingConfig.adjudicator_io_ratio || ''}
                  onChange={(e) => updateBatchSizingConfig({ adjudicator_io_ratio: e.target.value ? parseFloat(e.target.value) : undefined })}
                  placeholder="6.20"
                  min="0.1"
                  max="10.0"
                />
                <p className="text-xs text-muted-foreground">Expected ratio for Adjudicator phase</p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="redaction-io-ratio">Redaction I/O Ratio</Label>
                <Input
                  id="redaction-io-ratio"
                  type="number"
                  step="0.01"
                  value={batchSizingConfig.redaction_io_ratio || ''}
                  onChange={(e) => updateBatchSizingConfig({ redaction_io_ratio: e.target.value ? parseFloat(e.target.value) : undefined })}
                  placeholder="1.70"
                  min="0.1"
                  max="10.0"
                />
                <p className="text-xs text-muted-foreground">Expected ratio for Redaction phase</p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="rephrase-io-ratio">Rephrase I/O Ratio</Label>
                <Input
                  id="rephrase-io-ratio"
                  type="number"
                  step="0.01"
                  value={batchSizingConfig.rephrase_io_ratio || ''}
                  onChange={(e) => updateBatchSizingConfig({ rephrase_io_ratio: e.target.value ? parseFloat(e.target.value) : undefined })}
                  placeholder="2.30"
                  min="0.1"
                  max="10.0"
                />
                <p className="text-xs text-muted-foreground">Expected ratio for Rephrase phase</p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="safety-margin-percent">Safety Margin (%)</Label>
                <Input
                  id="safety-margin-percent"
                  type="number"
                  step="1"
                  value={batchSizingConfig.safety_margin_percent || ''}
                  onChange={(e) => updateBatchSizingConfig({ safety_margin_percent: e.target.value ? parseInt(e.target.value) : undefined })}
                  placeholder="15"
                  min="5"
                  max="50"
                />
                <p className="text-xs text-muted-foreground">Buffer percentage to prevent token limit overruns</p>
              </div>
            </div>
            
            <div className="flex gap-3 pt-4">
              <Button onClick={handleSaveBatchSizing} disabled={saving} size="sm">
                <Save className="w-4 h-4 mr-2" />
                {saving ? 'Saving...' : 'Save Batch Sizing'}
              </Button>
              <Button variant="outline" onClick={() => fetchConfigurations()} size="sm">
                <RotateCcw className="w-4 h-4 mr-2" />
                Reset
              </Button>
            </div>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            {SCANNER_CONFIGS.map((scannerConfig) => (
              <TabsTrigger key={scannerConfig.type} value={scannerConfig.type}>
                {scannerConfig.label}
              </TabsTrigger>
            ))}
          </TabsList>
          
          {SCANNER_CONFIGS.map((scannerConfig) => (
            <TabsContent key={scannerConfig.type} value={scannerConfig.type} className="mt-6">
              {renderConfigurationTab(scannerConfig)}
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
};