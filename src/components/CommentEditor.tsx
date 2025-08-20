import React, { useState, useEffect, useRef } from 'react';
import { Search, Download, Edit3, Check, X, User, Filter, Scan, AlertTriangle, Eye, EyeOff, ToggleLeft, ToggleRight, Upload, FileText, HelpCircle, Save, FolderOpen, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { CommentData, FileUpload } from './FileUpload';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCommentSessions } from '@/hooks/useCommentSessions';
import { useUserRole } from '@/hooks/useUserRole';
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
  const {
    user
  } = useAuth();
  const { isAdmin } = useUserRole();
  const {
    sessions,
    loading: sessionsLoading,
    saving,
    loadSessions,
    saveSession,
    loadSession,
    deleteSession,
    deleteAllSessions
  } = useCommentSessions();
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
  const [focusedCommentId, setFocusedCommentId] = useState<string | null>(null);
  const [hasScanRun, setHasScanRun] = useState(false);
  const [selectedDemographic, setSelectedDemographic] = useState<string | null>(null);
  const [debugMode, setDebugMode] = useState(false);
  const scanInFlightRef = useRef(false);
  const lastScanTsRef = useRef<number>(0);

  // Save/Load dialog state
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showLoadDialog, setShowLoadDialog] = useState(false);
  const [sessionName, setSessionName] = useState('');
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Set default session name to current date/time when dialog opens
  const getCurrentDateTimeString = () => {
    const now = new Date();
    return now.toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).replace(/[\/,]/g, '-').replace(/\s/g, '_');
  };
  useEffect(() => {
    let filtered = comments.filter(comment => {
      const matchesSearch = comment.text.toLowerCase().includes(searchTerm.toLowerCase()) || comment.originalText.toLowerCase().includes(searchTerm.toLowerCase()) || comment.author && comment.author.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesConcerning = showConcerningOnly ? comment.concerning : true;
      const matchesIdentifiable = showIdentifiableOnly ? comment.identifiable : true;
      const matchesDemographic = selectedDemographic ? comment.demographics === selectedDemographic : true;
      return matchesSearch && matchesConcerning && matchesIdentifiable && matchesDemographic;
    });
    setFilteredComments(filtered);
  }, [comments, searchTerm, showConcerningOnly, showIdentifiableOnly, selectedDemographic]);

  // Load sessions when user logs in
  useEffect(() => {
    if (user) {
      loadSessions();
    }
  }, [user, loadSessions]);
  const startEditing = (comment: CommentData) => {
    setEditingId(comment.id);
    setEditText(comment.text);
  };
  const handleTextChange = (commentId: string, newText: string) => {
    const comment = comments.find(c => c.id === commentId);
    if (!comment) return;
    const updatedComments = comments.map(c => c.id === commentId ? {
      ...c,
      text: newText,
      // Automatically switch to edit mode when user starts typing something different
      mode: newText !== c.originalText && newText !== c.redactedText && newText !== c.rephrasedText ? 'edit' : c.mode,
      // Hide AI response when user starts editing and the comment originally had "No Changes Needed" status
      hideAiResponse: c.hideAiResponse || newText !== c.originalText && c.aiReasoning && !c.concerning && !c.identifiable
    } : c);
    onCommentsUpdate(updatedComments);
  };
  const toggleCommentCheck = (commentId: string, field: 'checked' | 'concerning' | 'identifiable' | 'approved') => {
    const updatedComments = comments.map(comment => comment.id === commentId ? {
      ...comment,
      [field]: !comment[field]
    } : comment);
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
    } else if (mode === 'redact') {
      // For redact mode, use redacted text if available, otherwise reprocess
      middleColumnText = comment.redactedText || comment.originalText;
    }

    // Update the mode, copy to final column, and unset approved (except for edit mode)
    const updatedComments = comments.map(c => c.id === commentId ? {
      ...c,
      mode,
      text: middleColumnText,
      approved: mode === 'edit' ? c.approved : false
    } : c);
    onCommentsUpdate(updatedComments);

    // Reprocess if we don't have the required text for the mode, or if it's a concerning/identifiable comment that needs updating
    if (comment.concerning || comment.identifiable) {
      if (mode === 'redact' && !comment.redactedText) {
        // If switching to redact mode but no redacted text exists, reprocess
        await reprocessComment(commentId, mode);
      } else if (mode === 'rephrase' && !comment.rephrasedText) {
        // If switching to rephrase mode but no rephrased text exists, reprocess
        await reprocessComment(commentId, mode);
      } else if (mode !== 'revert' && mode !== 'edit') {
        // For other modes that need reprocessing
        await reprocessComment(commentId, mode);
      }
    }
  };
  const scanComments = async () => {
    const now = Date.now();
    if (now - (lastScanTsRef.current || 0) < 1000) {
      // Debounce rapid re-triggers within 1s window
      return;
    }
    lastScanTsRef.current = now;
    if (scanInFlightRef.current) {
      toast.info('A scan is already in progress. Please wait.');
      return;
    }
    scanInFlightRef.current = true;
    if (comments.length === 0) {
      toast.error('No comments to scan');
      scanInFlightRef.current = false;
      return;
    }
    setIsScanning(true);
    setScanProgress(0);
    toast.info(`Scanning ${comments.length} comments with AI...`);

    // Generate a short 4-digit scanRunId so backend logs can be filtered to this click
    const scanRunId = String(Math.floor(1000 + Math.random() * 9000));

    // Single-shot analysis request; backend handles effective batch sizing per model
    let processedComments: any[] = [];

    try {
      // Phase 1: single-shot analysis — skip adjudicator and postprocess
      const isSingleRun = comments.length === 1;
      const { data, error } = await supabase.functions.invoke('scan-comments', {
        body: {
          comments,
          defaultMode,
          skipAdjudicator: true,
          // For single-row runs, perform postprocess in phase 1 to avoid a second pass
          skipPostprocess: !isSingleRun,
          scanRunId
        }
      });

      console.log(`Single analysis response:`, { data, error });

      if (error) {
        console.error(`Analysis error:`, error);
        throw new Error(error.message || JSON.stringify(error));
      }

      if (data?.comments) {
        // Normalize results to ensure UI flags match final decision
        const normalizedComments = data.comments.map((c: any) => {
          const fd = c?.debugInfo?.finalDecision;
          const concerning = typeof fd?.concerning === 'boolean' ? fd.concerning : !!c.concerning;
          const identifiable = typeof fd?.identifiable === 'boolean' ? fd.identifiable : !!c.identifiable;
          if (!concerning && !identifiable) {
            return {
              ...c,
              concerning: false,
              identifiable: false,
              mode: 'original',
              text: c.originalText || c.text,
              redactedText: undefined,
              rephrasedText: undefined,
            };
          }
          return { ...c, concerning, identifiable };
        });

        // Merge normalized results into the full comment list by id, preserving original order and length
        const baseList = processedComments.length > 0 ? processedComments : comments;
        const updatesById = new Map(normalizedComments.map((u: any) => [u.id, u]));
        processedComments = baseList.map((c: any) => {
          const update = updatesById.get(c.id);
          return update && typeof update === 'object' ? { ...c, ...update } : c;
        });

        onCommentsUpdate(processedComments);
        setHasScanRun(true);
        setScanProgress(90);
        toast.info(`Processed ${processedComments.length}/${comments.length} comments`);
      } else {
        throw new Error(`No comment data received`);
      }
      
      // Phase 2: follow-up adjudication and postprocess on subset
      // For single-row runs, if no adjudication is needed, skip phase 2 entirely.
      const isPhase2SingleRun = comments.length === 1;
      const needsFollowup = processedComments.filter((c: any) => c?.debugInfo?.needsAdjudication || (!isPhase2SingleRun && (c.concerning || c.identifiable)));
      if (needsFollowup.length > 0) {
        toast.info(`Running follow-up on ${needsFollowup.length} flagged comments...`);
        // Phase 2 chunk size: modest size to avoid timeouts
        const phase2Base = 20;
        for (let i = 0; i < needsFollowup.length; i += phase2Base) {
          const chunk = needsFollowup.slice(i, i + phase2Base);
          // Phase 2A: adjudication-only (must run BEFORE postprocess so backend can decide A vs B text)
          const { data: adjData, error: adjError } = await supabase.functions.invoke('scan-comments', {
            body: {
              comments: chunk,
              defaultMode,
              skipAdjudicator: false,
              skipPostprocess: true,
              useCachedAnalysis: true,
              scanRunId
            }
          });
          if (adjError) {
            console.warn('Follow-up adjudication chunk failed:', adjError);
          } else if (adjData?.comments) {
            const map = new Map(processedComments.map((x: any) => [x.id, x]));
            for (const u of adjData.comments) {
              const fd = u?.debugInfo?.finalDecision;
              const concerning = typeof fd?.concerning === 'boolean' ? fd.concerning : !!u.concerning;
              const identifiable = typeof fd?.identifiable === 'boolean' ? fd.identifiable : !!u.identifiable;
              const merged = (!concerning && !identifiable) ? {
                ...u,
                concerning: false,
                identifiable: false,
                mode: 'original',
                text: u.originalText || u.text,
                redactedText: undefined,
                rephrasedText: undefined,
              } : { ...u, concerning, identifiable };
              const prev = map.get(u.id) || {} as any;
              const next = { ...prev, ...merged } as any;
              // Preserve any previously computed redaction/rephrase from Phase 2A ONLY if still flagged
              const stillFlagged = concerning || identifiable;
              if (stillFlagged) {
                if (merged.redactedText == null && prev.redactedText != null) next.redactedText = prev.redactedText;
                if (merged.rephrasedText == null && prev.rephrasedText != null) next.rephrasedText = prev.rephrasedText;
                // Preserve final text if adjudication-only update did not include postprocess content
                if ((merged.redactedText == null && merged.rephrasedText == null) && prev.text && prev.mode && prev.mode !== 'original') {
                  next.text = prev.text;
                }
              }
              map.set(u.id, next);
            }
            processedComments = Array.from(map.values());
            setScanProgress(90 + Math.round(((i + chunk.length) / needsFollowup.length) * 10));
            onCommentsUpdate(processedComments);
          }

          // Phase 2B: postprocess-only (now that adjudication is finalized for this chunk)
          const { data: ppData, error: ppError } = await supabase.functions.invoke('scan-comments', {
            body: {
              comments: chunk,
              defaultMode,
              skipAdjudicator: true,
              skipPostprocess: false,
              useCachedAnalysis: true,
              scanRunId
            }
          });
          if (ppError) {
            console.warn('Follow-up postprocess chunk failed:', ppError);
          } else if (ppData?.comments) {
            const map2 = new Map(processedComments.map((x: any) => [x.id, x]));
            for (const u of ppData.comments) {
              const fd = u?.debugInfo?.finalDecision;
              const concerning = typeof fd?.concerning === 'boolean' ? fd.concerning : !!u.concerning;
              const identifiable = typeof fd?.identifiable === 'boolean' ? fd.identifiable : !!u.identifiable;
              const merged = (!concerning && !identifiable) ? {
                ...u,
                concerning: false,
                identifiable: false,
                mode: 'original',
                text: u.originalText || u.text,
                redactedText: undefined,
                rephrasedText: undefined,
              } : { ...u, concerning, identifiable };
              const prev = map2.get(u.id) || {} as any;
              const next = { ...prev, ...merged } as any;
              if (merged.redactedText == null && prev.redactedText != null) next.redactedText = prev.redactedText;
              if (merged.rephrasedText == null && prev.rephrasedText != null) next.rephrasedText = prev.rephrasedText;
              map2.set(u.id, next);
            }
            processedComments = Array.from(map2.values());
            onCommentsUpdate(processedComments);
          }
        }
      }

      // Final update with all processed comments
      setScanProgress(100);
      setHasScanRun(true);
      onCommentsUpdate(processedComments);
      toast.success(`Scan complete: ${processedComments.length} comments processed`);
      
    } catch (error) {
      console.error('Scan failed:', error);
      toast.error(`Scan failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsScanning(false);
      setScanProgress(0);
      scanInFlightRef.current = false;
    }
  };
  const handleSaveSession = async () => {
    if (!sessionName.trim()) {
      toast.error('Please enter a session name');
      return;
    }
    const scrollPosition = scrollContainerRef.current?.scrollTop || 0;
    const success = await saveSession(sessionName, comments, hasScanRun, defaultMode, scrollPosition);
    if (success) {
      setShowSaveDialog(false);
      setSessionName('');
    }
  };
  const handleLoadSession = async (sessionId: string) => {
    const session = await loadSession(sessionId);
    if (session) {
      onCommentsUpdate(session.comments_data);
      setHasScanRun(session.has_scan_run);
      setDefaultMode(session.default_mode);
      setShowLoadDialog(false);

      // Restore scroll position after a brief delay to ensure content is rendered
      if (session.scroll_position && scrollContainerRef.current) {
        setTimeout(() => {
          if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTop = session.scroll_position!;
          }
        }, 100);
      }
    }
  };
  const handleDeleteSession = async (sessionId: string) => {
    await deleteSession(sessionId);
  };
  const handleDeleteAllSessions = async () => {
    await deleteAllSessions();
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
    return <Card className="p-8 text-center">
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
      </Card>;
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
    // If no scan has been run yet, show "Scan Required"
    if (!hasScanRun) {
      return 'Scan Required';
    }

    // If the comment was never processed by AI (no aiReasoning), keep it as "No Changes Needed"
    if (!comment.aiReasoning) {
      return 'No Changes Needed';
    }

    // Check if comment has been manually edited and differs from both original AND AI suggestions
    if (comment.mode === 'edit' || comment.text !== comment.originalText && comment.text !== comment.redactedText && comment.text !== comment.rephrasedText) {
      return 'Edited';
    }
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
      const {
        data,
        error
      } = await supabase.functions.invoke('scan-comments', {
        body: {
          comments: [{
            ...comment,
            mode
          }],
          defaultMode: mode
        }
      });
      if (error) throw new Error(error.message);
      if (data?.comments && data.comments.length > 0) {
        let updatedComment = data.comments[0];
        // Normalize to ensure flags align with final decision and clear stale AI text if not flagged
        const fd = updatedComment?.debugInfo?.finalDecision;
        const concerning = typeof fd?.concerning === 'boolean' ? fd.concerning : !!updatedComment.concerning;
        const identifiable = typeof fd?.identifiable === 'boolean' ? fd.identifiable : !!updatedComment.identifiable;
        if (!concerning && !identifiable) {
          updatedComment = {
            ...updatedComment,
            concerning: false,
            identifiable: false,
            mode: 'revert',
            text: updatedComment.originalText || updatedComment.text,
            redactedText: undefined,
            rephrasedText: undefined,
          };
        } else {
          updatedComment = { ...updatedComment, concerning, identifiable };
        }
        const middleColumnText = mode === 'rephrase' ? updatedComment.rephrasedText : updatedComment.redactedText;
        const updatedComments = comments.map(c => c.id === commentId ? {
          ...c,
          ...updatedComment,
          mode,
          text: middleColumnText || updatedComment.text || c.text,
          approved: false
        } : c);
        onCommentsUpdate(updatedComments);
        toast.success(`Comment ${mode === 'redact' ? 'redacted' : 'rephrased'} successfully`);
      }
    } catch (error) {
      console.error('Reprocess error:', error);
      toast.error(`Failed to ${mode} comment. Please try again.`);
    }
  };
  return <TooltipProvider>
      <div className="w-full max-w-none">
      {/* Header */}
      <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between mb-6">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setShowImportDialog(!showImportDialog)} variant="outline" className="gap-2">
              <Upload className="w-4 h-4" />
              Import Comments
            </Button>
          
          {user && <>
              <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="gap-2" disabled={comments.length === 0} onClick={() => setSessionName(getCurrentDateTimeString())}>
                    <Save className="w-4 h-4" />
                    Save Progress
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Save Session</DialogTitle>
                    <DialogDescription>
                      Save your current progress including scan results and edits.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="session-name">Session Name</Label>
                      <Input id="session-name" value={sessionName} onChange={e => setSessionName(e.target.value)} placeholder="Enter a name for this session" />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setShowSaveDialog(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleSaveSession} disabled={saving}>
                      {saving ? 'Saving...' : 'Save'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Dialog open={showLoadDialog} onOpenChange={setShowLoadDialog}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="gap-2">
                    <FolderOpen className="w-4 h-4" />
                    Load Session
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Load Saved Session</DialogTitle>
                    <DialogDescription>
                      Choose a previously saved session to continue working on.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 max-h-96 overflow-y-auto">
                    {sessionsLoading ? <div className="text-center py-8">Loading sessions...</div> : sessions.length === 0 ? <div className="text-center py-8 text-muted-foreground">
                        No saved sessions found
                      </div> : sessions.map(session => <Card key={session.id} className="p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <h4 className="font-medium">{session.session_name}</h4>
                              <p className="text-sm text-muted-foreground">
                                {session.comments_data?.length || 0} comments • 
                                {session.has_scan_run ? ' Scanned' : ' Not scanned'} • 
                                {session.default_mode} mode
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Last updated: {new Date(session.updated_at).toLocaleDateString()}
                              </p>
                            </div>
                            <div className="flex gap-2">
                              <Button size="sm" onClick={() => handleLoadSession(session.id)}>
                                Load
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button size="sm" variant="outline">
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete Session</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Are you sure you want to delete "{session.session_name}"? This action cannot be undone.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => handleDeleteSession(session.id)}>
                                      Delete
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </div>
                        </Card>)}
                    
                    {sessions.length > 0 && <div className="pt-4 border-t">
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="outline" className="w-full gap-2 text-destructive">
                              <Trash2 className="w-4 h-4" />
                              Delete All Sessions
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete All Sessions</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete all your saved sessions? This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={handleDeleteAllSessions}>
                                Delete All
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>}
                  </div>
                </DialogContent>
              </Dialog>
            </>}
          </div>
          
          <div className="flex flex-wrap gap-2">
            <Button onClick={scanComments} disabled={isScanning} className={`gap-2 ${!hasScanRun && !isScanning ? 'animate-very-slow-pulse' : ''}`}>
              <Scan className="w-4 h-4" />
              {isScanning ? 'Scanning...' : 'Scan Comments'}
            </Button>
          
            {/* Default Mode Toggle */}
            <div className="flex items-center gap-2 px-3 py-2 border rounded-md">
              <span className="text-sm font-medium">Default Mode:</span>
              <div className="flex items-center gap-1">
                <Button variant={defaultMode === 'redact' ? 'default' : 'ghost'} size="sm" onClick={() => setDefaultMode('redact')} className="h-7 text-xs">
                  Redact
                </Button>
                <Button variant={defaultMode === 'rephrase' ? 'default' : 'ghost'} size="sm" onClick={() => setDefaultMode('rephrase')} className="h-7 text-xs">
                  Rephrase
                </Button>
              </div>
            </div>
          </div>
          
          {!user && comments.length > 0 && <div className="text-sm text-muted-foreground bg-muted/30 px-3 py-2 rounded-md border">
              💡 Sign in to save your progress
            </div>}
          
          {/* Progress Indicator */}
          {isScanning && <div className="flex items-center gap-2 px-3 py-2 border rounded-md bg-muted/30">
              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
              <span className="text-sm text-muted-foreground">
                Processing comments... {Math.round(scanProgress)}%
              </span>
            </div>}
        </div>
        
        <div>
          <h2 className="text-2xl font-bold mb-1 px-0 mx-[80px]">Comment Editor</h2>
          <p className="text-muted-foreground text-center px-0 mx-[21px]">
            {filteredComments.length} comments
            {concerningCount > 0 && ` • ${concerningCount} concerning`}
            {identifiableCount > 0 && ` • ${identifiableCount} identifiable`}
          </p>
        </div>
        
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2 justify-end">
            <Button onClick={exportToExcel} variant="outline" className="gap-2">
              <Download className="w-4 h-4" />
              Export
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setShowConcerningOnly(!showConcerningOnly)} variant={showConcerningOnly ? "default" : "outline"} className="gap-2">
              <AlertTriangle className="w-4 h-4" />
              {showConcerningOnly ? 'Show All' : 'Show Concerning Only'}
            </Button>
            <Button onClick={() => setShowIdentifiableOnly(!showIdentifiableOnly)} variant={showIdentifiableOnly ? "default" : "outline"} className="gap-2">
              {showIdentifiableOnly ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              {showIdentifiableOnly ? 'Show All' : 'Show Identifiable Only'}
            </Button>
            {isAdmin && (
              <Button onClick={() => setDebugMode(!debugMode)} variant={debugMode ? "default" : "outline"} className="gap-2">
                {debugMode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                {debugMode ? 'Hide Debug' : 'Debug Mode'}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Import Dialog */}
      {showImportDialog && <div className="mb-6">
          <Card className="p-4">
            <h3 className="text-lg font-semibold mb-4">Import New Comments</h3>
            <FileUpload onDataLoaded={newComments => {
            onImportComments(newComments);
            setShowImportDialog(false);
          }} />
          </Card>
        </div>}

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
        <Input placeholder="Search comments..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10" />
      </div>

      {/* Comments List - Scrollable Container */}
      <div ref={scrollContainerRef} className="h-[70vh] overflow-y-auto border rounded-lg bg-background/50 backdrop-blur-sm">
        <div className="space-y-4 p-4">
        {filteredComments.map((comment, index) => <Card key={comment.id} className={`p-4 sm:p-6 hover:shadow-md transition-all duration-300 animate-fade-in ${comment.approved ? 'bg-green-50 border-green-300 dark:bg-green-950/30 dark:border-green-800/50' : comment.concerning ? 'bg-red-100 border-red-300 dark:bg-red-950/30 dark:border-red-800/50' : comment.identifiable && !comment.concerning ? 'bg-red-50 border-red-200 dark:bg-red-950/10 dark:border-red-800/20' : ''}`}>
            <div className="space-y-4">
              {/* Three Column Layout (with optional demographics) */}
              <div className={`grid grid-cols-1 gap-4 lg:gap-6 ${hasDemographics ? 'xl:grid-cols-[200px_1fr_1fr] xl:gap-x-6' : 'xl:grid-cols-2'}`}>
                {/* Demographics Column (conditional) */}
                {hasDemographics && <div className="space-y-2 xl:mr-[-16px]">
                    <div className="flex items-center gap-2 h-6">
                      <h4 className="text-sm font-medium text-muted-foreground">Demographics</h4>
                    </div>
                    <div className="flex items-center gap-2 h-8">
                      <Badge variant="secondary" className="text-xs">
                        Row {comment.originalRow || index + 1}
                      </Badge>
                    </div>
                    <div className="p-3 sm:p-4 rounded-lg bg-muted/30 border">
                      {comment.demographics ? <div className="text-foreground leading-relaxed text-sm sm:text-base">
                          <div className="flex items-center gap-2">
                            <Checkbox 
                              checked={selectedDemographic === comment.demographics}
                              onCheckedChange={(checked) => {
                                setSelectedDemographic(checked ? comment.demographics! : null);
                              }}
                              className="h-3 w-3"
                            />
                            <div className="font-medium">{comment.demographics}</div>
                          </div>
                          <div className="text-muted-foreground text-xs mt-1">
                            {demographicCounts[comment.demographics]} comments
                          </div>
                        </div> : <p className="text-foreground leading-relaxed text-sm sm:text-base">
                          No data
                        </p>}
                    </div>
                  </div>}
                {/* Original Comment Column */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 h-6">
                    <h4 className="text-sm font-medium text-muted-foreground">Original Comment</h4>
                  </div>
                  <div className="flex items-center gap-6 h-8">
                    <div className="flex items-center space-x-2 pointer-events-none">
                      <Checkbox id={`concerning-${comment.id}`} checked={comment.concerning || false} />
                      <label htmlFor={`concerning-${comment.id}`} className="text-sm font-medium leading-none">
                        Concerning
                      </label>
                    </div>
                    <div className="flex items-center space-x-2 pointer-events-none">
                      <Checkbox id={`identifiable-${comment.id}`} checked={comment.identifiable || false} />
                      <label htmlFor={`identifiable-${comment.id}`} className="text-sm font-medium leading-none">
                        Identifiable
                      </label>
                    </div>
                  </div>
                  <div className="p-3 sm:p-4 rounded-lg bg-muted/30 border">
                    <p className="text-foreground leading-relaxed text-sm sm:text-base">
                      {comment.originalText}
                    </p>
                  </div>
                     <div className="space-y-3 mt-4">
                     {comment.aiReasoning && !comment.hideAiResponse && getCommentStatus(comment) !== 'No Changes Needed' && <div className="p-2 rounded-lg bg-muted/50 border">
                         <p className="text-xs text-muted-foreground">
                           <strong>AI:</strong> {comment.aiReasoning}
                         </p>
                       </div>}
                       
                       {/* Debug Mode - Show AI scan details for admins */}
                       {debugMode && isAdmin && comment.debugInfo && (
                         <div className="space-y-2">
                           <h5 className="text-xs font-semibold text-muted-foreground">Debug Information:</h5>
                           
                            {comment.debugInfo.scanAResult && (
                              <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/50">
                                <p className="text-xs font-medium text-blue-900 dark:text-blue-100">
                                  Scan A Result {comment.debugInfo.scanAResult.model ? `[${comment.debugInfo.scanAResult.model}]` : ''}:
                                </p>
                                <p className="text-xs text-blue-800 dark:text-blue-200">
                                  Concerning: {comment.debugInfo.scanAResult.concerning ? 'Yes' : 'No'} | 
                                  Identifiable: {comment.debugInfo.scanAResult.identifiable ? 'Yes' : 'No'}
                                </p>
                               {comment.debugInfo.scanAResult.reasoning && (
                                 <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                                   {comment.debugInfo.scanAResult.reasoning}
                                 </p>
                               )}
                             </div>
                           )}
                           
                            {comment.debugInfo.scanBResult && (
                              <div className="p-2 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800/50">
                                <p className="text-xs font-medium text-green-900 dark:text-green-100">
                                  Scan B Result {comment.debugInfo.scanBResult.model ? `[${comment.debugInfo.scanBResult.model}]` : ''}:
                                </p>
                                <p className="text-xs text-green-800 dark:text-green-200">
                                  Concerning: {comment.debugInfo.scanBResult.concerning ? 'Yes' : 'No'} | 
                                  Identifiable: {comment.debugInfo.scanBResult.identifiable ? 'Yes' : 'No'}
                                </p>
                               {comment.debugInfo.scanBResult.reasoning && (
                                 <p className="text-xs text-green-700 dark:text-green-300 mt-1">
                                   {comment.debugInfo.scanBResult.reasoning}
                                 </p>
                               )}
                             </div>
                           )}
                           
                            {comment.debugInfo.adjudicationResult && (
                              <div className="p-2 rounded-lg bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800/50">
                                <p className="text-xs font-medium text-purple-900 dark:text-purple-100">
                                  Adjudicator Result {comment.debugInfo.adjudicationResult.model ? `[${comment.debugInfo.adjudicationResult.model}]` : ''}:
                                </p>
                                <p className="text-xs text-purple-800 dark:text-purple-200">
                                  Concerning: {comment.debugInfo.adjudicationResult.concerning ? 'Yes' : 'No'} | 
                                  Identifiable: {comment.debugInfo.adjudicationResult.identifiable ? 'Yes' : 'No'}
                                </p>
                               {comment.debugInfo.adjudicationResult.reasoning && (
                                 <p className="text-xs text-purple-700 dark:text-purple-300 mt-1">
                                   {comment.debugInfo.adjudicationResult.reasoning}
                                 </p>
                               )}
                             </div>
                           )}
                           
                           {comment.debugInfo.needsAdjudication && (
                             <div className="p-2 rounded-lg bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800/50">
                               <p className="text-xs font-medium text-yellow-900 dark:text-yellow-100">
                                 ⚠️ Adjudication Required (Scan A and B disagreed)
                               </p>
                             </div>
                           )}
                           
                            {comment.debugInfo.error && (
                              <div className="p-2 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50">
                                <p className="text-xs font-medium text-red-900 dark:text-red-100">Error:</p>
                                <p className="text-xs text-red-800 dark:text-red-200">{comment.debugInfo.error}</p>
                              </div>
                            )}

                            {/* Raw AI Responses - JSON Parse Failure Debug */}
                            {comment.debugInfo.rawResponses && (
                              <div className="space-y-2">
                                <h6 className="text-xs font-semibold text-muted-foreground">Raw AI Responses (JSON Parse Failures):</h6>
                                
                                {comment.debugInfo.rawResponses.scanAResponse && (
                                  <div className="p-2 rounded-lg bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800/50">
                                    <p className="text-xs font-medium text-orange-900 dark:text-orange-100">Scan A Raw Response:</p>
                                    <pre className="text-xs text-orange-800 dark:text-orange-200 whitespace-pre-wrap mt-1 max-h-32 overflow-y-auto">
                                      {comment.debugInfo.rawResponses.scanAResponse}
                                    </pre>
                                  </div>
                                )}
                                
                                {comment.debugInfo.rawResponses.scanBResponse && (
                                  <div className="p-2 rounded-lg bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800/50">
                                    <p className="text-xs font-medium text-orange-900 dark:text-orange-100">Scan B Raw Response:</p>
                                    <pre className="text-xs text-orange-800 dark:text-orange-200 whitespace-pre-wrap mt-1 max-h-32 overflow-y-auto">
                                      {comment.debugInfo.rawResponses.scanBResponse}
                                    </pre>
                                  </div>
                                )}
                                
                                {comment.debugInfo.rawResponses.adjudicationResponse && (
                                  <div className="p-2 rounded-lg bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800/50">
                                    <p className="text-xs font-medium text-orange-900 dark:text-orange-100">Adjudication Raw Response:</p>
                                    <pre className="text-xs text-orange-800 dark:text-orange-200 whitespace-pre-wrap mt-1 max-h-32 overflow-y-auto">
                                      {comment.debugInfo.rawResponses.adjudicationResponse}
                                    </pre>
                                  </div>
                                )}
                              </div>
                           )}
                         </div>
                       )}
                   </div>
                </div>

                {/* Final Version Column */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 h-6">
                    <h4 className="text-sm font-medium text-muted-foreground">
                      Final Version (Editable)
                    </h4>
                    <Badge variant="secondary" className="text-xs">
                      {getCommentStatus(comment)}
                    </Badge>
                    
                    {/* Approved checkbox moved here, right after the status badge */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center space-x-2 ml-2">
                          <Checkbox id={`approved-${comment.id}`} checked={comment.approved || false} onCheckedChange={() => toggleCommentCheck(comment.id, 'approved')} />
                          <label htmlFor={`approved-${comment.id}`} className="text-xs font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                            Approved
                          </label>
                          <HelpCircle className="w-3 h-3 text-muted-foreground hover:text-foreground transition-colors cursor-help" />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs">
                          Marking as approved just indicates that you are finished looking at this comment. You do not need to approve items for them to appear in the export.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  
                   {/* Mode Controls */}
                   <div className="flex items-center gap-1 flex-wrap h-8">
                       {getCommentStatus(comment) !== 'Scan Required' && <>
                            {getCommentStatus(comment) === 'No Changes Needed' ? <Button variant="default" size="sm" onClick={() => toggleCommentMode(comment.id, 'revert')} className="h-6 text-xs px-2">
                               Revert
                             </Button> : <>
                               {/* Only show Redact/Rephrase buttons for comments flagged as concerning or identifiable */}
                               {(comment.concerning || comment.identifiable) && <>
                                 <Button variant={comment.mode === 'redact' ? 'default' : 'ghost'} size="sm" onClick={() => toggleCommentMode(comment.id, 'redact')} className="h-6 text-xs px-2">
                                   Redact
                                 </Button>
                                 <Button variant={comment.mode === 'rephrase' ? 'default' : 'ghost'} size="sm" onClick={() => toggleCommentMode(comment.id, 'rephrase')} className="h-6 text-xs px-2">
                                   Rephrase
                                 </Button>
                               </>}
                               <Button variant={comment.mode === 'revert' ? 'default' : 'ghost'} size="sm" onClick={() => toggleCommentMode(comment.id, 'revert')} className="h-6 text-xs px-2">
                                 Revert
                               </Button>
                             </>}
                         </>}
                     </div>
                   
                   {/* Content Area */}
                   {comment.mode === 'edit' || focusedCommentId === comment.id ? <div className="p-3 sm:p-4 rounded-lg border border-dashed border-border hover:border-primary/50 transition-colors">
                       <Textarea value={comment.text} onChange={e => {
                      handleTextChange(comment.id, e.target.value);
                    }} onFocus={() => {
                      setFocusedCommentId(comment.id);
                    }} onBlur={() => {
                      setFocusedCommentId(null);
                    }} autoFocus={focusedCommentId === comment.id} className="min-h-[120px] resize-none text-sm sm:text-base border-none p-0 bg-transparent focus-visible:ring-0" placeholder="Edit your comment..." />
                     </div> : <div className="p-3 sm:p-4 rounded-lg bg-muted/30 border cursor-text hover:bg-muted/40 transition-colors" onClick={() => setFocusedCommentId(comment.id)}>
                        <p className="text-foreground leading-relaxed text-sm sm:text-base">
                          {comment.text}
                        </p>
                      </div>}
                 </div>
                </div>
              </div>
            </Card>)}
         </div>
       </div>

       {filteredComments.length === 0 && searchTerm && <Card className="p-8 text-center">
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
         </Card>}
       </div>
     </TooltipProvider>;
};