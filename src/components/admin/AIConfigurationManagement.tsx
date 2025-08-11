import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { BrainCircuit, Save, RotateCcw } from 'lucide-react';

interface AIConfiguration {
  id: string;
  provider: string;
  model: string;
  analysis_prompt: string;
  redact_prompt: string;
  rephrase_prompt: string;
}

const PROVIDERS = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'bedrock', label: 'AWS Bedrock' }
];

const MODELS = {
  openai: [
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
    { value: 'gpt-4o', label: 'GPT-4o' }
  ],
  bedrock: [
    { value: 'anthropic.claude-3-5-sonnet-20241022-v2:0', label: 'Claude 3.5 Sonnet v2' },
    { value: 'anthropic.claude-3-haiku-20240307-v1:0', label: 'Claude 3 Haiku' },
    { value: 'amazon.titan-text-lite-v1', label: 'Amazon Titan Text G1 - Lite' }
  ]
};

export const AIConfigurationManagement = () => {
  const { toast } = useToast();
  const [config, setConfig] = useState<AIConfiguration | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchConfiguration();
  }, []);

  const fetchConfiguration = async () => {
    try {
      const { data, error } = await supabase
        .from('ai_configurations')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching AI configuration:', error);
        toast({
          title: "Error",
          description: "Failed to load AI configuration",
          variant: "destructive",
        });
        return;
      }

      setConfig(data);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!config) return;

    setSaving(true);
    try {
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
          description: "Failed to save AI configuration",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Success",
        description: "AI configuration saved successfully",
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

  const handleReset = () => {
    fetchConfiguration();
    toast({
      title: "Reset",
      description: "Configuration reset to saved values",
    });
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

  if (!config) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BrainCircuit className="w-5 h-5" />
            AI Configuration
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">No AI configuration found</p>
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
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="provider">AI Provider</Label>
            <Select
              value={config.provider}
              onValueChange={(value) => {
                const newModel = MODELS[value as keyof typeof MODELS]?.[0]?.value || '';
                setConfig({ ...config, provider: value, model: newModel });
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
            <Label htmlFor="model">Model</Label>
            <Select
              value={config.model}
              onValueChange={(value) => setConfig({ ...config, model: value })}
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

        <div className="space-y-2">
          <Label htmlFor="analysis_prompt">Analysis Prompt</Label>
          <Textarea
            id="analysis_prompt"
            value={config.analysis_prompt}
            onChange={(e) => setConfig({ ...config, analysis_prompt: e.target.value })}
            rows={8}
            placeholder="Enter the prompt used for analyzing comments..."
            className="font-mono text-sm"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="redact_prompt">Redaction Prompt</Label>
          <Textarea
            id="redact_prompt"
            value={config.redact_prompt}
            onChange={(e) => setConfig({ ...config, redact_prompt: e.target.value })}
            rows={4}
            placeholder="Enter the prompt used for redacting comments..."
            className="font-mono text-sm"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="rephrase_prompt">Rephrase Prompt</Label>
          <Textarea
            id="rephrase_prompt"
            value={config.rephrase_prompt}
            onChange={(e) => setConfig({ ...config, rephrase_prompt: e.target.value })}
            rows={4}
            placeholder="Enter the prompt used for rephrasing comments..."
            className="font-mono text-sm"
          />
        </div>

        <div className="flex gap-3 pt-4">
          <Button onClick={handleSave} disabled={saving}>
            <Save className="w-4 h-4 mr-2" />
            {saving ? 'Saving...' : 'Save Configuration'}
          </Button>
          <Button variant="outline" onClick={handleReset}>
            <RotateCcw className="w-4 h-4 mr-2" />
            Reset
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};