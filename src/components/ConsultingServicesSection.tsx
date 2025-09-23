import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { User, FileText, Settings, Briefcase, Target, Lightbulb, Mail } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EditableText } from '@/components/EditableText';

interface ConsultingService {
  id: string;
  service_id: string;
  name: string;
  description: string | null;
  is_enabled: boolean;
  is_hidden: boolean;
  is_blurred: boolean;
  status: string;
  position: number;
}

interface ConsultingServicesSettings {
  is_enabled: boolean;
  section_title: string;
  section_subtitle: string;
}

const serviceIcons = {
  'survey-results-presentation': FileText,
  'written-recommendations': FileText,
  'bespoke-survey-design': Settings,
  'project-management': Briefcase,
  '360-debrief-sessions': User,
  'action-planning-workshops': Target,
};

const serviceRoutes = {
  'survey-results-presentation': '/services/survey-results-presentation',
  'written-recommendations': '/services/written-recommendations',
  'bespoke-survey-design': '/services/bespoke-survey-design',
  'project-management': '/services/project-management',
  '360-debrief-sessions': '/services/debrief-sessions',
  'action-planning-workshops': '/services/action-planning-workshops',
};

export const ConsultingServicesSection: React.FC = () => {
  const [services, setServices] = useState<ConsultingService[]>([]);
  const [settings, setSettings] = useState<ConsultingServicesSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [servicesResult, settingsResult] = await Promise.all([
          supabase
            .from('consulting_services')
            .select('*')
            .eq('is_enabled', true)
            .eq('is_hidden', false)
            .order('position'),
          supabase
            .from('consulting_services_settings')
            .select('*')
            .limit(1)
        ]);

        if (servicesResult.error) throw servicesResult.error;
        if (settingsResult.error) throw settingsResult.error;

        setServices(servicesResult.data || []);
        setSettings(settingsResult.data?.[0] || null);
      } catch (error) {
        console.error('Error fetching consulting services:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const effectiveSettings: ConsultingServicesSettings = settings ?? {
    is_enabled: true,
    section_title: 'When AI is not enough, and you need HI: Human Intelligence',
    section_subtitle: 'Our professional consultants are registered workplace psychologists, specialising in working with you to obtain maximum value from your survey results.',
  };

  if (loading || !effectiveSettings.is_enabled || services.length === 0) {
    return null;
  }

  return (
    <section className="py-20">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <EditableText contentKey="consulting-services-title" as="h2" className="text-3xl md:text-4xl font-bold mb-6">
            {effectiveSettings.section_title}
          </EditableText>
          <EditableText contentKey="consulting-services-subtitle" as="p" className="text-xl text-muted-foreground max-w-4xl mx-auto leading-relaxed">
            {effectiveSettings.section_subtitle}
          </EditableText>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {services.map((service) => {
            const IconComponent = serviceIcons[service.service_id as keyof typeof serviceIcons] || Lightbulb;
            const route = serviceRoutes[service.service_id as keyof typeof serviceRoutes] || '#';
            
            return (
              <Card key={service.id} className="group hover:shadow-lg transition-all duration-300 border-2 hover:border-primary/30">
                <CardContent className="p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                      <IconComponent className="h-6 w-6 text-primary" />
                    </div>
                    <Badge variant="secondary" className="text-sm">
                      {service.status}
                    </Badge>
                  </div>
                  
                  <h3 className="text-xl font-semibold mb-3 group-hover:text-primary transition-colors">
                    {service.name}
                  </h3>
                  
                  <p className="text-muted-foreground mb-6 leading-relaxed">
                    {service.description}
                  </p>
                  
                  <div className="flex gap-3">
                    <Button asChild size="sm" className="flex-1">
                      <Link to={route}>Learn More</Link>
                    </Button>
                    <Button variant="outline" size="sm" className="gap-2">
                      <Mail className="h-4 w-4" />
                      Contact
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
};