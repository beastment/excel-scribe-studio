import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Wrench, Save } from 'lucide-react';
import { useMaintenanceMode } from '@/hooks/useMaintenanceMode';
import { useToast } from '@/hooks/use-toast';

export const MaintenanceToggle: React.FC = () => {
  const { maintenanceStatus, toggleMaintenanceMode, loading } = useMaintenanceMode();
  const { toast } = useToast();
  const [message, setMessage] = useState(maintenanceStatus.message);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleToggle = async (enabled: boolean) => {
    setIsSubmitting(true);
    const result = await toggleMaintenanceMode(enabled, message);
    
    if (result.success) {
      toast({
        title: "Success",
        description: `Maintenance mode ${enabled ? 'enabled' : 'disabled'} successfully.`,
      });
    } else {
      toast({
        title: "Error",
        description: "Failed to update maintenance mode.",
        variant: "destructive",
      });
    }
    setIsSubmitting(false);
  };

  const handleSaveMessage = async () => {
    setIsSubmitting(true);
    const result = await toggleMaintenanceMode(maintenanceStatus.isEnabled, message);
    
    if (result.success) {
      toast({
        title: "Success",
        description: "Maintenance message updated successfully.",
      });
    } else {
      toast({
        title: "Error",
        description: "Failed to update maintenance message.",
        variant: "destructive",
      });
    }
    setIsSubmitting(false);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-gray-200 rounded w-1/4"></div>
            <div className="h-8 bg-gray-200 rounded"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wrench className="w-5 h-5" />
          Maintenance Mode
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Label htmlFor="maintenance-switch" className="text-sm font-medium">
              Enable Maintenance Mode
            </Label>
            <p className="text-sm text-muted-foreground">
              When enabled, only admin users can access the site
            </p>
          </div>
          <Switch
            id="maintenance-switch"
            checked={maintenanceStatus.isEnabled}
            onCheckedChange={handleToggle}
            disabled={isSubmitting}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="maintenance-message" className="text-sm font-medium">
            Maintenance Message
          </Label>
          <Textarea
            id="maintenance-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Enter the message to display during maintenance..."
            className="min-h-[100px]"
          />
          <Button
            onClick={handleSaveMessage}
            disabled={isSubmitting || message === maintenanceStatus.message}
            size="sm"
            className="w-full"
          >
            <Save className="w-4 h-4 mr-2" />
            Save Message
          </Button>
        </div>

        {maintenanceStatus.isEnabled && (
          <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
            <p className="text-sm text-orange-800 font-medium">
              ⚠️ Maintenance mode is currently active. Regular users cannot access the site.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};