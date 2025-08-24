import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CreditCard, RefreshCw, Package, History } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useUserCredits } from '@/hooks/useUserCredits';
import { supabase } from '@/integrations/supabase/client';

interface CreditPackage {
  id: string;
  name: string;
  credits: number;
  price_usd: number;
  description: string;
}

interface CreditUsage {
  id: string;
  credits_used: number;
  comments_scanned: number;
  scan_type: string;
  created_at: string;
}

const CreditManagement: React.FC = () => {
  const { user } = useAuth();
  const { userCredits, totalUsed, refreshCredits, loading } = useUserCredits();
  const [creditPackages, setCreditPackages] = useState<CreditPackage[]>([]);
  const [recentUsage, setRecentUsage] = useState<CreditUsage[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  // Debug logging
  useEffect(() => {
    console.log('[CreditManagement] Component rendered with:', {
      userCredits,
      totalUsed,
      loading,
      userId: user?.id
    });
  }, [userCredits, totalUsed, loading, user?.id]);

  const fetchCreditPackages = async () => {
    try {
      const { data, error } = await supabase
        .from('credit_packages')
        .select('*')
        .eq('is_active', true)
        .order('credits', { ascending: true });

      if (error) {
        console.error('Error fetching credit packages:', error);
        return;
      }

      setCreditPackages(data || []);
    } catch (error) {
      console.error('Error fetching credit packages:', error);
    }
  };

  const fetchRecentUsage = async () => {
    if (!user?.id) return;
    
    try {
      const { data, error } = await supabase
        .from('credit_usage')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) {
        console.error('Error fetching usage history:', error);
        return;
      }

      setRecentUsage(data || []);
    } catch (error) {
      console.error('Error fetching usage history:', error);
    }
  };

  const refreshAll = async () => {
    setRefreshing(true);
    await Promise.all([
      refreshCredits(),
      fetchCreditPackages(),
      fetchRecentUsage()
    ]);
    setRefreshing(false);
  };

  useEffect(() => {
    if (user) {
      Promise.all([
        fetchCreditPackages(),
        fetchRecentUsage()
      ]);
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
              {userCredits?.available_credits || 0}
            </div>
            <div className="text-sm text-muted-foreground mb-2">Available Credits</div>
            <div className="text-sm text-muted-foreground mb-4">
              Total Used: {totalUsed || 0}
            </div>
            <div className="text-xs text-muted-foreground">
              Last updated: {userCredits?.updated_at ? new Date(userCredits.updated_at).toLocaleDateString() : 'Never'}
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

      {/* Credit Packages */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Package className="w-5 h-5 mr-2" />
            Available Packages
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {creditPackages.map((pkg) => (
              <div key={pkg.id} className="border rounded-lg p-4">
                <div className="font-semibold">{pkg.name}</div>
                <div className="text-2xl font-bold text-primary">{pkg.credits} Credits</div>
                <div className="text-sm text-muted-foreground mb-2">{pkg.description}</div>
                <div className="text-lg font-semibold">
                  ${pkg.price_usd === 0 ? 'Free' : pkg.price_usd}
                </div>
                <Button 
                  className="w-full mt-2" 
                  variant={pkg.price_usd === 0 ? "outline" : "default"}
                  disabled
                >
                  {pkg.price_usd === 0 ? 'Included' : 'Purchase'}
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Recent Usage History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <History className="w-5 h-5 mr-2" />
            Recent Usage
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recentUsage.length > 0 ? (
            <div className="space-y-3">
              {recentUsage.map((usage) => (
                <div key={usage.id} className="flex justify-between items-center border-b pb-2">
                  <div>
                    <div className="font-medium">Comment Scan</div>
                    <div className="text-sm text-muted-foreground">
                      {usage.comments_scanned} comments • {new Date(usage.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-red-600">-{usage.credits_used}</div>
                    <div className="text-xs text-muted-foreground">credits</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-muted-foreground py-4">
              No usage history yet
            </div>
          )}
        </CardContent>
      </Card>

      {/* Information Card */}
      <Card>
        <CardHeader>
          <CardTitle>How Credits Work</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>• You start with 100 free credits when you join</p>
            <p>• <strong>Comment Scan:</strong> 1 credit per comment</p>
            <p>• <strong>Demo File:</strong> Free (no credits deducted)</p>
            <p>• Credits are deducted automatically when you run scans</p>
            <p>• Contact your administrator to get more credits</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default CreditManagement;