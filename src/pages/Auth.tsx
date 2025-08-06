import React, { useState, useEffect } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { AuthForm } from '@/components/auth/AuthForm';
import { useAuth } from '@/contexts/AuthContext';

const Auth = () => {
  const { user, loading } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');

  // Redirect if already authenticated
  if (!loading && user) {
    return <Navigate to="/" replace />;
  }

  // Show loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary via-primary-glow to-primary text-primary-foreground">
        <div className="container mx-auto px-4 py-12">
          <div className="text-center max-w-3xl mx-auto animate-fade-in">
            <h1 className="text-4xl md:text-5xl font-bold mb-4">
              {mode === 'signin' ? 'Welcome Back' : 'Join Us'}
            </h1>
            <p className="text-lg md:text-xl opacity-90">
              {mode === 'signin' 
                ? 'Sign in to access your comment screening tools'
                : 'Create an account to start managing your comments'
              }
            </p>
          </div>
        </div>
      </div>

      {/* Auth Form */}
      <div className="container mx-auto px-4 py-12">
        <div className="flex items-center justify-center">
          <div className="max-w-md w-full">
            <div className="mb-6 text-center">
              <Link 
                to="/" 
                className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                ← Back to Home
              </Link>
            </div>
            <AuthForm mode={mode} onModeChange={setMode} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Auth;