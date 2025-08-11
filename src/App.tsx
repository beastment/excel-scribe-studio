import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, HashRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "next-themes";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Navigation } from "@/components/Navigation";
import { MaintenanceMode } from "@/components/MaintenanceMode";
import { isInIframe, logIframeInfo } from "@/utils/iframeUtils";
import { useMaintenanceMode } from "@/hooks/useMaintenanceMode";
import { useAuth } from "@/contexts/AuthContext";
import { useScrollToTop } from "@/hooks/useScrollToTop";
import { useUserRole } from "@/hooks/useUserRole";
import Home from "./pages/Home";
import About from "./pages/About";
import FAQ from "./pages/FAQ";
import Contact from "./pages/Contact";
import Auth from "./pages/Auth";
import CommentEditor from "./pages/CommentEditor";
import Dashboard from "./pages/Dashboard";
import NotFound from "./pages/NotFound";

import CommentDeIdentification from "./pages/apps/CommentDeIdentification";
import ThematicAnalysis from "./pages/apps/ThematicAnalysis";
import ActionPlanningExtension from "./pages/apps/ActionPlanningExtension";
import ReportWriter from "./pages/apps/ReportWriter";

const queryClient = new QueryClient();

const AppContent = () => {
  const { maintenanceStatus, loading } = useMaintenanceMode();
  const { user } = useAuth();
  const { canBypassMaintenance, loading: roleLoading } = useUserRole();
  
  // Scroll to top on route change
  useScrollToTop();
  
  // Check if we should show maintenance mode
  const shouldShowMaintenance = !loading && !roleLoading && maintenanceStatus.isEnabled && !canBypassMaintenance();

  return (
    <>
      <Navigation />
      <Routes>
        <Route path="/" element={
          shouldShowMaintenance ? 
            <MaintenanceMode /> : 
            <Home />
        } />
        <Route path="/about" element={
          shouldShowMaintenance ? 
            <MaintenanceMode /> : 
            <About />
        } />
        <Route path="/faq" element={
          shouldShowMaintenance ? 
            <MaintenanceMode /> : 
            <FAQ />
        } />
        <Route path="/contact" element={
          shouldShowMaintenance ? 
            <MaintenanceMode /> : 
            <Contact />
        } />
        <Route path="/auth" element={<Auth />} />
        
        <Route path="/comments" element={
          shouldShowMaintenance ? 
            <MaintenanceMode /> : 
            <ProtectedRoute>
              <CommentEditor />
            </ProtectedRoute>
        } />
        <Route path="/dashboard" element={
          shouldShowMaintenance ? 
            <MaintenanceMode /> : 
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
        } />
        <Route path="/apps/comment-de-identification" element={
          shouldShowMaintenance ? 
            <MaintenanceMode /> : 
            <CommentDeIdentification />
        } />
        <Route path="/apps/thematic-analysis" element={
          shouldShowMaintenance ? 
            <MaintenanceMode /> : 
            <ThematicAnalysis />
        } />
        <Route path="/apps/action-planning-extension" element={
          shouldShowMaintenance ? 
            <MaintenanceMode /> : 
            <ActionPlanningExtension />
        } />
        <Route path="/apps/report-writer" element={
          shouldShowMaintenance ? 
            <MaintenanceMode /> : 
            <ReportWriter />
        } />
        {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
};

const App = () => {
  // Detect if we're in an iframe and log info for debugging
  const inIframe = isInIframe();
  
  // Log iframe information for debugging
  if (inIframe) {
    logIframeInfo();
  }

  // Use HashRouter for iframe compatibility, BrowserRouter otherwise
  const Router = inIframe ? HashRouter : BrowserRouter;

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <Router>
              <AppContent />
            </Router>
          </TooltipProvider>
        </ThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
