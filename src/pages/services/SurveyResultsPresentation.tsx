import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Mail, Calendar, CheckCircle, Users, BarChart, FileText } from 'lucide-react';

export default function SurveyResultsPresentation() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary/20">
      <div className="container mx-auto px-4 py-8">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-3 mb-4">
            <BarChart className="h-12 w-12 text-primary" />
            <Badge variant="secondary" className="text-lg px-4 py-2">
              Professional Service
            </Badge>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
            Presentation of Survey Results
          </h1>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
            Professional presentation and interpretation of your survey findings with expert insights and actionable recommendations from our registered workplace psychologists.
          </p>
        </div>

        {/* Contact CTA */}
        <div className="text-center mb-12">
          <Card className="max-w-2xl mx-auto bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20">
            <CardContent className="p-6">
              <h2 className="text-2xl font-semibold mb-4">Ready to Transform Your Survey Data?</h2>
              <p className="text-muted-foreground mb-6">
                Contact us to discuss your requirements and obtain a personalized quote for professional survey results presentation.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button size="lg" className="gap-2">
                  <Mail className="h-5 w-5" />
                  Contact Us for Quote
                </Button>
                <Button variant="outline" size="lg" className="gap-2">
                  <Calendar className="h-5 w-5" />
                  Schedule Consultation
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Service Overview */}
        <div className="grid md:grid-cols-2 gap-8 mb-12">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="h-6 w-6 text-green-600" />
                What's Included
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-muted-foreground">
                <li>• Professional data visualization and charts</li>
                <li>• Statistical analysis and interpretation</li>
                <li>• Key findings summary and insights</li>
                <li>• Actionable recommendations</li>
                <li>• Executive summary for leadership</li>
                <li>• Interactive presentation delivery</li>
                <li>• Q&A session with our psychologists</li>
                <li>• Follow-up support and clarifications</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-6 w-6 text-blue-600" />
                Who Benefits
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-muted-foreground">
                <li>• Senior leadership teams</li>
                <li>• HR departments</li>
                <li>• Department managers</li>
                <li>• Board members</li>
                <li>• Change management teams</li>
                <li>• Organizational development professionals</li>
                <li>• Anyone responsible for acting on survey results</li>
              </ul>
            </CardContent>
          </Card>
        </div>

        {/* Why Choose Our Service */}
        <Card>
          <CardHeader>
            <CardTitle>Why Choose Our Professional Presentation Service?</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground leading-relaxed">
              Our team consists of registered workplace psychologists with extensive experience in organizational research and development. We don't just present data – we provide context, interpretation, and strategic insights that help you understand what your survey results really mean for your organization.
            </p>
            <br />
            <p className="text-muted-foreground leading-relaxed">
              With years of experience working with organizations of all sizes, we know how to communicate complex data in a way that's accessible to all stakeholders, from frontline managers to C-suite executives. Our presentations are designed to not just inform, but to inspire action and drive positive organizational change.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}