import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Settings, Shield, BrainCircuit, ClipboardList, FileText } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface AppConfiguration {
  id: string;
  app_id: string;
  name: string;
  description: string | null;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

const iconMap = {
  'comment-de-identification': Shield,
  'thematic-analysis': BrainCircuit,
  'action-planning-extension': ClipboardList,
  'report-writer': FileText,
};

const colorMap = {
  'comment-de-identification': 'from-blue-500 to-cyan-500',
  'thematic-analysis': 'from-purple-500 to-pink-500',
  'action-planning-extension': 'from-green-500 to-emerald-500',
  'report-writer': 'from-orange-500 to-red-500',
};

export const AppManagement = () => {
  const [apps, setApps] = useState<AppConfiguration[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    fetchApps();
  }, []);

  const fetchApps = async () => {
    try {
      const { data, error } = await supabase
        .from('app_configurations')
        .select('*')
        .order('name');

      if (error) throw error;
      setApps(data || []);
    } catch (error) {
      console.error('Error fetching apps:', error);
      toast.error('Failed to load app configurations');
    } finally {
      setLoading(false);
    }
  };

  const toggleAppStatus = async (appId: string, currentStatus: boolean) => {
    setUpdating(appId);
    try {
      const { error } = await supabase
        .from('app_configurations')
        .update({ is_enabled: !currentStatus })
        .eq('app_id', appId);

      if (error) throw error;

      setApps(apps.map(app => 
        app.app_id === appId 
          ? { ...app, is_enabled: !currentStatus }
          : app
      ));

      toast.success(`App ${!currentStatus ? 'enabled' : 'disabled'} successfully`);
    } catch (error) {
      console.error('Error updating app status:', error);
      toast.error('Failed to update app status');
    } finally {
      setUpdating(null);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            App Management
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="w-5 h-5" />
          App Management
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Enable or disable applications for all users
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {apps.map((app) => {
            const IconComponent = iconMap[app.app_id as keyof typeof iconMap] || Settings;
            const colorClasses = colorMap[app.app_id as keyof typeof colorMap] || 'from-gray-500 to-gray-600';
            
            return (
              <div key={app.id} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center space-x-4">
                  <div className={`w-10 h-10 bg-gradient-to-br ${colorClasses} rounded-xl flex items-center justify-center`}>
                    <IconComponent className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h4 className="font-medium text-foreground">{app.name}</h4>
                    <p className="text-sm text-muted-foreground">{app.description}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <Badge variant={app.is_enabled ? "default" : "secondary"}>
                    {app.is_enabled ? 'Enabled' : 'Disabled'}
                  </Badge>
                  <Switch
                    checked={app.is_enabled}
                    onCheckedChange={() => toggleAppStatus(app.app_id, app.is_enabled)}
                    disabled={updating === app.app_id}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};