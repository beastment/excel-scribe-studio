import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

interface UserCredits {
  available_credits: number;
  total_credits_used: number;
  created_at: string;
  updated_at: string;
}

export const useUserCredits = () => {
  const { user } = useAuth();
  const [userCredits, setUserCredits] = useState<UserCredits | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      console.log('[useUserCredits] User authenticated, fetching credits for:', user.id);
      fetchCredits();
    } else {
      console.log('[useUserCredits] No user, resetting credits');
      setUserCredits(null);
      setLoading(false);
    }
  }, [user]);

  const fetchCredits = async () => {
    if (!user) return;

    try {
      console.log('[useUserCredits] Fetching credits from RPC function...');
      setLoading(true);
      // Use the profiles table for now since RPC functions may not be in types
      const { data, error } = await supabase
        .from('profiles')
        .select('credits, user_id, created_at, updated_at')
        .eq('user_id', user.id)
        .single();

      console.log('[useUserCredits] Profile response:', { data, error });

      if (error) {
        console.error('[useUserCredits] Error fetching credits:', error);
        return;
      }

      if (data) {
        const userCreditsData = {
          available_credits: data.credits || 0,
          total_credits_used: 0, // We'll track this separately for now
          created_at: data.created_at,
          updated_at: data.updated_at
        };
        console.log('[useUserCredits] Setting user credits:', userCreditsData);
        setUserCredits(userCreditsData);
      }
    } catch (error) {
      console.error('[useUserCredits] Unexpected error:', error);
    } finally {
      setLoading(false);
    }
  };

  const refreshCredits = () => {
    console.log('[useUserCredits] Manual refresh requested');
    fetchCredits();
  };

  return {
    credits: userCredits?.available_credits || 0,
    totalUsed: userCredits?.total_credits_used || 0,
    userCredits,
    loading,
    refreshCredits,
  };
};