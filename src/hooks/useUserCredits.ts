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
      console.log('[useUserCredits] Fetching credits using database function...');
      setLoading(true);
      
      // Use the database function to get or create user credits
      // Type assertion since the function exists but isn't in types
      const { data, error } = await (supabase.rpc as any)('get_or_create_user_credits', {
        user_uuid: user.id
      });

      console.log('[useUserCredits] get_or_create_user_credits response:', { data, error });

      if (error) {
        console.error('[useUserCredits] Error fetching credits:', error);
        return;
      } 
      
      if (data) {
        console.log('[useUserCredits] Setting user credits:', data);
        setUserCredits({
          available_credits: data.available_credits,
          total_credits_used: data.total_credits_used,
          created_at: data.created_at,
          updated_at: data.updated_at
        });
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