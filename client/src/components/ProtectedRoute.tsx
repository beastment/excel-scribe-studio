import React, { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { AuthModal } from './AuthModal';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Lock, UserPlus, LogIn } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  title?: string;
  description?: string;
}

export function ProtectedRoute({ 
  children, 
  title = "Authentication Required",
  description = "Please sign in to access this feature"
}: ProtectedRouteProps) {
  const { isAuthenticated, isLoading } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full p-8 text-center">
          <div className="mb-6">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Lock className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-2xl font-bold mb-2">{title}</h1>
            <p className="text-muted-foreground">{description}</p>
          </div>

          <div className="space-y-3">
            <Button 
              onClick={() => {
                setAuthMode('login');
                setShowAuthModal(true);
              }}
              className="w-full"
            >
              <LogIn className="w-4 h-4 mr-2" />
              Sign In
            </Button>
            
            <Button 
              onClick={() => {
                setAuthMode('register');
                setShowAuthModal(true);
              }}
              variant="outline"
              className="w-full"
            >
              <UserPlus className="w-4 h-4 mr-2" />
              Create Account
            </Button>
          </div>
        </Card>

        <AuthModal 
          isOpen={showAuthModal}
          onClose={() => setShowAuthModal(false)}
          defaultMode={authMode}
        />
      </div>
    );
  }

  return <>{children}</>;
}