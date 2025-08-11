import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  User, 
  CreditCard, 
  Package, 
  Settings,
  Shield,
  BrainCircuit,
  ClipboardList,
  FileText,
  Crown
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { MaintenanceToggle } from '@/components/admin/MaintenanceToggle';
import { UserManagement } from '@/components/admin/UserManagement';
import { AppManagement } from '@/components/admin/AppManagement';

interface UserProfile {
  id: string;
  user_id: string;
  full_name: string | null;
  role: 'admin' | 'user' | 'partner';
  created_at: string;
  updated_at: string;
}

const Dashboard = () => {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProfile = async () => {
      if (!user) return;

      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('user_id', user.id)
          .single();

        if (error) {
          console.error('Error fetching profile:', error);
        } else {
          setProfile(data);
        }
      } catch (error) {
        console.error('Error:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [user]);

  const apps = [
    {
      id: "comment-de-identification",
      name: "Comment De-Identification",
      description: "Securely anonymize employee comments",
      icon: Shield,
      color: "from-blue-500 to-cyan-500",
      status: "active",
      subscribed: true
    },
    {
      id: "thematic-analysis",
      name: "Thematic Analysis",
      description: "AI-powered topic modeling and sentiment analysis",
      icon: BrainCircuit,
      color: "from-purple-500 to-pink-500",
      status: "coming-soon",
      subscribed: false
    },
    {
      id: "action-planning-extension",
      name: "Action Planning Extension",
      description: "Turn feedback into actionable plans",
      icon: ClipboardList,
      color: "from-green-500 to-emerald-500",
      status: "coming-soon",
      subscribed: false
    },
    {
      id: "report-writer",
      name: "Report Writer",
      description: "Generate executive summaries automatically",
      icon: FileText,
      color: "from-orange-500 to-red-500",
      status: "coming-soon",
      subscribed: false
    }
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center pt-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pt-20">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
              <p className="text-muted-foreground">
                Welcome back, {profile?.full_name || user?.email}
              </p>
            </div>
            {profile?.role === 'admin' && (
              <Badge className="bg-gradient-to-r from-yellow-500 to-orange-500 text-white">
                <Crown className="w-3 h-3 mr-1" />
                Administrator
              </Badge>
            )}
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <User className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Account Type</p>
                  <p className="font-semibold">{profile?.role === 'admin' ? 'Administrator' : 'Standard User'}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                  <Package className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Active Apps</p>
                  <p className="font-semibold">{apps.filter(app => app.subscribed).length}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                  <CreditCard className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Subscription</p>
                  <p className="font-semibold">Beta Access</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                  <Settings className="w-5 h-5 text-orange-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <p className="font-semibold">Active</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Admin Controls */}
        {profile?.role === 'admin' && (
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-foreground mb-6">Admin Controls</h2>
            <div className="grid lg:grid-cols-1 gap-8 mb-8">
              <UserManagement />
            </div>
            <div className="grid lg:grid-cols-1 gap-8 mb-8">
              <AppManagement />
            </div>
            <div className="grid lg:grid-cols-2 gap-8 mb-8">
              <MaintenanceToggle />
            </div>
          </div>
        )}

        {/* My Applications */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>My Applications</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4">
              {apps.map((app) => (
                <div key={app.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center space-x-4">
                    <div className={`w-12 h-12 bg-gradient-to-br ${app.color} rounded-xl flex items-center justify-center`}>
                      <app.icon className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">{app.name}</h3>
                      <p className="text-sm text-muted-foreground">{app.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    {app.subscribed ? (
                      <Badge className="bg-green-100 text-green-800">Active</Badge>
                    ) : (
                      <Badge className="bg-gray-100 text-gray-600">Not Subscribed</Badge>
                    )}
                    {app.status === "active" ? (
                      <Button asChild>
                        <a href="/comments">Launch App</a>
                      </Button>
                    ) : (
                      <Button variant="outline" disabled>
                        Coming Soon
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Account Information */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <Card>
            <CardHeader>
              <CardTitle>Account Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">Email</label>
                <p className="text-foreground">{user?.email}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Full Name</label>
                <p className="text-foreground">{profile?.full_name || 'Not provided'}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Account Type</label>
                <p className="text-foreground">{profile?.role === 'admin' ? 'Administrator' : 'Standard User'}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Member Since</label>
                <p className="text-foreground">
                  {profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : 'Unknown'}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Subscription & Billing</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">Current Plan</label>
                <p className="text-foreground">Beta Access - Free</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Billing Status</label>
                <p className="text-foreground">No billing during beta</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Next Billing Date</label>
                <p className="text-foreground">N/A</p>
              </div>
              <Button variant="outline" className="w-full">
                Manage Subscription
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;