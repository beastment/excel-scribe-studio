import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Shield, ArrowRight, Check, Star, Eye, Lock, Zap, ChevronDown } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { EditableText } from '@/components/EditableText';
const CommentDeIdentification = () => {
  const {
    user
  } = useAuth();
  const features = [{
    icon: Shield,
    title: "Advanced PII Detection",
    description: "Automatically identifies and redacts names, addresses, phone numbers, emails, and other sensitive data."
  }, {
    icon: Eye,
    title: "Context Preservation",
    description: "Maintains the original meaning and tone while removing identifiable information."
  }, {
    icon: Lock,
    title: "Enterprise Security",
    description: "SOC 2 compliant processing with end-to-end encryption and audit trails."
  }, {
    icon: Zap,
    title: "Bulk Processing",
    description: "Process thousands of comments in minutes with our high-performance API."
  }];
  const benefits = ["Protect employee privacy while preserving feedback value", "Comply with GDPR, CCPA, and other privacy regulations", "Complete data sovereignty - your data never leaves Australia", "Our AI highlights highly concerning comments, helping protect staff safety", "Enable safe sharing of feedback across teams", "Reduce legal risks from data exposure", "Maintain statistical accuracy for analysis"];
  return <div className="pt-20">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-50 to-blue-50 py-20 lg:py-32">
        <div className="absolute inset-0 bg-grid-slate-100 [mask-image:linear-gradient(0deg,white,rgba(255,255,255,0.6))] -z-10"></div>
        
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-4xl mx-auto">
            <div className="inline-flex items-center space-x-2 bg-blue-100 text-blue-800 px-4 py-2 rounded-full text-sm font-medium mb-8">
              <Star className="w-4 h-4" />
              <span>Currently in Beta</span>
            </div>
            
            <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-3xl flex items-center justify-center mx-auto mb-8">
              <Shield className="w-10 h-10 text-white" />
            </div>
            
            <h1 className="text-4xl lg:text-6xl font-bold text-gray-900 mb-6 leading-tight">
              <EditableText contentKey="comment-de-id-title" as="span">Comment </EditableText>
              <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                <EditableText contentKey="comment-de-id-title-highlight" as="span"> De-Identification</EditableText>
              </span>
            </h1>
            
            <p className="text-xl text-gray-600 mb-6 leading-relaxed max-w-3xl mx-auto">
              <EditableText contentKey="comment-de-id-description" as="span">
                Securely anonymize employee feedback while preserving the original tone and intent. 
                Remove personally identifiable information without losing valuable insights.
              </EditableText>
            </p>
            
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 max-w-2xl mx-auto mb-8">
              <p className="text-sm text-blue-800 font-medium text-center">
                🔒 Your data remains yours and will never be used for training AI models
              </p>
            </div>
            
            <div className="flex flex-col sm:flex-row items-center justify-center space-y-4 sm:space-y-0 sm:space-x-6">
              {user ? <Link to="/comments">
                  <Button className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-8 py-4 text-lg rounded-xl shadow-lg hover:shadow-xl transition-all duration-300">
                    Start De-Identifying
                    <ArrowRight className="ml-2 w-5 h-5" />
                  </Button>
                </Link> : <Link to="/auth">
                  <Button className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-8 py-4 text-lg rounded-xl shadow-lg hover:shadow-xl transition-all duration-300">
                    Get Started
                    <ArrowRight className="ml-2 w-5 h-5" />
                  </Button>
                </Link>}
              <Link to="/contact">
                <Button variant="outline" className="border-2 border-gray-300 text-gray-700 hover:bg-gray-50 px-8 py-4 text-lg rounded-xl transition-all duration-300">
                  Request Demo
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
              <EditableText contentKey="comment-de-id-features-title" as="span">Advanced De-Identification Features</EditableText>
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              <EditableText contentKey="comment-de-id-features-description" as="span">
                Our AI-powered system provides comprehensive privacy protection while maintaining data utility. 
                Our AI also has situational awareness, and can protect people from giving themselves away by describing roles, specific events, etc.
              </EditableText>
            </p>
          </div>
          
          <div className="grid lg:grid-cols-2 gap-8">
            {features.map((feature, index) => <Card key={index} className="border-0 shadow-lg hover:shadow-xl transition-all duration-300 bg-white">
                <CardContent className="p-8">
                  <div className="flex items-start space-x-4">
                    <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center">
                      <feature.icon className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold mb-3 text-gray-900">
                        <EditableText contentKey={`comment-de-id-feature-${index}-title`} as="span">{feature.title}</EditableText>
                      </h3>
                      <p className="text-gray-600 leading-relaxed">
                        <EditableText contentKey={`comment-de-id-feature-${index}-desc`} as="span">{feature.description}</EditableText>
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>)}
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-20 bg-gradient-to-br from-gray-50 to-blue-50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-3xl lg:text-4xl font-bold text-gray-900 mb-6">
                <EditableText contentKey="comment-de-id-why-title" as="span">Why Choose Our De-Identification?</EditableText>
              </h2>
              <p className="text-xl text-gray-600 mb-8">
                <EditableText contentKey="comment-de-id-why-description" as="span">Protect your organization and employees while maintaining the valuable insights hidden in your feedback data.</EditableText>
              </p>
              
              <div className="space-y-4">
                {benefits.map((benefit, index) => <div key={index} className="flex items-start space-x-3">
                    <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                      <Check className="w-4 h-4 text-green-600" />
                    </div>
                    <p className="text-gray-700 font-medium">
                      <EditableText contentKey={`comment-de-id-benefit-${index}`} as="span">{benefit}</EditableText>
                    </p>
                  </div>)}
              </div>
            </div>
            
            <div className="bg-white rounded-2xl shadow-xl p-8">
              <h3 className="text-2xl font-bold text-gray-900 mb-6">Pricing</h3>
              
              <div className="mb-6">
                <Badge className="bg-blue-100 text-blue-800 mb-4">
                  <Star className="w-3 h-3 mr-1" />
                  Beta Pricing
                </Badge>
                <div className="text-4xl font-bold text-gray-900 mb-2">Pay only for what you need</div>
                <div className="text-gray-600">$1.00 per comment processed for the first 1000 comments
$0.50 per comment for the next 9,000
$0.25 for each comment after that</div>
              </div>
              
              <div className="space-y-3 mb-8">
                <div className="flex items-center space-x-2">
                  <Check className="w-4 h-4 text-green-600" />
                  <span className="text-gray-700">Purchase as many as you need, or just upload your file for a quote</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Check className="w-4 h-4 text-green-600" />
                  <span className="text-gray-700">Bulk Processing API</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Check className="w-4 h-4 text-green-600" />
                  <span className="text-gray-700">Enterprise Security</span>
                </div>
                <div className="flex items-center space-x-2">
                  
                  
                </div>
              </div>
              
              {user ? <Link to="/comments">
                  <Button className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white py-3 rounded-xl font-medium transition-all duration-300">
                    Start Processing
                    <ArrowRight className="ml-2 w-5 h-5" />
                  </Button>
                </Link> : <Link to="/auth">
                  <Button className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white py-3 rounded-xl font-medium transition-all duration-300">
                    Get Started
                    <ArrowRight className="ml-2 w-5 h-5" />
                  </Button>
                </Link>}
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-r from-blue-600 to-purple-600">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-3xl lg:text-4xl font-bold text-white mb-6">
            <EditableText contentKey="comment-de-id-cta-title" as="span">Ready to Secure Your Employee Feedback?</EditableText>
          </h2>
          <p className="text-xl text-blue-100 mb-10">
            <EditableText contentKey="comment-de-id-cta-description" as="span">Join organizations worldwide who trust us to protect their sensitive data while preserving valuable insights.</EditableText>
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center space-y-4 sm:space-y-0 sm:space-x-6">
            {user ? <Link to="/comments">
                <Button className="bg-white text-blue-600 hover:bg-gray-50 px-8 py-4 text-lg rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all duration-300">
                  Start De-Identifying
                </Button>
              </Link> : <>
                <Link to="/auth">
                  <Button className="bg-white text-blue-600 hover:bg-gray-50 px-8 py-4 text-lg rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all duration-300">
                    Get Started
                  </Button>
                </Link>
                <Link to="/contact">
                  <Button variant="outline" className="border-2 border-white text-white hover:bg-white hover:text-blue-600 px-8 py-4 text-lg rounded-xl transition-all duration-300">
                    Contact Sales
                  </Button>
                </Link>
              </>}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-20 bg-white">
        <div className="max-w-4xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl lg:text-4xl font-bold text-gray-900 mb-4">
              Frequently Asked Questions
            </h2>
            <p className="text-lg text-gray-600">
              Get answers to common questions about our comment de-identification service
            </p>
          </div>

          <Accordion type="single" collapsible className="space-y-4">
            <AccordionItem value="data-security" className="border border-gray-200 rounded-lg">
              <AccordionTrigger className="px-6 py-4 text-left hover:no-underline">
                <span className="text-lg font-semibold text-gray-900">Where is my data stored, and how secure is it?</span>
              </AccordionTrigger>
              <AccordionContent className="px-6 pb-4">
                <p className="text-gray-700 leading-relaxed">
                  We get it. You're entrusting us with highly sensitive data that will be processed by an AI. All data resides on secure AWS servers located in Sydney Australia. It's encrypted during transit and at rest. Additionally, once the analysis is done your data is removed unless you opt to save the session. You can delete any saved sessions yourself, or they will automatically be removed after three months. The AI models we use are deployed on secure AWS and Azure infrastructure located in Australian datacentres. We do not send your data to international AI companies (OpenAI, Anthropic, etc).
                </p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="what-does-it-do" className="border border-gray-200 rounded-lg">
              <AccordionTrigger className="px-6 py-4 text-left hover:no-underline">
                <span className="text-lg font-semibold text-gray-900">What does this do exactly?</span>
              </AccordionTrigger>
              <AccordionContent className="px-6 pb-4">
                <p className="text-gray-700 leading-relaxed">
                  It flags any comments that contain personally identifying information (names, IDs, etc), or contextual information that could potentially identify someone either directly or indirectly (e.g. if someone refers to the "Head of Marketing", or indicates that they have worked in their role for a specific length of time, have three children, etc). It also recognises specific events that could be identifying, like "the person who talked about XYZ at the team meeting…". It also flags comments that are unnecessarily inflammatory (e.g. expletives, accusations, "sack the whole team", etc).
                </p>
                <p className="text-gray-700 leading-relaxed mt-3">
                  In addition to flagging whether a comment is identifying/inflammatory, each comment is flagged if it contains 'concerning' content that requires your attention. For example, this could be content that indicates a serious safety issue, threats of violence, self-harm, alleged criminal activity, etc.
                </p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="flagged-comments" className="border border-gray-200 rounded-lg">
              <AccordionTrigger className="px-6 py-4 text-left hover:no-underline">
                <span className="text-lg font-semibold text-gray-900">What happens when a comment has been flagged?</span>
              </AccordionTrigger>
              <AccordionContent className="px-6 pb-4">
                <p className="text-gray-700 leading-relaxed">
                  For comments that are flagged you are provided with both a redacted version (that has the identifying parts of the comment replaced by XXXX) and a rephrased version (that has the comment reworded so as to convey the original intent, but without the problematic references). You can choose whether prefer redacted or rephrased content to be the default, and can switch individual comments from one to the other as needed. Comments that flagged as concerning but not identifiable/inflammatory are just rephrased.
                </p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="positive-comments" className="border border-gray-200 rounded-lg">
              <AccordionTrigger className="px-6 py-4 text-left hover:no-underline">
                <span className="text-lg font-semibold text-gray-900">What if the comment is positive, e.g. identifies someone but is actually praising them?</span>
              </AccordionTrigger>
              <AccordionContent className="px-6 pb-4">
                <p className="text-gray-700 leading-relaxed">
                  These types of comments are not flagged.
                </p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="existing-platform" className="border border-gray-200 rounded-lg">
              <AccordionTrigger className="px-6 py-4 text-left hover:no-underline">
                <span className="text-lg font-semibold text-gray-900">Can't I just use my existing platform to do this?</span>
              </AccordionTrigger>
              <AccordionContent className="px-6 pb-4">
                <p className="text-gray-700 leading-relaxed">
                  Possibly, but the vast majority of platforms do not provide any similar functionality. Those that do, typically only scan for Personally Identifying Material (PII), such as; names, phone numbers, titles, etc, and often just remove the entire comment or flag it for manual review.
                </p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="review-results" className="border border-gray-200 rounded-lg">
              <AccordionTrigger className="px-6 py-4 text-left hover:no-underline">
                <span className="text-lg font-semibold text-gray-900">Can I review the results of the analysis?</span>
              </AccordionTrigger>
              <AccordionContent className="px-6 pb-4">
                <p className="text-gray-700 leading-relaxed">
                  Yes, absolutely. Our software includes a full interface for reviewing the comments. It provides details on how many comments were flagged and in what way, the ability to filter the full comment list to show only the comments that were identifiable/inflammatory, or only those that were concerning. For each flagged comment you are able to switch between the redacted text and the rephrased text, revert to the original text, or edit the final text directly. You can flag comments as approved and not needing further analysis (but you are not required to approve comments), and can also save your session in case you want to come back and make some changes later one.
                </p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="departments" className="border border-gray-200 rounded-lg">
              <AccordionTrigger className="px-6 py-4 text-left hover:no-underline">
                <span className="text-lg font-semibold text-gray-900">What about different departments, demographics, etc?</span>
              </AccordionTrigger>
              <AccordionContent className="px-6 pb-4">
                <p className="text-gray-700 leading-relaxed">
                  Our platform allows you to include a department or demographic column alongside each comment. You can then filter to see only comments from those groups.
                </p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="multiple-questions" className="border border-gray-200 rounded-lg">
              <AccordionTrigger className="px-6 py-4 text-left hover:no-underline">
                <span className="text-lg font-semibold text-gray-900">What if I have comments from multiple survey questions?</span>
              </AccordionTrigger>
              <AccordionContent className="px-6 pb-4">
                <p className="text-gray-700 leading-relaxed">
                  Each comment is treated independently. Generally, you would analyse comments from one question at a time.
                </p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="after-analysis" className="border border-gray-200 rounded-lg">
              <AccordionTrigger className="px-6 py-4 text-left hover:no-underline">
                <span className="text-lg font-semibold text-gray-900">What happens after the analysis?</span>
              </AccordionTrigger>
              <AccordionContent className="px-6 pb-4">
                <p className="text-gray-700 leading-relaxed">
                  Once you are finished, simply hit the export button and you will be provided with an Excel or CSV file showing the full list of original comments, the redacted and rephrased versions, and the final version of the comment (including any direct edits that you made). You can then upload the comments back into your existing survey platform, or contact your provider for assistance.
                </p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="accuracy" className="border border-gray-200 rounded-lg">
              <AccordionTrigger className="px-6 py-4 text-left hover:no-underline">
                <span className="text-lg font-semibold text-gray-900">How accurate is it?</span>
              </AccordionTrigger>
              <AccordionContent className="px-6 pb-4">
                <p className="text-gray-700 leading-relaxed">
                  Every comment is analysed by two high performing AI models, which agree over 80% of the time. If the two models disagree on whether a comment is concerning or identifiable/inflammatory, then an additional premium AI model conducts a further analysis to resolve the disagreement (just like a supervisor overseeing the work of junior analysts).
                </p>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </section>
    </div>;
};
export default CommentDeIdentification;