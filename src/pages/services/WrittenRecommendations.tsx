import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Mail, Calendar, CheckCircle, Users, FileText, Target } from 'lucide-react';
import { EditableText } from '@/components/EditableText';

export default function WrittenRecommendations() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary/20">
      <div className="container mx-auto px-4 py-8">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-3 mb-4">
            <FileText className="h-12 w-12 text-primary" />
            <Badge variant="secondary" className="text-lg px-4 py-2">
              Professional Service
            </Badge>
          </div>
          <EditableText
            content="Written Recommendations for Action"
            contentKey="written-recommendations-title"
            className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent"
            elementType="h1"
          />
          <EditableText
            content="Comprehensive written reports with actionable recommendations based on your survey data and organizational context, delivered by our registered workplace psychologists."
            contentKey="written-recommendations-subtitle"
            className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed"
            elementType="p"
          />
        </div>

        {/* Contact CTA */}
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
                content="• Comprehensive analysis report (15-30 pages)\n• Executive summary for leadership\n• Detailed findings by theme/department\n• Prioritized action recommendations\n• Implementation timeline suggestions\n• Success metrics and KPIs\n• Resource requirement estimates\n• Risk assessment and mitigation strategies\n• Follow-up consultation call"
                contentKey="written-recommendations-included"
                className="space-y-2"
                elementType="div"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-6 w-6 text-blue-600" />
                Report Focus Areas
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <EditableText
                content="• Leadership and management effectiveness\n• Employee engagement and satisfaction\n• Communication and culture improvement\n• Performance and productivity enhancement\n• Change management strategies\n• Team dynamics and collaboration\n• Training and development needs\n• Work-life balance and wellbeing initiatives"
                contentKey="written-recommendations-focus"
                className="space-y-2"
                elementType="div"
              />
            </CardContent>
          </Card>
        </div>

        {/* Sample Report Structure */}
        <Card className="mb-12">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-6 w-6 text-primary" />
              Sample Report Structure
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-semibold mb-3">Section 1: Executive Overview</h3>
                <EditableText
                  content="• Key findings summary\n• Critical action priorities\n• Strategic recommendations\n• Expected outcomes"
                  contentKey="written-recommendations-section1"
                  className="text-sm text-muted-foreground space-y-1"
                  elementType="div"
                />
              </div>
              <div>
                <h3 className="font-semibold mb-3">Section 2: Detailed Analysis</h3>
                <EditableText
                  content="• Statistical analysis\n• Trend identification\n• Comparative benchmarks\n• Risk assessments"
                  contentKey="written-recommendations-section2"
                  className="text-sm text-muted-foreground space-y-1"
                  elementType="div"
                />
              </div>
              <div>
                <h3 className="font-semibold mb-3">Section 3: Recommendations</h3>
                <EditableText
                  content="• Prioritized action items\n• Implementation strategies\n• Resource requirements\n• Timeline suggestions"
                  contentKey="written-recommendations-section3"
                  className="text-sm text-muted-foreground space-y-1"
                  elementType="div"
                />
              </div>
              <div>
                <h3 className="font-semibold mb-3">Section 4: Implementation</h3>
                <EditableText
                  content="• Step-by-step action plans\n• Success metrics\n• Monitoring strategies\n• Next steps guidance"
                  contentKey="written-recommendations-section4"
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
              <Users className="h-6 w-6 text-primary" />
              Benefits of Written Recommendations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-3 gap-6">
              <div>
                <h3 className="font-semibold mb-2">Strategic Clarity</h3>
                <EditableText
                  content="Get clear, prioritized action items that align with your organizational goals and resources."
                  contentKey="written-recommendations-benefit1"
                  className="text-sm text-muted-foreground"
                  elementType="p"
                />
              </div>
              <div>
                <h3 className="font-semibold mb-2">Evidence-Based</h3>
                <EditableText
                  content="All recommendations are grounded in solid psychological research and your specific survey data."
                  contentKey="written-recommendations-benefit2"
                  className="text-sm text-muted-foreground"
                  elementType="p"
                />
              </div>
              <div>
                <h3 className="font-semibold mb-2">Stakeholder Buy-in</h3>
                <EditableText
                  content="Professional documentation helps secure leadership support and resource allocation for initiatives."
                  contentKey="written-recommendations-benefit3"
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
            <CardTitle>Why Choose Our Written Recommendations?</CardTitle>
          </CardHeader>
          <CardContent>
            <EditableText
              content="Our written recommendations go beyond simple data interpretation. As registered workplace psychologists, we understand the complex dynamics of organizational change and human behavior. Our reports provide not just what needs to be done, but how to do it effectively.\n\nEach recommendation is tailored to your organization's unique context, culture, and constraints. We consider factors like change readiness, resource availability, and stakeholder dynamics to ensure our suggestions are not only theoretically sound but practically implementable.\n\nOur reports serve as strategic documents that can guide your organization's development efforts for months or even years to come, providing a clear roadmap for sustainable positive change."
              contentKey="written-recommendations-why-choose"
              className="text-muted-foreground leading-relaxed whitespace-pre-line"
              elementType="p"
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}