import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Users, Target, TrendingUp, MessageSquare, CheckCircle, Brain, Star, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EditableText } from '@/components/EditableText';

const ConsultingServices = () => {
  const services = [
    {
      category: "Survey Support",
      icon: MessageSquare,
      color: "from-blue-500 to-cyan-500",
      items: [
        {
          title: "Design",
          description: "Design custom tools for robust workforce and client surveys"
        },
        {
          title: "Survey Management", 
          description: "Develop and implement survey communications and strategy to maximising buy-in and response rates"
        },
        {
          title: "Interpretive Reporting",
          description: "Delve beyond the numbers with key insights and actionable recommendations"
        },
        {
          title: "Presentations",
          description: "Cut away the noise, present critical insights with clarity to your leaders and teams"
        },
        {
          title: "Action Planning Workshops",
          description: "Drive improvements with human-centred design thinking to align and inspire leaders on actions for the future"
        }
      ]
    },
    {
      category: "Culture & Values Alignment",
      icon: Target,
      color: "from-purple-500 to-pink-500",
      items: [
        {
          title: "Values Definition & Embedding",
          description: "Clearly define your organisational values and ensure they are deeply embedded within your culture, guiding behaviours and decisions"
        },
        {
          title: "Values Workshop",
          description: "Understand the enacted values of your organisation. Develop a bottom-up understanding of the values that build staff behaviour"
        },
        {
          title: "Diversity & Inclusion Initiatives",
          description: "We help you move beyond compliance to cultivate an authentically inclusive workplace that leverages the full potential of a diverse workforce"
        }
      ]
    },
    {
      category: "Leadership & Development",
      icon: TrendingUp,
      color: "from-green-500 to-emerald-500",
      items: [
        {
          title: "360-Degree Feedback & Coaching",
          description: "Building leadership strength and insights, with comprehensive 360-degree feedback assessment, combined with professional debriefs and targeted coaching"
        },
        {
          title: "Interviews and Focus Groups",
          description: "Gathering insights on root causes and generative solutions to guide actions that drive an uplift in performance"
        },
        {
          title: "Workplace Training & Learning Material Development",
          description: "We design and deliver tailored training programs and learning materials to address specific skill gaps, enhance team effectiveness, and support organisational growth"
        }
      ]
    }
  ];

  return (
    <div className="pt-20">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-background to-secondary py-20 lg:py-32">
        <div className="absolute inset-0 bg-grid-slate-100 [mask-image:linear-gradient(0deg,white,rgba(255,255,255,0.6))] -z-10"></div>
        
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-4xl mx-auto">
            <div className="inline-flex items-center space-x-2 bg-primary/10 text-primary px-4 py-2 rounded-full text-sm font-medium mb-4">
              <Users className="w-4 h-4" />
              <span>Human Intelligence Services</span>
            </div>
            
            <h1 className="text-4xl lg:text-6xl font-bold text-foreground mb-6 leading-tight">
              <EditableText contentKey="consulting-title" as="span">Consulting</EditableText>
              <span className="bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                <EditableText contentKey="consulting-title-highlight" as="span"> Services</EditableText>
              </span>
            </h1>
            
            <p className="text-xl text-muted-foreground mb-8 leading-relaxed">
              <EditableText contentKey="consulting-description" as="span">
                When AI is not enough, and you need HI: Human Intelligence. Our professional consultants are registered workplace psychologists, specialising in working with you to obtain maximum value from your survey results.
              </EditableText>
            </p>

            <Badge className="bg-green-100 text-green-800 text-lg px-4 py-2 mb-8">
              <Star className="w-4 h-4 mr-2" />
              Live
            </Badge>
            
            <div className="flex flex-col sm:flex-row items-center justify-center space-y-4 sm:space-y-0 sm:space-x-6">
              <Link to="/contact">
                <Button className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white px-8 py-4 text-lg rounded-xl shadow-lg hover:shadow-xl transition-all duration-300">
                  Get in Touch
                  <ArrowRight className="ml-2 w-5 h-5" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
        
        {/* Floating Elements */}
        <div className="absolute top-20 left-10 w-20 h-20 bg-purple-200 rounded-full opacity-20 animate-pulse"></div>
        <div className="absolute bottom-20 right-20 w-32 h-32 bg-pink-200 rounded-full opacity-20 animate-pulse delay-700"></div>
      </section>

      {/* Services Section */}
      <section className="py-20 bg-gradient-to-br from-background to-secondary">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-4xl font-bold text-foreground mb-4">
              <EditableText contentKey="consulting-services-title" as="span">Our Professional Services</EditableText>
            </h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              <EditableText contentKey="consulting-services-description" as="span">Comprehensive consulting services delivered by registered workplace psychologists with deep expertise in organisational development and survey analysis.</EditableText>
            </p>
          </div>
          
          <div className="space-y-12">
            {services.map((service, index) => (
              <Card key={index} className="border-0 shadow-lg bg-card overflow-hidden">
                <CardHeader>
                  <div className="flex items-center space-x-4">
                    <div className={`w-14 h-14 bg-gradient-to-br ${service.color} rounded-2xl flex items-center justify-center`}>
                      <service.icon className="w-7 h-7 text-white" />
                    </div>
                    <CardTitle className="text-2xl text-card-foreground">{service.category}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {service.items.map((item, itemIndex) => (
                      <div key={itemIndex} className="space-y-3">
                        <div className="flex items-start space-x-3">
                          <CheckCircle className={`w-5 h-5 mt-1 bg-gradient-to-r ${service.color} bg-clip-text text-transparent`} />
                          <div>
                            <h4 className="font-semibold text-card-foreground mb-2">{item.title}</h4>
                            <p className="text-muted-foreground text-sm leading-relaxed">{item.description}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Why Choose Our Consultants Section */}
      <section className="py-20 bg-gradient-to-r from-purple-600 to-pink-600">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <div className="inline-flex items-center space-x-2 bg-white/20 text-white px-4 py-2 rounded-full text-sm font-medium mb-6">
            <Brain className="w-4 h-4" />
            <span>Registered Workplace Psychologists</span>
          </div>
          
          <h2 className="text-3xl lg:text-4xl font-bold text-white mb-6">
            <EditableText contentKey="consulting-why-title" as="span">Why Choose Our Human Intelligence?</EditableText>
          </h2>
          
          <p className="text-xl text-purple-100 mb-10">
            <EditableText contentKey="consulting-why-description" as="span">Our consultants bring deep psychological expertise and proven methodologies to help you unlock insights that AI alone cannot provide. We bridge the gap between data and human understanding.</EditableText>
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center space-y-4 sm:space-y-0 sm:space-x-6">
            <Link to="/contact">
              <Button className="bg-card text-primary hover:bg-card/90 px-8 py-4 text-lg rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all duration-300">
                Schedule a Consultation
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
};

export default ConsultingServices;