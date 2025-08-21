import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  FileText, 
  ArrowRight,
  Check,
  Settings,
  BarChart,
  PieChart,
  TrendingUp,
  Download
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { EditableText } from '@/components/EditableText';

const ReportWriter = () => {
  const { user } = useAuth();

  const features = [
    {
      icon: FileText,
      title: "Automated Narrative Generation",
      description: "Transform complex data into clear, compelling stories that executives and stakeholders can understand."
    },
    {
      icon: BarChart,
      title: "Custom Report Templates",
      description: "Create branded report templates that automatically populate with your latest data and insights."
    },
    {
      icon: PieChart,
      title: "Data Visualization Integration",
      description: "Seamlessly combine charts, graphs, and narrative text for comprehensive reporting."
    },
    {
      icon: Download,
      title: "Multi-Format Export",
      description: "Generate reports in PowerPoint, PDF, Word, and other formats for different audiences."
    }
  ];

  const benefits = [
    "Generate executive summaries in minutes, not hours",
    "Ensure consistent, professional reporting across teams",
    "Combine quantitative and qualitative insights seamlessly",
    "Customize reports for different stakeholder groups",
    "Maintain brand consistency with custom templates"
  ];

  return (
    <div className="pt-20">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-50 to-orange-50 py-20 lg:py-32">
        <div className="absolute inset-0 bg-grid-slate-100 [mask-image:linear-gradient(0deg,white,rgba(255,255,255,0.6))] -z-10"></div>
        
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-4xl mx-auto">
            <div className="inline-flex items-center space-x-2 bg-orange-100 text-orange-800 px-4 py-2 rounded-full text-sm font-medium mb-8">
              <Settings className="w-4 h-4" />
              <span>In Development</span>
            </div>
            
            <div className="w-20 h-20 bg-gradient-to-br from-orange-500 to-red-500 rounded-3xl flex items-center justify-center mx-auto mb-8">
              <FileText className="w-10 h-10 text-white" />
            </div>
            
            <h1 className="text-4xl lg:text-6xl font-bold text-gray-900 mb-6 leading-tight">
              <EditableText contentKey="report-writer-title" as="span">Report </EditableText>
              <span className="bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent">
                <EditableText contentKey="report-writer-title-highlight" as="span"> Writer</EditableText>
              </span>
            </h1>
            
            <p className="text-xl text-gray-600 mb-10 leading-relaxed max-w-3xl mx-auto">
              <EditableText contentKey="report-writer-description" as="span">
                Instantly generate executive summaries and narrative reports from your quantitative and qualitative data. 
                Transform complex insights into compelling stories.
              </EditableText>
            </p>
            
            <div className="flex flex-col sm:flex-row items-center justify-center space-y-4 sm:space-y-0 sm:space-x-6">
              <Link to="/contact">
                <Button className="bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700 text-white px-8 py-4 text-lg rounded-xl transition-all duration-300">
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
              <EditableText contentKey="report-writer-features-title" as="span">Intelligent Report Generation</EditableText>
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              <EditableText contentKey="report-writer-features-description" as="span">Let AI craft professional reports that tell the story behind your data with clarity and impact.</EditableText>
            </p>
          </div>
          
          <div className="grid lg:grid-cols-2 gap-8">
            {features.map((feature, index) => (
              <Card key={index} className="border-0 shadow-lg hover:shadow-xl transition-all duration-300 bg-white">
                <CardContent className="p-8">
                  <div className="flex items-start space-x-4">
                    <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-red-500 rounded-xl flex items-center justify-center">
                      <feature.icon className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold mb-3 text-gray-900">
                        <EditableText contentKey={`report-writer-feature-${index}-title`} as="span">{feature.title}</EditableText>
                      </h3>
                      <p className="text-gray-600 leading-relaxed">
                        <EditableText contentKey={`report-writer-feature-${index}-desc`} as="span">{feature.description}</EditableText>
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
      <section className="py-20 bg-gradient-to-br from-gray-50 to-orange-50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-3xl lg:text-4xl font-bold text-gray-900 mb-6">
                <EditableText contentKey="report-writer-why-title" as="span">Professional Reports in Minutes</EditableText>
              </h2>
              <p className="text-xl text-gray-600 mb-8">
                <EditableText contentKey="report-writer-why-description" as="span">Stop spending days creating reports manually. Generate professional, branded reports that tell compelling data stories automatically.</EditableText>
              </p>
              
              <div className="space-y-4">
                {benefits.map((benefit, index) => (
                  <div key={index} className="flex items-start space-x-3">
                    <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                      <Check className="w-4 h-4 text-green-600" />
                    </div>
                    <p className="text-gray-700 font-medium">
                      <EditableText contentKey={`report-writer-benefit-${index}`} as="span">{benefit}</EditableText>
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
                  <span className="text-gray-700">Automated Narrative Generation</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Check className="w-4 h-4 text-green-600" />
                  <span className="text-gray-700">Custom Report Templates</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Check className="w-4 h-4 text-green-600" />
                  <span className="text-gray-700">Data Visualization Integration</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Check className="w-4 h-4 text-green-600" />
                  <span className="text-gray-700">Multi-Format Export</span>
                </div>
              </div>
              
              <Link to="/contact">
                <Button className="w-full bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700 text-white py-3 rounded-xl font-medium transition-all duration-300">
                  Get in Touch
                  <ArrowRight className="ml-2 w-5 h-5" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-r from-orange-600 to-red-600">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-3xl lg:text-4xl font-bold text-white mb-6">
            <EditableText contentKey="report-writer-cta-title" as="span">Transform Data Into Stories</EditableText>
          </h2>
          <p className="text-xl text-orange-100 mb-10">
            <EditableText contentKey="report-writer-cta-description" as="span">Join organizations who are revolutionizing how they communicate insights with AI-powered report generation.</EditableText>
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center space-y-4 sm:space-y-0 sm:space-x-6">
            <Link to="/contact">
              <Button className="bg-white text-orange-600 hover:bg-gray-50 px-8 py-4 text-lg rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all duration-300">
                Get in Touch
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
};

export default ReportWriter;