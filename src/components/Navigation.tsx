import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';

export const Navigation = () => {
  const { user, signOut } = useAuth();
  const location = useLocation();
  
  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <header className="fixed top-0 w-full bg-white/90 backdrop-blur-lg border-b border-gray-100 z-50">
      <nav className="max-w-7xl mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          <Link to="/" className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl flex items-center justify-center">
              <span className="text-white font-bold text-lg">S</span>
            </div>
            <span className="text-xl font-semibold text-gray-900">SurveyJumper</span>
          </Link>
          
          <div className="hidden md:flex items-center space-x-8">
            <Link to="/" className="text-gray-600 hover:text-gray-900 transition-colors">
              Home
            </Link>
            <a href="/#apps" className="text-gray-600 hover:text-gray-900 transition-colors">
              Apps
            </a>
            <Link to="/about" className="text-gray-600 hover:text-gray-900 transition-colors">
              About
            </Link>
            <Link to="/services" className="text-gray-600 hover:text-gray-900 transition-colors">
              Services
            </Link>
            <Link to="/contact" className="text-gray-600 hover:text-gray-900 transition-colors">
              Contact
            </Link>

            {user ? (
              <>
                <Link to="/comments" className="text-gray-600 hover:text-gray-900 transition-colors font-medium">
                  Dashboard
                </Link>
                <Button variant="outline" onClick={handleSignOut}>
                  Logout
                </Button>
              </>
            ) : (
              <Link to="/auth">
                <Button className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-2 rounded-lg font-medium hover:shadow-lg transition-all duration-300">
                  Login / Sign Up
                </Button>
              </Link>
            )}
          </div>
        </div>
      </nav>
    </header>
  );
};