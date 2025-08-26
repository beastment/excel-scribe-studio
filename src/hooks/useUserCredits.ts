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
      console.log('[useUserCredits] Fetching credits from user_credits table...');
      setLoading(true);
      // Read from user_credits table to match what the backend functions use
      const { data, error } = await supabase
        .from('user_credits')
        .select('available_credits, total_credits_used, created_at, updated_at')
        .eq('user_id', user.id)
        .single();

      console.log('[useUserCredits] user_credits response:', { data, error });

      if (error) {
        if (error.code === 'PGRST116') { // No rows returned
          console.log('[useUserCredits] No user_credits record found, user may not have been initialized yet');
          // Set default credits for new users
          const defaultCredits = {
            available_credits: 100,
            total_credits_used: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
          setUserCredits(defaultCredits);
        } else {
          console.error('[useUserCredits] Error fetching credits:', error);
          return;
        }
      } else if (data) {
        console.log('[useUserCredits] Setting user credits:', data);
        setUserCredits(data);
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