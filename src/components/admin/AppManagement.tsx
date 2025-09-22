import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Settings, Shield, BrainCircuit, ClipboardList, FileText, GripVertical, EyeOff, Focus } from 'lucide-react'; // Fixed: Changed Blur to Focus
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import {
  CSS,
} from '@dnd-kit/utilities';

interface AppConfiguration {
  id: string;
  app_id: string;
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

const statusOptions = [
  'None',
  'Live',
  'Just Released', 
  'Currently in Beta',
  'In Development',
  'Planned',
  'Under Maintenance'
];

// Sortable App Item Component
interface SortableAppItemProps {
  app: AppConfiguration;
  updating: string | null;
  onToggleStatus: (appId: string, currentStatus: boolean) => void;
  onToggleHidden: (appId: string, currentHidden: boolean) => void;
  onToggleBlurred: (appId: string, currentBlurred: boolean) => void;
  onUpdateStatus: (appId: string, newStatus: string) => void;
}

const SortableAppItem = ({ app, updating, onToggleStatus, onToggleHidden, onToggleBlurred, onUpdateStatus }: SortableAppItemProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: app.app_id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const IconComponent = iconMap[app.app_id as keyof typeof iconMap] || Settings;
  const colorClasses = colorMap[app.app_id as keyof typeof colorMap] || 'from-gray-500 to-gray-600';

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center justify-between p-4 border rounded-lg bg-background"
    >
      <div className="flex items-center space-x-4">
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing p-2 hover:bg-muted rounded"
        >
          <GripVertical className="w-4 h-4 text-muted-foreground" />
        </div>
        <div className={`w-10 h-10 bg-gradient-to-br ${colorClasses} rounded-xl flex items-center justify-center`}>
          <IconComponent className="w-5 h-5 text-white" />
        </div>
        <div>
          <h4 className="font-medium text-foreground">{app.name}</h4>
          <p className="text-sm text-muted-foreground">{app.description}</p>
          <div className="mt-2">
            <Select value={app.status} onValueChange={(value) => onUpdateStatus(app.app_id, value)}>
              <SelectTrigger className="w-48 h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-background border z-50">
                {statusOptions.map((status) => (
                  <SelectItem key={status} value={status} className="hover:bg-muted">
                    {status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
      <div className="flex items-center space-x-3">
        <div className="flex flex-col space-y-2">
          <div className="flex items-center space-x-2">
            <Badge variant={app.is_enabled ? "default" : "secondary"}>
              {app.is_enabled ? 'Enabled' : 'Disabled'}
            </Badge>
            <Switch
              checked={app.is_enabled}
              onCheckedChange={() => onToggleStatus(app.app_id, app.is_enabled)}
              disabled={updating === app.app_id}
            />
          </div>
          <div className="flex items-center space-x-2">
            <Badge variant={app.is_hidden ? "destructive" : "outline"}>
              {app.is_hidden ? (
                <>
                  <EyeOff className="w-3 h-3 mr-1" />
                  Hidden
                </>
              ) : 'Visible'}
            </Badge>
            <Switch
              checked={app.is_hidden}
              onCheckedChange={() => onToggleHidden(app.app_id, app.is_hidden)}
              disabled={updating === app.app_id}
            />
          </div>
          <div className="flex items-center space-x-2">
            <Badge variant={app.is_blurred ? "secondary" : "outline"}>
              {app.is_blurred ? (
                <>
                  <Focus className="w-3 h-3 mr-1" />
                  Blurred
                </>
              ) : 'Clear'}
            </Badge>
            <Switch
              checked={app.is_blurred}
              onCheckedChange={() => onToggleBlurred(app.app_id, app.is_blurred)}
              disabled={updating === app.app_id}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export const AppManagement = () => {
  const [apps, setApps] = useState<AppConfiguration[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    fetchApps();
  }, []);

  const fetchApps = async () => {
    try {
      const { data, error } = await supabase
        .from('app_configurations')
        .select('id, app_id, name, description, is_enabled, is_hidden, is_blurred, status, position, created_at, updated_at')
        .order('position', { ascending: true });

      // Debug: log what we got back
      console.log('[AppManagement] fetchApps result', { count: data?.length ?? 0, error, data });

      if (error) throw error;
      setApps(data || []);

      if (!data || data.length === 0) {
        toast.message('No apps found', {
          description: 'No app configurations were returned from the database.'
        });
      }
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

  const toggleAppHidden = async (appId: string, currentHidden: boolean) => {
    setUpdating(appId);
    try {
      const { error } = await supabase
        .from('app_configurations')
        .update({ is_hidden: !currentHidden })
        .eq('app_id', appId);

      if (error) throw error;

      setApps(apps.map(app => 
        app.app_id === appId 
          ? { ...app, is_hidden: !currentHidden }
          : app
      ));

      toast.success(`App ${!currentHidden ? 'hidden' : 'made visible'} successfully`);
    } catch (error) {
      console.error('Error updating app hidden status:', error);
      toast.error('Failed to update app hidden status');
    } finally {
      setUpdating(null);
    }
  };

  const toggleAppBlurred = async (appId: string, currentBlurred: boolean) => {
    setUpdating(appId);
    try {
      const { error } = await supabase
        .from('app_configurations')
        .update({ is_blurred: !currentBlurred })
        .eq('app_id', appId);

      if (error) throw error;

      setApps(apps.map(app => 
        app.app_id === appId 
          ? { ...app, is_blurred: !currentBlurred }
          : app
      ));

      toast.success(`App ${!currentBlurred ? 'blurred' : 'unblurred'} successfully`);
    } catch (error) {
      console.error('Error updating app blur status:', error);
      toast.error('Failed to update app blur status');
    } finally {
      setUpdating(null);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (active.id !== over?.id) {
      const oldIndex = apps.findIndex(app => app.app_id === active.id);
      const newIndex = apps.findIndex(app => app.app_id === over?.id);
      
      const reorderedApps = arrayMove(apps, oldIndex, newIndex);
      setApps(reorderedApps);

      // Update positions in database
      try {
        const updates = reorderedApps.map((app, index) => ({
          app_id: app.app_id,
          position: index + 1
        }));

        for (const update of updates) {
          await supabase
            .from('app_configurations')
            .update({ position: update.position })
            .eq('app_id', update.app_id);
        }

        toast.success('App order updated successfully');
      } catch (error) {
        console.error('Error updating app order:', error);
        toast.error('Failed to update app order');
        // Revert on error
        fetchApps();
      }
    }
  };

  const updateAppStatus = async (appId: string, newStatus: string) => {
    setUpdating(appId);
    try {
      const { error } = await supabase
        .from('app_configurations')
        .update({ status: newStatus })
        .eq('app_id', appId);

      if (error) throw error;

      setApps(apps.map(app => 
        app.app_id === appId 
          ? { ...app, status: newStatus }
          : app
      ));

      toast.success(`App status updated to "${newStatus}" successfully`);
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
          Enable or disable applications for all users. Hidden apps won't appear on the main page. Blurred apps appear but are unrecognizable. Drag to reorder.
        </p>
      </CardHeader>
      <CardContent>
        {apps.length === 0 ? (
          <div className="py-10 text-center text-muted-foreground">
            No apps found. Try refreshing the page. If this persists, it may be a data visibility (RLS) issue.
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={apps.map(app => app.app_id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-4">
                {apps.map((app) => (
                  <SortableAppItem
                    key={app.app_id}
                    app={app}
                    updating={updating}
                    onToggleStatus={toggleAppStatus}
                    onToggleHidden={toggleAppHidden}
                    onToggleBlurred={toggleAppBlurred}
                    onUpdateStatus={updateAppStatus}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </CardContent>
    </Card>
  );
};