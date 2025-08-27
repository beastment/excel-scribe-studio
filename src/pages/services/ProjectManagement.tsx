import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Mail, Calendar, CheckCircle, Users, Briefcase, Clock } from 'lucide-react';
import { EditableText } from '@/components/EditableText';

export default function ProjectManagement() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary/20">
      <div className="container mx-auto px-4 py-8">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Briefcase className="h-12 w-12 text-primary" />
            <Badge variant="secondary" className="text-lg px-4 py-2">
              Professional Service
            </Badge>
          </div>
          <EditableText
            content="End to End Survey Project Management"
            contentKey="project-management-title"
            className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent"
            elementType="h1"
          />
          <EditableText
            content="Complete survey project management from initial planning through final reporting and implementation, handled by our experienced workplace psychology team."
            contentKey="project-management-subtitle"
            className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed"
            elementType="p"
          />
        </div>

        {/* Contact CTA */}
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

        {/* Service Overview */}
        <div className="grid md:grid-cols-2 gap-8 mb-12">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="h-6 w-6 text-green-600" />
                Complete Service Includes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <EditableText
                content="• Project planning and timeline development\n• Survey design and customization\n• Stakeholder engagement strategy\n• Communication and launch campaigns\n• Data collection management\n• Quality assurance and monitoring\n• Data analysis and interpretation\n• Report writing and visualization\n• Results presentation\n• Implementation support and follow-up"
                contentKey="project-management-included"
                className="space-y-2"
                elementType="div"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-6 w-6 text-blue-600" />
                Typical Timeline
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <EditableText
                content="• Week 1-2: Project scoping and planning\n• Week 3-4: Survey design and testing\n• Week 5: Launch preparation and communication\n• Week 6-8: Data collection period\n• Week 9-10: Analysis and report preparation\n• Week 11: Results presentation\n• Week 12+: Implementation support\n\n*Timeline may vary based on project scope and organization size"
                contentKey="project-management-timeline"
                className="space-y-2"
                elementType="div"
              />
            </CardContent>
          </Card>
        </div>

        {/* Project Phases */}
        <Card className="mb-12">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Briefcase className="h-6 w-6 text-primary" />
              Project Management Phases
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-8">
              <div className="space-y-6">
                <div>
                  <h3 className="font-semibold text-lg mb-2">Phase 1: Planning & Design</h3>
                  <EditableText
                    content="• Stakeholder mapping and engagement\n• Objective setting and success metrics\n• Survey design and customization\n• Communication strategy development\n• Timeline and resource planning"
                    contentKey="project-management-phase1"
                    className="text-sm text-muted-foreground space-y-1"
                    elementType="div"
                  />
                </div>
                <div>
                  <h3 className="font-semibold text-lg mb-2">Phase 2: Launch & Collection</h3>
                  <EditableText
                    content="• Launch campaign execution\n• Participation monitoring\n• Reminder campaigns\n• Technical support\n• Data quality assurance"
                    contentKey="project-management-phase2"
                    className="text-sm text-muted-foreground space-y-1"
                    elementType="div"
                  />
                </div>
              </div>
              <div className="space-y-6">
                <div>
                  <h3 className="font-semibold text-lg mb-2">Phase 3: Analysis & Reporting</h3>
                  <EditableText
                    content="• Statistical analysis and interpretation\n• Report writing and visualization\n• Executive summary preparation\n• Recommendation development\n• Quality review and validation"
                    contentKey="project-management-phase3"
                    className="text-sm text-muted-foreground space-y-1"
                    elementType="div"
                  />
                </div>
                <div>
                  <h3 className="font-semibold text-lg mb-2">Phase 4: Delivery & Support</h3>
                  <EditableText
                    content="• Results presentation to leadership\n• Department-specific briefings\n• Implementation planning support\n• Follow-up consultation\n• Progress monitoring guidance"
                    contentKey="project-management-phase4"
                    className="text-sm text-muted-foreground space-y-1"
                    elementType="div"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Benefits */}
        <Card className="mb-12">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-6 w-6 text-primary" />
              Why Choose Full Project Management?
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-3 gap-6">
              <div>
                <h3 className="font-semibold mb-2">Focus on Core Business</h3>
                <EditableText
                  content="Free up your internal resources to focus on day-to-day operations while we handle all survey complexities."
                  contentKey="project-management-benefit1"
                  className="text-sm text-muted-foreground"
                  elementType="p"
                />
              </div>
              <div>
                <h3 className="font-semibold mb-2">Expert Execution</h3>
                <EditableText
                  content="Leverage our experience managing hundreds of survey projects across diverse organizations and industries."
                  contentKey="project-management-benefit2"
                  className="text-sm text-muted-foreground"
                  elementType="p"
                />
              </div>
              <div>
                <h3 className="font-semibold mb-2">Guaranteed Outcomes</h3>
                <EditableText
                  content="Ensure project success with professional management, quality assurance, and proven methodologies."
                  contentKey="project-management-benefit3"
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
            <CardTitle>Why Choose Our Project Management Service?</CardTitle>
          </CardHeader>
          <CardContent>
            <EditableText
              content="Survey projects can be complex, time-consuming, and resource-intensive. Our end-to-end project management service removes all the burden from your organization while ensuring professional execution at every stage.\n\nAs registered workplace psychologists with extensive project management experience, we understand both the technical requirements and organizational dynamics that make survey projects successful. We handle everything from stakeholder management to technical implementation, allowing you to focus on your core business.\n\nOur proven methodology ensures higher response rates, better data quality, and more actionable insights than organizations typically achieve when managing surveys internally. With clear communication, regular updates, and transparent processes, you'll always know where your project stands and what to expect next."
              contentKey="project-management-why-choose"
              className="text-muted-foreground leading-relaxed whitespace-pre-line"
              elementType="p"
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}