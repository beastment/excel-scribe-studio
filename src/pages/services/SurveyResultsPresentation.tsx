import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Mail, Calendar, CheckCircle, Users, BarChart, FileText } from 'lucide-react';
import { EditableText } from '@/components/EditableText';

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
          <EditableText
            contentKey="survey-results-presentation-title"
            className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent"
            as="h1"
          >
            Presentation of Survey Results
          </EditableText>
          <EditableText
            content="Professional presentation and interpretation of your survey findings with expert insights and actionable recommendations from our registered workplace psychologists."
            contentKey="survey-results-presentation-subtitle"
            className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed"
            elementType="p"
          />
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
            <CardContent className="space-y-4">
              <EditableText
                content="• Professional data visualization and charts\n• Statistical analysis and interpretation\n• Key findings summary and insights\n• Actionable recommendations\n• Executive summary for leadership\n• Interactive presentation delivery\n• Q&A session with our psychologists\n• Follow-up support and clarifications"
                contentKey="survey-results-presentation-included"
                className="space-y-2"
                elementType="div"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-6 w-6 text-blue-600" />
                Who Benefits
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <EditableText
                content="• Senior leadership teams\n• HR departments\n• Department managers\n• Board members\n• Change management teams\n• Organizational development professionals\n• Anyone responsible for acting on survey results"
                contentKey="survey-results-presentation-benefits"
                className="space-y-2"
                elementType="div"
              />
            </CardContent>
          </Card>
        </div>

        {/* Process Overview */}
        <Card className="mb-12">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-6 w-6 text-primary" />
              Our Presentation Process
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-3 gap-6">
              <div className="text-center">
                <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-xl font-bold text-primary">1</span>
                </div>
                <h3 className="font-semibold mb-2">Data Analysis</h3>
                <EditableText
                  content="Our registered workplace psychologists conduct thorough analysis of your survey data, identifying key patterns and insights."
                  contentKey="survey-results-presentation-step1"
                  className="text-sm text-muted-foreground"
                  elementType="p"
                />
              </div>
              <div className="text-center">
                <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-xl font-bold text-primary">2</span>
                </div>
                <h3 className="font-semibold mb-2">Presentation Preparation</h3>
                <EditableText
                  content="We create professional visualizations and prepare a comprehensive presentation tailored to your organization's context."
                  contentKey="survey-results-presentation-step2"
                  className="text-sm text-muted-foreground"
                  elementType="p"
                />
              </div>
              <div className="text-center">
                <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-xl font-bold text-primary">3</span>
                </div>
                <h3 className="font-semibold mb-2">Delivery & Discussion</h3>
                <EditableText
                  content="We present the findings to your team, provide expert interpretation, and facilitate discussion around next steps and recommendations."
                  contentKey="survey-results-presentation-step3"
                  className="text-sm text-muted-foreground"
                  elementType="p"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Why Choose Our Experts */}
        <Card>
          <CardHeader>
            <CardTitle>Why Choose Our Professional Presentation Service?</CardTitle>
          </CardHeader>
          <CardContent>
            <EditableText
              content="Our team consists of registered workplace psychologists with extensive experience in organizational research and development. We don't just present data – we provide context, interpretation, and strategic insights that help you understand what your survey results really mean for your organization.\n\nWith years of experience working with organizations of all sizes, we know how to communicate complex data in a way that's accessible to all stakeholders, from frontline managers to C-suite executives. Our presentations are designed to not just inform, but to inspire action and drive positive organizational change."
              contentKey="survey-results-presentation-why-choose"
              className="text-muted-foreground leading-relaxed whitespace-pre-line"
              elementType="p"
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}