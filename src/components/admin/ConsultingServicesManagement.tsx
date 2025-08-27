import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { GripVertical, Settings } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface ConsultingService {
  id: string;
  service_id: string;
  name: string;
  description: string | null;
  is_enabled: boolean;
  is_hidden: boolean;
  is_blurred: boolean;
  status: string;
  position: number;
  created_at: string;
  updated_at: string;
}

interface ConsultingServicesSettings {
  id: string;
  is_enabled: boolean;
  section_title: string;
  section_subtitle: string;
  updated_at: string;
  updated_by: string | null;
}

function SortableServiceItem({ service }: { service: ConsultingService }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: service.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const [updating, setUpdating] = useState(false);

  const toggleServiceStatus = async (field: 'is_enabled' | 'is_hidden' | 'is_blurred', value: boolean) => {
    setUpdating(true);
    try {
      const { error } = await supabase
        .from('consulting_services')
        .update({ [field]: value })
        .eq('id', service.id);

      if (error) throw error;
      
      toast({
        title: "Success",
        description: `Service ${field.replace('is_', '')} updated successfully`,
      });
      
      window.location.reload();
    } catch (error) {
      console.error('Error updating service:', error);
      toast({
        title: "Error",
        description: "Failed to update service",
        variant: "destructive",
      });
    } finally {
      setUpdating(false);
    }
  };

  const updateServiceStatus = async (status: string) => {
    setUpdating(true);
    try {
      const { error } = await supabase
        .from('consulting_services')
        .update({ status })
        .eq('id', service.id);

      if (error) throw error;
      
      toast({
        title: "Success",
        description: "Service status updated successfully",
      });
      
      window.location.reload();
    } catch (error) {
      console.error('Error updating service status:', error);
      toast({
        title: "Error",
        description: "Failed to update service status",
        variant: "destructive",
      });
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-card border rounded-lg p-4 space-y-4 hover:shadow-md transition-shadow"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            {...attributes}
            {...listeners}
            className="cursor-grab hover:cursor-grabbing"
          >
            <GripVertical className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <h3 className="font-semibold">{service.name}</h3>
            <p className="text-sm text-muted-foreground">{service.service_id}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={service.is_enabled ? "default" : "secondary"}>
            {service.is_enabled ? "Enabled" : "Disabled"}
          </Badge>
          <Badge variant={service.is_hidden ? "destructive" : "outline"}>
            {service.is_hidden ? "Hidden" : "Visible"}
          </Badge>
          {service.is_blurred && (
            <Badge variant="secondary">Blurred</Badge>
          )}
        </div>
      </div>

      <p className="text-sm text-muted-foreground">{service.description}</p>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Status</label>
          <Select
            value={service.status}
            onValueChange={updateServiceStatus}
            disabled={updating}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Available">Available</SelectItem>
              <SelectItem value="Coming Soon">Coming Soon</SelectItem>
              <SelectItem value="Beta">Beta</SelectItem>
              <SelectItem value="Maintenance">Maintenance</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center space-x-2">
          <Switch
            checked={service.is_enabled}
            onCheckedChange={(checked) => toggleServiceStatus('is_enabled', checked)}
            disabled={updating}
          />
          <label className="text-sm font-medium">Enabled</label>
        </div>

        <div className="flex items-center space-x-2">
          <Switch
            checked={service.is_hidden}
            onCheckedChange={(checked) => toggleServiceStatus('is_hidden', checked)}
            disabled={updating}
          />
          <label className="text-sm font-medium">Hidden</label>
        </div>

        <div className="flex items-center space-x-2">
          <Switch
            checked={service.is_blurred}
            onCheckedChange={(checked) => toggleServiceStatus('is_blurred', checked)}
            disabled={updating}
          />
          <label className="text-sm font-medium">Blurred</label>
        </div>
      </div>
    </div>
  );
}

export const ConsultingServicesManagement: React.FC = () => {
  const [services, setServices] = useState<ConsultingService[]>([]);
  const [settings, setSettings] = useState<ConsultingServicesSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const fetchData = async () => {
    try {
      const [servicesResult, settingsResult] = await Promise.all([
        supabase
          .from('consulting_services')
          .select('*')
          .order('position'),
        supabase
          .from('consulting_services_settings')
          .select('*')
          .limit(1)
      ]);

      if (servicesResult.error) throw servicesResult.error;
      if (settingsResult.error) throw settingsResult.error;

      setServices(servicesResult.data || []);
      setSettings(settingsResult.data?.[0] || null);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast({
        title: "Error",
        description: "Failed to fetch consulting services data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = services.findIndex((service) => service.id === active.id);
      const newIndex = services.findIndex((service) => service.id === over.id);

      const newServices = arrayMove(services, oldIndex, newIndex);
      setServices(newServices);

      // Update positions in database
      try {
        const updates = newServices.map((service, index) => ({
          id: service.id,
          position: index,
        }));

        for (const update of updates) {
          const { error } = await supabase
            .from('consulting_services')
            .update({ position: update.position })
            .eq('id', update.id);

          if (error) throw error;
        }

        toast({
          title: "Success",
          description: "Service order updated successfully",
        });
      } catch (error) {
        console.error('Error updating order:', error);
        toast({
          title: "Error",
          description: "Failed to update service order",
          variant: "destructive",
        });
        // Revert on error
        fetchData();
      }
    }
  };

  const updateSettings = async (field: string, value: any) => {
    if (!settings) return;

    setUpdating(true);
    try {
      const { error } = await supabase
        .from('consulting_services_settings')
        .update({ [field]: value })
        .eq('id', settings.id);

      if (error) throw error;

      setSettings({ ...settings, [field]: value });
      
      toast({
        title: "Success",
        description: "Settings updated successfully",
      });
    } catch (error) {
      console.error('Error updating settings:', error);
      toast({
        title: "Error",
        description: "Failed to update settings",
        variant: "destructive",
      });
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Consulting Services Management
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Section Settings */}
          {settings && (
            <div className="space-y-4 p-4 border rounded-lg">
              <h3 className="font-semibold">Section Settings</h3>
              
              <div className="flex items-center space-x-2">
                <Switch
                  checked={settings.is_enabled}
                  onCheckedChange={(checked) => updateSettings('is_enabled', checked)}
                  disabled={updating}
                />
                <label className="text-sm font-medium">Enable Consulting Services Section</label>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Section Title</label>
                <Input
                  value={settings.section_title}
                  onChange={(e) => updateSettings('section_title', e.target.value)}
                  disabled={updating}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Section Subtitle</label>
                <Textarea
                  value={settings.section_subtitle}
                  onChange={(e) => updateSettings('section_subtitle', e.target.value)}
                  disabled={updating}
                  rows={3}
                />
              </div>
            </div>
          )}

          {/* Services Management */}
          <div>
            <h3 className="font-semibold mb-4">Services</h3>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={services.map(s => s.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-4">
                  {services.map((service) => (
                    <SortableServiceItem key={service.id} service={service} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};