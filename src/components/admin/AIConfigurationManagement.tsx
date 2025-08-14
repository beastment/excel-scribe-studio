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
  const [modelLimits, setModelLimits] = useState<Record<string, { rpm_limit?: number; tpm_limit?: number }>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('scan_a');

  useEffect(() => {
    fetchConfigurations();
  }, []);

  const fetchConfigurations = async () => {
    try {
      const { data, error } = await supabase
        .from('ai_configurations')
        .select('*')
        .order('scanner_type');

      if (error) {
        console.error('Error fetching AI configurations:', error);
        toast({
          title: "Error",
          description: "Failed to load AI configurations",
          variant: "destructive",
        });
        return;
      }

      const configMap: Record<string, AIConfiguration> = {};
      const limitsMap: Record<string, { rpm_limit?: number; tpm_limit?: number }> = {};
      
      data?.forEach(config => {
        configMap[config.scanner_type] = {
          ...config,
          rpm_limit: config.rpm_limit || undefined,
          tpm_limit: config.tpm_limit || undefined
        };
        
        // Store limits per model-provider combination for reuse
        const modelKey = `${config.provider}:${config.model}`;
        if (config.rpm_limit !== null || config.tpm_limit !== null) {
          limitsMap[modelKey] = {
            rpm_limit: config.rpm_limit || undefined,
            tpm_limit: config.tpm_limit || undefined
          };
        }
      });
      
      setConfigs(configMap);
      setModelLimits(limitsMap);
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
      // Update this scanner's configuration
      const { error } = await supabase
        .from('ai_configurations')
        .upsert({
          ...config,
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

      // Update the model limits lookup and apply to other scanners using the same model
      const modelKey = `${config.provider}:${config.model}`;
      const newLimits = {
        rpm_limit: config.rpm_limit,
        tpm_limit: config.tpm_limit
      };
      
      setModelLimits(prev => ({
        ...prev,
        [modelKey]: newLimits
      }));

      // Apply the same limits to other scanners using the same model
      setConfigs(prev => {
        const updated = { ...prev };
        Object.keys(updated).forEach(key => {
          if (key !== scannerType && updated[key].provider === config.provider && updated[key].model === config.model) {
            updated[key] = {
              ...updated[key],
              rpm_limit: config.rpm_limit,
              tpm_limit: config.tpm_limit
            };
          }
        });
        return updated;
      });

      // Save updates to all other scanners using the same model
      const otherConfigs = Object.values(configs).filter(c => 
        c.scanner_type !== scannerType && 
        c.provider === config.provider && 
        c.model === config.model
      );

      if (otherConfigs.length > 0) {
        const updatePromises = otherConfigs.map(otherConfig => 
          supabase
            .from('ai_configurations')
            .upsert({
              ...otherConfig,
              rpm_limit: config.rpm_limit,
              tpm_limit: config.tpm_limit,
              updated_at: new Date().toISOString(),
            })
        );

        await Promise.all(updatePromises);
      }

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

  const handleReset = (scannerType: string) => {
    fetchConfigurations();
    toast({
      title: "Reset",
      description: `${SCANNER_CONFIGS.find(s => s.type === scannerType)?.label} configuration reset to saved values`,
    });
  };

  const updateConfig = (scannerType: string, updates: Partial<AIConfiguration>) => {
    setConfigs(prev => ({
      ...prev,
      [scannerType]: {
        ...prev[scannerType],
        ...updates
      }
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
    } else {
      updates.rpm_limit = undefined;
      updates.tpm_limit = undefined;
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