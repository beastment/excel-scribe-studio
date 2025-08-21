import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  ClipboardList, 
  ArrowRight,
  Check,
  Settings,
  Target,
  Users,
  Calendar,
  CheckCircle
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { EditableText } from '@/components/EditableText';

const ActionPlanningExtension = () => {
  const { user } = useAuth();

  const features = [
    {
      icon: Target,
      title: "AI-Generated Action Items",
      description: "Automatically convert feedback themes into specific, actionable initiatives with clear success metrics."
    },
    {
      icon: CheckCircle,
      title: "Goal & Progress Tracking",
      description: "Set SMART goals and track progress with built-in milestones and reporting dashboards."
    },
    {
      icon: Users,
      title: "Manager Accountability Tools",
      description: "Assign ownership, set deadlines, and ensure follow-through with automated reminders and escalations."
    },
    {
      icon: Calendar,
      title: "Timeline Management",
      description: "Create realistic timelines with dependencies and automatically adjust schedules based on progress."
    }
  ];

  const benefits = [
    "Transform feedback into concrete action plans automatically",
    "Ensure accountability with clear ownership and deadlines",
    "Track progress and measure impact of initiatives",
    "Prevent feedback fatigue by showing visible change",
    "Integrate with existing project management tools"
  ];

  return (
    <div className="pt-20">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-50 to-green-50 py-20 lg:py-32">
        <div className="absolute inset-0 bg-grid-slate-100 [mask-image:linear-gradient(0deg,white,rgba(255,255,255,0.6))] -z-10"></div>
        
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-4xl mx-auto">
            <div className="inline-flex items-center space-x-2 bg-orange-100 text-orange-800 px-4 py-2 rounded-full text-sm font-medium mb-8">
              <Settings className="w-4 h-4" />
              <span>In Development</span>
            </div>
            
            <div className="w-20 h-20 bg-gradient-to-br from-green-500 to-emerald-500 rounded-3xl flex items-center justify-center mx-auto mb-8">
              <ClipboardList className="w-10 h-10 text-white" />
            </div>
            
            <h1 className="text-4xl lg:text-6xl font-bold text-gray-900 mb-6 leading-tight">
              <EditableText contentKey="action-planning-title" as="span">Action Planning </EditableText>
              <span className="bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
                <EditableText contentKey="action-planning-title-highlight" as="span"> Extension</EditableText>
              </span>
            </h1>
            
            <p className="text-xl text-gray-600 mb-10 leading-relaxed max-w-3xl mx-auto">
              <EditableText contentKey="action-planning-description" as="span">
                Turn employee feedback into concrete action plans with AI-suggested initiatives and progress tracking. 
                Close the feedback loop and drive meaningful change.
              </EditableText>
            </p>
            
            <div className="flex flex-col sm:flex-row items-center justify-center space-y-4 sm:space-y-0 sm:space-x-6">
              <Link to="/contact">
                <Button className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white px-8 py-4 text-lg rounded-xl transition-all duration-300">
                  Get in Touch
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-4xl font-bold text-gray-900 mb-4">
              <EditableText contentKey="action-planning-features-title" as="span">From Feedback to Action</EditableText>
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              <EditableText contentKey="action-planning-features-description" as="span">Bridge the gap between collecting feedback and implementing change with intelligent action planning.</EditableText>
            </p>
          </div>
          
          <div className="grid lg:grid-cols-2 gap-8">
            {features.map((feature, index) => (
              <Card key={index} className="border-0 shadow-lg hover:shadow-xl transition-all duration-300 bg-white">
                <CardContent className="p-8">
                  <div className="flex items-start space-x-4">
                    <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-500 rounded-xl flex items-center justify-center">
                      <feature.icon className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold mb-3 text-gray-900">
                        <EditableText contentKey={`action-planning-feature-${index}-title`} as="span">{feature.title}</EditableText>
                      </h3>
                      <p className="text-gray-600 leading-relaxed">
                        <EditableText contentKey={`action-planning-feature-${index}-desc`} as="span">{feature.description}</EditableText>
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-20 bg-gradient-to-br from-gray-50 to-green-50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-3xl lg:text-4xl font-bold text-gray-900 mb-6">
                <EditableText contentKey="action-planning-why-title" as="span">Drive Real Organizational Change</EditableText>
              </h2>
              <p className="text-xl text-gray-600 mb-8">
                <EditableText contentKey="action-planning-why-description" as="span">Stop letting valuable feedback go unactionable. Transform insights into measurable improvements with systematic action planning.</EditableText>
              </p>
              
              <div className="space-y-4">
                {benefits.map((benefit, index) => (
                  <div key={index} className="flex items-start space-x-3">
                    <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                      <Check className="w-4 h-4 text-green-600" />
                    </div>
                    <p className="text-gray-700 font-medium">
                      <EditableText contentKey={`action-planning-benefit-${index}`} as="span">{benefit}</EditableText>
                    </p>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="bg-white rounded-2xl shadow-xl p-8">
              <h3 className="text-2xl font-bold text-gray-900 mb-6">Coming Soon</h3>
              
              <div className="mb-6">
                <Badge className="bg-orange-100 text-orange-800 mb-4">
                  <Settings className="w-3 h-3 mr-1" />
                  In Development
                </Badge>
                <div className="text-4xl font-bold text-gray-900 mb-2">Pricing yet to be confirmed</div>
              </div>
              
              <div className="space-y-3 mb-8">
                <div className="flex items-center space-x-2">
                  <Check className="w-4 h-4 text-green-600" />
                  <span className="text-gray-700">AI-Generated Action Items</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Check className="w-4 h-4 text-green-600" />
                  <span className="text-gray-700">Goal & Progress Tracking</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Check className="w-4 h-4 text-green-600" />
                  <span className="text-gray-700">Manager Accountability Tools</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Check className="w-4 h-4 text-green-600" />
                  <span className="text-gray-700">Timeline Management</span>
                </div>
              </div>
              
              <Link to="/contact">
                <Button className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white py-3 rounded-xl font-medium transition-all duration-300">
                  Get in Touch
                  <ArrowRight className="ml-2 w-5 h-5" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-r from-green-600 to-emerald-600">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-3xl lg:text-4xl font-bold text-white mb-6">
            <EditableText contentKey="action-planning-cta-title" as="span">Ready to Close the Feedback Loop?</EditableText>
          </h2>
          <p className="text-xl text-green-100 mb-10">
            <EditableText contentKey="action-planning-cta-description" as="span">Join forward-thinking organizations who are turning employee insights into measurable business improvements.</EditableText>
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center space-y-4 sm:space-y-0 sm:space-x-6">
            <Link to="/contact">
              <Button className="bg-white text-green-600 hover:bg-gray-50 px-8 py-4 text-lg rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all duration-300">
                Get in Touch
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
};

export default ActionPlanningExtension;