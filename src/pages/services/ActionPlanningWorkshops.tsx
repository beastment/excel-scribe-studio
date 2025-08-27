import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Mail, Calendar, CheckCircle, Users, Target, Lightbulb } from 'lucide-react';
import { EditableText } from '@/components/EditableText';

export default function ActionPlanningWorkshops() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary/20">
      <div className="container mx-auto px-4 py-8">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Target className="h-12 w-12 text-primary" />
            <Badge variant="secondary" className="text-lg px-4 py-2">
              Professional Service
            </Badge>
          </div>
          <EditableText
            content="Action Planning Workshops"
            contentKey="action-planning-workshops-title"
            className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent"
            elementType="h1"
          />
          <EditableText
            content="Facilitated workshops to help your team develop concrete action plans based on survey insights, guided by our registered workplace psychologists."
            contentKey="action-planning-workshops-subtitle"
            className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed"
            elementType="p"
          />
        </div>

        {/* Contact CTA */}
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

        {/* Service Overview */}
        <div className="grid md:grid-cols-2 gap-8 mb-12">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="h-6 w-6 text-green-600" />
                Workshop Includes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <EditableText
                content="• Pre-workshop planning session\n• Survey results presentation\n• Facilitated group discussions\n• Priority setting exercises\n• Action planning templates\n• SMART goal development\n• Resource allocation planning\n• Timeline creation\n• Success metrics definition\n• Workshop summary documentation\n• Follow-up support session"
                contentKey="action-planning-workshops-included"
                className="space-y-2"
                elementType="div"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lightbulb className="h-6 w-6 text-blue-600" />
                Workshop Formats
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <EditableText
                content="• Half-day workshops (4 hours)\n• Full-day intensive sessions (8 hours)\n• Multi-session programs (2-3 sessions)\n• Department-specific workshops\n• Leadership team sessions\n• Cross-functional planning meetings\n• Virtual or in-person delivery\n• Custom formats for your needs"
                contentKey="action-planning-workshops-formats"
                className="space-y-2"
                elementType="div"
              />
            </CardContent>
          </Card>
        </div>

        {/* Workshop Structure */}
        <Card className="mb-12">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-6 w-6 text-primary" />
              Typical Workshop Structure
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-4 gap-6">
              <div className="text-center">
                <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-xl font-bold text-primary">1</span>
                </div>
                <h3 className="font-semibold mb-2">Results Review</h3>
                <EditableText
                  content="Comprehensive presentation of survey findings with focus on key insights and priority areas for action."
                  contentKey="action-planning-workshops-step1"
                  className="text-sm text-muted-foreground"
                  elementType="p"
                />
              </div>
              <div className="text-center">
                <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-xl font-bold text-primary">2</span>
                </div>
                <h3 className="font-semibold mb-2">Priority Setting</h3>
                <EditableText
                  content="Facilitated exercises to identify the most important issues and opportunities based on impact and feasibility."
                  contentKey="action-planning-workshops-step2"
                  className="text-sm text-muted-foreground"
                  elementType="p"
                />
              </div>
              <div className="text-center">
                <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-xl font-bold text-primary">3</span>
                </div>
                <h3 className="font-semibold mb-2">Action Planning</h3>
                <EditableText
                  content="Collaborative development of specific, measurable action plans with clear ownership and timelines."
                  contentKey="action-planning-workshops-step3"
                  className="text-sm text-muted-foreground"
                  elementType="p"
                />
              </div>
              <div className="text-center">
                <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-xl font-bold text-primary">4</span>
                </div>
                <h3 className="font-semibold mb-2">Implementation</h3>
                <EditableText
                  content="Planning for execution including resource allocation, communication strategies, and progress monitoring."
                  contentKey="action-planning-workshops-step4"
                  className="text-sm text-muted-foreground"
                  elementType="p"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Key Activities */}
        <Card className="mb-12">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-6 w-6 text-primary" />
              Key Workshop Activities
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-8">
              <div>
                <h3 className="font-semibold text-lg mb-3">Analysis & Discussion</h3>
                <EditableText
                  content="• Data interpretation exercises\n• Root cause analysis\n• Impact assessment activities\n• Stakeholder mapping\n• Barrier identification\n• Opportunity recognition"
                  contentKey="action-planning-workshops-activities1"
                  className="text-sm text-muted-foreground space-y-1"
                  elementType="div"
                />
              </div>
              <div>
                <h3 className="font-semibold text-lg mb-3">Planning & Commitment</h3>
                <EditableText
                  content="• SMART goal setting\n• Action item development\n• Resource requirement planning\n• Timeline creation\n• Success metric definition\n• Accountability assignment"
                  contentKey="action-planning-workshops-activities2"
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
              Benefits of Action Planning Workshops
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-3 gap-6">
              <div>
                <h3 className="font-semibold mb-2">Collective Buy-in</h3>
                <EditableText
                  content="Involving stakeholders in planning creates ownership and commitment to implementation success."
                  contentKey="action-planning-workshops-benefit1"
                  className="text-sm text-muted-foreground"
                  elementType="p"
                />
              </div>
              <div>
                <h3 className="font-semibold mb-2">Practical Solutions</h3>
                <EditableText
                  content="Collaborative approach ensures actions are realistic, achievable, and aligned with organizational capacity."
                  contentKey="action-planning-workshops-benefit2"
                  className="text-sm text-muted-foreground"
                  elementType="p"
                />
              </div>
              <div>
                <h3 className="font-semibold mb-2">Clear Direction</h3>
                <EditableText
                  content="Structured process creates specific, measurable plans that guide implementation and track progress."
                  contentKey="action-planning-workshops-benefit3"
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
            <CardTitle>Why Choose Our Action Planning Workshops?</CardTitle>
          </CardHeader>
          <CardContent>
            <EditableText
              content="Survey data without action is just information. Our action planning workshops bridge the gap between insights and implementation, ensuring your survey investment leads to real organizational improvement.\n\nAs registered workplace psychologists, we understand both the technical aspects of data interpretation and the human dynamics of organizational change. Our facilitation ensures productive discussions, realistic planning, and stakeholder buy-in for successful implementation.\n\nWe use proven methodologies and tools to guide your team through the complex process of turning survey findings into actionable strategies. Our workshops don't just create plans – they build the foundation for sustained organizational improvement and positive change."
              contentKey="action-planning-workshops-why-choose"
              className="text-muted-foreground leading-relaxed whitespace-pre-line"
              elementType="p"
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}