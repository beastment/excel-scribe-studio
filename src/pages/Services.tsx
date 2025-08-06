import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Building, FileText, Users, Zap, Shield, Headphones } from 'lucide-react';

const Services = () => {
  const services = [
    {
      icon: Building,
      title: "Business Consultation",
      description: "Strategic guidance and expert advice to help your business grow and optimize operations.",
      features: ["Strategic Planning", "Process Optimization", "Market Analysis", "Growth Strategy"]
    },
    {
      icon: FileText,
      title: "Document Solutions",
      description: "Advanced document processing and management tools for efficient content handling.",
      features: ["Document Processing", "Content Management", "File Conversion", "Data Extraction"]
    },
    {
      icon: Users,
      title: "Team Solutions",
      description: "Collaborative tools and services to enhance team productivity and communication.",
      features: ["Team Collaboration", "Project Management", "Communication Tools", "Workflow Optimization"]
    },
    {
      icon: Zap,
      title: "Automation Services",
      description: "Streamline your processes with custom automation solutions and integrations.",
      features: ["Process Automation", "System Integration", "Custom Scripts", "Workflow Design"]
    },
    {
      icon: Shield,
      title: "Security & Compliance",
      description: "Ensure your business meets industry standards with our security and compliance services.",
      features: ["Security Audits", "Compliance Consulting", "Risk Assessment", "Data Protection"]
    },
    {
      icon: Headphones,
      title: "Support & Training",
      description: "Comprehensive support and training to ensure you get the most from our solutions.",
      features: ["24/7 Support", "User Training", "Documentation", "Ongoing Maintenance"]
    }
  ];

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
              <Link to="/services" className="text-primary font-medium">Services</Link>
              <Link to="/comments" className="text-foreground hover:text-primary transition-colors">Comment Editor</Link>
              <Link to="/contact" className="text-foreground hover:text-primary transition-colors">Contact</Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="bg-gradient-to-r from-primary via-primary-glow to-primary text-primary-foreground">
        <div className="container mx-auto px-4 py-16">
          <div className="max-w-3xl mx-auto text-center animate-fade-in">
            <h1 className="text-4xl md:text-5xl font-bold mb-4">Our Services</h1>
            <p className="text-lg md:text-xl opacity-90">
              Comprehensive solutions tailored to your business needs
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-6xl mx-auto">
          <Button variant="ghost" asChild className="mb-8">
            <Link to="/">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Home
            </Link>
          </Button>

          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">What We Offer</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              From consultation to implementation, we provide end-to-end solutions that drive results
            </p>
          </div>

          {/* Services Grid */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16">
            {services.map((service, index) => (
              <div key={index} className="bg-card rounded-lg border p-6 hover:shadow-lg transition-shadow animate-fade-in">
                <service.icon className="h-12 w-12 text-primary mb-4" />
                <h3 className="text-xl font-semibold mb-3">{service.title}</h3>
                <p className="text-muted-foreground mb-4">{service.description}</p>
                <ul className="space-y-2">
                  {service.features.map((feature, idx) => (
                    <li key={idx} className="text-sm text-muted-foreground flex items-center">
                      <div className="w-2 h-2 bg-primary rounded-full mr-2"></div>
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Featured Tool */}
          <div className="bg-muted rounded-lg p-8 mb-16 animate-fade-in">
            <div className="grid lg:grid-cols-2 gap-8 items-center">
              <div>
                <h2 className="text-3xl font-bold mb-4">Featured Tool: Comment Editor</h2>
                <p className="text-muted-foreground mb-6">
                  Try our powerful Excel Comment Editor - upload your files and edit comments with ease. 
                  Perfect for content management, data processing, and collaborative document editing.
                </p>
                <div className="flex flex-col sm:flex-row gap-4">
                  <Button asChild>
                    <Link to="/comments">Try Comment Editor</Link>
                  </Button>
                  <Button variant="outline" asChild>
                    <Link to="/contact">Learn More</Link>
                  </Button>
                </div>
              </div>
              <div className="bg-background rounded-lg p-6 border">
                <FileText className="h-16 w-16 text-primary mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-center mb-2">Excel Comment Screening</h3>
                <p className="text-sm text-muted-foreground text-center">
                  Upload .xlsx, .xls, or .csv files and edit comments with our intuitive interface
                </p>
              </div>
            </div>
          </div>

          {/* Call to Action */}
          <div className="text-center bg-card rounded-lg border p-8 animate-fade-in">
            <h2 className="text-2xl font-bold mb-4">Ready to Get Started?</h2>
            <p className="text-muted-foreground mb-6">
              Contact us today to discuss your specific needs and how we can help
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button asChild>
                <Link to="/contact">Contact Us</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link to="/about">Learn About Us</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Services;