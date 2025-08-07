import React, { useState, useEffect } from 'react';
import { Navigate, Link, useSearchParams } from 'react-router-dom';
import { AuthForm } from '@/components/auth/AuthForm';
import { useAuth } from '@/contexts/AuthContext';

const Auth = () => {
  const { user, loading } = useAuth();
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<'signin' | 'signup' | 'reset'>('signin');

  useEffect(() => {
    // Check if this is a password reset redirect
    const type = searchParams.get('type');
    const hash = window.location.hash;
    
    if (type === 'recovery') {
      // If we have tokens in the URL hash, redirect to password reset page
      if (hash.includes('access_token') && hash.includes('refresh_token')) {
        const hashParams = new URLSearchParams(hash.substring(1));
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');
        
        // Redirect to password reset page with tokens as query params
        window.location.href = `/password-reset?access_token=${accessToken}&refresh_token=${refreshToken}`;
        return;
      }
      setMode('reset');
    }
    
    // Also check URL hash directly for password reset tokens (without type parameter)
    if (hash.includes('access_token') && hash.includes('refresh_token') && !type) {
      const hashParams = new URLSearchParams(hash.substring(1));
      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');
      
      if (accessToken && refreshToken) {
        window.location.href = `/password-reset?access_token=${accessToken}&refresh_token=${refreshToken}`;
        return;
      }
    }
  }, [searchParams]);

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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 pt-20">
      {/* Hero Section - consistent with home page */}
      <section className="relative overflow-hidden py-16 lg:py-24">
        <div className="absolute inset-0 bg-grid-slate-100 [mask-image:linear-gradient(0deg,white,rgba(255,255,255,0.6))] -z-10"></div>
        
        <div className="max-w-4xl mx-auto px-6 text-center">
          <div className="inline-flex items-center space-x-2 bg-blue-100 text-blue-800 px-4 py-2 rounded-full text-sm font-medium mb-6">
            <span>Secure Access</span>
          </div>
          
          <h1 className="text-4xl lg:text-5xl font-bold text-gray-900 mb-6 leading-tight">
            {mode === 'signin' ? 'Welcome Back' : mode === 'signup' ? 'Join Our Community' : 'Reset Password'}
          </h1>
          
          <p className="text-xl text-gray-600 mb-8 leading-relaxed max-w-2xl mx-auto">
            {mode === 'signin' 
              ? 'Sign in to access your AI-powered employee feedback tools'
              : mode === 'signup'
              ? 'Create an account to start leveraging the power of AI for your employee feedback'
              : 'Enter your new password below'
            }
          </p>
        </div>
        
        {/* Floating Elements - consistent with home */}
        <div className="absolute top-10 left-10 w-16 h-16 bg-blue-200 rounded-full opacity-20 animate-pulse"></div>
        <div className="absolute bottom-10 right-20 w-24 h-24 bg-purple-200 rounded-full opacity-20 animate-pulse delay-700"></div>
      </section>

      {/* Auth Form Section */}
      <section className="pb-20">
        <div className="max-w-md mx-auto px-6">
          <div className="mb-6 text-center">
            <Link 
              to="/" 
              className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              ← Back to Home
            </Link>
          </div>
          <AuthForm mode={mode} onModeChange={setMode} />
        </div>
      </section>
    </div>
  );
};

export default Auth;