import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { 
  ArrowLeft, 
  Shield, 
  Lock, 
  MapPin, 
  Server, 
  CheckCircle,
  HelpCircle,
  FileText,
  Users,
  Zap
} from 'lucide-react';

const FAQ = () => {
  const faqs = [
    {
      category: "Data Security & Privacy",
      icon: Shield,
      color: "from-blue-500 to-cyan-500",
      questions: [
        {
          q: "How is my data protected?",
          a: "All data is encrypted in transit and at rest using industry-standard AES-256 encryption. We employ multi-layered security protocols and regular security audits to ensure your data remains protected at all times."
        },
        {
          q: "Is my data anonymized?",
          a: "Yes, our Comment De-Identification tool automatically removes all personally identifiable information (PII) while preserving the original tone and context of feedback. This ensures complete anonymity for your employees."
        },
        {
          q: "Where is my data stored?",
          a: "All data is stored exclusively in Australian data centers, ensuring compliance with Australian data sovereignty requirements. Your data never leaves Australian borders, providing maximum protection under Australian privacy laws."
        },
        {
          q: "Who has access to my data?",
          a: "Access is strictly controlled and limited to authorized personnel only. All access is logged and monitored. We operate under a zero-trust security model where access is granted on a need-to-know basis."
        },
        {
          q: "Will my data be used to train AI models?",
          a: "No, absolutely not. Your data remains yours and will never be used for training AI models. We maintain strict data privacy policies to ensure your information is only used for the specific services you've requested."
        }
      ]
    },
    {
      category: "Platform Features",
      icon: Zap,
      color: "from-purple-500 to-pink-500",
      questions: [
        {
          q: "How accurate is the AI analysis?",
          a: "Our AI models achieve over 95% accuracy in identifying and categorizing themes from employee feedback. The models are continuously trained and improved using the latest natural language processing techniques."
        },
        {
          q: "Can I integrate with my existing HR systems?",
          a: "Yes, we provide robust APIs and pre-built integrations with popular HR platforms. Our technical team can assist with custom integrations to ensure seamless workflow integration."
        },
        {
          q: "What file formats are supported?",
          a: "We support CSV, Excel, JSON, and direct API uploads. Our bulk processing capabilities can handle thousands of comments simultaneously while maintaining processing speed and accuracy."
        },
        {
          q: "How quickly can I get results?",
          a: "Most analyses are completed within minutes. For large datasets (10,000+ comments), processing typically takes 15-30 minutes depending on the complexity of analysis required."
        }
      ]
    },
    {
      category: "Compliance & Governance",
      icon: FileText,
      color: "from-green-500 to-emerald-500",
      questions: [
        {
          q: "Are you compliant with Australian privacy laws?",
          a: "Yes, we are fully compliant with the Privacy Act 1988 and Australian Privacy Principles. Our Australian-based infrastructure ensures adherence to all local data protection requirements."
        },
        {
          q: "Do you provide audit trails?",
          a: "Complete audit trails are maintained for all data processing activities. You can access detailed logs showing when data was processed, by whom, and what actions were taken."
        },
        {
          q: "Can you help with compliance reporting?",
          a: "Our Report Writer tool generates compliance-ready reports that meet Australian regulatory standards. All reports include necessary documentation for audit purposes."
        },
        {
          q: "What about data retention policies?",
          a: "Data retention periods are configurable based on your organizational requirements. We can automatically delete data after specified periods or maintain it according to your compliance needs."
        }
      ]
    },
  ];

  return (
    <div className="pt-20">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-50 to-blue-50 py-20 lg:py-32">
        <div className="absolute inset-0 bg-grid-slate-100 [mask-image:linear-gradient(0deg,white,rgba(255,255,255,0.6))] -z-10"></div>
        
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-4xl mx-auto">
            <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-500 rounded-3xl flex items-center justify-center mx-auto mb-8">
              <HelpCircle className="w-10 h-10 text-white" />
            </div>
            
            <h1 className="text-4xl lg:text-6xl font-bold text-gray-900 mb-6 leading-tight">
              Frequently Asked
              <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent"> Questions</span>
            </h1>
            
            <p className="text-xl text-gray-600 mb-10 leading-relaxed max-w-3xl mx-auto">
              Find answers to common questions about our AI-powered feedback analysis platform, security measures, and Australian data sovereignty.
            </p>
            
            <Button variant="ghost" asChild className="mb-8">
              <Link to="/">
                <ArrowLeft className="mr-2 h-4 w-4" /> Back to Home
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* FAQ Sections */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="space-y-16">
            {faqs.map((category, categoryIndex) => (
              <div key={categoryIndex}>
                <div className="text-center mb-12">
                  <div className={`w-16 h-16 bg-gradient-to-br ${category.color} rounded-2xl flex items-center justify-center mx-auto mb-6`}>
                    <category.icon className="w-8 h-8 text-white" />
                  </div>
                  <h2 className="text-3xl lg:text-4xl font-bold text-gray-900 mb-4">
                    {category.category}
                  </h2>
                </div>
                
                <div className="grid lg:grid-cols-2 gap-8">
                  {category.questions.map((faq, faqIndex) => (
                    <Card key={faqIndex} className="border-0 shadow-lg hover:shadow-xl transition-all duration-300 bg-white">
                      <CardContent className="p-8">
                        <h3 className="text-xl font-semibold mb-4 text-gray-900 flex items-start">
                          <CheckCircle className="w-6 h-6 text-green-600 mr-3 mt-0.5 flex-shrink-0" />
                          {faq.q}
                        </h3>
                        <p className="text-gray-600 leading-relaxed pl-9">{faq.a}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Data Sovereignty Highlight */}
      <section className="py-20 bg-gradient-to-br from-green-50 to-blue-50">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <div className="bg-white rounded-2xl shadow-xl p-8">
            <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-blue-500 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <MapPin className="w-8 h-8 text-white" />
            </div>
            
            <h2 className="text-3xl font-bold text-gray-900 mb-6">
              100% Australian Data Sovereignty
            </h2>
            
            <p className="text-xl text-gray-600 mb-8">
              Your data is stored exclusively in Australian data centers and governed by Australian privacy laws. 
              We ensure complete compliance with local regulations and your data never leaves Australian borders.
            </p>
            
            <div className="grid md:grid-cols-3 gap-6 mb-8">
              <div className="flex items-center justify-center space-x-3">
                <Server className="w-6 h-6 text-green-600" />
                <span className="font-medium text-gray-700">Australian Servers</span>
              </div>
              <div className="flex items-center justify-center space-x-3">
                <Lock className="w-6 h-6 text-green-600" />
                <span className="font-medium text-gray-700">Local Compliance</span>
              </div>
              <div className="flex items-center justify-center space-x-3">
                <Shield className="w-6 h-6 text-green-600" />
                <span className="font-medium text-gray-700">Privacy Protection</span>
              </div>
            </div>
            
            <Link to="/contact">
              <Button className="bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 text-white px-8 py-4 text-lg rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all duration-300">
                Learn More About Our Security
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Contact CTA */}
      <section className="py-20 bg-gradient-to-r from-blue-600 to-purple-600">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-3xl lg:text-4xl font-bold text-white mb-6">
            Still Have Questions?
          </h2>
          <p className="text-xl text-blue-100 mb-10">
            Our team is here to help you understand how our platform can transform your feedback analysis process.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center space-y-4 sm:space-y-0 sm:space-x-6">
            <Link to="/contact">
              <Button className="bg-white text-blue-600 hover:bg-gray-50 px-8 py-4 text-lg rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all duration-300">
                Contact Our Team
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
};

export default FAQ;