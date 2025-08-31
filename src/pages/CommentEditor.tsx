import React, { useState, useRef, useEffect } from 'react';
import { FileUpload, CommentData } from '@/components/FileUpload';
import { CommentEditor } from '@/components/CommentEditor';
import { Button } from '@/components/ui/button';
import { FileText } from 'lucide-react';
import { toast } from 'sonner';
import { CreditsDisplay } from '@/components/CreditsDisplay';
import { InsufficientCreditsDialog } from '@/components/InsufficientCreditsDialog';
import { useUserCredits } from '@/hooks/useUserCredits';
import { useAuth } from '@/contexts/AuthContext';
const CommentEditorPage = () => {
  const [comments, setComments] = useState<CommentData[]>([]);
  const [isDemoData, setIsDemoData] = useState(false);
  const [hasScanRun, setHasScanRun] = useState(false);
  const [showInsufficientCreditsDialog, setShowInsufficientCreditsDialog] = useState(false);
  const [creditsError, setCreditsError] = useState<{ needed: number; available: number } | null>(null);
  
  const { user } = useAuth();
  const { credits, loading: creditsLoading, refreshCredits } = useUserCredits();
  const aiLogsViewerRef = useRef<{ clearLogs: () => void } | null>(null);
  const [isLoadingNewData, setIsLoadingNewData] = useState(false);
  const isLoadingNewDataRef = useRef(false);

  // Effect to clear logs when new data is loaded
  useEffect(() => {
    if (isLoadingNewData && aiLogsViewerRef.current) {
      aiLogsViewerRef.current.clearLogs();
      setIsLoadingNewData(false);
      isLoadingNewDataRef.current = false;
    }
  }, [isLoadingNewData]);
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
    isLoadingNewDataRef.current = true;
    setIsLoadingNewData(true);
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
    isLoadingNewDataRef.current = true;
    setIsLoadingNewData(true);
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
      originalText: 'The salary structure is transparent and fair. I feel valued for my contributions.',
      text: 'The salary structure is transparent and fair. I feel valued for my contributions.',
      author: 'Anonymous',
      originalRow: 12,
      concerning: false,
      identifiable: false,
      demographics: 'HR'
    }, {
      id: '13',
      originalText: 'My coworker David Martinez has been harassing me with inappropriate messages. I have screenshots of the conversations.',
      text: 'My coworker David Martinez has been harassing me with inappropriate messages. I have screenshots of the conversations.',
      author: 'Anonymous',
      originalRow: 13,
      concerning: true,
      identifiable: true,
      demographics: 'Sales'
    }, {
      id: '14',
      originalText: 'The office environment is clean and well-maintained. Great job facilities team!',
      text: 'The office environment is clean and well-maintained. Great job facilities team!',
      author: 'Anonymous',
      originalRow: 14,
      concerning: false,
      identifiable: false,
      demographics: 'Facilities'
    }, {
      id: '15',
      originalText: 'I witnessed my manager Lisa Thompson (employee #456) accepting bribes from vendors. This is a serious ethical violation.',
      text: 'I witnessed my manager Lisa Thompson (employee #456) accepting bribes from vendors. This is a serious ethical violation.',
      author: 'Anonymous',
      originalRow: 15,
      concerning: true,
      identifiable: true,
      demographics: 'Procurement'
    }, {
      id: '16',
      originalText: 'The company\'s commitment to sustainability is impressive. I appreciate the recycling initiatives.',
      text: 'The company\'s commitment to sustainability is impressive. I appreciate the recycling initiatives.',
      author: 'Anonymous',
      originalRow: 16,
      concerning: false,
      identifiable: false,
      demographics: 'Marketing'
    }, {
      id: '17',
      originalText: 'There\'s a toxic work environment in the IT department. My supervisor Robert Chen constantly belittles team members.',
      text: 'There\'s a toxic work environment in the IT department. My supervisor Robert Chen constantly belittles team members.',
      author: 'Anonymous',
      originalRow: 17,
      concerning: true,
      identifiable: true,
      demographics: 'IT'
    }, {
      id: '18',
      originalText: 'The new project management software has improved our workflow significantly.',
      text: 'The new project management software has improved our workflow significantly.',
      author: 'Anonymous',
      originalRow: 18,
      concerning: false,
      identifiable: false,
      demographics: 'Engineering'
    }, {
      id: '19',
      originalText: 'I found evidence of financial fraud in the accounting department. Maria Rodriguez has been manipulating expense reports.',
      text: 'I found evidence of financial fraud in the accounting department. Maria Rodriguez has been manipulating expense reports.',
      author: 'Anonymous',
      originalRow: 19,
      concerning: true,
      identifiable: true,
      demographics: 'Finance'
    }, {
      id: '20',
      originalText: 'The employee recognition program is motivating and helps boost morale.',
      text: 'The employee recognition program is motivating and helps boost morale.',
      author: 'Anonymous',
      originalRow: 20,
      concerning: false,
      identifiable: false,
      demographics: 'HR'
    }];

    setComments(demoComments);
    setHasScanRun(false);
    setIsLoadingNewData(false);
    setIsDemoData(true);
    // Set flag to clear AI logs when demo data is loaded
    if (aiLogsViewerRef?.current) {
      aiLogsViewerRef.current.clearLogs();
    }
    toast.success('Demo data loaded successfully! 20 employee survey comments imported.');
  };

  // Generate a larger test dataset for performance testing
  const generateLargeTestData = (count: number = 1000) => {
    setIsDemoData(true);
    setIsLoadingNewData(true);
    
    const departments = ['Engineering', 'Marketing', 'Sales', 'HR', 'Finance', 'IT', 'Operations', 'Management', 'Security', 'Facilities'];
    const positiveComments = [
      'I love working here! The flexible schedule and remote work options have been life-changing.',
      'Great company culture and benefits package. The health insurance coverage is excellent.',
      'The training programs have been very helpful for my professional development.',
      'I enjoy the collaborative work environment and my team members are supportive.',
      'The salary structure is transparent and fair. I feel valued for my contributions.',
      'The office environment is clean and well-maintained. Great job facilities team!',
      'The company\'s commitment to sustainability is impressive. I appreciate the recycling initiatives.',
      'The new project management software has improved our workflow significantly.',
      'The employee recognition program is motivating and helps boost morale.',
      'The work-life balance here is excellent. I appreciate the flexible hours.'
    ];
    
    const neutralComments = [
      'The office coffee machine is always broken. Can we please get it fixed?',
      'The new parking policy is unfair to employees who don\'t live close to the office.',
      'The new project management software has improved our workflow significantly.',
      'The office environment is clean and well-maintained. Great job facilities team!',
      'The company\'s commitment to sustainability is impressive. I appreciate the recycling initiatives.',
      'The training programs have been very helpful for my professional development.',
      'The salary structure is transparent and fair. I feel valued for my contributions.',
      'The work-life balance here is excellent. I appreciate the flexible hours.',
      'The employee recognition program is motivating and helps boost morale.',
      'The new project management software has improved our workflow significantly.'
    ];
    
    const concerningComments = [
      'The management team really needs to improve their communication skills. John Smith in HR is particularly difficult to work with.',
      'The new manager in accounting, Sarah Johnson (employee ID 12345), has been making inappropriate comments about female employees. This needs to be addressed immediately.',
      'I feel unsafe coming to work due to threats from my supervisor Mike Wilson. He said he would "make my life hell" if I didn\'t work overtime without pay.',
      'My direct report told me about drug use during work hours by employees in the warehouse. I witnessed Tom Anderson (badge #789) smoking what appeared to be marijuana during lunch break.',
      'There have been multiple incidents of theft from employee lockers. Security cameras caught Jennifer Lee from customer service taking items from other people\'s belongings.',
      'My coworker David Martinez has been harassing me with inappropriate messages. I have screenshots of the conversations.',
      'I witnessed my manager Lisa Thompson (employee #456) accepting bribes from vendors. This is a serious ethical violation.',
      'There\'s a toxic work environment in the IT department. My supervisor Robert Chen constantly belittles team members.',
      'I found evidence of financial fraud in the accounting department. Maria Rodriguez has been manipulating expense reports.',
      'The new manager in marketing, Alex Johnson (employee #789), has been making inappropriate comments about female employees. This needs to be addressed immediately.'
    ];

    const largeTestComments: CommentData[] = [];
    
    for (let i = 1; i <= count; i++) {
      const commentType = Math.random();
      let text: string;
      
      if (commentType < 0.1) {
        // 10% concerning comments
        text = concerningComments[Math.floor(Math.random() * concerningComments.length)];
      } else if (commentType < 0.3) {
        // 20% positive comments
        text = positiveComments[Math.floor(Math.random() * positiveComments.length)];
      } else {
        // 70% neutral comments
        text = neutralComments[Math.floor(Math.random() * neutralComments.length)];
      }
      
      largeTestComments.push({
        id: i.toString(),
        originalText: text,
        text: text,
        author: 'Anonymous',
        originalRow: i,
        concerning: false,
        identifiable: false,
        demographics: departments[Math.floor(Math.random() * departments.length)]
      });
    }

    setComments(largeTestComments);
    setHasScanRun(false);
    setIsLoadingNewData(false);
    setIsDemoData(true);
    // Set flag to clear AI logs when test data is loaded
    if (aiLogsViewerRef?.current) {
      aiLogsViewerRef.current.clearLogs();
    }
    toast.success(`Large test dataset loaded successfully! ${count} employee survey comments imported for performance testing.`);
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
                <div className="flex flex-wrap justify-center gap-2 mb-4">
                  <Button onClick={loadDemoData} variant="outline" className="gap-2">
                    <FileText className="w-4 h-4" />
                    Load Demo (20 comments)
                  </Button>
                  <Button onClick={() => generateLargeTestData(500)} variant="outline" className="gap-2">
                    <FileText className="w-4 h-4" />
                    Test 500 Comments
                  </Button>
                  <Button onClick={() => generateLargeTestData(1000)} variant="outline" className="gap-2">
                    <FileText className="w-4 h-4" />
                    Test 1000 Comments
                  </Button>
                </div>
                <div className="text-sm text-muted-foreground">or</div>
              </div>
              <FileUpload onDataLoaded={handleDataLoaded} />
            </div> : <div className="animate-slide-up">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold">
                  {isDemoData ? 'Demo Data' : 'Comment Analysis'}
                </h2>
                <div className="flex gap-2 items-center">
                  {comments.length > 100 && (
                    <div className="text-sm text-muted-foreground bg-muted px-3 py-1 rounded">
                      📊 {comments.length} comments loaded
                    </div>
                  )}
                  <Button onClick={clearComments} variant="outline" size="sm">
                    Clear & Start Over
                  </Button>
                </div>
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
                shouldClearLogs={isLoadingNewDataRef.current}
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
export default CommentEditorPage;