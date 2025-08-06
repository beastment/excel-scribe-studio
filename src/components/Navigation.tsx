import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { LogOut, User } from 'lucide-react';
export const Navigation = () => {
  const {
    user,
    signOut
  } = useAuth();
  const location = useLocation();
  const handleSignOut = async () => {
    await signOut();
  };
  const isActive = (path: string) => location.pathname === path;
  return <nav className="bg-background border-b">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center space-x-8">
            <Link to="/" className="text-xl font-bold text-primary">SurveyJumper</Link>
            
            <div className="hidden md:flex space-x-4">
              <Link to="/" className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${isActive('/') ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                Home
              </Link>
              <Link to="/about" className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${isActive('/about') ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                About
              </Link>
              <Link to="/services" className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${isActive('/services') ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                Services
              </Link>
              <Link to="/contact" className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${isActive('/contact') ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                Contact
              </Link>
              {user && <Link to="/comments" className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${isActive('/comments') ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                  Comments
                </Link>}
            </div>
          </div>

          <div className="flex items-center space-x-4">
            {user ? <div className="flex items-center space-x-3">
                <div className="flex items-center space-x-2 text-sm">
                  <User className="h-4 w-4" />
                  <span className="text-muted-foreground">{user.email}</span>
                </div>
                <Button variant="outline" size="sm" onClick={handleSignOut}>
                  <LogOut className="h-4 w-4 mr-2" />
                  Sign Out
                </Button>
              </div> : <Link to="/auth">
                <Button variant="default">Sign In</Button>
              </Link>}
          </div>
        </div>
      </div>
    </nav>;
};