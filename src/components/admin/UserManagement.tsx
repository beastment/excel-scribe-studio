import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Users, Crown, User, Trash2, RefreshCw, ChevronDown, ChevronRight, Mail, AlertTriangle, Link2, ChevronUp } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { SubscriptionManagement } from './SubscriptionManagement';
import { CreditsManagement } from './CreditsManagement';
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface UserProfile {
  id: string;
  user_id: string;
  full_name: string | null;
  role: 'admin' | 'user' | 'partner';
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
  email?: string; // We'll need to fetch this separately
}

type SortField = 'full_name' | 'created_at' | 'updated_at' | 'last_login_at';
type SortDirection = 'asc' | 'desc';

export const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState<string | null>(null);
  const [resending, setResending] = useState<string | null>(null);
  const [generatingLink, setGeneratingLink] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const { toast } = useToast();

  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order(sortField, { ascending: sortDirection === 'asc' });

      if (error) {
        console.error('Error fetching users:', error);
        toast({
          title: "Error",
          description: "Failed to fetch users.",
          variant: "destructive",
        });
        return;
      }

      setUsers(data || []);
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateUserRole = async (userId: string, newRole: 'admin' | 'user' | 'partner') => {
    setUpdating(userId);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ role: newRole })
        .eq('user_id', userId);

      if (error) {
        console.error('Error updating user role:', error);
        toast({
          title: "Error",
          description: "Failed to update user role.",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Success",
        description: `User role updated to ${newRole}.`,
      });

      await fetchUsers();
    } catch (error) {
      console.error('Error updating user role:', error);
    } finally {
      setUpdating(null);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-AU', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const deleteUser = async (userId: string, userEmail: string) => {
    setDeleting(userId);
    try {
      const { data, error } = await supabase.functions.invoke('delete-user', {
        body: { userId }
      });

      if (error) {
        console.error('Error deleting user:', error);
        toast({
          title: "Error",
          description: error.message || "Failed to delete user.",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Success",
        description: "User has been completely removed from the system.",
      });

      await fetchUsers();
    } catch (error) {
      console.error('Error deleting user:', error);
      toast({
        title: "Error",
        description: "Failed to delete user.",
        variant: "destructive",
      });
    } finally {
      setDeleting(null);
    }
  };

  const resendConfirmationEmail = async (userId: string) => {
    // For now, ask admin to input the email since we don't store it in profiles
    const email = prompt(`Please enter the email address for this user (${userId}):`);
    if (!email) return;

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      toast({
        title: "Error",
        description: "Please enter a valid email address.",
        variant: "destructive",
      });
      return;
    }

    setResending(userId);
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email.trim(),
        options: {
          emailRedirectTo: `${window.location.origin}/auth`
        }
      });

      if (error) {
        console.error('Error resending confirmation email:', error);
        let errorMessage = "Failed to resend confirmation email.";
        
        if (error.message.includes("Email address") && error.message.includes("invalid")) {
          errorMessage = "The email address format is invalid. Please check and try again.";
        } else if (error.message.includes("rate limit")) {
          errorMessage = "Too many requests. Please wait a moment before trying again.";
        } else {
          errorMessage = `Failed to resend confirmation email: ${error.message}`;
        }
        
        toast({
          title: "Error",
          description: errorMessage,
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Success",
        description: `Confirmation email has been sent to ${email}.`,
      });
    } catch (error) {
      console.error('Error resending confirmation email:', error);
      toast({
        title: "Error",
        description: "Failed to resend confirmation email.",
        variant: "destructive",
      });
    } finally {
      setResending(null);
    }
  };

  const generateLoginLink = async (userId: string) => {
    setGeneratingLink(userId);
    try {
      const { data, error } = await supabase.functions.invoke('generate-login-link', {
        body: { userId }
      });

      if (error) {
        console.error('Error generating login link:', error);
        toast({
          title: "Error",
          description: error.message || "Failed to generate login link.",
          variant: "destructive",
        });
        return;
      }

      // Copy link to clipboard
      if (data.loginLink) {
        await navigator.clipboard.writeText(data.loginLink);
        toast({
          title: "Success",
          description: `Login link for ${data.email} has been copied to clipboard.`,
        });
      }
    } catch (error) {
      console.error('Error generating login link:', error);
      toast({
        title: "Error",
        description: "Failed to generate login link.",
        variant: "destructive",
      });
    } finally {
      setGeneratingLink(null);
    }
  };

  const toggleUserExpansion = (userId: string) => {
    const newExpanded = new Set(expandedUsers);
    if (newExpanded.has(userId)) {
      newExpanded.delete(userId);
    } else {
      newExpanded.add(userId);
    }
    setExpandedUsers(newExpanded);
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />;
  };

  useEffect(() => {
    fetchUsers();
  }, [sortField, sortDirection]);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-gray-200 rounded w-1/4"></div>
            <div className="h-32 bg-gray-200 rounded"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            User Management
          </CardTitle>
          <Button
            onClick={fetchUsers}
            variant="outline"
            size="sm"
            disabled={loading}
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead 
                  className="cursor-pointer hover:bg-muted/50 select-none"
                  onClick={() => handleSort('full_name')}
                >
                  <div className="flex items-center gap-1">
                    Name
                    {getSortIcon('full_name')}
                  </div>
                </TableHead>
                <TableHead 
                  className="cursor-pointer hover:bg-muted/50 select-none"
                  onClick={() => handleSort('created_at')}
                >
                  <div className="flex items-center gap-1">
                    Created
                    {getSortIcon('created_at')}
                  </div>
                </TableHead>
                <TableHead 
                  className="cursor-pointer hover:bg-muted/50 select-none"
                  onClick={() => handleSort('updated_at')}
                >
                  <div className="flex items-center gap-1">
                    Last Updated
                    {getSortIcon('updated_at')}
                  </div>
                </TableHead>
                <TableHead 
                  className="cursor-pointer hover:bg-muted/50 select-none"
                  onClick={() => handleSort('last_login_at')}
                >
                  <div className="flex items-center gap-1">
                    Last Login
                    {getSortIcon('last_login_at')}
                  </div>
                </TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="text-right">Actions</TableHead>
                <TableHead className="text-right">Subscriptions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <React.Fragment key={user.id}>
                  <TableRow>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {user.role === 'admin' ? (
                          <Crown className="w-4 h-4 text-yellow-500" />
                        ) : (
                          <User className="w-4 h-4 text-gray-500" />
                        )}
                        {user.full_name || 'Unknown User'}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(user.created_at)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(user.updated_at)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {user.last_login_at ? formatDate(user.last_login_at) : 'Never'}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={user.role}
                        onValueChange={(value: 'admin' | 'user' | 'partner') => updateUserRole(user.user_id, value)}
                        disabled={updating === user.user_id}
                      >
                        <SelectTrigger className="w-24 h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="user">User</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="partner">Partner</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center gap-2 justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => resendConfirmationEmail(user.user_id)}
                          disabled={resending === user.user_id}
                          title="Resend confirmation email"
                        >
                          <Mail className="h-4 w-4" />
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => generateLoginLink(user.user_id)}
                          disabled={generatingLink === user.user_id}
                          title="Generate login link"
                        >
                          <Link2 className="h-4 w-4" />
                        </Button>

                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={deleting === user.user_id}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              title="Delete user"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle className="flex items-center gap-2">
                                <AlertTriangle className="h-5 w-5 text-red-600" />
                                Delete User
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete <strong>{user.full_name || 'Unknown User'}</strong>? 
                                This action cannot be undone and will remove the user from the system.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteUser(user.user_id, user.user_id)}
                                className="bg-red-600 hover:bg-red-700"
                              >
                                Delete User
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => toggleUserExpansion(user.user_id)}
                      >
                        {expandedUsers.has(user.user_id) ? (
                          <ChevronDown className="h-4 w-4 mr-1" />
                        ) : (
                          <ChevronRight className="h-4 w-4 mr-1" />
                        )}
                        Manage
                      </Button>
                    </TableCell>
                  </TableRow>
                  
                   {expandedUsers.has(user.user_id) && (
                    <TableRow>
                      <TableCell colSpan={7} className="p-0">
                        <div className="p-4 bg-gray-50 border-t space-y-4">
                          <CreditsManagement 
                            userId={user.user_id} 
                            userFullName={user.full_name || 'Unknown User'} 
                          />
                          <SubscriptionManagement 
                            userId={user.user_id} 
                            userFullName={user.full_name || 'Unknown User'} 
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              ))}
            </TableBody>
          </Table>
        </div>

        {users.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            No users found.
          </div>
        )}
      </CardContent>
    </Card>
  );
};