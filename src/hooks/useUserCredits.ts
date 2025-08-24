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
      fetchCredits();
    } else {
      setUserCredits(null);
      setLoading(false);
    }
  }, [user]);

  const fetchCredits = async () => {
    if (!user) return;

    try {
      setLoading(true);
      // Get or create user credits using the RPC function
      const { data, error } = await supabase
        .rpc('get_or_create_user_credits', { user_uuid: user.id });

      if (error) {
        console.error('Error fetching credits:', error);
        return;
      }

      setUserCredits(data);
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
    credits: userCredits?.available_credits || 0,
    totalUsed: userCredits?.total_credits_used || 0,
    userCredits,
    loading,
    refreshCredits,
  };
};