import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Mail, Calendar, CheckCircle, Users, Settings, Target } from 'lucide-react';
import { EditableText } from '@/components/EditableText';

export default function BespokeSurveyDesign() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary/20">
      <div className="container mx-auto px-4 py-8">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Settings className="h-12 w-12 text-primary" />
            <Badge variant="secondary" className="text-lg px-4 py-2">
              Professional Service
            </Badge>
          </div>
          <EditableText
            content="Bespoke Survey Structure & Question Design"
            contentKey="bespoke-survey-design-title"
            className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent"
            elementType="h1"
          />
          <EditableText
            content="Custom survey design tailored to your specific organizational needs and research objectives, crafted by our registered workplace psychologists."
            contentKey="bespoke-survey-design-subtitle"
            className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed"
            elementType="p"
          />
        </div>

        {/* Contact CTA */}
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

        {/* Service Overview */}
        <div className="grid md:grid-cols-2 gap-8 mb-12">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="h-6 w-6 text-green-600" />
                What's Included
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <EditableText
                content="• Initial consultation and needs assessment\n• Research objective clarification\n• Custom question development\n• Survey structure optimization\n• Response scale selection\n• Pilot testing and refinement\n• Implementation guidance\n• Data collection strategy\n• Quality assurance review\n• Final survey documentation"
                contentKey="bespoke-survey-design-included"
                className="space-y-2"
                elementType="div"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-6 w-6 text-blue-600" />
                Survey Types We Design
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <EditableText
                content="• Employee engagement surveys\n• 360-degree feedback assessments\n• Culture and values surveys\n• Leadership effectiveness studies\n• Customer satisfaction surveys\n• Training needs assessments\n• Exit interview questionnaires\n• Pulse surveys and regular check-ins\n• Change management surveys\n• Wellbeing and stress assessments"
                contentKey="bespoke-survey-design-types"
                className="space-y-2"
                elementType="div"
              />
            </CardContent>
          </Card>
        </div>

        {/* Design Process */}
        <Card className="mb-12">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-6 w-6 text-primary" />
              Our Design Process
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-4 gap-6">
              <div className="text-center">
                <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-xl font-bold text-primary">1</span>
                </div>
                <h3 className="font-semibold mb-2">Discovery</h3>
                <EditableText
                  content="We conduct detailed consultations to understand your organizational context, research objectives, and specific requirements."
                  contentKey="bespoke-survey-design-step1"
                  className="text-sm text-muted-foreground"
                  elementType="p"
                />
              </div>
              <div className="text-center">
                <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-xl font-bold text-primary">2</span>
                </div>
                <h3 className="font-semibold mb-2">Design</h3>
                <EditableText
                  content="Our psychologists craft questions and structure based on established research methodologies and your specific needs."
                  contentKey="bespoke-survey-design-step2"
                  className="text-sm text-muted-foreground"
                  elementType="p"
                />
              </div>
              <div className="text-center">
                <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-xl font-bold text-primary">3</span>
                </div>
                <h3 className="font-semibold mb-2">Testing</h3>
                <EditableText
                  content="We pilot test the survey with a small group to identify issues and optimize question clarity and flow."
                  contentKey="bespoke-survey-design-step3"
                  className="text-sm text-muted-foreground"
                  elementType="p"
                />
              </div>
              <div className="text-center">
                <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-xl font-bold text-primary">4</span>
                </div>
                <h3 className="font-semibold mb-2">Delivery</h3>
                <EditableText
                  content="We deliver the final survey with implementation guidelines and ongoing support for successful deployment."
                  contentKey="bespoke-survey-design-step4"
                  className="text-sm text-muted-foreground"
                  elementType="p"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Key Features */}
        <Card className="mb-12">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-6 w-6 text-primary" />
              Why Custom Survey Design Matters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-3 gap-6">
              <div>
                <h3 className="font-semibold mb-2">Precise Measurement</h3>
                <EditableText
                  content="Custom questions ensure you're measuring exactly what matters to your organization, not generic concepts."
                  contentKey="bespoke-survey-design-feature1"
                  className="text-sm text-muted-foreground"
                  elementType="p"
                />
              </div>
              <div>
                <h3 className="font-semibold mb-2">Higher Response Rates</h3>
                <EditableText
                  content="Relevant, well-crafted questions increase participant engagement and completion rates."
                  contentKey="bespoke-survey-design-feature2"
                  className="text-sm text-muted-foreground"
                  elementType="p"
                />
              </div>
              <div>
                <h3 className="font-semibold mb-2">Actionable Insights</h3>
                <EditableText
                  content="Questions designed for your context produce data that directly informs decision-making and action planning."
                  contentKey="bespoke-survey-design-feature3"
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
            <CardTitle>Why Choose Our Bespoke Survey Design Service?</CardTitle>
          </CardHeader>
          <CardContent>
            <EditableText
              content="Generic survey templates often miss the mark because every organization is unique. Our registered workplace psychologists understand the nuances of organizational behavior and research methodology, ensuring your survey captures the data you actually need.\n\nWe combine academic rigor with practical experience, creating surveys that are both scientifically sound and organizationally relevant. Our questions are designed to minimize bias, maximize clarity, and produce data that can drive meaningful change in your organization.\n\nWith our bespoke approach, you get a survey that speaks your organization's language, addresses your specific challenges, and provides insights that generic tools simply cannot deliver."
              contentKey="bespoke-survey-design-why-choose"
              className="text-muted-foreground leading-relaxed whitespace-pre-line"
              elementType="p"
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}