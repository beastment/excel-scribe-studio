import React, { useState, useRef } from 'react';
import { FileUpload, CommentData } from '@/components/FileUpload';
import { CommentEditor } from '@/components/CommentEditor';
import { Button } from '@/components/ui/button';
import { FileText } from 'lucide-react';
import { toast } from 'sonner';
import { CreditsDisplay } from '@/components/CreditsDisplay';
import { InsufficientCreditsDialog } from '@/components/InsufficientCreditsDialog';
import { useUserCredits } from '@/hooks/useUserCredits';
import { useAuth } from '@/contexts/AuthContext';
const Index = () => {
  const [comments, setComments] = useState<CommentData[]>([]);
  const [isDemoData, setIsDemoData] = useState(false);
  const [hasScanRun, setHasScanRun] = useState(false);
  const [showInsufficientCreditsDialog, setShowInsufficientCreditsDialog] = useState(false);
  const [creditsError, setCreditsError] = useState<{ needed: number; available: number } | null>(null);
  
  const { user } = useAuth();
  const { credits, loading: creditsLoading, refreshCredits } = useUserCredits();
  const aiLogsViewerRef = useRef<{ clearLogs: () => void } | null>(null);
  const [shouldClearLogs, setShouldClearLogs] = useState(false);

  // Effect to clear logs when the flag is set
  useEffect(() => {
    if (shouldClearLogs && aiLogsViewerRef.current) {
      aiLogsViewerRef.current.clearLogs();
      setShouldClearLogs(false);
    }
  }, [shouldClearLogs]);
  const handleDataLoaded = (newComments: CommentData[]) => {
    setIsDemoData(false); // Regular file upload, not demo data
    
    // Reset all comments to clean state - clear AI processing results and set status to "Scan Needed"
    const cleanComments = newComments.map(comment => ({
      ...comment,
      concerning: false,
      identifiable: false,
      aiReasoning: undefined,
      redactedText: undefined,
      rephrasedText: undefined,
      mode: undefined,
      approved: false,
      hideAiResponse: false,
      needsAdjudication: false,
      isAdjudicated: false,
      needsPostProcessing: false,
      isPostProcessed: false,
      debugInfo: undefined
    }));
    
    setComments(cleanComments);
    setHasScanRun(false); // Reset scan state when new data is imported
    
    // Set flag to clear AI logs when new file is loaded
    setShouldClearLogs(true);
  };
  const handleCommentsUpdate = (updatedComments: CommentData[]) => {
    setComments(updatedComments);
  };

  const handleCreditsError = (needed: number, available: number) => {
    setCreditsError({ needed, available });
    setShowInsufficientCreditsDialog(true);
  };

  const handleCreditsRefresh = () => {
    refreshCredits();
  };

  const clearComments = () => {
    setComments([]);
    setIsDemoData(false);
    setHasScanRun(false);
    
    // Set flag to clear AI logs when comments are cleared
    setShouldClearLogs(true);
  };
  const loadDemoData = () => {
    setIsDemoData(true);
    const demoComments: CommentData[] = [{
      id: '1',
      originalText: 'The management team really needs to improve their communication skills. John Smith in HR is particularly difficult to work with.',
      text: 'The management team really needs to improve their communication skills. John Smith in HR is particularly difficult to work with.',
      author: 'Anonymous',
      originalRow: 1,
      concerning: false,
      identifiable: true,
      demographics: 'Engineering'
    }, {
      id: '2',
      originalText: 'I love working here! The flexible schedule and remote work options have been life-changing.',
      text: 'I love working here! The flexible schedule and remote work options have been life-changing.',
      author: 'Anonymous',
      originalRow: 2,
      concerning: false,
      identifiable: false,
      demographics: 'Marketing'
    }, {
      id: '3',
      originalText: 'The new manager in accounting, Sarah Johnson (employee ID 12345), has been making inappropriate comments about female employees. This needs to be addressed immediately.',
      text: 'The new manager in accounting, Sarah Johnson (employee ID 12345), has been making inappropriate comments about female employees. This needs to be addressed immediately.',
      author: 'Anonymous',
      originalRow: 3,
      concerning: true,
      identifiable: true,
      demographics: 'Finance'
    }, {
      id: '4',
      originalText: 'Great company culture and benefits package. The health insurance coverage is excellent.',
      text: 'Great company culture and benefits package. The health insurance coverage is excellent.',
      author: 'Anonymous',
      originalRow: 4,
      concerning: false,
      identifiable: false,
      demographics: 'HR'
    }, {
      id: '5',
      originalText: 'I feel unsafe coming to work due to threats from my supervisor Mike Wilson. He said he would "make my life hell" if I didn\'t work overtime without pay.',
      text: 'I feel unsafe coming to work due to threats from my supervisor Mike Wilson. He said he would "make my life hell" if I didn\'t work overtime without pay.',
      author: 'Anonymous',
      originalRow: 5,
      concerning: true,
      identifiable: true,
      demographics: 'Operations'
    }, {
      id: '6',
      originalText: 'The office coffee machine is always broken. Can we please get it fixed?',
      text: 'The office coffee machine is always broken. Can we please get it fixed?',
      author: 'Anonymous',
      originalRow: 6,
      concerning: false,
      identifiable: false,
      demographics: 'Sales'
    }, {
      id: '7',
      originalText: 'My direct report told me about drug use during work hours by employees in the warehouse. I witnessed Tom Anderson (badge #789) smoking what appeared to be marijuana during lunch break.',
      text: 'My direct report told me about drug use during work hours by employees in the warehouse. I witnessed Tom Anderson (badge #789) smoking what appeared to be marijuana during lunch break.',
      author: 'Anonymous',
      originalRow: 7,
      concerning: true,
      identifiable: true,
      demographics: 'Management'
    }, {
      id: '8',
      originalText: 'The training programs have been very helpful for my professional development.',
      text: 'The training programs have been very helpful for my professional development.',
      author: 'Anonymous',
      originalRow: 8,
      concerning: false,
      identifiable: false,
      demographics: 'Engineering'
    }, {
      id: '9',
      originalText: 'There have been multiple incidents of theft from employee lockers. Security cameras caught Jennifer Lee from customer service taking items from other people\'s belongings.',
      text: 'There have been multiple incidents of theft from employee lockers. Security cameras caught Jennifer Lee from customer service taking items from other people\'s belongings.',
      author: 'Anonymous',
      originalRow: 9,
      concerning: true,
      identifiable: true,
      demographics: 'Security'
    }, {
      id: '10',
      originalText: 'The new parking policy is unfair to employees who don\'t live close to the office.',
      text: 'The new parking policy is unfair to employees who don\'t live close to the office.',
      author: 'Anonymous',
      originalRow: 10,
      concerning: false,
      identifiable: false,
      demographics: 'Marketing'
    }, {
      id: '11',
      originalText: 'I enjoy the collaborative work environment and my team members are supportive.',
      text: 'I enjoy the collaborative work environment and my team members are supportive.',
      author: 'Anonymous',
      originalRow: 11,
      concerning: false,
      identifiable: false,
      demographics: 'Engineering'
    }, {
      id: '12',
      originalText: 'The annual performance review process needs improvement. My manager Rebecca Williams provides very little useful feedback.',
      text: 'The annual performance review process needs improvement. My manager Rebecca Williams provides very little useful feedback.',
      author: 'Anonymous',
      originalRow: 12,
      concerning: false,
      identifiable: true,
      demographics: 'Finance'
    }, {
      id: '13',
      originalText: 'I love the company picnic every summer! It\'s a great way to connect with colleagues.',
      text: 'I love the company picnic every summer! It\'s a great way to connect with colleagues.',
      author: 'Anonymous',
      originalRow: 13,
      concerning: false,
      identifiable: false,
      demographics: 'HR'
    }, {
      id: '14',
      originalText: 'There are serious safety violations in the manufacturing area. Equipment operator David Chen (SSN: 123-45-6789) doesn\'t follow proper procedures and someone is going to get hurt.',
      text: 'There are serious safety violations in the manufacturing area. Equipment operator David Chen (SSN: 123-45-6789) doesn\'t follow proper procedures and someone is going to get hurt.',
      author: 'Anonymous',
      originalRow: 14,
      concerning: true,
      identifiable: true,
      demographics: 'Manufacturing'
    }, {
      id: '15',
      originalText: 'The work-life balance here is excellent. I appreciate the mental health days.',
      text: 'The work-life balance here is excellent. I appreciate the mental health days.',
      author: 'Anonymous',
      originalRow: 15,
      concerning: false,
      identifiable: false,
      demographics: 'Marketing'
    }, {
      id: '16',
      originalText: 'Please provide more opportunities for career advancement and promotion.',
      text: 'Please provide more opportunities for career advancement and promotion.',
      author: 'Anonymous',
      originalRow: 16,
      concerning: false,
      identifiable: false,
      demographics: 'Sales'
    }, {
      id: '17',
      originalText: 'The IT department is very responsive when we have technical issues.',
      text: 'The IT department is very responsive when we have technical issues.',
      author: 'Anonymous',
      originalRow: 17,
      concerning: false,
      identifiable: false,
      demographics: 'Operations'
    }, {
      id: '18',
      originalText: 'I\'ve witnessed discrimination against older employees. Manager Lisa Rodriguez (phone: 555-0123) made ageist comments saying "we need fresh blood, not these old dinosaurs".',
      text: 'I\'ve witnessed discrimination against older employees. Manager Lisa Rodriguez (phone: 555-0123) made ageist comments saying "we need fresh blood, not these old dinosaurs".',
      author: 'Anonymous',
      originalRow: 18,
      concerning: true,
      identifiable: true,
      demographics: 'Management'
    }, {
      id: '19',
      originalText: 'The company\'s commitment to sustainability is impressive and motivating.',
      text: 'The company\'s commitment to sustainability is impressive and motivating.',
      author: 'Anonymous',
      originalRow: 19,
      concerning: false,
      identifiable: false,
      demographics: 'Engineering'
    }, {
      id: '20',
      originalText: 'Can we please get better chairs? My back is killing me after long days at the computer.',
      text: 'Can we please get better chairs? My back is killing me after long days at the computer.',
      author: 'Anonymous',
      originalRow: 20,
      concerning: false,
      identifiable: false,
      demographics: 'Finance'
    }];

    // Clear any cached AI results and reset to clean state
    const cleanDemoComments = demoComments.map(comment => ({
      ...comment,
      concerning: false,
      identifiable: false,
      aiReasoning: undefined,
      redactedText: undefined,
      rephrasedText: undefined,
      mode: undefined,
      approved: false,
      hideAiResponse: false
    }));
    setComments(cleanDemoComments); // Directly set comments for demo data
    setHasScanRun(false); // Reset scan state for demo data
    
    // Set flag to clear AI logs when demo data is loaded
    setShouldClearLogs(true);
    
    toast.success('Demo data loaded successfully! 20 employee survey comments imported.');
  };
  return <div className="pt-20">
      {/* Header */}
      <section className="relative overflow-hidden bg-gradient-to-br from-background to-muted py-8 lg:py-12">
        <div className="absolute inset-0 bg-grid-slate-100 [mask-image:linear-gradient(0deg,white,rgba(255,255,255,0.6))] -z-10"></div>
        
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-4xl mx-auto">
            
            {user && (
              <div className="flex justify-center mb-6">
                <CreditsDisplay credits={credits} loading={creditsLoading} />
              </div>
            )}
            
            <h1 className="text-4xl lg:text-6xl font-bold text-foreground mb-6 leading-tight">
              Comment
              <span className="bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent"> De-Identification</span>
            </h1>
            
            <p className="text-xl text-gray-600 mb-6 leading-relaxed max-w-3xl mx-auto">
              Upload your comment files (.xlsx, .xls, .csv) and automatically remove sensitive information while preserving tone and context. Powered by enterprise-grade AI.
            </p>
            
            
          </div>
        </div>
      </section>

      {/* Main Content */}
      <section className="py-12 bg-muted/50">
        <div className="w-full px-6">
          <div className="w-full space-y-12">
            {comments.length === 0 ? <div className="animate-slide-up">
              <h2 className="text-2xl font-bold text-center mb-8">
                Get Started
              </h2>
              <div className="flex flex-col items-center gap-4 mb-6">
                <Button onClick={loadDemoData} variant="outline" className="gap-2">
                  <FileText className="w-4 h-4" />
                  Load Demo File
                </Button>
                <div className="text-sm text-muted-foreground">or</div>
              </div>
              <FileUpload onDataLoaded={handleDataLoaded} />
            </div> : <div className="animate-slide-up">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold">
                  {isDemoData ? 'Demo Data' : 'Comment Analysis'}
                </h2>
                <Button onClick={clearComments} variant="outline" size="sm">
                  Clear & Start Over
                </Button>
              </div>
              <CommentEditor 
                comments={comments} 
                onCommentsUpdate={handleCommentsUpdate} 
                onImportComments={handleDataLoaded}
                onCreditsError={handleCreditsError}
                onCreditsRefresh={handleCreditsRefresh}
                onResetScanState={() => setHasScanRun(false)}
                isDemoData={isDemoData}
                hasScanRun={hasScanRun}
                setHasScanRun={setHasScanRun}
                aiLogsViewerRef={aiLogsViewerRef}
              />
            </div>}
          </div>
        </div>
      </section>

      {/* Insufficient Credits Dialog */}
      <InsufficientCreditsDialog
        open={showInsufficientCreditsDialog}
        onOpenChange={setShowInsufficientCreditsDialog}
        creditsNeeded={creditsError?.needed || 0}
        creditsAvailable={creditsError?.available || 0}
        onTryDemoFile={clearComments}
        onRefreshCredits={handleCreditsRefresh}
      />
    </div>;
};
export default Index;