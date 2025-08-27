import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Mail, Calendar, CheckCircle, Users, Settings, Target } from 'lucide-react';

export default function BespokeSurveyDesign() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary/20">
      <div className="container mx-auto px-4 py-8">
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Settings className="h-12 w-12 text-primary" />
            <Badge variant="secondary" className="text-lg px-4 py-2">
              Professional Service
            </Badge>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
            Bespoke Survey Structure & Question Design
          </h1>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
            Custom survey design tailored to your specific organizational needs and research objectives, crafted by our registered workplace psychologists.
          </p>
        </div>

        <div className="text-center mb-12">
          <Card className="max-w-2xl mx-auto bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20">
            <CardContent className="p-6">
              <h2 className="text-2xl font-semibold mb-4">Get the Right Data with the Right Questions</h2>
              <p className="text-muted-foreground mb-6">
                Contact us to discuss your requirements and obtain a personalized quote for custom survey design services.
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
                <li>• Initial consultation and needs assessment</li>
                <li>• Research objective clarification</li>
                <li>• Custom question development</li>
                <li>• Survey structure optimization</li>
                <li>• Response scale selection</li>
                <li>• Pilot testing and refinement</li>
                <li>• Implementation guidance</li>
                <li>• Data collection strategy</li>
                <li>• Quality assurance review</li>
                <li>• Final survey documentation</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-6 w-6 text-blue-600" />
                Survey Types We Design
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-muted-foreground">
                <li>• Employee engagement surveys</li>
                <li>• 360-degree feedback assessments</li>
                <li>• Culture and values surveys</li>
                <li>• Leadership effectiveness studies</li>
                <li>• Customer satisfaction surveys</li>
                <li>• Training needs assessments</li>
                <li>• Exit interview questionnaires</li>
                <li>• Pulse surveys and regular check-ins</li>
                <li>• Change management surveys</li>
                <li>• Wellbeing and stress assessments</li>
              </ul>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Why Choose Our Bespoke Survey Design Service?</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground leading-relaxed">
              Generic survey templates often miss the mark because every organization is unique. Our registered workplace psychologists understand the nuances of organizational behavior and research methodology, ensuring your survey captures the data you actually need.
            </p>
            <br />
            <p className="text-muted-foreground leading-relaxed">
              We combine academic rigor with practical experience, creating surveys that are both scientifically sound and organizationally relevant. Our questions are designed to minimize bias, maximize clarity, and produce data that can drive meaningful change in your organization.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}