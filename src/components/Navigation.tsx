import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useUserRole } from '@/hooks/useUserRole';
import { useEditMode } from '@/contexts/EditModeContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { User, LogOut, LayoutDashboard, ChevronDown, Edit } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';

export const Navigation = () => {
  const { user, signOut } = useAuth();
  const { isAdmin } = useUserRole();
  const { isEditMode, toggleEditMode } = useEditMode();
  const location = useLocation();
  
  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <header className="fixed top-0 w-full bg-background/90 backdrop-blur-lg border-b border-border z-50">
      <nav className="max-w-7xl mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          <Link to="/" className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl flex items-center justify-center">
              <span className="text-white font-bold text-lg">S</span>
            </div>
            <span className="text-xl font-semibold text-foreground">SurveyJumper</span>
          </Link>
          
          <div className="hidden md:flex items-center space-x-8">
            <Link to="/" className="text-muted-foreground hover:text-foreground transition-colors">
              Home
            </Link>
            <Link to="/about" className="text-muted-foreground hover:text-foreground transition-colors">
              About
            </Link>
            <Link to="/faq" className="text-muted-foreground hover:text-foreground transition-colors">
              FAQ
            </Link>
            <Link to="/contact" className="text-muted-foreground hover:text-foreground transition-colors">
              Contact
            </Link>

            <ThemeToggle />
            
            {/* Admin Edit Mode Toggle */}
            {user && isAdmin() && (
              <Button
                onClick={toggleEditMode}
                variant={isEditMode ? "default" : "outline"}
                size="sm"
                className="flex items-center space-x-2"
              >
                <Edit className="w-4 h-4" />
                <span>{isEditMode ? 'Exit Edit' : 'Edit Mode'}</span>
              </Button>
            )}
            
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="flex items-center space-x-2 text-muted-foreground hover:text-foreground">
                    <User size={16} />
                    <span>{user.user_metadata?.full_name || user.email?.split('@')[0] || 'User'}</span>
                    <ChevronDown size={14} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem asChild>
                    <Link to="/dashboard" className="flex items-center space-x-2 px-2 py-1.5 text-sm cursor-pointer">
                      <LayoutDashboard size={16} />
                      <span>Dashboard</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    onClick={handleSignOut}
                    className="flex items-center space-x-2 px-2 py-1.5 text-sm cursor-pointer text-destructive"
                  >
                    <LogOut size={16} />
                    <span>Logout</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
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