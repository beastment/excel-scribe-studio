import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, HashRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Navigation } from "@/components/Navigation";
import { isInIframe, logIframeInfo } from "@/utils/iframeUtils";
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
            <Navigation />
            <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/about" element={<About />} />
            <Route path="/faq" element={<FAQ />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/comments" element={
              <ProtectedRoute>
                <CommentEditor />
              </ProtectedRoute>
            } />
            <Route path="/dashboard" element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            } />
            <Route path="/apps/comment-de-identification" element={<CommentDeIdentification />} />
            <Route path="/apps/thematic-analysis" element={<ThematicAnalysis />} />
            <Route path="/apps/action-planning-extension" element={<ActionPlanningExtension />} />
            <Route path="/apps/report-writer" element={<ReportWriter />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Router>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
