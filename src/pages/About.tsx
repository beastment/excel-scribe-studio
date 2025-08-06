import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Target, Award, Users } from 'lucide-react';

const About = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="text-2xl font-bold text-primary">Eastment</div>
            <div className="hidden md:flex space-x-8">
              <Link to="/" className="text-foreground hover:text-primary transition-colors">Home</Link>
              <Link to="/about" className="text-primary font-medium">About</Link>
              <Link to="/services" className="text-foreground hover:text-primary transition-colors">Services</Link>
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
            <h1 className="text-4xl md:text-5xl font-bold mb-4">About Eastment</h1>
            <p className="text-lg md:text-xl opacity-90">
              Delivering professional services and innovative solutions since our founding
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-4xl mx-auto">
          <Button variant="ghost" asChild className="mb-8">
            <Link to="/">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Home
            </Link>
          </Button>

          <div className="grid lg:grid-cols-2 gap-12 mb-16">
            <div className="animate-fade-in">
              <h2 className="text-3xl font-bold mb-6">Our Story</h2>
              <p className="text-muted-foreground mb-4">
                Eastment was founded with a vision to provide exceptional professional services and innovative 
                solutions that help businesses thrive in today's competitive landscape.
              </p>
              <p className="text-muted-foreground mb-4">
                Our team combines years of industry experience with cutting-edge technology to deliver 
                results that exceed expectations. We believe in building long-term partnerships with our 
                clients, understanding their unique challenges, and providing tailored solutions.
              </p>
              <p className="text-muted-foreground">
                From document processing tools to comprehensive business solutions, we're committed to 
                innovation and excellence in everything we do.
              </p>
            </div>

            <div className="space-y-6 animate-fade-in">
              <div className="flex items-start space-x-4">
                <Target className="h-8 w-8 text-primary mt-1" />
                <div>
                  <h3 className="text-xl font-semibold mb-2">Our Mission</h3>
                  <p className="text-muted-foreground">
                    To empower businesses with innovative solutions and professional services that drive growth and success.
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-4">
                <Award className="h-8 w-8 text-primary mt-1" />
                <div>
                  <h3 className="text-xl font-semibold mb-2">Our Values</h3>
                  <p className="text-muted-foreground">
                    Excellence, integrity, innovation, and client satisfaction are at the core of everything we do.
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-4">
                <Users className="h-8 w-8 text-primary mt-1" />
                <div>
                  <h3 className="text-xl font-semibold mb-2">Our Team</h3>
                  <p className="text-muted-foreground">
                    A dedicated team of professionals with diverse expertise and a shared commitment to excellence.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Call to Action */}
          <div className="text-center bg-muted rounded-lg p-8 animate-fade-in">
            <h2 className="text-2xl font-bold mb-4">Ready to Work Together?</h2>
            <p className="text-muted-foreground mb-6">
              Let's discuss how we can help your business achieve its goals
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button asChild>
                <Link to="/contact">Get in Touch</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link to="/services">View Our Services</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default About;