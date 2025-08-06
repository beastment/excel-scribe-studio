import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Trash2, Plus, Calendar, Hash } from 'lucide-react';

interface Product {
  id: string;
  name: string;
  description?: string;
}

interface UserSubscription {
  id: string;
  user_id: string;
  product_id: string;
  expires_at?: string;
  tokens_remaining?: number;
  is_active: boolean;
  product?: Product;
}

interface SubscriptionManagementProps {
  userId: string;
  userFullName: string;
}

export const SubscriptionManagement: React.FC<SubscriptionManagementProps> = ({ 
  userId, 
  userFullName 
}) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [subscriptions, setSubscriptions] = useState<UserSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const { toast } = useToast();

  // Form state for adding new subscription
  const [newSubscription, setNewSubscription] = useState({
    productId: '',
    expiresAt: '',
    tokensRemaining: '',
    subscriptionType: 'time' as 'time' | 'token'
  });

  useEffect(() => {
    fetchData();
  }, [userId]);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Fetch products
      const { data: productsData, error: productsError } = await supabase
        .from('products')
        .select('*')
        .order('name');

      if (productsError) throw productsError;

      // Fetch user subscriptions
      const { data: subscriptionsData, error: subscriptionsError } = await supabase
        .from('user_subscriptions')
        .select(`
          *,
          product:products(*)
        `)
        .eq('user_id', userId);

      if (subscriptionsError) throw subscriptionsError;

      setProducts(productsData || []);
      setSubscriptions(subscriptionsData || []);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const addSubscription = async () => {
    if (!newSubscription.productId) {
      toast({
        title: 'Product Required',
        description: 'Please select a product.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setUpdating('add');
      
      const subscriptionData: any = {
        user_id: userId,
        product_id: newSubscription.productId,
        is_active: true
      };

      if (newSubscription.subscriptionType === 'time' && newSubscription.expiresAt) {
        subscriptionData.expires_at = new Date(newSubscription.expiresAt).toISOString();
      }

      if (newSubscription.subscriptionType === 'token' && newSubscription.tokensRemaining) {
        subscriptionData.tokens_remaining = parseInt(newSubscription.tokensRemaining);
      }

      const { error } = await supabase
        .from('user_subscriptions')
        .upsert(subscriptionData, {
          onConflict: 'user_id,product_id'
        });

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Subscription added successfully.',
      });

      // Reset form
      setNewSubscription({
        productId: '',
        expiresAt: '',
        tokensRemaining: '',
        subscriptionType: 'time'
      });

      fetchData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setUpdating(null);
    }
  };

  const updateSubscription = async (subscriptionId: string, updates: Partial<UserSubscription>) => {
    try {
      setUpdating(subscriptionId);
      
      const { error } = await supabase
        .from('user_subscriptions')
        .update(updates)
        .eq('id', subscriptionId);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Subscription updated successfully.',
      });

      fetchData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setUpdating(null);
    }
  };

  const deleteSubscription = async (subscriptionId: string) => {
    try {
      setUpdating(subscriptionId);
      
      const { error } = await supabase
        .from('user_subscriptions')
        .delete()
        .eq('id', subscriptionId);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Subscription removed successfully.',
      });

      fetchData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setUpdating(null);
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'No expiration';
    return new Date(dateString).toLocaleDateString();
  };

  const isExpired = (expiresAt?: string) => {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Subscription Management</CardTitle>
          <CardDescription>Loading subscription data...</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Subscription Management</CardTitle>
        <CardDescription>Manage subscriptions for {userFullName}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Add New Subscription */}
        <div className="border rounded-lg p-4 space-y-4">
          <h4 className="font-medium text-sm">Add New Subscription</h4>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Product</Label>
              <Select 
                value={newSubscription.productId} 
                onValueChange={(value) => setNewSubscription(prev => ({ ...prev, productId: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select product" />
                </SelectTrigger>
                <SelectContent>
                  {products.map((product) => (
                    <SelectItem key={product.id} value={product.id}>
                      {product.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Subscription Type</Label>
              <Select 
                value={newSubscription.subscriptionType} 
                onValueChange={(value: 'time' | 'token') => setNewSubscription(prev => ({ 
                  ...prev, 
                  subscriptionType: value,
                  expiresAt: '',
                  tokensRemaining: ''
                }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="time">Time-based</SelectItem>
                  <SelectItem value="token">Token-based</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {newSubscription.subscriptionType === 'time' && (
              <div className="space-y-2">
                <Label>Expires At</Label>
                <Input
                  type="datetime-local"
                  value={newSubscription.expiresAt}
                  onChange={(e) => setNewSubscription(prev => ({ ...prev, expiresAt: e.target.value }))}
                />
              </div>
            )}

            {newSubscription.subscriptionType === 'token' && (
              <div className="space-y-2">
                <Label>Tokens Remaining</Label>
                <Input
                  type="number"
                  placeholder="Number of tokens"
                  value={newSubscription.tokensRemaining}
                  onChange={(e) => setNewSubscription(prev => ({ ...prev, tokensRemaining: e.target.value }))}
                />
              </div>
            )}
          </div>

          <Button 
            onClick={addSubscription} 
            disabled={updating === 'add'}
            className="w-full"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Subscription
          </Button>
        </div>

        {/* Current Subscriptions */}
        <div className="space-y-4">
          <h4 className="font-medium">Current Subscriptions</h4>
          
          {subscriptions.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No subscriptions found</p>
          ) : (
            <div className="space-y-3">
              {subscriptions.map((subscription) => (
                <div key={subscription.id} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <h5 className="font-medium">{subscription.product?.name}</h5>
                      <Badge variant={subscription.is_active ? 'default' : 'secondary'}>
                        {subscription.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                      {subscription.expires_at && isExpired(subscription.expires_at) && (
                        <Badge variant="destructive">Expired</Badge>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => deleteSubscription(subscription.id)}
                      disabled={updating === subscription.id}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    {subscription.expires_at && (
                      <div className="flex items-center space-x-2">
                        <Calendar className="h-4 w-4 text-gray-500" />
                        <span>Expires: {formatDate(subscription.expires_at)}</span>
                      </div>
                    )}
                    
                    {subscription.tokens_remaining !== null && subscription.tokens_remaining !== undefined && (
                      <div className="flex items-center space-x-2">
                        <Hash className="h-4 w-4 text-gray-500" />
                        <span>Tokens: {subscription.tokens_remaining}</span>
                      </div>
                    )}

                    <div className="flex items-center space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => updateSubscription(subscription.id, { is_active: !subscription.is_active })}
                        disabled={updating === subscription.id}
                      >
                        {subscription.is_active ? 'Deactivate' : 'Activate'}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};