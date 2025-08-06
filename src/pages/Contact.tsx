import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft, Mail, Phone, MapPin, Send, MessageCircle, Clock, Shield } from 'lucide-react';

const Contact = () => {
  return (
    <div className="pt-20">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-50 to-blue-50 py-20 lg:py-32">
        <div className="absolute inset-0 bg-grid-slate-100 [mask-image:linear-gradient(0deg,white,rgba(255,255,255,0.6))] -z-10"></div>
        
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-4xl mx-auto">
            <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-500 rounded-3xl flex items-center justify-center mx-auto mb-8">
              <MessageCircle className="w-10 h-10 text-white" />
            </div>
            
            <h1 className="text-4xl lg:text-6xl font-bold text-gray-900 mb-6 leading-tight">
              Get in
              <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent"> Touch</span>
            </h1>
            
            <p className="text-xl text-gray-600 mb-10 leading-relaxed max-w-3xl mx-auto">
              Ready to transform your feedback analysis process? Our team of experts is here to help you get started with our AI-powered platform.
            </p>
            
            <Button variant="ghost" asChild className="mb-8">
              <Link to="/">
                <ArrowLeft className="mr-2 h-4 w-4" /> Back to Home
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Content */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-16">
            {/* Contact Form */}
            <Card className="border-0 shadow-xl">
              <CardContent className="p-8">
                <h2 className="text-3xl font-bold mb-6 text-gray-900">Send us a Message</h2>
                <form className="space-y-6">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="firstName" className="block text-sm font-medium mb-2 text-gray-700">
                        First Name
                      </label>
                      <Input id="firstName" placeholder="John" className="border-gray-200 focus:border-blue-500" />
                    </div>
                    <div>
                      <label htmlFor="lastName" className="block text-sm font-medium mb-2 text-gray-700">
                        Last Name
                      </label>
                      <Input id="lastName" placeholder="Doe" className="border-gray-200 focus:border-blue-500" />
                    </div>
                  </div>
                  
                  <div>
                    <label htmlFor="email" className="block text-sm font-medium mb-2 text-gray-700">
                      Email Address
                    </label>
                    <Input id="email" type="email" placeholder="john@company.com" className="border-gray-200 focus:border-blue-500" />
                  </div>
                  
                  <div>
                    <label htmlFor="subject" className="block text-sm font-medium mb-2 text-gray-700">
                      Subject
                    </label>
                    <Input id="subject" placeholder="How can we help you?" className="border-gray-200 focus:border-blue-500" />
                  </div>
                  
                  <div>
                    <label htmlFor="message" className="block text-sm font-medium mb-2 text-gray-700">
                      Message
                    </label>
                    <Textarea 
                      id="message" 
                      rows={6} 
                      placeholder="Tell us about your feedback analysis needs..."
                      className="border-gray-200 focus:border-blue-500"
                    />
                  </div>
                  
                  <Button type="submit" className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white py-3 rounded-xl font-medium transition-all duration-300">
                    Send Message <Send className="ml-2 h-4 w-4" />
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* Contact Information */}
            <div className="space-y-8">
              <div>
                <h2 className="text-3xl font-bold mb-6 text-gray-900">Contact Information</h2>
                <p className="text-xl text-gray-600 mb-8">
                  Ready to transform your feedback analysis? Our Australian-based team is here to help you get started.
                </p>
              </div>

              <div className="space-y-6">
                <Card className="border-0 shadow-lg hover:shadow-xl transition-all duration-300">
                  <CardContent className="p-6">
                    <div className="flex items-start space-x-4">
                      <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-500 rounded-xl flex items-center justify-center">
                        <Mail className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <h3 className="font-semibold mb-2 text-gray-900">Email</h3>
                        <p className="text-gray-600">support@surveyjumper.com</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-0 shadow-lg hover:shadow-xl transition-all duration-300">
                  <CardContent className="p-6">
                    <div className="flex items-start space-x-4">
                      <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-500 rounded-xl flex items-center justify-center">
                        <Clock className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <h3 className="font-semibold mb-2 text-gray-900">Response Time</h3>
                        <p className="text-gray-600">Within 24 hours</p>
                        <p className="text-sm text-gray-500">Mon-Fri 9AM-5PM AEST</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-0 shadow-lg hover:shadow-xl transition-all duration-300">
                  <CardContent className="p-6">
                    <div className="flex items-start space-x-4">
                      <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-red-500 rounded-xl flex items-center justify-center">
                        <MapPin className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <h3 className="font-semibold mb-2 text-gray-900">Location</h3>
                        <p className="text-gray-600">
                          Australia-based team<br />
                          100% Australian data sovereignty
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Security Highlight */}
              <Card className="border-0 bg-gradient-to-br from-blue-50 to-purple-50 shadow-lg">
                <CardContent className="p-6">
                  <div className="flex items-start space-x-4">
                    <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-500 rounded-xl flex items-center justify-center">
                      <Shield className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="font-semibold mb-2 text-gray-900">Data Security Promise</h3>
                      <p className="text-gray-600">
                        Your data stays in Australia, encrypted and secure. We're committed to the highest standards of privacy protection.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-r from-blue-600 to-purple-600">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-3xl lg:text-4xl font-bold text-white mb-6">
            Ready to Get Started?
          </h2>
          <p className="text-xl text-blue-100 mb-10">
            Join Australian organizations who trust us with their most sensitive employee feedback data.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center space-y-4 sm:space-y-0 sm:space-x-6">
            <Link to="/faq">
              <Button className="bg-white text-blue-600 hover:bg-gray-50 px-8 py-4 text-lg rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all duration-300">
                View FAQ
              </Button>
            </Link>
            <Link to="/about">
              <Button variant="outline" className="border-2 border-white text-white hover:bg-white hover:text-blue-600 px-8 py-4 text-lg rounded-xl transition-all duration-300">
                About Us
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Contact;