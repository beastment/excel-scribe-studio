import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Plus, Minus } from 'lucide-react';

interface CreditsManagementProps {
  userId: string;
  userFullName: string;
}

interface UserProfile {
  id: string;
  user_id: string;
  full_name: string | null;
  credits: number;
}

export const CreditsManagement: React.FC<CreditsManagementProps> = ({ userId, userFullName }) => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [creditAmount, setCreditAmount] = useState<number>(0);
  const { toast } = useToast();

  useEffect(() => {
    fetchUserProfile();
  }, [userId]);

  const fetchUserProfile = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error) {
        console.error('Error fetching user profile:', error);
        toast({
          title: "Error",
          description: "Failed to fetch user profile",
          variant: "destructive",
        });
        return;
      }

      setProfile(data);
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const updateCredits = async (operation: 'add' | 'subtract') => {
    if (!profile || creditAmount <= 0) return;

    try {
      setUpdating(true);
      
      const finalAmount = operation === 'add' ? creditAmount : -creditAmount;
      
      const { error } = await supabase.rpc('add_credits', {
        user_uuid: userId,
        amount: finalAmount
      });

      if (error) {
        console.error('Error updating credits:', error);
        toast({
          title: "Error",
          description: "Failed to update credits",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Success",
        description: `${operation === 'add' ? 'Added' : 'Subtracted'} ${creditAmount} credits`,
      });

      // Refresh the profile data
      await fetchUserProfile();
      setCreditAmount(0);
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setUpdating(false);
    }
  };

  const setCreditsDirectly = async (newAmount: number) => {
    if (!profile || newAmount < 0) return;

    try {
      setUpdating(true);
      
      const { error } = await supabase
        .from('profiles')
        .update({ credits: newAmount })
        .eq('user_id', userId);

      if (error) {
        console.error('Error setting credits:', error);
        toast({
          title: "Error",
          description: "Failed to set credits",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Success",
        description: `Set credits to ${newAmount}`,
      });

      // Refresh the profile data
      await fetchUserProfile();
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setUpdating(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Credits Management</CardTitle>
        <CardDescription>
          Manage credits for {userFullName}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : profile ? (
          <>
            <div className="flex items-center justify-between">
              <Label>Current Credits</Label>
              <Badge variant={profile.credits > 10 ? "default" : profile.credits > 0 ? "secondary" : "destructive"}>
                {profile.credits} credits
              </Badge>
            </div>

            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <Label htmlFor="creditAmount" className="min-w-fit">Amount:</Label>
                <Input
                  id="creditAmount"
                  type="number"
                  value={creditAmount}
                  onChange={(e) => setCreditAmount(Math.max(0, parseInt(e.target.value) || 0))}
                  min="0"
                  placeholder="Enter amount"
                />
              </div>

              <div className="flex space-x-2">
                <Button
                  onClick={() => updateCredits('add')}
                  disabled={updating || creditAmount <= 0}
                  variant="default"
                  size="sm"
                  className="flex-1"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Credits
                </Button>
                <Button
                  onClick={() => updateCredits('subtract')}
                  disabled={updating || creditAmount <= 0 || (profile.credits - creditAmount) < 0}
                  variant="secondary"
                  size="sm"
                  className="flex-1"
                >
                  <Minus className="h-4 w-4 mr-1" />
                  Subtract Credits
                </Button>
              </div>

              <div className="pt-2 border-t">
                <Label className="text-sm">Quick Actions</Label>
                <div className="flex space-x-2 mt-2">
                  <Button
                    onClick={() => setCreditsDirectly(0)}
                    disabled={updating}
                    variant="destructive"
                    size="sm"
                  >
                    Set to 0
                  </Button>
                  <Button
                    onClick={() => setCreditsDirectly(20)}
                    disabled={updating}
                    variant="outline"
                    size="sm"
                  >
                    Set to 20
                  </Button>
                  <Button
                    onClick={() => setCreditsDirectly(100)}
                    disabled={updating}
                    variant="outline"
                    size="sm"
                  >
                    Set to 100
                  </Button>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="text-center text-muted-foreground">
            Failed to load user profile
          </div>
        )}
      </CardContent>
    </Card>
  );
};