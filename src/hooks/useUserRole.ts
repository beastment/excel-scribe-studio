import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

export type UserRole = 'admin' | 'user' | 'partner';

interface UserProfile {
  id: string;
  user_id: string;
  full_name: string | null;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export const useUserRole = () => {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProfile = async () => {
      if (!user) {
        setProfile(null);
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('user_id', user.id)
          .single();

        if (error) {
          console.error('Error fetching profile:', error);
          setProfile(null);
        } else {
          setProfile(data);
        }
      } catch (error) {
        console.error('Error:', error);
        setProfile(null);
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [user]);

  const hasRole = (role: UserRole) => {
    return profile?.role === role;
  };

  const isAdmin = () => hasRole('admin');
  const isPartner = () => hasRole('partner');
  const canBypassMaintenance = () => isAdmin() || isPartner();

  return {
    profile,
    loading,
    hasRole,
    isAdmin,
    isPartner,
    canBypassMaintenance,
  };
};