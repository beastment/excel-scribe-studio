import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CreditCard, RefreshCw, ShoppingCart } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@supabase/supabase-js';

interface UserCredits {
  available_credits: number;
  total_credits_used: number;
  created_at: string;
  updated_at: string;
}

interface CreditPackage {
  id: string;
  name: string;
  credits: number;
  price_usd: number;
  description: string;
  is_active: boolean;
}

interface CreditUsage {
  id: string;
  scan_run_id: string;
  credits_used: number;
  comments_scanned: number;
  scan_type: string;
  created_at: string;
}

const CreditManagement: React.FC = () => {
  const { user } = useAuth();
  const [credits, setCredits] = useState<UserCredits | null>(null);
  const [packages, setPackages] = useState<CreditPackage[]>([]);
  const [usage, setUsage] = useState<CreditUsage[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const supabase = createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_ANON_KEY
  );

  const fetchCredits = async () => {
    try {
      const { data, error } = await supabase
        .from('user_credits')
        .select('*')
        .eq('user_id', user?.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching credits:', error);
        return;
      }

      if (data) {
        setCredits(data);
      } else {
        // Create default credits record
        const { data: newCredits, error: createError } = await supabase
          .rpc('get_or_create_user_credits', { user_uuid: user?.id });

        if (createError) {
          console.error('Error creating credits:', createError);
          return;
        }

        setCredits(newCredits);
      }
    } catch (error) {
      console.error('Error fetching credits:', error);
    }
  };

  const fetchPackages = async () => {
    try {
      const { data, error } = await supabase
        .from('credit_packages')
        .select('*')
        .eq('is_active', true)
        .order('credits', { ascending: true });

      if (error) {
        console.error('Error fetching packages:', error);
        return;
      }

      setPackages(data || []);
    } catch (error) {
      console.error('Error fetching packages:', error);
    }
  };

  const fetchUsage = async () => {
    try {
      const { data, error } = await supabase
        .from('credit_usage')
        .select('*')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) {
        console.error('Error fetching usage:', error);
        return;
      }

      setUsage(data || []);
    } catch (error) {
      console.error('Error fetching usage:', error);
    }
  };

  const refreshAll = async () => {
    setRefreshing(true);
    await Promise.all([fetchCredits(), fetchPackages(), fetchUsage()]);
    setRefreshing(false);
  };

  useEffect(() => {
    if (user) {
      Promise.all([fetchCredits(), fetchPackages(), fetchUsage()]).finally(() => {
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {credits?.available_credits || 100}
              </div>
              <div className="text-sm text-muted-foreground">Available Credits</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                {credits?.total_credits_used || 0}
              </div>
              <div className="text-sm text-muted-foreground">Total Used</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">
                {(credits?.available_credits || 100) + (credits?.total_credits_used || 0)}
              </div>
              <div className="text-sm text-muted-foreground">Total Earned</div>
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
            <ShoppingCart className="w-5 h-5 mr-2" />
            Available Packages
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {packages.map((pkg) => (
              <div key={pkg.id} className="border rounded-lg p-4 text-center">
                <div className="text-lg font-semibold">{pkg.name}</div>
                <div className="text-2xl font-bold text-green-600 my-2">
                  {pkg.credits.toLocaleString()}
                </div>
                <div className="text-sm text-muted-foreground mb-3">
                  {pkg.description}
                </div>
                <div className="text-lg font-semibold mb-3">
                  ${pkg.price_usd.toFixed(2)}
                </div>
                <Button 
                  className="w-full" 
                  disabled={pkg.price_usd === 0}
                >
                  {pkg.price_usd === 0 ? 'Free' : 'Purchase'}
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Recent Usage */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Usage</CardTitle>
        </CardHeader>
        <CardContent>
          {usage.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              No usage history yet
            </div>
          ) : (
            <div className="space-y-3">
              {usage.map((item) => (
                <div key={item.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center space-x-3">
                    <Badge variant={item.scan_type === 'comment_scan' ? 'default' : 'secondary'}>
                      {item.scan_type === 'comment_scan' ? 'Scan' : 'Adjudication'}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {item.comments_scanned} comments
                    </span>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-red-600">
                      -{item.credits_used} credits
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(item.created_at).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default CreditManagement;
