import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface AuthFormProps {
  mode: 'signin' | 'signup' | 'reset';
  onModeChange: (mode: 'signin' | 'signup') => void;
}

export const AuthForm: React.FC<AuthFormProps> = ({ mode, onModeChange }) => {
  const { signIn, signUp } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    fullName: '',
    confirmPassword: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      let result;
      if (mode === 'signup') {
        result = await signUp(formData.email, formData.password, formData.fullName);
        if (!result.error) {
          toast({
            title: 'Check your email',
            description: 'We sent you a confirmation link to complete your registration.',
          });
        }
      } else if (mode === 'reset') {
        if (formData.password !== formData.confirmPassword) {
          toast({
            title: 'Password Mismatch',
            description: 'Passwords do not match. Please try again.',
            variant: 'destructive',
          });
          setLoading(false);
          return;
        }

        const { error } = await supabase.auth.updateUser({
          password: formData.password
        });

        if (error) {
          toast({
            title: 'Error',
            description: error.message,
            variant: 'destructive',
          });
        } else {
          toast({
            title: 'Password Updated',
            description: 'Your password has been successfully updated.',
          });
          // Redirect to dashboard after successful password reset
          window.location.href = '/';
        }
        setLoading(false);
        return;
      } else {
        result = await signIn(formData.email, formData.password);
        if (!result.error) {
          toast({
            title: 'Welcome back!',
            description: 'You have been signed in successfully.',
          });
        }
      }

      if (result?.error) {
        toast({
          title: 'Authentication Error',
          description: result.error.message,
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'An unexpected error occurred. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const handleForgotPassword = async () => {
    if (!formData.email) {
      toast({
        title: 'Email Required',
        description: 'Please enter your email address first.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(formData.email, {
        redirectTo: `${window.location.origin}/auth?type=recovery`,
      });

      if (error) {
        toast({
          title: 'Error',
          description: error.message,
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Reset Email Sent',
          description: 'Check your email for password reset instructions.',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'An unexpected error occurred. Please try again.',
        variant: 'destructive',
      });
    }
  };

  return (
    <Card className="w-full shadow-xl bg-white border-0">
      <CardHeader className="text-center pb-4">
        <CardTitle className="text-2xl font-bold text-gray-900">
          {mode === 'signin' ? 'Sign In' : mode === 'signup' ? 'Create Account' : 'Reset Password'}
        </CardTitle>
        <CardDescription className="text-gray-600">
          {mode === 'signin' 
            ? 'Welcome back! Please sign in to continue'
            : mode === 'signup'
            ? 'Join us and start transforming your feedback process'
            : 'Enter your new password below'
          }
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <form onSubmit={handleSubmit} className="space-y-5">
          {mode === 'signup' && (
            <div className="space-y-2">
              <Label htmlFor="fullName" className="text-gray-700 font-medium">Full Name</Label>
              <Input
                id="fullName"
                name="fullName"
                type="text"
                placeholder="Enter your full name"
                value={formData.fullName}
                onChange={handleInputChange}
                required
                className="border-gray-200 focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
          )}
          
          {mode !== 'reset' && (
            <div className="space-y-2">
              <Label htmlFor="email" className="text-gray-700 font-medium">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="Enter your email"
                value={formData.email}
                onChange={handleInputChange}
                required
                className="border-gray-200 focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
          )}
          
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password" className="text-gray-700 font-medium">
                {mode === 'reset' ? 'New Password' : 'Password'}
              </Label>
              {mode === 'signin' && (
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  className="text-sm text-blue-600 hover:text-blue-800 hover:underline transition-colors"
                >
                  Forgot password?
                </button>
              )}
            </div>
            <Input
              id="password"
              name="password"
              type="password"
              placeholder={mode === 'reset' ? 'Enter your new password' : 'Enter your password'}
              value={formData.password}
              onChange={handleInputChange}
              required
              minLength={6}
              className="border-gray-200 focus:border-blue-500 focus:ring-blue-500"
            />
          </div>

          {mode === 'reset' && (
            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-gray-700 font-medium">Confirm New Password</Label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                placeholder="Confirm your new password"
                value={formData.confirmPassword}
                onChange={handleInputChange}
                required
                minLength={6}
                className="border-gray-200 focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
          )}
          
          <Button 
            type="submit" 
            className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white py-3 text-base font-medium rounded-xl shadow-lg hover:shadow-xl transition-all duration-300" 
            disabled={loading}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {mode === 'signin' ? 'Sign In' : mode === 'signup' ? 'Create Account' : 'Update Password'}
          </Button>
        </form>
        
        {mode !== 'reset' && (
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600">
              {mode === 'signin' ? "Don't have an account?" : 'Already have an account?'}
              {' '}
              <button
                type="button"
                onClick={() => onModeChange(mode === 'signin' ? 'signup' : 'signin')}
                className="text-blue-600 hover:text-blue-800 hover:underline font-medium transition-colors"
              >
                {mode === 'signin' ? 'Sign up here' : 'Sign in here'}
              </button>
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};