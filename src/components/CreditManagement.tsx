import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CreditCard, RefreshCw, Package, History } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useUserCredits } from '@/hooks/useUserCredits';
import { usePaymentVerification } from '@/hooks/usePaymentVerification';
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
  
  // Handle payment verification and refresh credits when payment is successful
  usePaymentVerification(refreshCredits);
  const [creditPackages, setCreditPackages] = useState<CreditPackage[]>([]);
  const [recentUsage, setRecentUsage] = useState<CreditUsage[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [customCredits, setCustomCredits] = useState<number>(0);
  const [customCreditsInput, setCustomCreditsInput] = useState<string>('0');

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
      setCreditPackages([
        {
          id: '100-credits',
          name: '100 Credits',
          credits: 100,
          price_usd: 100,
          description: '100 credits for comment scanning'
        },
        {
          id: '500-credits', 
          name: '500 Credits',
          credits: 500,
          price_usd: 500,
          description: '500 credits for comment scanning'
        },
        {
          id: '1000-credits',
          name: '1,000 Credits', 
          credits: 1000,
          price_usd: 1000,
          description: '1,000 credits for comment scanning'
        }
      ]);
    } catch (error) {
      console.error('Error fetching credit packages:', error);
    }
  };

  const fetchRecentUsage = async () => {
    if (!user?.id) return;
    
    try {
      // For now, show empty usage since the table might not be in types yet
      setRecentUsage([]);
    } catch (error) {
      console.error('Error fetching usage history:', error);
    }
  };

  const handlePurchase = async (packageId: string, credits?: number) => {
    if (!user) return;
    
    setPurchasing(packageId);
    try {
      const body = packageId === 'custom-credits' 
        ? { packageId, customCredits: credits }
        : { packageId };
        
      const { data, error } = await supabase.functions.invoke('create-payment', {
        body
      });
      
      if (error) throw error;
      
      // Open Stripe checkout in a new tab
      window.open(data.url, '_blank');
    } catch (error) {
      console.error('Purchase error:', error);
    } finally {
      setPurchasing(null);
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

  // Sync input display with numeric value
  useEffect(() => {
    setCustomCreditsInput(customCredits.toString());
  }, [customCredits]);

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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {creditPackages.map((pkg) => (
              <div key={pkg.id} className="border rounded-lg p-4">
                <div className="font-semibold">{pkg.name}</div>
                <div className="text-2xl font-bold text-primary">{pkg.credits.toLocaleString()} Credits</div>
                <div className="text-sm text-muted-foreground mb-2">{pkg.description}</div>
                <div className="text-lg font-semibold">
                  ${pkg.price_usd.toLocaleString()} AUD
                </div>
                <Button 
                  className="w-full mt-2" 
                  onClick={() => handlePurchase(pkg.id)}
                  disabled={purchasing === pkg.id}
                >
                  {purchasing === pkg.id ? 'Processing...' : 'Purchase'}
                </Button>
              </div>
            ))}
            
            {/* Custom Amount Option */}
            <div className="border rounded-lg p-4 bg-muted/20">
              <div className="font-semibold">Custom Amount</div>
              <div className="text-sm text-muted-foreground mb-3">Choose your own credit amount</div>
              <div className="space-y-3">
                <div>
                  <Label htmlFor="custom-credits">Number of Credits (0-50,000)</Label>
                  <Input
                    id="custom-credits"
                    type="number"
                    value={customCreditsInput}
                    onChange={(e) => {
                      const value = e.target.value;
                      setCustomCreditsInput(value);
                      
                      if (value === '') {
                        setCustomCredits(0);
                      } else {
                        const numValue = parseInt(value);
                        if (!isNaN(numValue)) {
                          setCustomCredits(Math.max(0, Math.min(50000, numValue)));
                        }
                      }
                    }}
                    min="0"
                    max="50000"
                    className="mt-1"
                  />
                </div>
                <div className="text-lg font-semibold">
                  ${(() => {
                    if (customCredits <= 1000) return customCredits;
                    if (customCredits <= 10000) return 1000 + ((customCredits - 1000) * 0.5);
                    return 5500 + ((customCredits - 10000) * 0.25);
                  })().toLocaleString()} AUD
                </div>
                <div className="text-xs text-muted-foreground">
                  Tiered: ≤1K: $1 each | 1K-10K: $1K + $0.50 each | 10K+: $5.5K + $0.25 each
                </div>
                <Button 
                  className="w-full" 
                  onClick={() => handlePurchase('custom-credits', customCredits)}
                  disabled={purchasing === 'custom-credits' || customCredits <= 0 || customCredits > 50000}
                >
                  {purchasing === 'custom-credits' ? 'Processing...' : 'Purchase Custom Amount'}
                </Button>
              </div>
            </div>
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