import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowRight, FileText, Building, Users, Mail } from 'lucide-react';

const Home = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="text-2xl font-bold text-primary">Eastment</div>
            <div className="hidden md:flex space-x-8">
              <Link to="/" className="text-foreground hover:text-primary transition-colors">Home</Link>
              <Link to="/about" className="text-foreground hover:text-primary transition-colors">About</Link>
              <Link to="/services" className="text-foreground hover:text-primary transition-colors">Services</Link>
              <Link to="/comments" className="text-foreground hover:text-primary transition-colors">Comment Editor</Link>
              <Link to="/contact" className="text-foreground hover:text-primary transition-colors">Contact</Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="bg-gradient-to-r from-primary via-primary-glow to-primary text-primary-foreground">
        <div className="container mx-auto px-4 py-24">
          <div className="text-center max-w-4xl mx-auto animate-fade-in">
            <h1 className="text-5xl md:text-6xl font-bold mb-6">
              Welcome to Eastment
            </h1>
            <p className="text-xl md:text-2xl opacity-90 mb-8">
              Professional services and innovative solutions for your business needs
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" variant="secondary" asChild>
                <Link to="/services">
                  Our Services <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link to="/comments">
                  Try Comment Editor <FileText className="ml-2 h-5 w-5" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div className="container mx-auto px-4 py-20">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Why Choose Eastment?</h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            We provide innovative solutions and professional services tailored to your specific needs
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          <div className="text-center p-6 rounded-lg border bg-card animate-fade-in">
            <Building className="h-12 w-12 text-primary mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">Professional Services</h3>
            <p className="text-muted-foreground">
              Expert consultation and services to help your business grow and succeed
            </p>
          </div>
          
          <div className="text-center p-6 rounded-lg border bg-card animate-fade-in">
            <FileText className="h-12 w-12 text-primary mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">Document Solutions</h3>
            <p className="text-muted-foreground">
              Advanced tools for document processing and content management
            </p>
          </div>
          
          <div className="text-center p-6 rounded-lg border bg-card animate-fade-in">
            <Users className="h-12 w-12 text-primary mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">Client-Focused</h3>
            <p className="text-muted-foreground">
              Dedicated support and personalized solutions for every client
            </p>
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="bg-muted py-20">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Ready to Get Started?</h2>
          <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
            Contact us today to learn how we can help your business reach its full potential
          </p>
          <Button size="lg" asChild>
            <Link to="/contact">
              Contact Us <Mail className="ml-2 h-5 w-5" />
            </Link>
          </Button>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-background border-t py-12">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <h3 className="text-lg font-semibold mb-4">Eastment</h3>
              <p className="text-muted-foreground">
                Professional services and innovative solutions for modern businesses
              </p>
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
            <p>&copy; 2024 Eastment. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Home;