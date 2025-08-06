import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowRight, FileText, Shield, Zap, MessageSquare, BarChart3 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
const Home = () => {
  const {
    user
  } = useAuth();
  return <div className="min-h-screen bg-background">

      {/* Hero Section */}
      <div className="relative bg-background text-foreground">
        <div className="container mx-auto px-4 py-16">
          <div className="text-center max-w-5xl mx-auto animate-fade-in">
            <div className="text-sm text-muted-foreground mb-6 flex items-center justify-center gap-2">
              <Shield className="h-4 w-4" />
              Powered by Enterprise Grade AI
            </div>
            <h1 className="text-4xl lg:text-6xl font-bold text-gray-900 mb-6 leading-tight">
              Leverage AI to Unlock the
              <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent"> True Voice </span>
              in Your Employee Feedback
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-3xl mx-auto">
              Our suite of AI-powered tools helps you analyze, understand, and act on 
              employee feedback faster and more effectively than ever before.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              {user ? <Button size="lg" className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg">
                  <Link to="/comments" className="flex items-center">
                    Start Screening Comments <ArrowRight className="ml-2 h-5 w-5" />
                  </Link>
                </Button> : <>
                  <Button size="lg" className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg">
                    <Link to="/auth" className="flex items-center">
                      Explore Our AI Tools <ArrowRight className="ml-2 h-5 w-5" />
                    </Link>
                  </Button>
                  <Button size="lg" variant="outline" className="border-primary text-primary hover:bg-primary hover:text-primary-foreground">
                    <Link to="/services" className="flex items-center">
                      Learn More
                    </Link>
                  </Button>
                </>}
            </div>
          </div>
        </div>
      </div>

      {/* Applications Section */}
      <div className="container mx-auto px-4 py-20">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Powerful AI Applications</h2>
          <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
            Choose from our suite of specialized applications, each designed to supercharge a 
            specific part of your feedback analysis workflow.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-6xl mx-auto">
          {/* Comment De-Identification */}
          <div className="bg-card rounded-xl border p-8 shadow-card hover:shadow-lg transition-all duration-300 animate-fade-in">
            <div className="flex items-start gap-4 mb-6">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <MessageSquare className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1">
                <div className="text-sm text-muted-foreground mb-1">Starting at</div>
                <div className="text-2xl font-bold">$199</div>
              </div>
              <div className="text-xs bg-orange-100 text-orange-600 px-2 py-1 rounded">
                In Development
              </div>
            </div>
            <h3 className="text-xl font-semibold mb-3">Comment De-Identification</h3>
            <p className="text-muted-foreground mb-6">
              Securely anonymize open-ended comments while preserving the 
              original tone and intent.
            </p>
            <div className="space-y-2 mb-6">
              <div className="flex items-center text-sm text-muted-foreground">
                <div className="w-2 h-2 bg-green-500 rounded-full mr-3"></div>
                PII & Sensitive Data Redaction
              </div>
              <div className="flex items-center text-sm text-muted-foreground">
                <div className="w-2 h-2 bg-green-500 rounded-full mr-3"></div>
                Tone & Context Preservation
              </div>
              <div className="flex items-center text-sm text-muted-foreground">
                <div className="w-2 h-2 bg-green-500 rounded-full mr-3"></div>
                Bulk Processing API
              </div>
            </div>
            {user ? <Button variant="secondary" className="w-full">
                <Link to="/comments">Try Now</Link>
              </Button> : <Button variant="secondary" className="w-full">
                <Link to="/auth">Sign Up to Try</Link>
              </Button>}
          </div>

          {/* Thematic Analysis */}
          <div className="bg-card rounded-xl border p-8 shadow-card hover:shadow-lg transition-all duration-300 animate-fade-in">
            <div className="flex items-start gap-4 mb-6">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <BarChart3 className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1">
                <div className="text-sm text-muted-foreground mb-1">Coming Soon</div>
              </div>
              <div className="text-xs bg-orange-100 text-orange-600 px-2 py-1 rounded">
                In Development
              </div>
            </div>
            <h3 className="text-xl font-semibold mb-3">Thematic Analysis</h3>
            <p className="text-muted-foreground mb-6">
              Automatically discover and categorize key themes and sentiment from 
              thousands of employee comments.
            </p>
            <div className="space-y-2 mb-6">
              <div className="flex items-center text-sm text-muted-foreground">
                <div className="w-2 h-2 bg-green-500 rounded-full mr-3"></div>
                AI-Powered Topic Modeling
              </div>
              <div className="flex items-center text-sm text-muted-foreground">
                <div className="w-2 h-2 bg-green-500 rounded-full mr-3"></div>
                Sentiment Analysis
              </div>
              <div className="flex items-center text-sm text-muted-foreground">
                <div className="w-2 h-2 bg-green-500 rounded-full mr-3"></div>
                Emerging Trend Identification
              </div>
            </div>
            <Button variant="secondary" className="w-full">
              Coming Soon
            </Button>
          </div>

          {/* Action Planning Extension */}
          <div className="bg-card rounded-xl border p-8 shadow-card hover:shadow-lg transition-all duration-300 animate-fade-in">
            <div className="flex items-start gap-4 mb-6">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Zap className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1">
                <div className="text-sm text-muted-foreground mb-1">Coming Soon</div>
              </div>
              <div className="text-xs bg-orange-100 text-orange-600 px-2 py-1 rounded">
                In Development
              </div>
            </div>
            <h3 className="text-xl font-semibold mb-3">Action Planning Extension</h3>
            <p className="text-muted-foreground mb-6">
              Turn insights into concrete action plans with AI suggested initiatives and 
              progress tracking.
            </p>
            <div className="space-y-2 mb-6">
              <div className="flex items-center text-sm text-muted-foreground">
                <div className="w-2 h-2 bg-green-500 rounded-full mr-3"></div>
                AI-Generated Action Items
              </div>
              <div className="flex items-center text-sm text-muted-foreground">
                <div className="w-2 h-2 bg-green-500 rounded-full mr-3"></div>
                Goal & Progress Tracking
              </div>
              <div className="flex items-center text-sm text-muted-foreground">
                <div className="w-2 h-2 bg-green-500 rounded-full mr-3"></div>
                Manager Accountability Tools
              </div>
            </div>
            <Button variant="secondary" className="w-full">
              Coming Soon
            </Button>
          </div>

          {/* Report Writer */}
          <div className="bg-card rounded-xl border p-8 shadow-card hover:shadow-lg transition-all duration-300 animate-fade-in">
            <div className="flex items-start gap-4 mb-6">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <FileText className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1">
                <div className="text-sm text-muted-foreground mb-1">Coming Soon</div>
              </div>
              <div className="text-xs bg-orange-100 text-orange-600 px-2 py-1 rounded">
                In Development
              </div>
            </div>
            <h3 className="text-xl font-semibold mb-3">Report Writer</h3>
            <p className="text-muted-foreground mb-6">
              Instantly generate executive summaries and narrative reports from your 
              quantitative and qualitative data.
            </p>
            <div className="space-y-2 mb-6">
              <div className="flex items-center text-sm text-muted-foreground">
                <div className="w-2 h-2 bg-green-500 rounded-full mr-3"></div>
                Automated Narrative Generation
              </div>
              <div className="flex items-center text-sm text-muted-foreground">
                <div className="w-2 h-2 bg-green-500 rounded-full mr-3"></div>
                Custom Report Templates
              </div>
              <div className="flex items-center text-sm text-muted-foreground">
                <div className="w-2 h-2 bg-green-500 rounded-full mr-3"></div>
                Data Visualization Integration
              </div>
            </div>
            <Button variant="secondary" className="w-full">
              Coming Soon
            </Button>
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="bg-gradient-footer text-black-20">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4 text-slate-950">
            Ready to Revolutionize Your Data Process?
          </h2>
          <p className="text-lg opacity-90 mb-8 max-w-2xl mx-auto text-slate-950">
            Join hundreds of organizations that have transformed their data analysis with our platform.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            {user ? <Button size="lg" variant="secondary" className="bg-white text-primary hover:bg-gray-100">
                <Link to="/comments">Start Screening</Link>
              </Button> : <>
                <Button size="lg" variant="secondary" className="bg-white text-primary hover:bg-gray-100">
                  <Link to="/auth">Start Free Trial</Link>
                </Button>
                
              </>}
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-background border-t py-12">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <h3 className="text-lg font-semibold mb-4">SurveyJumper</h3>
              <p className="text-muted-foreground">AI based tools for leveraging your survey data</p>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Services</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><Link to="/services" className="hover:text-primary">Consultation</Link></li>
                <li><Link to="/services" className="hover:text-primary">Document Processing</Link></li>
                <li><Link to="/services" className="hover:text-primary">Business Solutions</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Tools</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><Link to="/comments" className="hover:text-primary">Comment Editor</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Contact</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><Link to="/contact" className="hover:text-primary">Get in Touch</Link></li>
                <li><Link to="/about" className="hover:text-primary">About Us</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t mt-8 pt-8 text-center text-sm text-muted-foreground">
            <p>© 2025 SurveyJumper. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>;
};
export default Home;