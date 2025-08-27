import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Mail, Calendar, CheckCircle, Users, User, Shield } from 'lucide-react';

export default function DebriefSessions() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary/20">
      <div className="container mx-auto px-4 py-8">
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-3 mb-4">
            <User className="h-12 w-12 text-primary" />
            <Badge variant="secondary" className="text-lg px-4 py-2">
              Professional Service
            </Badge>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
            360-Degree Debrief Sessions for CEOs, Executives, and Senior Managers
          </h1>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
            Confidential one-on-one debrief sessions with senior leadership to discuss survey results and development opportunities with our registered workplace psychologists.
          </p>
        </div>

        <div className="text-center mb-12">
          <Card className="max-w-2xl mx-auto bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20">
            <CardContent className="p-6">
              <h2 className="text-2xl font-semibold mb-4">Confidential Leadership Development</h2>
              <p className="text-muted-foreground mb-6">
                Contact us to discuss your requirements and obtain a personalized quote for executive debrief sessions.
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
                Session Includes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-muted-foreground">
                <li>• Personalized feedback analysis</li>
                <li>• Individual performance insights</li>
                <li>• Leadership style assessment</li>
                <li>• Development opportunity identification</li>
                <li>• Confidential discussion space</li>
                <li>• Goal setting and action planning</li>
                <li>• Ongoing development recommendations</li>
                <li>• Follow-up support sessions</li>
                <li>• Written development summary</li>
                <li>• Progress tracking guidance</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-6 w-6 text-blue-600" />
                Confidentiality Assurance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-muted-foreground">
                <li>• Strictly confidential sessions</li>
                <li>• Professional psychological standards</li>
                <li>• No organizational reporting</li>
                <li>• Secure discussion environment</li>
                <li>• Individual data protection</li>
                <li>• Optional sharing decisions</li>
                <li>• Professional therapeutic boundaries</li>
                <li>• Ethical practice guidelines</li>
                <li>• Trust-based relationship building</li>
              </ul>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Why Choose Our 360-Degree Debrief Sessions?</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground leading-relaxed">
              360-degree feedback can be overwhelming and emotionally challenging for senior leaders. Our registered workplace psychologists provide the professional support and expertise needed to turn feedback into meaningful development opportunities.
            </p>
            <br />
            <p className="text-muted-foreground leading-relaxed">
              We understand the unique pressures and responsibilities of senior leadership roles. Our debrief sessions are designed specifically for executives who need confidential, professional support to process feedback and develop strategic approaches to leadership improvement.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}