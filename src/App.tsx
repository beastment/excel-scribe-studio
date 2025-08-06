import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, HashRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Navigation } from "@/components/Navigation";
import { MaintenanceMode } from "@/components/MaintenanceMode";
import { isInIframe, logIframeInfo } from "@/utils/iframeUtils";
import { useMaintenanceMode } from "@/hooks/useMaintenanceMode";
import { useAuth } from "@/contexts/AuthContext";
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
  
  // Check if current user is admin
  const isAdminUser = user?.email === 'admin@surveyjumper.com';

  return (
    <>
      <Navigation />
      <Routes>
        <Route path="/" element={
          !loading && maintenanceStatus.isEnabled && !isAdminUser ? 
            <MaintenanceMode /> : 
            <Home />
        } />
        <Route path="/about" element={
          !loading && maintenanceStatus.isEnabled && !isAdminUser ? 
            <MaintenanceMode /> : 
            <About />
        } />
        <Route path="/faq" element={
          !loading && maintenanceStatus.isEnabled && !isAdminUser ? 
            <MaintenanceMode /> : 
            <FAQ />
        } />
        <Route path="/contact" element={
          !loading && maintenanceStatus.isEnabled && !isAdminUser ? 
            <MaintenanceMode /> : 
            <Contact />
        } />
        <Route path="/auth" element={<Auth />} />
        <Route path="/comments" element={
          !loading && maintenanceStatus.isEnabled && !isAdminUser ? 
            <MaintenanceMode /> : 
            <ProtectedRoute>
              <CommentEditor />
            </ProtectedRoute>
        } />
        <Route path="/dashboard" element={
          !loading && maintenanceStatus.isEnabled && !isAdminUser ? 
            <MaintenanceMode /> : 
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
        } />
        <Route path="/apps/comment-de-identification" element={
          !loading && maintenanceStatus.isEnabled && !isAdminUser ? 
            <MaintenanceMode /> : 
            <CommentDeIdentification />
        } />
        <Route path="/apps/thematic-analysis" element={
          !loading && maintenanceStatus.isEnabled && !isAdminUser ? 
            <MaintenanceMode /> : 
            <ThematicAnalysis />
        } />
        <Route path="/apps/action-planning-extension" element={
          !loading && maintenanceStatus.isEnabled && !isAdminUser ? 
            <MaintenanceMode /> : 
            <ActionPlanningExtension />
        } />
        <Route path="/apps/report-writer" element={
          !loading && maintenanceStatus.isEnabled && !isAdminUser ? 
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
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <Router>
            <AppContent />
          </Router>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
