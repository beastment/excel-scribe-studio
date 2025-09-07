import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useUserRole } from '@/hooks/useUserRole';
import { Plus, Minus, RefreshCw } from 'lucide-react';

interface CreditsManagementProps {
  userId: string;
  userFullName: string;
}

interface UserCredits {
  id: string;
  user_id: string;
  available_credits: number;
  total_credits_used: number;
  created_at: string;
  updated_at: string;
}

export const CreditsManagement: React.FC<CreditsManagementProps> = ({ userId, userFullName }) => {
  const [userCredits, setUserCredits] = useState<UserCredits | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [creditAmount, setCreditAmount] = useState<number>(0);
  const { toast } = useToast();
  const { isAdmin } = useUserRole();

  useEffect(() => {
    fetchUserCredits();
  }, [userId]);

  const fetchUserCredits = async () => {
    try {
      setLoading(true);
      // Use the database function to get or create user credits
      // Type assertion since the function exists but isn't in types
      const { data, error } = await (supabase.rpc as any)('get_or_create_user_credits', {
        user_uuid: userId
      });

      if (error) {
        console.error('Error fetching user credits:', error);
        toast({
          title: "Error",
          description: "Failed to fetch user credits",
          variant: "destructive",
        });
        return;
      }

      if (data) {
        setUserCredits({
          id: data.id,
          user_id: userId,
          available_credits: data.available_credits,
          total_credits_used: data.total_credits_used,
          created_at: data.created_at,
          updated_at: data.updated_at
        });
      }
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
    if (!userCredits || creditAmount <= 0) return;

    // Check if current user is admin
    if (!isAdmin()) {
      toast({
        title: "Error",
        description: "Only administrators can manage user credits",
        variant: "destructive",
      });
      return;
    }

    try {
      setUpdating(true);
      
      if (operation === 'add') {
        // Add credits by updating the available_credits directly
        const newAmount = userCredits.available_credits + creditAmount;
        
        const { error } = await supabase
          .from('user_credits')
          .update({ 
            available_credits: newAmount,
            updated_at: new Date().toISOString()
          })
          .eq('user_id', userId);

        if (error) {
          console.error('Error adding credits:', error);
          toast({
            title: "Error",
            description: `Failed to add credits: ${error.message}`,
            variant: "destructive",
          });
          return;
        }

        toast({
          title: "Success",
          description: `Added ${creditAmount} credits`,
        });
      } else {
        // For subtracting credits, we need to update directly since there's no subtract function
        const newAmount = Math.max(0, userCredits.available_credits - creditAmount);
        
        const { error } = await supabase
          .from('user_credits')
          .update({ 
            available_credits: newAmount,
            updated_at: new Date().toISOString()
          })
          .eq('user_id', userId);

        if (error) {
          console.error('Error subtracting credits:', error);
          toast({
            title: "Error",
            description: `Failed to subtract credits: ${error.message}`,
            variant: "destructive",
          });
          return;
        }

        toast({
          title: "Success",
          description: `Subtracted ${creditAmount} credits`,
        });
      }

      // Refresh the credits data
      await fetchUserCredits();
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
    if (!userCredits || newAmount < 0) return;

    // Check if current user is admin
    if (!isAdmin()) {
      toast({
        title: "Error",
        description: "Only administrators can manage user credits",
        variant: "destructive",
      });
      return;
    }

    try {
      setUpdating(true);
      
      // Set credits directly by updating the available_credits
      const { error } = await supabase
        .from('user_credits')
        .update({ 
          available_credits: newAmount,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId);

      if (error) {
        console.error('Error setting credits:', error);
        toast({
          title: "Error",
          description: `Failed to set credits: ${error.message}`,
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Success",
        description: `Set credits to ${newAmount}`,
      });

      // Refresh the credits data
      await fetchUserCredits();
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
        ) : userCredits ? (
          <>
            <div className="flex items-center justify-between">
              <Label>Current Credits</Label>
              <div className="flex items-center space-x-2">
                <Badge variant={userCredits.available_credits > 10 ? "default" : userCredits.available_credits > 0 ? "secondary" : "destructive"}>
                  {userCredits.available_credits} available
                </Badge>
                <Badge variant="outline">
                  {userCredits.total_credits_used} used
                </Badge>
              </div>
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
                  disabled={updating || creditAmount <= 0 || (userCredits.available_credits - creditAmount) < 0}
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

              <div className="pt-2 border-t">
                <Button
                  onClick={fetchUserCredits}
                  disabled={updating}
                  variant="outline"
                  size="sm"
                  className="w-full"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh Credits
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="text-center text-muted-foreground">
            Failed to load user credits
          </div>
        )}
      </CardContent>
    </Card>
  );
};