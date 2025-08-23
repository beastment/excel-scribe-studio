import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

export const useUserCredits = () => {
  const { user } = useAuth();
  const [credits, setCredits] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchCredits();
    } else {
      setCredits(0);
      setLoading(false);
    }
  }, [user]);

  const fetchCredits = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('profiles')
        .select('credits')
        .eq('user_id', user.id)
        .single();

      if (error) {
        console.error('Error fetching credits:', error);
        return;
      }

      setCredits(data?.credits || 0);
    } catch (error) {
      console.error('Error fetching credits:', error);
    } finally {
      setLoading(false);
    }
  };

  const refreshCredits = () => {
    fetchCredits();
  };

  return {
    credits,
    loading,
    refreshCredits,
  };
};