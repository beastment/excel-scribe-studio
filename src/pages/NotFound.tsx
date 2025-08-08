import { useLocation } from "react-router-dom";
import { useEffect } from "react";

const NotFound = () => {
  const location = useLocation();

  // Track 404 errors for analytics if needed
  useEffect(() => {
    // Error tracking could be implemented here with proper analytics service
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-emerald-light/5 to-muted">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">404</h1>
        <p className="text-xl text-gray-600 mb-4">Oops! Page not found</p>
        <a href="/" className="text-emerald hover:text-emerald-light underline font-medium">
          Return to Home
        </a>
      </div>
    </div>
  );
};

export default NotFound;
