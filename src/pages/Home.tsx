import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EditableText } from '@/components/EditableText';
import { EditableFeatureList } from '@/components/EditableFeatureList';
import { Shield, BrainCircuit, ClipboardList, FileText, ArrowRight, Star, Settings } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

interface AppConfiguration {
  id: string;
  app_id: string;
  name: string;
  description: string | null;
  is_enabled: boolean;
  is_hidden: boolean;
  is_blurred: boolean;
  status: string;
  position: number | null;
}

interface UserProfile {
  role: 'admin' | 'user' | 'partner';
}

const Home = () => {
  const { user } = useAuth();
  const [appConfigs, setAppConfigs] = useState<AppConfiguration[]>([]);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAppConfigurations();
    if (user) {
      fetchUserProfile();
    }
  }, [user]);

  const fetchAppConfigurations = async () => {
    try {
      const { data, error } = await supabase
        .from('app_configurations')
        .select('*')
        .eq('is_hidden', false) // Only fetch non-hidden apps
        .order('position');

      if (error) throw error;
      setAppConfigs(data || []);
    } catch (error) {
      console.error('Error fetching app configurations:', error);
    } finally {
      if (!user) {
        setLoading(false);
      }
    }
  };

  const fetchUserProfile = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('user_id', user.id)
        .single();

      if (error) throw error;
      setUserProfile(data);
    } catch (error) {
      console.error('Error fetching user profile:', error);
    } finally {
      setLoading(false);
    }
  };
  
  // Static app data that gets merged with database configurations
  const staticApps = {
    "action-planning-extension": {
      name: "Action Planning Extension",
      description: "Turn feedback into concrete action plans with AI-suggested initiatives and progress tracking.",
      icon: ClipboardList,
      color: "from-green-500 to-emerald-500",
      features: ["AI-Generated Action Items", "Goal & Progress Tracking", "Manager Accountability Tools"],
      startingPrice: "$149"
    },
    "thematic-analysis": {
      name: "Thematic Analysis",
      description: "Automatically discover and categorize key themes and sentiment from thousands of employee comments.",
      icon: BrainCircuit,
      color: "from-purple-500 to-pink-500",
      features: ["AI-Powered Topic Modeling", "Sentiment Analysis", "Emerging Trend Identification"],
      startingPrice: "$299"
    },
    "comment-de-identification": {
      name: "Comment De-Identification",
      description: "Securely anonymize open-ended employee comments while preserving the original tone and intent.",
      icon: Shield,
      color: "from-blue-500 to-cyan-500",
      features: ["PII & Sensitive Data Redaction", "Tone & Context Preservation", "Bulk Processing API"],
      startingPrice: "$199"
    },
    "report-writer": {
      name: "Report Writer",
      description: "Instantly generate executive summaries and narrative reports from your quantitative and qualitative data.",
      icon: FileText,
      color: "from-orange-500 to-red-500",
      features: ["Automated Narrative Generation", "Custom Report Templates", "Data Visualization Integration"],
      startingPrice: "$249"
    },
    "consulting-services": {
      name: "Consulting Services",
      description: "When AI is not enough, and you need HI: Human Intelligence. Our professional consultants are registered workplace psychologists.",
      icon: Shield,
      color: "from-purple-500 to-pink-500",
      features: ["Registered Workplace Psychologists", "Survey Strategy & Management", "Action Planning Workshops"],
      startingPrice: "Contact Us"
    }
  };

  // Merge static app data with database configurations and automatically re-arrange
  const apps = appConfigs
    .map(config => ({
      id: config.app_id,
      ...staticApps[config.app_id as keyof typeof staticApps],
      is_enabled: config.is_enabled,
      is_blurred: config.is_blurred,
      status: config.status,
      position: config.position
    }))
    .filter(app => app.name) // Filter out any apps that don't have static data
    .sort((a, b) => (a.position || 0) - (b.position || 0)); // Sort by position to maintain order

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center pt-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }
  return <div className="pt-20">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-background to-secondary py-12 lg:py-20">
        <div className="absolute inset-0 bg-grid-slate-100 [mask-image:linear-gradient(0deg,white,rgba(255,255,255,0.6))] -z-10"></div>
        
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-4xl mx-auto">
            <div className="inline-flex items-center space-x-2 bg-primary/10 text-primary px-4 py-2 rounded-full text-sm font-medium mb-4">
              <Star className="w-4 h-4" />
              <span>Powered by Enterprise-Grade AI</span>
            </div>
            
            <EditableText 
              contentKey="home-hero-title"
              as="h1"
              className="text-4xl lg:text-6xl font-bold text-foreground mb-6 leading-tight"
            >
              Leverage AI to Unlock the
            </EditableText>
            <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              <EditableText contentKey="home-hero-title-highlight"> True Voice </EditableText>
            </span>
            <EditableText 
              contentKey="home-hero-title-end"
              className="text-4xl lg:text-6xl font-bold text-foreground mb-6 leading-tight"
            >
              in Your Employee Feedback
            </EditableText>
            
            <EditableText 
              contentKey="home-hero-subtitle"
              as="p"
              className="text-xl text-muted-foreground mb-10 leading-relaxed max-w-3xl mx-auto"
            >
              Our suite of AI-powered tools helps you analyze, understand, and act on employee feedback faster and more effectively than ever before.
            </EditableText>
            
            <div className="flex flex-col sm:flex-row items-center justify-center space-y-4 sm:space-y-0 sm:space-x-6">
              {user ? <Link to="/comments">
                  <Button className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-8 py-4 text-lg rounded-xl shadow-lg hover:shadow-xl transition-all duration-300">
                    Start Screening Comments
                    <ArrowRight className="ml-2 w-5 h-5" />
                  </Button>
                </Link> : <a href="https://www.youtube.com/watch?v=demo-video" target="_blank" rel="noopener noreferrer">
                  <Button className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-8 py-4 text-lg rounded-xl shadow-lg hover:shadow-xl transition-all duration-300">
                    Explore Our AI Tools
                    <ArrowRight className="ml-2 w-5 h-5" />
                  </Button>
                </a>}
            </div>
          </div>
        </div>
        
        {/* Floating Elements */}
        <div className="absolute top-20 left-10 w-20 h-20 bg-blue-200 rounded-full opacity-20 animate-pulse"></div>
        <div className="absolute bottom-20 right-20 w-32 h-32 bg-purple-200 rounded-full opacity-20 animate-pulse delay-700"></div>
      </section>

      {/* Apps Showcase Section */}
      <section id="apps" className="py-12 bg-gradient-to-br from-background to-secondary">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <EditableText 
              contentKey="home-apps-title"
              as="h2"
              className="text-3xl lg:text-4xl font-bold text-foreground mb-4"
            >
              Powerful AI Applications
            </EditableText>
            <EditableText 
              contentKey="home-apps-subtitle"
              as="p"
              className="text-xl text-muted-foreground max-w-3xl mx-auto"
            >
              Choose from our suite of specialized applications, each designed to supercharge a specific part of your feedback analysis workflow. No need to change providers, our offerings leverage your existing survey platform.
            </EditableText>
          </div>
          
          <div className={`grid gap-8 ${apps.length === 1 ? 'lg:grid-cols-1 max-w-2xl mx-auto' : apps.length === 3 ? 'lg:grid-cols-2 xl:grid-cols-3' : 'lg:grid-cols-2'}`}>
            {apps.map((app, index) => {
              const isDisabled = !app.is_enabled;
              const isAdmin = userProfile?.role === 'admin';
              const shouldAllowClick = app.is_enabled || isAdmin;
              
              return (
                <Card key={app.id} className={`border-0 shadow-lg hover:shadow-2xl transition-all duration-500 hover:-translate-y-1 bg-card overflow-hidden group ${isDisabled ? 'opacity-60' : ''} ${app.is_blurred ? 'blur' : ''}`}>
                  <CardContent className="p-0">
                    <div className={`h-2 bg-gradient-to-r ${app.color}`}></div>
                    <div className="p-8">
                      <div className="flex items-start justify-between mb-6">
                        <div className={`w-14 h-14 bg-gradient-to-br ${app.color} rounded-2xl flex items-center justify-center`}>
                          <app.icon className="w-7 h-7 text-white" />
                        </div>
                        <div className="text-right">
                          {app.status === "Live" ? (
                            <Badge className="bg-green-100 text-green-800">
                              <Star className="w-3 h-3 mr-1" />
                              Live
                            </Badge>
                          ) : app.status === "Just Released" ? (
                            <Badge className="bg-emerald-100 text-emerald-800">
                              <Star className="w-3 h-3 mr-1" />
                              Just Released
                            </Badge>
                          ) : app.status === "Currently in Beta" ? (
                            <Badge className="bg-blue-100 text-blue-800">
                              <Star className="w-3 h-3 mr-1" />
                              Currently in Beta
                            </Badge>
                          ) : app.status === "In Development" ? (
                            <Badge className="bg-orange-100 text-orange-800">
                              <Settings className="w-3 h-3 mr-1" />
                              In Development
                            </Badge>
                          ) : app.status === "Planned" ? (
                            <Badge className="bg-gray-100 text-gray-800">
                              <Settings className="w-3 h-3 mr-1" />
                              Planned
                            </Badge>
                          ) : app.status === "Under Maintenance" ? (
                            <Badge className="bg-red-100 text-red-800">
                              <Settings className="w-3 h-3 mr-1" />
                              Under Maintenance
                            </Badge>
                          ) : app.status !== "None" ? (
                            <Badge className="bg-orange-100 text-orange-800">
                              <Settings className="w-3 h-3 mr-1" />
                              {app.status}
                            </Badge>
                          ) : null}
                        </div>
                      </div>
                      
                       <EditableText 
                         contentKey={`app-name-${app.id}`}
                         as="h3"
                         className="text-2xl font-semibold mb-4 text-card-foreground"
                       >
                         {app.name}
                       </EditableText>
                       <EditableText 
                         contentKey={`app-description-${app.id}`}
                         as="p"
                         className="text-muted-foreground mb-6 leading-relaxed h-20"
                       >
                         {app.description}
                       </EditableText>
                      
                       <EditableFeatureList
                         appId={app.id}
                         features={app.features}
                         color={app.color}
                       />
                      
                      {shouldAllowClick ? (
                        <Link to={`/apps/${app.id}`}>
                          <Button className="w-full bg-foreground hover:bg-foreground/90 text-background py-3 rounded-xl font-medium transition-all duration-300 group-hover:shadow-lg">
                            Learn More
                            <ArrowRight className="ml-2 w-5 h-5" />
                          </Button>
                        </Link>
                      ) : (
                        <Button 
                          className="w-full bg-muted text-muted-foreground py-3 rounded-xl font-medium cursor-not-allowed opacity-50" 
                          disabled
                        >
                          Temporarily Unavailable
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-r from-blue-600 to-purple-600">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <EditableText 
            contentKey="cta-title"
            as="h2"
            className="text-3xl lg:text-4xl font-bold text-white mb-6"
          >
            Ready to Revolutionize Your Feedback Process?
          </EditableText>
          <EditableText 
            contentKey="cta-subtitle"
            as="p"
            className="text-xl text-blue-100 mb-10"
          >
            Join hundreds of organizations that have transformed their employee experience with our platform.
          </EditableText>
          
           <div className="flex flex-col sm:flex-row items-center justify-center space-y-4 sm:space-y-0 sm:space-x-6">
             {user ? <Link to="/comments">
                  <Button className="bg-card text-primary hover:bg-card/90 px-8 py-4 text-lg rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all duration-300">
                   Start Screening
                 </Button>
               </Link> : <Link to="/contact">
                 <Button className="bg-card text-primary hover:bg-card/90 px-8 py-4 text-lg rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all duration-300">
                   Get in Touch
                 </Button>
               </Link>}
          </div>
        </div>
      </section>
    </div>;
};
export default Home;