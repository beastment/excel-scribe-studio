import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Mail, Calendar, CheckCircle, Users, Target, Lightbulb } from 'lucide-react';

export default function ActionPlanningWorkshops() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary/20">
      <div className="container mx-auto px-4 py-8">
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Target className="h-12 w-12 text-primary" />
            <Badge variant="secondary" className="text-lg px-4 py-2">
              Professional Service
            </Badge>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
            Action Planning Workshops
          </h1>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
            Facilitated workshops to help your team develop concrete action plans based on survey insights, guided by our registered workplace psychologists.
          </p>
        </div>

        <div className="text-center mb-12">
          <Card className="max-w-2xl mx-auto bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20">
            <CardContent className="p-6">
              <h2 className="text-2xl font-semibold mb-4">Turn Insights into Action</h2>
              <p className="text-muted-foreground mb-6">
                Contact us to discuss your requirements and obtain a personalized quote for action planning workshops.
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
                Workshop Includes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-muted-foreground">
                <li>• Pre-workshop planning session</li>
                <li>• Survey results presentation</li>
                <li>• Facilitated group discussions</li>
                <li>• Priority setting exercises</li>
                <li>• Action planning templates</li>
                <li>• SMART goal development</li>
                <li>• Resource allocation planning</li>
                <li>• Timeline creation</li>
                <li>• Success metrics definition</li>
                <li>• Workshop summary documentation</li>
                <li>• Follow-up support session</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lightbulb className="h-6 w-6 text-blue-600" />
                Workshop Formats
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-muted-foreground">
                <li>• Half-day workshops (4 hours)</li>
                <li>• Full-day intensive sessions (8 hours)</li>
                <li>• Multi-session programs (2-3 sessions)</li>
                <li>• Department-specific workshops</li>
                <li>• Leadership team sessions</li>
                <li>• Cross-functional planning meetings</li>
                <li>• Virtual or in-person delivery</li>
                <li>• Custom formats for your needs</li>
              </ul>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Why Choose Our Action Planning Workshops?</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground leading-relaxed">
              Survey data without action is just information. Our action planning workshops bridge the gap between insights and implementation, ensuring your survey investment leads to real organizational improvement.
            </p>
            <br />
            <p className="text-muted-foreground leading-relaxed">
              As registered workplace psychologists, we understand both the technical aspects of data interpretation and the human dynamics of organizational change. Our facilitation ensures productive discussions, realistic planning, and stakeholder buy-in for successful implementation.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}