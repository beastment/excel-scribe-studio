import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, Mail, Phone, MapPin, Send } from 'lucide-react';

const Contact = () => {
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
              <Link to="/contact" className="text-primary font-medium">Contact</Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="bg-gradient-to-r from-primary via-primary-glow to-primary text-primary-foreground">
        <div className="container mx-auto px-4 py-16">
          <div className="max-w-3xl mx-auto text-center animate-fade-in">
            <h1 className="text-4xl md:text-5xl font-bold mb-4">Contact Us</h1>
            <p className="text-lg md:text-xl opacity-90">
              Get in touch to discuss your project and how we can help
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

          <div className="grid lg:grid-cols-2 gap-12">
            {/* Contact Form */}
            <div className="animate-fade-in">
              <h2 className="text-3xl font-bold mb-6">Send us a Message</h2>
              <form className="space-y-6">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="firstName" className="block text-sm font-medium mb-2">
                      First Name
                    </label>
                    <Input id="firstName" placeholder="John" />
                  </div>
                  <div>
                    <label htmlFor="lastName" className="block text-sm font-medium mb-2">
                      Last Name
                    </label>
                    <Input id="lastName" placeholder="Doe" />
                  </div>
                </div>
                
                <div>
                  <label htmlFor="email" className="block text-sm font-medium mb-2">
                    Email Address
                  </label>
                  <Input id="email" type="email" placeholder="john@example.com" />
                </div>
                
                <div>
                  <label htmlFor="subject" className="block text-sm font-medium mb-2">
                    Subject
                  </label>
                  <Input id="subject" placeholder="How can we help you?" />
                </div>
                
                <div>
                  <label htmlFor="message" className="block text-sm font-medium mb-2">
                    Message
                  </label>
                  <Textarea 
                    id="message" 
                    rows={6} 
                    placeholder="Tell us about your project or questions..."
                  />
                </div>
                
                <Button type="submit" className="w-full">
                  Send Message <Send className="ml-2 h-4 w-4" />
                </Button>
              </form>
            </div>

            {/* Contact Information */}
            <div className="animate-fade-in">
              <h2 className="text-3xl font-bold mb-6">Get in Touch</h2>
              <p className="text-muted-foreground mb-8">
                We'd love to hear from you. Send us a message and we'll respond as soon as possible.
              </p>

              <div className="space-y-6">
                <div className="flex items-start space-x-4">
                  <Mail className="h-6 w-6 text-primary mt-1" />
                  <div>
                    <h3 className="font-semibold mb-1">Email</h3>
                    <p className="text-muted-foreground">contact@eastment.com.au</p>
                    <p className="text-muted-foreground">support@eastment.com.au</p>
                  </div>
                </div>

                <div className="flex items-start space-x-4">
                  <Phone className="h-6 w-6 text-primary mt-1" />
                  <div>
                    <h3 className="font-semibold mb-1">Phone</h3>
                    <p className="text-muted-foreground">+61 (0) 123 456 789</p>
                    <p className="text-sm text-muted-foreground">Mon-Fri 9AM-5PM AEST</p>
                  </div>
                </div>

                <div className="flex items-start space-x-4">
                  <MapPin className="h-6 w-6 text-primary mt-1" />
                  <div>
                    <h3 className="font-semibold mb-1">Office</h3>
                    <p className="text-muted-foreground">
                      123 Business Street<br />
                      Sydney, NSW 2000<br />
                      Australia
                    </p>
                  </div>
                </div>
              </div>

              {/* Quick Links */}
              <div className="mt-8 p-6 bg-muted rounded-lg">
                <h3 className="font-semibold mb-4">Quick Links</h3>
                <div className="space-y-2">
                  <Link to="/services" className="block text-sm text-muted-foreground hover:text-primary transition-colors">
                    View Our Services
                  </Link>
                  <Link to="/comments" className="block text-sm text-muted-foreground hover:text-primary transition-colors">
                    Try Comment Editor
                  </Link>
                  <Link to="/about" className="block text-sm text-muted-foreground hover:text-primary transition-colors">
                    About Eastment
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Contact;