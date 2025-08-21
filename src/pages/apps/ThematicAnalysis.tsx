import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  BrainCircuit, 
  ArrowRight,
  Check,
  Settings,
  TrendingUp,
  BarChart,
  Target,
  Users
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { EditableText } from '@/components/EditableText';

const ThematicAnalysis = () => {
  const { user } = useAuth();

  const features = [
    {
      icon: BrainCircuit,
      title: "AI-Powered Topic Modeling",
      description: "Advanced machine learning algorithms identify hidden themes and patterns in your feedback data."
    },
    {
      icon: TrendingUp,
      title: "Sentiment Analysis",
      description: "Understand not just what employees are saying, but how they feel about each topic."
    },
    {
      icon: BarChart,
      title: "Trend Detection",
      description: "Track how themes evolve over time and identify emerging issues before they become problems."
    },
    {
      icon: Target,
      title: "Priority Scoring",
      description: "Automatically rank themes by frequency, sentiment, and potential impact on your organization."
    }
  ];

  const benefits = [
    "Discover hidden insights in thousands of comments automatically",
    "Track employee sentiment across different topics and departments",
    "Identify emerging trends and issues early",
    "Generate data-driven action plans",
    "Save weeks of manual analysis time"
  ];

  return (
    <div className="pt-20">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-50 to-purple-50 py-20 lg:py-32">
        <div className="absolute inset-0 bg-grid-slate-100 [mask-image:linear-gradient(0deg,white,rgba(255,255,255,0.6))] -z-10"></div>
        
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-4xl mx-auto">
            <div className="inline-flex items-center space-x-2 bg-orange-100 text-orange-800 px-4 py-2 rounded-full text-sm font-medium mb-8">
              <Settings className="w-4 h-4" />
              <span>In Development</span>
            </div>
            
            <div className="w-20 h-20 bg-gradient-to-br from-purple-500 to-pink-500 rounded-3xl flex items-center justify-center mx-auto mb-8">
              <BrainCircuit className="w-10 h-10 text-white" />
            </div>
            
            <h1 className="text-4xl lg:text-6xl font-bold text-gray-900 mb-6 leading-tight">
              <EditableText contentKey="thematic-analysis-title" as="span">Thematic </EditableText>
              <span className="bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                <EditableText contentKey="thematic-analysis-title-highlight" as="span"> Analysis</EditableText>
              </span>
            </h1>
            
            <p className="text-xl text-gray-600 mb-10 leading-relaxed max-w-3xl mx-auto">
              <EditableText contentKey="thematic-analysis-description" as="span">
                Automatically discover and categorize key themes and sentiment from thousands of employee comments. 
                Turn unstructured feedback into actionable insights.
              </EditableText>
            </p>
            
            <div className="flex flex-col sm:flex-row items-center justify-center space-y-4 sm:space-y-0 sm:space-x-6">
              <Link to="/contact">
                <Button className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white px-8 py-4 text-lg rounded-xl transition-all duration-300">
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
              Advanced Theme Discovery
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Our AI analyzes patterns in language, emotion, and context to reveal the true voice of your employees.
            </p>
          </div>
          
          <div className="grid lg:grid-cols-2 gap-8">
            {features.map((feature, index) => (
              <Card key={index} className="border-0 shadow-lg hover:shadow-xl transition-all duration-300 bg-white">
                <CardContent className="p-8">
                  <div className="flex items-start space-x-4">
                    <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center">
                      <feature.icon className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold mb-3 text-gray-900">{feature.title}</h3>
                      <p className="text-gray-600 leading-relaxed">{feature.description}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-20 bg-gradient-to-br from-gray-50 to-purple-50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-3xl lg:text-4xl font-bold text-gray-900 mb-6">
                Transform Feedback Into Intelligence
              </h2>
              <p className="text-xl text-gray-600 mb-8">
                Stop spending weeks manually categorizing feedback. Let AI reveal the patterns and insights that matter most.
              </p>
              
              <div className="space-y-4">
                {benefits.map((benefit, index) => (
                  <div key={index} className="flex items-start space-x-3">
                    <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                      <Check className="w-4 h-4 text-green-600" />
                    </div>
                    <p className="text-gray-700 font-medium">{benefit}</p>
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
                  <span className="text-gray-700">AI-Powered Topic Modeling</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Check className="w-4 h-4 text-green-600" />
                  <span className="text-gray-700">Sentiment Analysis</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Check className="w-4 h-4 text-green-600" />
                  <span className="text-gray-700">Trend Detection</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Check className="w-4 h-4 text-green-600" />
                  <span className="text-gray-700">Priority Scoring</span>
                </div>
              </div>
              
              <Link to="/contact">
                <Button className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white py-3 rounded-xl font-medium transition-all duration-300">
                  Get in Touch
                  <ArrowRight className="ml-2 w-5 h-5" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-r from-purple-600 to-pink-600">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-3xl lg:text-4xl font-bold text-white mb-6">
            Be First to Unlock Hidden Insights
          </h2>
          <p className="text-xl text-purple-100 mb-10">
            Join our early access program and be among the first to experience AI-powered thematic analysis.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center space-y-4 sm:space-y-0 sm:space-x-6">
            <Link to="/contact">
              <Button className="bg-white text-purple-600 hover:bg-gray-50 px-8 py-4 text-lg rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all duration-300">
                Get in Touch
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
};

export default ThematicAnalysis;