import React, { useState, useEffect } from 'react';
import { Search, Download, Edit3, Check, X, User, Filter, Scan, AlertTriangle, Eye, EyeOff, ToggleLeft, ToggleRight, Upload, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { CommentData, FileUpload } from './FileUpload';
import { supabase } from '@/integrations/supabase/client';
import * as XLSX from 'xlsx';

interface CommentEditorProps {
  comments: CommentData[];
  onCommentsUpdate: (comments: CommentData[]) => void;
  onImportComments: (comments: CommentData[]) => void;
}

export const CommentEditor: React.FC<CommentEditorProps> = ({ 
  comments, 
  onCommentsUpdate,
  onImportComments
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [showConcerningOnly, setShowConcerningOnly] = useState(false);
  const [showIdentifiableOnly, setShowIdentifiableOnly] = useState(false);
  const [filteredComments, setFilteredComments] = useState<CommentData[]>(comments);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [defaultMode, setDefaultMode] = useState<'redact' | 'rephrase'>('redact');
  const [showImportDialog, setShowImportDialog] = useState(false);

  useEffect(() => {
    let filtered = comments.filter(comment => {
      const matchesSearch = comment.text.toLowerCase().includes(searchTerm.toLowerCase()) ||
        comment.originalText.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (comment.author && comment.author.toLowerCase().includes(searchTerm.toLowerCase()));
      
      const matchesConcerning = showConcerningOnly ? comment.concerning : true;
      const matchesIdentifiable = showIdentifiableOnly ? comment.identifiable : true;
      
      return matchesSearch && matchesConcerning && matchesIdentifiable;
    });
    setFilteredComments(filtered);
  }, [comments, searchTerm, showConcerningOnly, showIdentifiableOnly]);

  const startEditing = (comment: CommentData) => {
    setEditingId(comment.id);
    setEditText(comment.text);
  };

  const handleTextChange = (commentId: string, newText: string) => {
    const updatedComments = comments.map(comment =>
      comment.id === commentId ? { ...comment, text: newText } : comment
    );
    onCommentsUpdate(updatedComments);
  };


  const toggleCommentCheck = (commentId: string, field: 'checked' | 'concerning' | 'identifiable' | 'approved') => {
    const updatedComments = comments.map(comment =>
      comment.id === commentId ? { ...comment, [field]: !comment[field] } : comment
    );
    onCommentsUpdate(updatedComments);
  };

  const toggleCommentMode = async (commentId: string, mode: 'redact' | 'rephrase' | 'revert' | 'edit') => {
    const comment = comments.find(c => c.id === commentId);
    if (!comment) return;

    // Determine the middle column text based on mode
    let middleColumnText = '';
    if (mode === 'edit') {
      // Keep existing text when switching to edit mode
      middleColumnText = comment.text;
    } else if (mode === 'revert') {
      middleColumnText = comment.originalText;
    } else if (mode === 'rephrase') {
      middleColumnText = comment.rephrasedText || comment.originalText;
    } else {
      middleColumnText = comment.redactedText || comment.originalText;
    }

    // Update the mode, copy to final column, and unset approved (except for edit mode)
    const updatedComments = comments.map(c =>
      c.id === commentId ? { 
        ...c, 
        mode, 
        text: middleColumnText, 
        approved: mode === 'edit' ? c.approved : false 
      } : c
    );
    onCommentsUpdate(updatedComments);

    // Only reprocess if the comment is concerning/identifiable and not reverting or editing
    if (comment.concerning || comment.identifiable) {
      if (mode !== 'revert' && mode !== 'edit') {
        await reprocessComment(commentId, mode);
      }
    }
  };

  const scanComments = async () => {
    if (comments.length === 0) {
      toast.error('No comments to scan');
      return;
    }

    setIsScanning(true);
    setScanProgress(0);
    toast.info(`Scanning ${comments.length} comments with AI...`);

    // Simulate progress tracking
    const progressInterval = setInterval(() => {
      setScanProgress(prev => {
        const newProgress = Math.min(prev + Math.random() * 15, 90);
        return newProgress;
      });
    }, 500);

    try {
      const { data, error } = await supabase.functions.invoke('scan-comments', {
        body: { comments, defaultMode }
      });

      if (error) {
        throw new Error(error.message);
      }

      if (data?.comments) {
        setScanProgress(100);
        onCommentsUpdate(data.comments);
        const summary = data.summary;
        toast.success(
          `Scan complete! Found ${summary.concerning} concerning and ${summary.identifiable} identifiable comments`
        );
      } else {
        throw new Error('Invalid response from scan function');
      }
    } catch (error) {
      console.error('Scan error:', error);
      toast.error('Failed to scan comments. Please try again.');
    } finally {
      clearInterval(progressInterval);
      setIsScanning(false);
      setScanProgress(0);
    }
  };

  const exportToExcel = () => {
    const exportData = comments.map((comment, index) => ({
      'Row': comment.originalRow || index + 1,
      'Original Comment': comment.originalText,
      'Final Comment': comment.text,
      'Author': comment.author || '',
      'Concerning': comment.concerning ? 'Yes' : 'No',
      'Identifiable': comment.identifiable ? 'Yes' : 'No',
      'AI Reasoning': comment.aiReasoning || '',
      'Redacted': comment.redactedText || '',
      'Rephrased': comment.rephrasedText || '',
      'Approved': comment.approved ? 'Yes' : 'No',
      'Last Modified': comment.timestamp || ''
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Comments');
    
    XLSX.writeFile(workbook, 'scanned_comments.xlsx');
    toast.success('Comments exported successfully');
  };

  if (comments.length === 0) {
    return (
      <Card className="p-8 text-center">
        <div className="flex flex-col items-center gap-4">
          <div className="p-4 rounded-full bg-muted">
            <Edit3 className="w-8 h-8 text-muted-foreground" />
          </div>
          <div>
            <h3 className="text-lg font-semibold mb-2">No Comments Loaded</h3>
            <p className="text-muted-foreground">
              Upload an Excel file to start editing comments
            </p>
          </div>
        </div>
      </Card>
    );
  }

  const concerningCount = comments.filter(c => c.concerning).length;
  const identifiableCount = comments.filter(c => c.identifiable).length;
  
  // Check if any comments have demographic data
  const hasDemographics = comments.some(c => c.demographics);
  
  // Calculate demographic counts
  const demographicCounts = comments.reduce((acc, comment) => {
    if (comment.demographics) {
      acc[comment.demographics] = (acc[comment.demographics] || 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>);

  const getCommentStatus = (comment: CommentData) => {
    if (comment.mode === 'edit') return 'Edited';
    if (comment.concerning || comment.identifiable) return 'AI Processed';
    if (!comment.redactedText && !comment.rephrasedText && !comment.aiReasoning) return 'Scan Required';
    return 'No Changes Needed';
  };

  // Get the initial mode for comments with "No Changes Needed" status
  const getInitialMode = (comment: CommentData) => {
    const status = getCommentStatus(comment);
    if (status === 'No Changes Needed' && !comment.mode) {
      return 'revert';
    }
    return comment.mode;
  };

  const reprocessComment = async (commentId: string, mode: 'redact' | 'rephrase' | 'revert') => {
    const comment = comments.find(c => c.id === commentId);
    if (!comment) return;

    try {
      const { data, error } = await supabase.functions.invoke('scan-comments', {
        body: { 
          comments: [{ ...comment, mode }], 
          defaultMode: mode
        }
      });

      if (error) throw new Error(error.message);

      if (data?.comments && data.comments.length > 0) {
        const updatedComment = data.comments[0];
        const middleColumnText = mode === 'rephrase' ? updatedComment.rephrasedText : updatedComment.redactedText;
        const updatedComments = comments.map(c =>
          c.id === commentId ? { 
            ...c, 
            ...updatedComment, 
            mode, 
            text: middleColumnText || c.text, 
            approved: false 
          } : c
        );
        onCommentsUpdate(updatedComments);
        toast.success(`Comment ${mode === 'redact' ? 'redacted' : 'rephrased'} successfully`);
      }
    } catch (error) {
      console.error('Reprocess error:', error);
      toast.error(`Failed to ${mode} comment. Please try again.`);
    }
  };

  return (
    <TooltipProvider>
      <div className="w-full max-w-none">
      {/* Header */}
      <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between mb-6">
        <div className="flex flex-wrap gap-2">
          <Button 
            onClick={() => setShowImportDialog(!showImportDialog)}
            variant="outline"
            className="gap-2"
          >
            <Upload className="w-4 h-4" />
            Import Comments
          </Button>
          
          <Button 
            onClick={scanComments}
            disabled={isScanning}
            className="gap-2"
          >
            <Scan className="w-4 h-4" />
            {isScanning ? 'Scanning...' : 'Scan Comments'}
          </Button>
          
          {/* Progress Indicator */}
          {isScanning && (
            <div className="flex items-center gap-2 px-3 py-2 border rounded-md bg-muted/30">
              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
              <span className="text-sm text-muted-foreground">
                Processing comments... {Math.round(scanProgress)}%
              </span>
            </div>
          )}
          
          {/* Default Mode Toggle */}
          <div className="flex items-center gap-2 px-3 py-2 border rounded-md">
            <span className="text-sm font-medium">Default Mode:</span>
            <div className="flex items-center gap-1">
              <Button
                variant={defaultMode === 'redact' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setDefaultMode('redact')}
                className="h-7 text-xs"
              >
                Redact
              </Button>
              <Button
                variant={defaultMode === 'rephrase' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setDefaultMode('rephrase')}
                className="h-7 text-xs"
              >
                Rephrase
              </Button>
            </div>
          </div>
        </div>
        
        <div>
          <h2 className="text-2xl font-bold mb-1">Comment Editor</h2>
          <p className="text-muted-foreground">
            {filteredComments.length} of {comments.length} comments
            {concerningCount > 0 && ` • ${concerningCount} concerning`}
            {identifiableCount > 0 && ` • ${identifiableCount} identifiable`}
          </p>
        </div>
        
        <div className="flex flex-wrap gap-2">
          <Button 
            onClick={() => setShowConcerningOnly(!showConcerningOnly)} 
            variant={showConcerningOnly ? "default" : "outline"} 
            className="gap-2"
          >
            <AlertTriangle className="w-4 h-4" />
            {showConcerningOnly ? 'Show All' : 'Show Concerning Only'}
          </Button>
          <Button 
            onClick={() => setShowIdentifiableOnly(!showIdentifiableOnly)} 
            variant={showIdentifiableOnly ? "default" : "outline"} 
            className="gap-2"
          >
            {showIdentifiableOnly ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            {showIdentifiableOnly ? 'Show All' : 'Show Identifiable Only'}
          </Button>
          <Button onClick={exportToExcel} variant="outline" className="gap-2">
            <Download className="w-4 h-4" />
            Export
          </Button>
        </div>
      </div>

      {/* Import Dialog */}
      {showImportDialog && (
        <div className="mb-6">
          <Card className="p-4">
            <h3 className="text-lg font-semibold mb-4">Import New Comments</h3>
            <FileUpload onDataLoaded={(newComments) => {
              onImportComments(newComments);
              setShowImportDialog(false);
            }} />
          </Card>
        </div>
      )}

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
        <Input
          placeholder="Search comments or authors..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Comments List */}
      <div className="space-y-4">
        {filteredComments.map((comment, index) => (
          <Card 
            key={comment.id} 
            className={`p-4 sm:p-6 hover:shadow-md transition-all duration-300 animate-fade-in ${
              comment.approved ? 'bg-green-50 border-green-300 dark:bg-green-950/30 dark:border-green-800/50' :
              comment.concerning ? 'bg-red-100 border-red-300 dark:bg-red-950/30 dark:border-red-800/50' : 
              comment.identifiable && !comment.concerning ? 'bg-red-50 border-red-200 dark:bg-red-950/10 dark:border-red-800/20' : ''
            }`}
          >
            <div className="space-y-4">
              {/* Comment Header */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <Badge variant="secondary" className="text-xs">
                    Row {comment.originalRow || index + 1}
                  </Badge>
                  {comment.author && (
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <User className="w-3 h-3" />
                      {comment.author}
                    </div>
                  )}
                </div>
              </div>

              {/* Three Column Layout (with optional demographics) */}
              <div className={`grid grid-cols-1 gap-4 lg:gap-6 ${hasDemographics ? 'xl:grid-cols-[200px_1fr_1fr] xl:gap-x-6' : 'xl:grid-cols-2'}`}>
                {/* Demographics Column (conditional) */}
                {hasDemographics && (
                  <div className="space-y-2 xl:mr-[-16px]">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-medium text-muted-foreground">Demographics</h4>
                    </div>
                    <div className="p-3 sm:p-4 rounded-lg bg-muted/30 border">
                      <p className="text-foreground leading-relaxed text-sm sm:text-base">
                        {comment.demographics ? 
                          `(${comment.demographics}, ${demographicCounts[comment.demographics]} comments)` : 
                          'No data'
                        }
                      </p>
                    </div>
                  </div>
                )}
                {/* Original Comment Column */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-medium text-muted-foreground">Original Comment</h4>
                  </div>
                  <div className="p-3 sm:p-4 rounded-lg bg-muted/30 border">
                    <p className="text-foreground leading-relaxed text-sm sm:text-base">
                      {comment.originalText}
                    </p>
                  </div>
                  <div className="space-y-3 mt-4">
                    <div className="flex items-center gap-6">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id={`concerning-${comment.id}`}
                          checked={comment.concerning || false}
                          onCheckedChange={() => toggleCommentCheck(comment.id, 'concerning')}
                        />
                        <label 
                          htmlFor={`concerning-${comment.id}`}
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                        >
                          Concerning
                        </label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id={`identifiable-${comment.id}`}
                          checked={comment.identifiable || false}
                          onCheckedChange={() => toggleCommentCheck(comment.id, 'identifiable')}
                        />
                        <label 
                          htmlFor={`identifiable-${comment.id}`}
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                        >
                          Identifiable
                        </label>
                      </div>
                    </div>
                    {comment.aiReasoning && getCommentStatus(comment) !== 'No Changes Needed' && (
                      <div className="p-2 rounded-lg bg-muted/50 border">
                        <p className="text-xs text-muted-foreground">
                          <strong>AI:</strong> {comment.aiReasoning}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Final Version Column */}
                <div className="space-y-2">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-medium text-muted-foreground">
                        Final Version
                      </h4>
                      <Badge variant="secondary" className="text-xs">
                        {getCommentStatus(comment)}
                      </Badge>
                    </div>
                    
                    {/* Mode Controls */}
                    <div className="flex items-center gap-1 flex-wrap">
                      {getCommentStatus(comment) !== 'Scan Required' && (
                        <>
                           {getCommentStatus(comment) === 'No Changes Needed' ? (
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => toggleCommentMode(comment.id, 'revert')}
                              className="h-6 text-xs px-2"
                            >
                              Revert
                            </Button>
                          ) : (
                            <>
                              <Button
                                variant={comment.mode === 'redact' ? 'default' : 'ghost'}
                                size="sm"
                                onClick={() => toggleCommentMode(comment.id, 'redact')}
                                className="h-6 text-xs px-2"
                              >
                                Redact
                              </Button>
                              <Button
                                variant={comment.mode === 'rephrase' ? 'default' : 'ghost'}
                                size="sm"
                                onClick={() => toggleCommentMode(comment.id, 'rephrase')}
                                className="h-6 text-xs px-2"
                              >
                                Rephrase
                              </Button>
                              <Button
                                variant={comment.mode === 'revert' ? 'default' : 'ghost'}
                                size="sm"
                                onClick={() => toggleCommentMode(comment.id, 'revert')}
                                className="h-6 text-xs px-2"
                              >
                                Revert
                              </Button>
                            </>
                          )}
                          <Button
                            variant={comment.mode === 'edit' ? 'default' : 'ghost'}
                            size="sm"
                            onClick={() => toggleCommentMode(comment.id, 'edit')}
                            className="h-6 text-xs px-2"
                          >
                            Edit
                          </Button>
                        </>
                      )}
                      {(comment.concerning || comment.identifiable) && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex items-center space-x-2 ml-2">
                              <Checkbox
                                id={`approved-${comment.id}`}
                                checked={comment.approved || false}
                                onCheckedChange={() => toggleCommentCheck(comment.id, 'approved')}
                              />
                              <label 
                                htmlFor={`approved-${comment.id}`}
                                className="text-xs font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                              >
                                Approved
                              </label>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="max-w-xs">
                              Marking as approved just indicates that you are finished looking at this comment. You do not need to approve items for them to appear in the export.
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </div>
                  
                  {/* Content Area */}
                  {comment.mode === 'edit' ? (
                    <div className="p-3 sm:p-4 rounded-lg border border-dashed border-border hover:border-primary/50 transition-colors">
                      <Textarea
                        value={comment.text}
                        onChange={(e) => {
                          handleTextChange(comment.id, e.target.value);
                          // Auto-switch to edit mode when typing
                          if (comment.mode !== 'edit') {
                            toggleCommentMode(comment.id, 'edit');
                          }
                        }}
                        onFocus={() => {
                          // Auto-switch to edit mode when clicking in textarea
                          if (comment.mode !== 'edit') {
                            toggleCommentMode(comment.id, 'edit');
                          }
                        }}
                        className="min-h-[120px] resize-none text-sm sm:text-base border-none p-0 bg-transparent focus-visible:ring-0"
                        placeholder="Edit your comment..."
                      />
                    </div>
                  ) : (
                    <div 
                      className="p-3 sm:p-4 rounded-lg bg-muted/30 border cursor-text hover:bg-muted/40 transition-colors"
                      onClick={() => toggleCommentMode(comment.id, 'edit')}
                    >
                      <p className="text-foreground leading-relaxed text-sm sm:text-base">
                        {getCommentStatus(comment) === 'No Changes Needed' ? 
                          comment.originalText :
                         comment.mode === 'revert' ? 
                           comment.originalText :
                         comment.mode === 'rephrase' ? 
                           (comment.rephrasedText || 'Processing...') : 
                         comment.mode === 'redact' ?
                           (comment.redactedText || 'Processing...') :
                         (comment.concerning || comment.identifiable) ? 
                           (comment.redactedText || comment.rephrasedText || 'Processing...') :
                           (!comment.redactedText && !comment.rephrasedText && !comment.aiReasoning ? 'Not processed yet' : 'No processing needed')
                        }
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {filteredComments.length === 0 && searchTerm && (
        <Card className="p-8 text-center">
          <div className="flex flex-col items-center gap-4">
            <div className="p-4 rounded-full bg-muted">
              <Search className="w-8 h-8 text-muted-foreground" />
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-2">No Results Found</h3>
              <p className="text-muted-foreground">
                Try adjusting your search terms or filters
              </p>
            </div>
          </div>
        </Card>
      )}
      </div>
    </TooltipProvider>
  );
};