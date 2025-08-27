import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Mail, Calendar, CheckCircle, Users, Briefcase, Clock } from 'lucide-react';

export default function ProjectManagement() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary/20">
      <div className="container mx-auto px-4 py-8">
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Briefcase className="h-12 w-12 text-primary" />
            <Badge variant="secondary" className="text-lg px-4 py-2">
              Professional Service
            </Badge>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
            End to End Survey Project Management
          </h1>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
            Complete survey project management from initial planning through final reporting and implementation, handled by our experienced workplace psychology team.
          </p>
        </div>

        <div className="text-center mb-12">
          <Card className="max-w-2xl mx-auto bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20">
            <CardContent className="p-6">
              <h2 className="text-2xl font-semibold mb-4">Let Us Handle Everything</h2>
              <p className="text-muted-foreground mb-6">
                Contact us to discuss your requirements and obtain a personalized quote for complete survey project management.
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
                Complete Service Includes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-muted-foreground">
                <li>• Project planning and timeline development</li>
                <li>• Survey design and customization</li>
                <li>• Stakeholder engagement strategy</li>
                <li>• Communication and launch campaigns</li>
                <li>• Data collection management</li>
                <li>• Quality assurance and monitoring</li>
                <li>• Data analysis and interpretation</li>
                <li>• Report writing and visualization</li>
                <li>• Results presentation</li>
                <li>• Implementation support and follow-up</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-6 w-6 text-blue-600" />
                Typical Timeline
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-muted-foreground">
                <li>• Week 1-2: Project scoping and planning</li>
                <li>• Week 3-4: Survey design and testing</li>
                <li>• Week 5: Launch preparation and communication</li>
                <li>• Week 6-8: Data collection period</li>
                <li>• Week 9-10: Analysis and report preparation</li>
                <li>• Week 11: Results presentation</li>
                <li>• Week 12+: Implementation support</li>
                <li className="pt-2 text-sm">*Timeline may vary based on project scope and organization size</li>
              </ul>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Why Choose Our Project Management Service?</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground leading-relaxed">
              Survey projects can be complex, time-consuming, and resource-intensive. Our end-to-end project management service removes all the burden from your organization while ensuring professional execution at every stage.
            </p>
            <br />
            <p className="text-muted-foreground leading-relaxed">
              As registered workplace psychologists with extensive project management experience, we understand both the technical requirements and organizational dynamics that make survey projects successful. We handle everything from stakeholder management to technical implementation, allowing you to focus on your core business.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}