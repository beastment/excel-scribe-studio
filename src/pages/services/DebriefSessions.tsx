import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Mail, Calendar, CheckCircle, Users, User, Shield } from 'lucide-react';
import { EditableText } from '@/components/EditableText';

export default function DebriefSessions() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary/20">
      <div className="container mx-auto px-4 py-8">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-3 mb-4">
            <User className="h-12 w-12 text-primary" />
            <Badge variant="secondary" className="text-lg px-4 py-2">
              Professional Service
            </Badge>
          </div>
          <EditableText
            content="360-Degree Debrief Sessions for CEOs, Executives, and Senior Managers"
            contentKey="debrief-sessions-title"
            className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent"
            elementType="h1"
          />
          <EditableText
            content="Confidential one-on-one debrief sessions with senior leadership to discuss survey results and development opportunities with our registered workplace psychologists."
            contentKey="debrief-sessions-subtitle"
            className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed"
            elementType="p"
          />
        </div>

        {/* Contact CTA */}
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

        {/* Service Overview */}
        <div className="grid md:grid-cols-2 gap-8 mb-12">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="h-6 w-6 text-green-600" />
                Session Includes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <EditableText
                content="• Personalized feedback analysis\n• Individual performance insights\n• Leadership style assessment\n• Development opportunity identification\n• Confidential discussion space\n• Goal setting and action planning\n• Ongoing development recommendations\n• Follow-up support sessions\n• Written development summary\n• Progress tracking guidance"
                contentKey="debrief-sessions-included"
                className="space-y-2"
                elementType="div"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-6 w-6 text-blue-600" />
                Confidentiality Assurance
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <EditableText
                content="• Strictly confidential sessions\n• Professional psychological standards\n• No organizational reporting\n• Secure discussion environment\n• Individual data protection\n• Optional sharing decisions\n• Professional therapeutic boundaries\n• Ethical practice guidelines\n• Trust-based relationship building"
                contentKey="debrief-sessions-confidentiality"
                className="space-y-2"
                elementType="div"
              />
            </CardContent>
          </Card>
        </div>

        {/* Session Structure */}
        <Card className="mb-12">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-6 w-6 text-primary" />
              Typical Session Structure
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-3 gap-6">
              <div className="text-center">
                <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-xl font-bold text-primary">1</span>
                </div>
                <h3 className="font-semibold mb-2">Data Review (30 mins)</h3>
                <EditableText
                  content="Comprehensive review of your individual 360-degree feedback data, including strengths, development areas, and patterns."
                  contentKey="debrief-sessions-structure1"
                  className="text-sm text-muted-foreground"
                  elementType="p"
                />
              </div>
              <div className="text-center">
                <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-xl font-bold text-primary">2</span>
                </div>
                <h3 className="font-semibold mb-2">Discussion & Insights (45 mins)</h3>
                <EditableText
                  content="Open discussion about the feedback, exploring context, reactions, and implications for your leadership development."
                  contentKey="debrief-sessions-structure2"
                  className="text-sm text-muted-foreground"
                  elementType="p"
                />
              </div>
              <div className="text-center">
                <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-xl font-bold text-primary">3</span>
                </div>
                <h3 className="font-semibold mb-2">Action Planning (30 mins)</h3>
                <EditableText
                  content="Collaborative development of specific, actionable goals and strategies for continued leadership growth and improvement."
                  contentKey="debrief-sessions-structure3"
                  className="text-sm text-muted-foreground"
                  elementType="p"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Who Benefits */}
        <Card className="mb-12">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-6 w-6 text-primary" />
              Who Benefits from Debrief Sessions?
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-8">
              <div>
                <h3 className="font-semibold text-lg mb-3">Senior Leadership Roles</h3>
                <EditableText
                  content="• Chief Executive Officers (CEOs)\n• Chief Operating Officers (COOs)\n• Chief Financial Officers (CFOs)\n• Division Presidents\n• Vice Presidents\n• Senior Directors\n• Department Heads\n• Team Leaders with significant responsibility"
                  contentKey="debrief-sessions-roles"
                  className="text-sm text-muted-foreground space-y-1"
                  elementType="div"
                />
              </div>
              <div>
                <h3 className="font-semibold text-lg mb-3">Development Scenarios</h3>
                <EditableText
                  content="• New leadership appointments\n• Performance improvement initiatives\n• Succession planning preparation\n• Leadership style refinement\n• Career transition support\n• Conflict resolution needs\n• Team effectiveness challenges\n• Strategic change management"
                  contentKey="debrief-sessions-scenarios"
                  className="text-sm text-muted-foreground space-y-1"
                  elementType="div"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Benefits */}
        <Card className="mb-12">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-6 w-6 text-primary" />
              Benefits of Professional Debrief Sessions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-3 gap-6">
              <div>
                <h3 className="font-semibold mb-2">Safe Space for Growth</h3>
                <EditableText
                  content="Provides a confidential environment to process feedback and explore development opportunities without judgment."
                  contentKey="debrief-sessions-benefit1"
                  className="text-sm text-muted-foreground"
                  elementType="p"
                />
              </div>
              <div>
                <h3 className="font-semibold mb-2">Expert Interpretation</h3>
                <EditableText
                  content="Professional psychologists help you understand the deeper implications of feedback and identify actionable insights."
                  contentKey="debrief-sessions-benefit2"
                  className="text-sm text-muted-foreground"
                  elementType="p"
                />
              </div>
              <div>
                <h3 className="font-semibold mb-2">Personalized Development</h3>
                <EditableText
                  content="Receive tailored recommendations and strategies that align with your unique leadership style and organizational context."
                  contentKey="debrief-sessions-benefit3"
                  className="text-sm text-muted-foreground"
                  elementType="p"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Why Choose Our Service */}
        <Card>
          <CardHeader>
            <CardTitle>Why Choose Our 360-Degree Debrief Sessions?</CardTitle>
          </CardHeader>
          <CardContent>
            <EditableText
              content="360-degree feedback can be overwhelming and emotionally challenging for senior leaders. Our registered workplace psychologists provide the professional support and expertise needed to turn feedback into meaningful development opportunities.\n\nWe understand the unique pressures and responsibilities of senior leadership roles. Our debrief sessions are designed specifically for executives who need confidential, professional support to process feedback and develop strategic approaches to leadership improvement.\n\nWith years of experience working with senior leaders across various industries, we know how to facilitate productive conversations that lead to real behavioral change and improved leadership effectiveness. Our approach is both supportive and challenging, helping you maximize the value of your 360-degree feedback investment."
              contentKey="debrief-sessions-why-choose"
              className="text-muted-foreground leading-relaxed whitespace-pre-line"
              elementType="p"
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}