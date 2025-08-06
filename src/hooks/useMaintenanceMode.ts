import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface MaintenanceStatus {
  isEnabled: boolean;
  message: string;
}

export const useMaintenanceMode = () => {
  const [maintenanceStatus, setMaintenanceStatus] = useState<MaintenanceStatus>({
    isEnabled: false,
    message: 'SurveyJumper is currently under maintenance. Please check back again soon.'
  });
  const [loading, setLoading] = useState(true);

  const fetchMaintenanceStatus = async () => {
    try {
      const { data, error } = await supabase
        .from('maintenance_mode')
        .select('is_enabled, message')
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();

      if (error) {
        console.error('Error fetching maintenance status:', error);
        return;
      }

      setMaintenanceStatus({
        isEnabled: data.is_enabled,
        message: data.message || 'SurveyJumper is currently under maintenance. Please check back again soon.'
      });
    } catch (error) {
      console.error('Error fetching maintenance status:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleMaintenanceMode = async (enabled: boolean, message?: string) => {
    try {
      const { error } = await supabase
        .from('maintenance_mode')
        .update({ 
          is_enabled: enabled,
          message: message || 'SurveyJumper is currently under maintenance. Please check back again soon.',
          updated_by: (await supabase.auth.getUser()).data.user?.id
        })
        .eq('id', (await supabase.from('maintenance_mode').select('id').limit(1).single()).data?.id);

      if (error) {
        console.error('Error updating maintenance mode:', error);
        return { success: false, error };
      }

      await fetchMaintenanceStatus();
      return { success: true };
    } catch (error) {
      console.error('Error updating maintenance mode:', error);
      return { success: false, error };
    }
  };

  useEffect(() => {
    fetchMaintenanceStatus();

    // Set up real-time subscription for maintenance mode changes
    const subscription = supabase
      .channel('maintenance_mode_changes')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'maintenance_mode' },
        () => {
          fetchMaintenanceStatus();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return {
    maintenanceStatus,
    loading,
    toggleMaintenanceMode,
    refetch: fetchMaintenanceStatus
  };
};