import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CreditCard, RefreshCw } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

interface UserProfile {
  credits: number;
  created_at: string;
  updated_at: string;
}

const CreditManagement: React.FC = () => {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchCredits = async () => {
    if (!user?.id) return;
    
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('credits, created_at, updated_at')
        .eq('user_id', user.id)
        .single();

      if (error) {
        console.error('Error fetching credits:', error);
        return;
      }

      setProfile(data);
    } catch (error) {
      console.error('Error fetching credits:', error);
    }
  };

  const refreshAll = async () => {
    setRefreshing(true);
    await fetchCredits();
    setRefreshing(false);
  };

  useEffect(() => {
    if (user) {
      fetchCredits().finally(() => {
        setLoading(false);
      });
    }
  }, [user]);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <RefreshCw className="w-6 h-6 animate-spin" />
            <span className="ml-2">Loading credits...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Current Credits */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <CreditCard className="w-5 h-5 mr-2" />
            Current Credits
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center">
            <div className="text-4xl font-bold text-primary mb-2">
              {profile?.credits || 0}
            </div>
            <div className="text-sm text-muted-foreground mb-4">Available Credits</div>
            <div className="text-xs text-muted-foreground">
              Last updated: {profile?.updated_at ? new Date(profile.updated_at).toLocaleDateString() : 'Never'}
            </div>
          </div>
          <div className="mt-4 flex justify-center">
            <Button 
              onClick={refreshAll} 
              variant="outline" 
              size="sm"
              disabled={refreshing}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Information Card */}
      <Card>
        <CardHeader>
          <CardTitle>How Credits Work</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>• You start with 20 free credits when you join</p>
            <p>• Each comment scan costs 1 credit</p>
            <p>• Credits are deducted automatically when you run scans</p>
            <p>• Contact your administrator to get more credits</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default CreditManagement;