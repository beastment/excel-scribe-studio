import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Mail, Calendar, CheckCircle, Users, FileText, Target } from 'lucide-react';

export default function WrittenRecommendations() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary/20">
      <div className="container mx-auto px-4 py-8">
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-3 mb-4">
            <FileText className="h-12 w-12 text-primary" />
            <Badge variant="secondary" className="text-lg px-4 py-2">
              Professional Service
            </Badge>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
            Written Recommendations for Action
          </h1>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
            Comprehensive written reports with actionable recommendations based on your survey data and organizational context, delivered by our registered workplace psychologists.
          </p>
        </div>

        <div className="text-center mb-12">
          <Card className="max-w-2xl mx-auto bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20">
            <CardContent className="p-6">
              <h2 className="text-2xl font-semibold mb-4">Transform Data into Strategic Action</h2>
              <p className="text-muted-foreground mb-6">
                Contact us to discuss your requirements and obtain a personalized quote for comprehensive written recommendations.
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
                <li>• Comprehensive analysis report (15-30 pages)</li>
                <li>• Executive summary for leadership</li>
                <li>• Detailed findings by theme/department</li>
                <li>• Prioritized action recommendations</li>
                <li>• Implementation timeline suggestions</li>
                <li>• Success metrics and KPIs</li>
                <li>• Resource requirement estimates</li>
                <li>• Risk assessment and mitigation strategies</li>
                <li>• Follow-up consultation call</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-6 w-6 text-blue-600" />
                Report Focus Areas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-muted-foreground">
                <li>• Leadership and management effectiveness</li>
                <li>• Employee engagement and satisfaction</li>
                <li>• Communication and culture improvement</li>
                <li>• Performance and productivity enhancement</li>
                <li>• Change management strategies</li>
                <li>• Team dynamics and collaboration</li>
                <li>• Training and development needs</li>
                <li>• Work-life balance and wellbeing initiatives</li>
              </ul>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Why Choose Our Written Recommendations?</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground leading-relaxed">
              Our written recommendations go beyond simple data interpretation. As registered workplace psychologists, we understand the complex dynamics of organizational change and human behavior. Our reports provide not just what needs to be done, but how to do it effectively.
            </p>
            <br />
            <p className="text-muted-foreground leading-relaxed">
              Each recommendation is tailored to your organization's unique context, culture, and constraints. We consider factors like change readiness, resource availability, and stakeholder dynamics to ensure our suggestions are not only theoretically sound but practically implementable.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}