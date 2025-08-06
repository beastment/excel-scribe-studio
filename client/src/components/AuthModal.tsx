import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth, type LoginData, type RegisterData } from '@/hooks/useAuth';
import { toast } from 'sonner';

const loginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

const registerSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters'),
  email: z.string().email('Please enter a valid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultMode?: 'login' | 'register';
}

export function AuthModal({ isOpen, onClose, defaultMode = 'login' }: AuthModalProps) {
  const [mode, setMode] = useState<'login' | 'register'>(defaultMode);
  const { login, register, isLoginPending, isRegisterPending } = useAuth();

  const loginForm = useForm<LoginData>({
    resolver: zodResolver(loginSchema),
  });

  const registerForm = useForm<RegisterData>({
    resolver: zodResolver(registerSchema),
  });

  const handleLogin = async (data: LoginData) => {
    try {
      await login(data);
      toast.success('Welcome back!');
      onClose();
    } catch (error: any) {
      toast.error(error.message || 'Login failed');
    }
  };

  const handleRegister = async (data: RegisterData) => {
    try {
      await register(data);
      toast.success('Account created successfully!');
      onClose();
    } catch (error: any) {
      toast.error(error.message || 'Registration failed');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === 'login' ? 'Sign In' : 'Create Account'}
          </DialogTitle>
        </DialogHeader>

        {mode === 'login' ? (
          <form onSubmit={loginForm.handleSubmit(handleLogin)} className="space-y-4">
            <div>
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                {...loginForm.register('username')}
                placeholder="Enter your username"
              />
              {loginForm.formState.errors.username && (
                <p className="text-sm text-red-500 mt-1">
                  {loginForm.formState.errors.username.message}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                {...loginForm.register('password')}
                placeholder="Enter your password"
              />
              {loginForm.formState.errors.password && (
                <p className="text-sm text-red-500 mt-1">
                  {loginForm.formState.errors.password.message}
                </p>
              )}
            </div>

            <Button type="submit" className="w-full" disabled={isLoginPending}>
              {isLoginPending ? 'Signing in...' : 'Sign In'}
            </Button>

            <p className="text-center text-sm">
              Don't have an account?{' '}
              <button
                type="button"
                onClick={() => setMode('register')}
                className="text-primary hover:underline"
              >
                Create one
              </button>
            </p>
          </form>
        ) : (
          <form onSubmit={registerForm.handleSubmit(handleRegister)} className="space-y-4">
            <div>
              <Label htmlFor="reg-username">Username</Label>
              <Input
                id="reg-username"
                {...registerForm.register('username')}
                placeholder="Choose a username"
              />
              {registerForm.formState.errors.username && (
                <p className="text-sm text-red-500 mt-1">
                  {registerForm.formState.errors.username.message}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                {...registerForm.register('email')}
                placeholder="Enter your email"
              />
              {registerForm.formState.errors.email && (
                <p className="text-sm text-red-500 mt-1">
                  {registerForm.formState.errors.email.message}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="reg-password">Password</Label>
              <Input
                id="reg-password"
                type="password"
                {...registerForm.register('password')}
                placeholder="Create a password"
              />
              {registerForm.formState.errors.password && (
                <p className="text-sm text-red-500 mt-1">
                  {registerForm.formState.errors.password.message}
                </p>
              )}
            </div>

            <Button type="submit" className="w-full" disabled={isRegisterPending}>
              {isRegisterPending ? 'Creating account...' : 'Create Account'}
            </Button>

            <p className="text-center text-sm">
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => setMode('login')}
                className="text-primary hover:underline"
              >
                Sign in
              </button>
            </p>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}