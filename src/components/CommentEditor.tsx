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
import { AILogsViewer } from './AILogsViewer';
import * as XLSX from 'xlsx';
import { sanitizeForExport } from '@/lib/utils';
interface CommentEditorProps {
  comments: CommentData[];
  onCommentsUpdate: (comments: CommentData[]) => void;
  onImportComments: (comments: CommentData[]) => void;
  onCreditsError?: (needed: number, available: number) => void;
  onCreditsRefresh?: () => void;
  onResetScanState?: () => void;
  isDemoData?: boolean;
  hasScanRun?: boolean;
  setHasScanRun?: (value: boolean) => void;
  aiLogsViewerRef?: React.RefObject<{ clearLogs: () => void }>;
  shouldClearLogs?: boolean;
}
export const CommentEditor: React.FC<CommentEditorProps> = ({ 
  comments, 
  onCommentsUpdate, 
  onImportComments,
  onCreditsError,
  onCreditsRefresh,
  onResetScanState,
  isDemoData = false,
  hasScanRun: externalHasScanRun,
  setHasScanRun: externalSetHasScanRun,
  aiLogsViewerRef,
  shouldClearLogs = false
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
  const [localHasScanRun, setLocalHasScanRun] = useState(false);
  
  // Use external state if provided, otherwise use local state
  const hasScanRun = externalHasScanRun !== undefined ? externalHasScanRun : localHasScanRun;
  const setHasScanRun = externalSetHasScanRun || setLocalHasScanRun;
  const [selectedDemographic, setSelectedDemographic] = useState<string | null>(null);
  const [debugMode, setDebugMode] = useState(false);
  const scanInFlightRef = useRef(false);
  const lastScanTsRef = useRef<number>(0);
  const requestedBatchesRef = useRef<Set<number>>(new Set());
  // Remove duplicate aiLogsViewerRef - using the one from props
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
    console.log('[FILTER] Updating filteredComments, count:', filtered.length, 'from comments:', comments.length);
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
      // Hide AI response when user starts editing and the comment originally had "AI: No Changes" status
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

    console.log(`[TOGGLE] Switching comment ${commentId} to mode: ${mode}`, {
      currentMode: comment.mode,
      hasRedactedText: !!comment.redactedText,
      hasRephrasedText: !!comment.rephrasedText,
      concerning: comment.concerning,
      identifiable: comment.identifiable
    });

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

    // Only reprocess if we don't have the required text for the mode AND the comment is identifiable
    if (comment.identifiable) {
      if (mode === 'redact' && !comment.redactedText) {
        console.log(`[TOGGLE] Need to reprocess for redact mode - no redactedText available`);
        // If switching to redact mode but no redacted text exists, reprocess
        await reprocessComment(commentId, mode);
      } else if (mode === 'rephrase' && !comment.rephrasedText) {
        console.log(`[TOGGLE] Need to reprocess for rephrase mode - no rephrasedText available`);
        // If switching to rephrase mode but no rephrased text exists, reprocess
        await reprocessComment(commentId, mode);
      } else {
        console.log(`[TOGGLE] No reprocessing needed - text already available for mode: ${mode}`);
      }
    } else if (comment.concerning && !comment.identifiable) {
      console.log(`[TOGGLE] Comment is only concerning (not identifiable) - no reprocessing needed, should stay in revert mode`);
    } else {
      console.log(`[TOGGLE] Comment not flagged (concerning: ${comment.concerning}, identifiable: ${comment.identifiable}) - no reprocessing needed`);
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
    // Reset requested batches tracker for this run
    requestedBatchesRef.current = new Set<number>();

    try {
      // Phase 1: Scan comments with Scan A and Scan B
      setScanProgress(10);
      if (isDemoData) {
        toast.info('Phase 1: Scanning demo comments (FREE - no credits deducted)...');
      } else {
        toast.info('Phase 1: Scanning comments for concerning/identifiable content...');
      }
      
      console.log('[SCAN] Starting initial scan-comments call...');
      const { data, error } = await supabase.functions.invoke('scan-comments', {
        body: {
          comments,
          defaultMode,
          scanRunId,
          isDemoScan: isDemoData,
          maxBatchesPerRequest: 2,
          maxRunMs: 70000
        }
      });

      // Aggregate multi-batch responses until complete
      if (data?.hasMore) {
        let accumulated = Array.isArray(data.comments) ? [...data.comments] : [];
        let nextBatchStart = (data.nextBatchStart ?? data.batchStart ?? accumulated.length) as number;
        let loops = 0;
        const expectedTotal = (data.totalComments as number) || comments.length;
        
        console.log(`[BATCH_CLIENT] Starting batch aggregation: accumulated=${accumulated.length}, nextStart=${nextBatchStart}, expectedTotal=${expectedTotal}`);
        
        // Continue requesting until server reports no more or we reach the expected total
        // Use a generous cap to avoid premature stop on large datasets
        const MAX_FOLLOWUPS = 200;
        while (data.hasMore && loops < MAX_FOLLOWUPS && accumulated.length < expectedTotal) {
          console.log(`[BATCH_CLIENT] Loop ${loops + 1}: requesting batch starting at ${nextBatchStart}`);
          if (requestedBatchesRef.current.has(nextBatchStart)) {
            console.warn(`[BATCH_CLIENT] Suppressing duplicate request for batchStart=${nextBatchStart}`);
            break;
          }
          requestedBatchesRef.current.add(nextBatchStart);
          
          console.log(`[SCAN] Requesting follow-up batch at start=${nextBatchStart}...`);
          const { data: nextData, error: nextError } = await supabase.functions.invoke('scan-comments', {
            body: {
              comments,
              defaultMode,
              scanRunId,
              isDemoScan: isDemoData,
              batchStart: nextBatchStart,
              useCachedAnalysis: true,
              maxBatchesPerRequest: 2,
              maxRunMs: 70000
            }
          });

          if (nextError) {
            console.error('Scan follow-up error:', nextError);
            break;
          }
          
          if (!nextData?.comments || nextData.comments.length === 0) {
            console.log(`[BATCH_CLIENT] No more comments in batch ${loops + 1}, stopping`);
            break;
          }

          const newCommentsCount = nextData.comments.length;
          accumulated = accumulated.concat(nextData.comments);
          
          // Calculate next batch start based on server hint or actual items
          nextBatchStart = typeof nextData.nextBatchStart === 'number'
            ? nextData.nextBatchStart
            : nextBatchStart + newCommentsCount;
          data.hasMore = Boolean(nextData.hasMore) && accumulated.length < expectedTotal;
          
          console.log(`[BATCH_CLIENT] Batch ${loops + 1} complete: received=${newCommentsCount}, accumulated=${accumulated.length}, nextStart=${nextBatchStart}, hasMore=${data.hasMore}`);
          
          loops += 1;
          
          // Small delay to prevent overwhelming the server
          if (data.hasMore) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }
        
        console.log(`[BATCH_CLIENT] Batch aggregation complete: total=${accumulated.length}, expected=${expectedTotal}`);
        // Replace original comments with the full set for downstream steps
        (data as any).comments = accumulated;
      }

      console.log(`Scan response:`, { data, error });
      console.log(`[DEBUG] Data type:`, typeof data, 'Error type:', typeof error);
      console.log(`[DEBUG] Data keys:`, data ? Object.keys(data) : 'null');
      console.log(`[DEBUG] Error keys:`, error ? Object.keys(error) : 'null');
      
      // Debug scan results
      if (data?.comments) {
        console.log(`[DEBUG] Scan results - ${data.comments.length} comments:`);
        data.comments.forEach((comment: any, index: number) => {
          console.log(`[DEBUG] Comment ${index + 1}:`, {
            id: comment.id,
            concerning: comment.concerning,
            identifiable: comment.identifiable,
            needsAdjudication: comment.needsAdjudication,
            mode: comment.mode
          });
        });
      }

      // Check for insufficient credits in the response data
      if (data && (data.error || data.insufficientCredits || data.success === false)) {
        console.log('[FRONTEND] Checking response for insufficient credits:', data);
        
        // Check if this is an insufficient credits error
        if (data.insufficientCredits || (data.error && data.error.includes('Insufficient credits'))) {
          console.log('[FRONTEND] Insufficient credits detected in response data');
          
          // Extract credit information from response
          let creditsNeeded = data.requiredCredits || comments.length;
          let creditsAvailable = data.availableCredits || 0;
          
          // If we don't have the structured data, try to parse the error message
          if (!data.requiredCredits || !data.availableCredits) {
            try {
              const match = data.error.match(/You have (\d+) credits available, but need (\d+) credits/);
              if (match) {
                creditsAvailable = parseInt(match[1]);
                creditsNeeded = parseInt(match[2]);
              }
            } catch (parseError) {
              console.warn('Could not parse credit information from error message:', parseError);
            }
          }
          
          console.log(`[FRONTEND] Credits needed: ${creditsNeeded}, available: ${creditsAvailable}`);
          
          // Show insufficient credits dialog
          if (onCreditsError) {
            onCreditsError(creditsNeeded, creditsAvailable);
          }
          
          // Reset scanning state
          setIsScanning(false);
          setScanProgress(0);
          scanInFlightRef.current = false;
          
          return; // Don't proceed with scan
        }
      }

      // Handle other errors
      if (error) {
        console.error(`Scan error:`, error);
        throw new Error(error.message || error.error || JSON.stringify(error));
      }

      if (!data?.comments) {
        // Check if this is because of insufficient credits
        if (data?.insufficientCredits || data?.error) {
          console.log('[FRONTEND] No comments in response, but insufficient credits detected');
          // This should have been handled above, but just in case
          return;
        }
        throw new Error(`No comment data received`);
      }

      setScanProgress(30);
      toast.info('Phase 1 complete: Comments scanned and flagged');
      console.log('[PHASE1] Completed initial scanning.');

      // Phase 2: Adjudication (handled by backend). Wait briefly if not completed yet.
      const adjudicatedCount = (data.comments as any[]).filter((c: any) => c.isAdjudicated).length;
      setScanProgress(60);
      console.log('[PHASE2] Adjudication phase beginning.');
      const adjudicationCompleted = Boolean((data as any).adjudicationCompleted);
      if (adjudicatedCount > 0) {
        toast.success(`Phase 2 complete: ${adjudicatedCount} disagreements resolved`);
        console.log(`[PHASE2] Completed with ${adjudicatedCount} resolved.`);
      } else if (adjudicationCompleted) {
        toast.info('Phase 2: Adjudication completed with no disagreements to resolve');
        console.log('[PHASE2] Completed with no disagreements.');
      } else {
        toast.info('Phase 2: Waiting for adjudication to complete...');
        console.log('[PHASE2] Waiting for adjudication to complete...');
        // Poll for adjudication completion without aborting Phase 3 on transient errors
        try {
          let adjudicationDone = Boolean((data as any).adjudicationCompleted);
          const maxPolls = 30;
          for (let i = 0; i < maxPolls && !adjudicationDone; i++) {
            await new Promise(r => setTimeout(r, 1500));
            try {
              const { data: statusData } = await supabase.functions.invoke('scan-comments', {
                body: {
                  comments,
                  defaultMode,
                  scanRunId,
                  isDemoScan: isDemoData,
                  useCachedAnalysis: true,
                  checkStatusOnly: true
                }
              });
              if (statusData && (statusData.adjudicationCompleted || (Array.isArray(statusData.comments) && statusData.comments.some((c: any) => c.isAdjudicated)))) {
                (data as any).adjudicationCompleted = Boolean(statusData.adjudicationCompleted);
                adjudicationDone = true;
                // Fetch full adjudicated comments (status-only returns empty comments)
                try {
                  const { data: fullAfterAdj } = await supabase.functions.invoke('scan-comments', {
                    body: {
                      comments,
                      defaultMode,
                      scanRunId,
                      isDemoScan: isDemoData,
                      useCachedAnalysis: true
                    }
                  });
                  if (fullAfterAdj && Array.isArray(fullAfterAdj.comments) && fullAfterAdj.comments.length >= (data.comments?.length || 0)) {
                    (data as any).comments = fullAfterAdj.comments;
                  }
                } catch {
                  // ignore
                }
                break;
              }
              // Nudge backend to resume adjudication if deferred and near the end of polling
              if (i === maxPolls - 1) {
                try {
                  await supabase.functions.invoke('scan-comments', {
                    body: {
                      comments,
                      defaultMode,
                      scanRunId,
                      isDemoScan: isDemoData,
                      useCachedAnalysis: true
                    }
                  });
                } catch {
                  // ignore
                }
              }
            } catch {
              // transient status error: continue polling
            }
          }
        } catch {
          // never abort Phase 3 due to polling errors
        }
      }

      // Phase 3: Post-process flagged comments
      let didPostProcessUpdate = false;
      // Process comments that are identifiable OR concerning-only (per updated logic)
      // Also consider pre-adjudication flags from scanA/scanB to avoid skipping Phase 3 when adjudication logs are delayed
      const commentsToProcess = data.comments.filter((c: any) => {
        const identifiable = Boolean(c.identifiable);
        const concerning = Boolean(c.concerning);
        const preA = Boolean(c.scanAResult?.identifiable || c.scanAResult?.concerning || c.adjudicationData?.scanAResult?.identifiable || c.adjudicationData?.scanAResult?.concerning);
        const preB = Boolean(c.scanBResult?.identifiable || c.scanBResult?.concerning || c.adjudicationData?.scanBResult?.identifiable || c.adjudicationData?.scanBResult?.concerning);
        return identifiable || concerning || preA || preB;
      });
      const phase3Counts = {
        total: data.comments.length,
        identifiable: data.comments.filter((c: any) => c.identifiable).length,
        concerning: data.comments.filter((c: any) => c.concerning).length,
        concerningOnly: data.comments.filter((c: any) => c.concerning && !c.identifiable).length,
        preScanFlagged: data.comments.filter((c: any) => (c.scanAResult?.identifiable || c.scanAResult?.concerning || c.adjudicationData?.scanAResult?.identifiable || c.adjudicationData?.scanAResult?.concerning || c.scanBResult?.identifiable || c.scanBResult?.concerning || c.adjudicationData?.scanBResult?.identifiable || c.adjudicationData?.scanBResult?.concerning)).length,
        toProcess: commentsToProcess.length,
        adjudicationCompleted: Boolean((data as any).adjudicationCompleted)
      };
      console.log('[PHASE3] Readiness:', phase3Counts);
      
      if (commentsToProcess.length > 0) {
        setScanProgress(70);
        toast.info(`Phase 3: Post-processing ${commentsToProcess.length} flagged comments (identifiable)...`);
        console.log(`[PHASE3] Starting with ${commentsToProcess.length} items.`);
        
        // Get AI configuration for post-processing
        const { data: aiConfigs, error: configError } = await supabase
          .from('ai_configurations')
          .select('*')
          .eq('scanner_type', 'scan_a')
          .single();
        
        if (configError || !aiConfigs) {
          console.warn('Failed to fetch AI configuration, using defaults');
        }
        
        console.log(`[BATCH] AI Config loaded for post-processing`);
        
        // Build routing sets based on which scan flagged the comment
        const getScanResult = (c: any, key: 'scanAResult' | 'scanBResult') => (c.adjudicationData?.[key] || c[key]);
        const wasFlaggedBy = (c: any, key: 'scanAResult' | 'scanBResult') => {
          const r = getScanResult(c, key);
          return Boolean(r && (r.concerning || r.identifiable));
        };
        const flaggedByAOnly = commentsToProcess.filter((c: any) => wasFlaggedBy(c, 'scanAResult') && !wasFlaggedBy(c, 'scanBResult'));
        const flaggedByBOnly = commentsToProcess.filter((c: any) => wasFlaggedBy(c, 'scanBResult') && !wasFlaggedBy(c, 'scanAResult'));
        const flaggedByBoth = commentsToProcess.filter((c: any) => wasFlaggedBy(c, 'scanAResult') && wasFlaggedBy(c, 'scanBResult'));
        const bothToA: any[] = [];
        const bothToB: any[] = [];
        flaggedByBoth.forEach((c: any, idx: number) => {
          if (idx % 2 === 0) bothToA.push(c); else bothToB.push(c);
        });
        const commentsForA = [...flaggedByAOnly, ...bothToA];
        const commentsForB = [...flaggedByBOnly, ...bothToB];

        console.log('[PHASE3] Launching redaction (scan_a, scan_b) ...', {
          aOnly: flaggedByAOnly.length,
          bOnly: flaggedByBOnly.length,
          both: flaggedByBoth.length,
          routeA: commentsForA.length,
          routeB: commentsForB.length
        });
        // 1) Run Redaction for Scan A and Scan B in parallel (route-specific)
        // Call post-process in parallel, but ensure we don't abort Phase 3 if one rejects
        const [ppRedactA, ppRedactB] = await Promise.allSettled([
          supabase.functions.invoke('post-process-comments', {
            body: {
              comments: commentsForA.map((c: any) => ({
                id: c.id,
                originalRow: c.originalRow,
                scannedIndex: c.scannedIndex,
                originalText: c.originalText || c.text,
                text: c.text,
                concerning: c.concerning,
                identifiable: c.identifiable,
                mode: c.mode || (c.identifiable ? defaultMode : (c.concerning ? 'rephrase' : 'original')),
                scanAResult: c.adjudicationData?.scanAResult || c.scanAResult,
                scanBResult: c.adjudicationData?.scanBResult || c.scanBResult,
                adjudicationResult: c.adjudicationResult
              })),
              scanConfig: {
                provider: aiConfigs?.provider || 'openai',
                model: aiConfigs?.model || 'gpt-4o-mini',
                redact_prompt: aiConfigs?.redact_prompt || 'Redact any concerning content while preserving the general meaning and tone.',
                rephrase_prompt: aiConfigs?.rephrase_prompt || 'Rephrase any personally identifiable information to make it anonymous while preserving the general meaning.',
              },
              defaultMode,
              scanRunId,
              phase: 'redaction',
              routingMode: 'scan_a'
            }
          }),
          supabase.functions.invoke('post-process-comments', {
            body: {
              comments: commentsForB.map((c: any) => ({
                id: c.id,
                originalRow: c.originalRow,
                scannedIndex: c.scannedIndex,
                originalText: c.originalText || c.text,
                text: c.text,
                concerning: c.concerning,
                identifiable: c.identifiable,
                mode: c.mode || (c.identifiable ? defaultMode : (c.concerning ? 'rephrase' : 'original')),
                scanAResult: c.adjudicationData?.scanAResult || c.scanAResult,
                scanBResult: c.adjudicationData?.scanBResult || c.scanBResult,
                adjudicationResult: c.adjudicationResult
              })),
              scanConfig: {
                provider: aiConfigs?.provider || 'openai',
                model: aiConfigs?.model || 'gpt-4o-mini',
                redact_prompt: aiConfigs?.redact_prompt || 'Redact any concerning content while preserving the general meaning and tone.',
                rephrase_prompt: aiConfigs?.rephrase_prompt || 'Rephrase any personally identifiable information to make it anonymous while preserving the general meaning.',
              },
              defaultMode,
              scanRunId,
              phase: 'redaction',
              routingMode: 'scan_b'
            }
          })
        ]);
        const postRedactA = ppRedactA.status === 'fulfilled' ? ppRedactA.value.data : null;
        const postRedactB = ppRedactB.status === 'fulfilled' ? ppRedactB.value.data : null;
        if (ppRedactA.status === 'rejected') console.error('Post-processing (redaction A) error:', ppRedactA.reason);
        if (ppRedactB.status === 'rejected') console.error('Post-processing (redaction B) error:', ppRedactB.reason);

        console.log('[PHASE3] Redaction finished. Launching rephrase (scan_a, scan_b) ...');
        // 2) After both redaction calls complete, run Rephrase for A and B in parallel (same routing)
        const [ppRephraseA, ppRephraseB] = await Promise.allSettled([
          supabase.functions.invoke('post-process-comments', {
            body: {
              comments: commentsForA.map((c: any) => ({
                id: c.id,
                originalRow: c.originalRow,
                scannedIndex: c.scannedIndex,
                originalText: c.originalText || c.text,
                text: c.text,
                concerning: c.concerning,
                identifiable: c.identifiable,
                mode: c.mode || (c.identifiable ? defaultMode : (c.concerning ? 'rephrase' : 'original')),
                scanAResult: c.adjudicationData?.scanAResult || c.scanAResult,
                scanBResult: c.adjudicationData?.scanBResult || c.scanBResult,
                adjudicationResult: c.adjudicationResult
              })),
              scanConfig: {
                provider: aiConfigs?.provider || 'openai',
                model: aiConfigs?.model || 'gpt-4o-mini',
                redact_prompt: aiConfigs?.redact_prompt || 'Redact any concerning content while preserving the general meaning and tone.',
                rephrase_prompt: aiConfigs?.rephrase_prompt || 'Rephrase any personally identifiable information to make it anonymous while preserving the general meaning.',
              },
              defaultMode,
              scanRunId,
              phase: 'rephrase',
              routingMode: 'scan_a'
            }
          }),
          supabase.functions.invoke('post-process-comments', {
            body: {
              comments: commentsForB.map((c: any) => ({
                id: c.id,
                originalRow: c.originalRow,
                scannedIndex: c.scannedIndex,
                originalText: c.originalText || c.text,
                text: c.text,
                concerning: c.concerning,
                identifiable: c.identifiable,
                mode: c.mode || (c.identifiable ? defaultMode : (c.concerning ? 'rephrase' : 'original')),
                scanAResult: c.adjudicationData?.scanAResult || c.scanAResult,
                scanBResult: c.adjudicationData?.scanBResult || c.scanBResult,
                adjudicationResult: c.adjudicationResult
              })),
              scanConfig: {
                provider: aiConfigs?.provider || 'openai',
                model: aiConfigs?.model || 'gpt-4o-mini',
                redact_prompt: aiConfigs?.redact_prompt || 'Redact any concerning content while preserving the general meaning and tone.',
                rephrase_prompt: aiConfigs?.rephrase_prompt || 'Rephrase any personally identifiable information to make it anonymous while preserving the general meaning.',
              },
              defaultMode,
              scanRunId,
              phase: 'rephrase',
              routingMode: 'scan_b'
            }
          })
        ]);
        const postRephraseA = ppRephraseA.status === 'fulfilled' ? ppRephraseA.value.data : null;
        const postRephraseB = ppRephraseB.status === 'fulfilled' ? ppRephraseB.value.data : null;
        if (ppRephraseA.status === 'rejected') console.error('Post-processing (rephrase A) error:', ppRephraseA.reason);
        if (ppRephraseB.status === 'rejected') console.error('Post-processing (rephrase B) error:', ppRephraseB.reason);

        // Merge all four results using multiple keys to avoid misses
        const processedCombined: Record<string, any> = {};
        const processedByOriginalRow: Map<number, any> = new Map();
        const processedByScannedIndex: Map<number, any> = new Map();
        const addResults = (arr?: any[]) => {
          if (!Array.isArray(arr)) return;
          for (const item of arr) {
            const key = String(item.id ?? '');
            const existing = key ? (processedCombined[key] || { id: key }) : {};
            const merged = {
              ...existing,
              // Prefer AI-derived results if present; otherwise keep existing
              redactedText: item.redactedText !== undefined ? item.redactedText : existing.redactedText,
              rephrasedText: item.rephrasedText !== undefined ? item.rephrasedText : existing.rephrasedText,
              originalRow: typeof item.originalRow === 'string' ? parseInt(item.originalRow, 10) : (item.originalRow ?? existing.originalRow),
              scannedIndex: typeof item.scannedIndex === 'string' ? parseInt(item.scannedIndex, 10) : (item.scannedIndex ?? existing.scannedIndex),
            };
            if (key) processedCombined[key] = merged;
            if (typeof merged.originalRow === 'number') processedByOriginalRow.set(merged.originalRow, merged);
            if (typeof merged.scannedIndex === 'number') processedByScannedIndex.set(merged.scannedIndex, merged);
          }
        };
        addResults(postRedactA?.processedComments);
        addResults(postRedactB?.processedComments);
        addResults(postRephraseA?.processedComments);
        addResults(postRephraseB?.processedComments);
        let mergedProcessed = Object.values(processedCombined);

        // Fallback: if nothing processed yet, try a single combined call (both phases)
        if (mergedProcessed.length === 0) {
          try {
            console.warn('[PHASE3] No processed results from split routes, attempting single combined post-process call...');
            const { data: ppCombined, error: ppCombinedErr } = await supabase.functions.invoke('post-process-comments', {
              body: {
                comments: commentsToProcess.map((c: any) => ({
                  id: c.id,
                  originalRow: c.originalRow,
                  scannedIndex: c.scannedIndex,
                  originalText: c.originalText || c.text,
                  text: c.text,
                  concerning: c.concerning,
                  identifiable: c.identifiable,
                  mode: c.mode || (c.identifiable ? defaultMode : (c.concerning ? 'rephrase' : 'original')),
                  scanAResult: c.adjudicationData?.scanAResult || c.scanAResult,
                  scanBResult: c.adjudicationData?.scanBResult || c.scanBResult,
                  adjudicationResult: c.adjudicationResult
                })),
                scanConfig: {
                  provider: aiConfigs?.provider || 'openai',
                  model: aiConfigs?.model || 'gpt-4o-mini',
                  redact_prompt: aiConfigs?.redact_prompt || 'Redact any concerning content while preserving the general meaning and tone.',
                  rephrase_prompt: aiConfigs?.rephrase_prompt || 'Rephrase any personally identifiable information to make it anonymous while preserving the general meaning.',
                },
                defaultMode,
                scanRunId,
                phase: 'both',
                routingMode: 'both'
              }
            });
            if (!ppCombinedErr && ppCombined?.processedComments) {
              addResults(ppCombined.processedComments);
              mergedProcessed = Object.values(processedCombined);
              console.log('[PHASE3] Combined post-process fallback succeeded:', mergedProcessed.length);
            } else if (ppCombinedErr) {
              console.error('[PHASE3] Combined post-process fallback error:', ppCombinedErr);
            }
          } catch (ppCombinedEx) {
            console.error('[PHASE3] Combined post-process fallback exception:', ppCombinedEx);
          }
        }
        // Safety: ensure concerning-only comments are present (rephrase-only)
        const concerningOnly = commentsToProcess.filter((c: any) => c.concerning && !c.identifiable);
        const missingConcerning = concerningOnly.filter((c: any) => !processedCombined[c.id]);
        if (missingConcerning.length > 0) {
          console.log(`[PHASE3] Safety rephrase for concerning-only: ${missingConcerning.length} items`);
          const { data: ppRephraseSafety, error: safetyErr } = await supabase.functions.invoke('post-process-comments', {
            body: {
              comments: missingConcerning.map((c: any) => ({
                id: c.id,
                originalRow: c.originalRow,
                scannedIndex: c.scannedIndex,
                originalText: c.originalText || c.text,
                text: c.text,
                concerning: c.concerning,
                identifiable: c.identifiable,
                mode: 'rephrase',
                scanAResult: c.adjudicationData?.scanAResult || c.scanAResult,
                scanBResult: c.adjudicationData?.scanBResult || c.scanBResult,
                adjudicationResult: c.adjudicationResult
              })),
              scanConfig: {
                provider: aiConfigs?.provider || 'openai',
                model: aiConfigs?.model || 'gpt-4o-mini',
                redact_prompt: aiConfigs?.redact_prompt || 'Redact any concerning content while preserving the general meaning and tone.',
                rephrase_prompt: aiConfigs?.rephrase_prompt || 'Rephrase any personally identifiable information to make it anonymous while preserving the general meaning.',
              },
              defaultMode,
              scanRunId,
              phase: 'rephrase',
              routingMode: 'both'
            }
          });
          if (!safetyErr && ppRephraseSafety?.processedComments) {
            for (const item of ppRephraseSafety.processedComments as any[]) {
              const existing = processedCombined[item.id] || { id: item.id };
              processedCombined[item.id] = {
                ...existing,
                rephrasedText: item.rephrasedText ?? existing.rephrasedText,
                finalText: item.finalText ?? existing.finalText,
                mode: item.mode ?? existing.mode,
              };
            }
            mergedProcessed = Object.values(processedCombined);
          }
        }
        if (mergedProcessed.length > 0) {
          console.log(`Post-processing completed: merged ${mergedProcessed.length} items`);
          
          // Create a map of processed comments by ID
          const processedMap = new Map(
            (mergedProcessed as any[]).map((c: any) => [c.id, c])
          );
          
          console.log(`Created processedMap with ${processedMap.size} entries:`, Array.from(processedMap.keys()));
          
          // Merge post-processing results back into the scan data
          const finalComments = data.comments.map((comment: any) => {
            // Process comments that are identifiable OR concerning-only
            if (comment.identifiable || comment.concerning) {
              let processed = processedMap.get(comment.id) as any;
              const orow = typeof comment.originalRow === 'string' ? parseInt(comment.originalRow, 10) : comment.originalRow;
              const sidx = typeof comment.scannedIndex === 'string' ? parseInt(comment.scannedIndex, 10) : comment.scannedIndex;
              if (!processed && typeof orow === 'number') {
                processed = processedByOriginalRow.get(orow);
              }
              if (!processed && typeof sidx === 'number') {
                processed = processedByScannedIndex.get(sidx);
              }
              if (processed) {
                console.log(`[POSTPROCESS] Raw processed comment:`, {
                  id: processed.id,
                  mode: processed.mode,
                  finalText: processed.finalText,
                  redactedText: processed.redactedText,
                  rephrasedText: processed.rephrasedText,
                  hasRedacted: !!processed.redactedText,
                  hasRephrased: !!processed.rephrasedText,
                  redactedTextPreview: processed.redactedText?.substring(0, 50),
                  rephrasedTextPreview: processed.rephrasedText?.substring(0, 50),
                  finalTextPreview: processed.finalText?.substring(0, 50)
                });
                
                // Determine the final text based on the backend finalText first, then fallback logic
                let finalText = comment.text; // Default to existing text
                let finalMode = processed.mode || defaultMode; // Use backend mode if available, otherwise use default mode
                
                console.log(`[MODE] Comment ${comment.id} - identifiable: ${comment.identifiable}, concerning: ${comment.concerning}, defaultMode: ${defaultMode}, processed mode: ${processed.mode}`);
                console.log(`[MODE] Comment ${comment.id} - has redactedText: ${!!processed.redactedText}, has rephrasedText: ${!!processed.rephrasedText}`);
                
                // Prefer computed redacted/rephrased based on policy; fall back to backend finalText last
                if (comment.identifiable) {
                  if (defaultMode === 'redact' && processed.redactedText) {
                    finalText = processed.redactedText;
                    finalMode = 'redact';
                  } else if (defaultMode === 'rephrase' && processed.rephrasedText) {
                    finalText = processed.rephrasedText;
                    finalMode = 'rephrase';
                  }
                } else if (comment.concerning && !comment.identifiable) {
                  if (processed.rephrasedText) {
                    finalText = processed.rephrasedText;
                    finalMode = 'rephrase';
                  }
                }
                if ((finalMode === defaultMode && finalText === comment.text) || (!processed.redactedText && !processed.rephrasedText)) {
                  if (typeof processed.finalText === 'string' && processed.finalText.trim().length > 0) {
                    finalText = processed.finalText;
                    finalMode = processed.mode || finalMode;
                    console.log(`[MODE] Fallback to backend finalText for comment ${comment.id}`);
                  }
                }
                
                 console.log(`[MODE] Final result for comment ${comment.id}: mode=${finalMode}, textLength=${finalText.length}`);
                 console.log(`[UPDATE] Setting comment.text to:`, finalText?.substring(0, 100));
                 console.log(`[UPDATE] Comment ${comment.id} - identifiable: ${comment.identifiable}, defaultMode: ${defaultMode}, finalMode: ${finalMode}, isRedacted: ${finalText !== comment.originalText && finalText === processed.redactedText}, isRephrased: ${finalText !== comment.originalText && finalText === processed.rephrasedText}`);
                 
                 const result = {
                   ...comment,
                   text: finalText,
                   redactedText: processed.redactedText,
                   rephrasedText: processed.rephrasedText,
                   mode: finalMode, // Use the determined final mode
                   needsPostProcessing: false, // Mark as processed
                   isPostProcessed: true // Add flag to prevent re-processing
                 };
                 
                 console.log(`[POSTPROCESS] Final result for comment ${comment.id}:`, {
                   identifiable: comment.identifiable,
                   concerning: comment.concerning,
                   defaultMode,
                   finalMode,
                   originalText: comment.text?.substring(0, 50),
                   finalText: finalText?.substring(0, 50),
                   redactedText: processed.redactedText?.substring(0, 50),
                   rephrasedText: processed.rephrasedText?.substring(0, 50),
                   isRedacted: finalText !== comment.text && finalText === processed.redactedText,
                   isRephrased: finalText !== comment.text && finalText === processed.rephrasedText
                 });
                 
                 return result;
              }
            }
            return comment;
          });
          
          // Update processedComments with the merged results and persist to UI state
          data.comments = finalComments;
          // Debug: log key rows to ensure processed values reached UI state
          const rowsToCheck = new Set([1,3,5,7,9,12,14,18]);
          console.log('[PHASE3][VERIFY] Final rows:', finalComments
            .filter((c: any) => typeof c.originalRow === 'number' && rowsToCheck.has(c.originalRow))
            .map((c: any) => ({
              originalRow: c.originalRow,
              id: c.id,
              mode: c.mode,
              hasRedacted: !!c.redactedText,
              hasRephrased: !!c.rephrasedText,
              textPreview: (c.text || '').substring(0, 80)
            }))
          );
          console.log('[UPDATE] Calling onCommentsUpdate with finalComments sample:', 
            finalComments.slice(0, 3).map((c: any) => ({ 
              id: c.id, 
              mode: c.mode, 
              textPreview: c.text?.substring(0, 50),
              isOriginal: c.text === c.originalText 
            }))
          );
          onCommentsUpdate(finalComments);
          didPostProcessUpdate = true;
          
          // Show success message with a computed summary based on final comments
          const redactedSummaryCount = finalComments.filter((c: any) => (c.identifiable || c.concerning) && c.mode === 'redact').length;
          const rephrasedSummaryCount = finalComments.filter((c: any) => (c.identifiable || c.concerning) && c.mode === 'rephrase').length;
          const originalSummaryCount = finalComments.length - redactedSummaryCount - rephrasedSummaryCount;
          toast.success(`Post-processing complete: ${redactedSummaryCount} redacted, ${rephrasedSummaryCount} rephrased, ${originalSummaryCount} unchanged`);
          
          setScanProgress(95);
        } else {
          console.warn('Post-processing returned no data, using scan results with placeholders');
          console.log('Full post-process responses:', { postRephraseA, postRedactA });
          console.log('[PHASE3] No processed results from split routes.');
        }
      } else {
        setScanProgress(95);
        // Explicit log note when Phase 3 is skipped (no identifiable items to post-process)
        console.log(`[PHASE3] Skipped: 0 flagged comments after adjudication.`);
        toast.info('Phase 3: No flagged comments to post-process');
      }

      // Final update with all processed comments
      setScanProgress(100);
      setHasScanRun(true);
      
      // Debug final comments before update
      console.log(`[DEBUG] Final comments before update - ${data.comments.length} comments:`);
      data.comments.forEach((comment: any, index: number) => {
        console.log(`[DEBUG] Final Comment ${index + 1}:`, {
          id: comment.id,
          concerning: comment.concerning,
          identifiable: comment.identifiable,
          mode: comment.mode,
          redactedText: !!comment.redactedText,
          rephrasedText: !!comment.rephrasedText,
          hasScanRun: true
        });
      });
      
      if (!didPostProcessUpdate) {
        onCommentsUpdate(data.comments);
      }
      toast.success(`Scan complete: ${data.comments.length} comments processed`);
      
      // Refresh credits after successful scan completion
      if (onCreditsRefresh) {
        onCreditsRefresh();
      }
      
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
    // Helper function to sanitize XLSX values against formula injection
    const sanitizeForXLSX = (value: any): string => {
      const str = String(value || '');
      // Check if value starts with formula characters
      if (str.match(/^[=+\-@]/)) {
        return `'${str}`; // Prefix with single quote to neutralize
      }
      return str;
    };

    const exportData = comments.map((comment, index) => ({
      'Row': sanitizeForXLSX(comment.originalRow || index + 1),
      'Original Comment': sanitizeForXLSX(comment.originalText),
      'Final Comment': sanitizeForXLSX(comment.text),
      'Author': sanitizeForXLSX(comment.author || ''),
      'Concerning': sanitizeForXLSX(comment.concerning ? 'Yes' : 'No'),
      'Identifiable': sanitizeForXLSX(comment.identifiable ? 'Yes' : 'No'),
      'AI Reasoning': sanitizeForXLSX(comment.aiReasoning || ''),
      'Redacted': sanitizeForXLSX(comment.redactedText || ''),
      'Rephrased': sanitizeForXLSX(comment.rephrasedText || ''),
      'Approved': sanitizeForXLSX(comment.approved ? 'Yes' : 'No'),
      'Last Modified': sanitizeForXLSX(comment.timestamp || '')
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
    // If no scan has been run yet, show "Scan Needed"
    if (!hasScanRun) {
      return 'Scan Needed';
    }

    // Check if comment has been manually edited and differs from both original AND AI suggestions
    if (comment.mode === 'edit' || (comment.text !== comment.originalText && comment.text !== comment.redactedText && comment.text !== comment.rephrasedText)) {
      return 'Edited';
    }

    // If comment has processed text available (redacted or rephrased), show as "AI: Flagged"
    if (comment.redactedText || comment.rephrasedText) {
      return 'AI: Flagged';
    }

    // Comments that are identifiable or concerning should show as "AI: Flagged"
    if (comment.identifiable || comment.concerning) {
      return 'AI: Flagged';
    }

    // If the comment was processed by AI but no changes were needed
    if (comment.aiReasoning) {
      return 'AI: No Changes';
    }

    // Default to scan needed if no AI processing has occurred
    return 'Scan Needed';
  };

  // Get the initial mode for comments with "AI: No Changes" status
  const getInitialMode = (comment: CommentData) => {
    const status = getCommentStatus(comment);
    if (status === 'AI: No Changes' && !comment.mode) {
      return 'revert';
    }
    return comment.mode;
  };
  const reprocessComment = async (commentId: string, mode: 'redact' | 'rephrase' | 'revert') => {
    const comment = comments.find(c => c.id === commentId);
    if (!comment) return;
    
    // Prevent reprocessing comments that are only concerning (not identifiable)
    if (comment.concerning && !comment.identifiable) {
      console.log(`[REPROCESS] Comment ${commentId} is only concerning (not identifiable) - should not be reprocessed`);
      toast.warning('Comments that are only concerning (not identifiable) should remain in revert mode');
      return;
    }
    
    // Allow processing of comments that are identifiable (with or without concerning)
    if (!comment.identifiable) {
      console.log(`[REPROCESS] Comment ${commentId} is not identifiable - no processing needed`);
      toast.warning('Comments that are not identifiable do not need processing');
      return;
    }
    
    try {
      // Get AI configuration for post-processing
      const { data: aiConfigData } = await supabase
        .from('ai_configurations')
        .select('*')
        .eq('scanner_type', 'scan_a')
        .single();

      const aiConfig = aiConfigData || {
        provider: 'openai',
        model: 'gpt-4o-mini',
        redact_prompt: 'Redact any personally identifiable information from this text while preserving the meaning.',
        rephrase_prompt: 'Rephrase this text to remove personally identifiable information while preserving the meaning.',
        
      };

      // Call post-process-comments directly since we already have scan results
      const { data, error } = await supabase.functions.invoke('post-process-comments', {
        body: {
          comments: [{
            ...comment,
            mode
          }],
          scanConfig: {
            provider: aiConfigData?.provider || 'openai',
            model: aiConfigData?.model || 'gpt-4o-mini',
            redact_prompt: aiConfigData?.redact_prompt || 'Redact any personally identifiable information from this text while preserving the meaning.',
            rephrase_prompt: aiConfigData?.rephrase_prompt || 'Rephrase this text to remove personally identifiable information while preserving the meaning.',
          },
          defaultMode: mode,
          scanRunId: `reprocess-${Date.now()}`
        }
      });
      
      if (error) throw new Error(error.message);
      if (data?.processedComments && data.processedComments.length > 0) {
        let updatedComment = data.processedComments[0];
        
        // Update the comment with the processed text
        const updatedComments = comments.map(c => c.id === commentId ? {
          ...c,
          ...updatedComment,
          mode,
          text: mode === 'rephrase' ? (updatedComment.rephrasedText || c.text) : 
                 mode === 'redact' ? (updatedComment.redactedText || c.text) : c.text,
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
                {scanProgress < 30 && 'Phase 1: Scanning comments...'}
                {scanProgress >= 30 && scanProgress < 60 && 'Phase 2: Adjudicating disagreements...'}
                {scanProgress >= 60 && scanProgress < 100 && 'Phase 3: Post-processing flagged comments...'}
                {scanProgress === 100 && 'Complete!'}
                {' '}{Math.round(scanProgress)}%
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
            // Reset scan state when new comments are imported
            if (onResetScanState) {
              onResetScanState();
            }
            setShowImportDialog(false);
          }} />
          </Card>
        </div>}

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
        <Input placeholder="Search comments..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10" />
      </div>

      {/* AI Logs Viewer */}
      <div className="mb-6">
        <AILogsViewer 
          debugMode={debugMode} 
          skipInitialFetch={shouldClearLogs}
          onRef={(ref) => {
            if (aiLogsViewerRef && aiLogsViewerRef.current !== ref) {
              // Only assign if aiLogsViewerRef exists and ref value has changed
              (aiLogsViewerRef as any).current = ref;
            }
          }}
        />
      </div>

      {/* Comments List - Scrollable Container */}
      <div ref={scrollContainerRef} className="h-[70vh] overflow-y-auto border rounded-lg bg-background/50 backdrop-blur-sm">
        <div className="space-y-4 p-4">
        {filteredComments.map((comment, index) => <Card key={comment.id} className={`p-4 sm:p-6 hover:shadow-md transition-all duration-300 animate-fade-in ${comment.approved ? 'bg-green-50 border-green-300 dark:bg-green-950/30 dark:border-green-800/50' : comment.concerning ? 'bg-red-200 border-red-500 dark:bg-red-900/40 dark:border-red-700/60' : comment.identifiable && !comment.concerning ? 'bg-red-50 border-red-200 dark:bg-red-950/10 dark:border-red-800/20' : ''}`}>
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
                     {comment.aiReasoning && !comment.hideAiResponse && getCommentStatus(comment) !== 'AI: No Changes' && <div className="p-2 rounded-lg bg-muted/50 border">
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
                       {(() => {
                         const status = getCommentStatus(comment);
                         const showButtons = comment.identifiable || comment.redactedText || comment.rephrasedText;
                         
                         console.log('Button debug:', {
                           status,
                           identifiable: comment.identifiable,
                           redactedText: !!comment.redactedText,
                           rephrasedText: !!comment.rephrasedText,
                           mode: comment.mode,
                           showButtons
                         });
                         
                          if (status === 'Scan Needed') return null;
                          
                          if (status === 'AI: No Changes') {
                            return <Button variant="default" size="sm" onClick={() => toggleCommentMode(comment.id, 'revert')} className="h-6 text-xs px-2">
                              Revert
                            </Button>;
                          }
                         
                         return <>
                           {/* Show Redact/Rephrase buttons for comments that are identifiable or have processed text available */}
                           {showButtons && <>
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
                         </>;
                       })()}
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
                         {/* Always show the unified final text */}
                         <p className="text-foreground leading-relaxed text-sm sm:text-base">
                           {(() => {
                             // After post-processing, comment.text should contain the correct processed text
                             // Only override for specific modes
                             let displayText = comment.text;
                             
                             if (comment.mode === 'revert') {
                               displayText = comment.originalText;
                             }
                             
                             console.log(`[DISPLAY] Comment ${comment.id}:`, {
                               mode: comment.mode,
                               displayText: displayText?.substring(0, 100),
                               text: comment.text?.substring(0, 100),
                               originalText: comment.originalText?.substring(0, 100),
                               redactedText: comment.redactedText?.substring(0, 100),
                               rephrasedText: comment.rephrasedText?.substring(0, 100),
                               hasScanRun,
                               identifiable: comment.identifiable
                             });
                             
                             return displayText;
                           })()}
                         </p>
                        {/* Context badge */}
                        {comment.mode === 'redact' && comment.redactedText && (
                          <div className="mt-2 p-2 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/50">
                            <p className="text-xs text-blue-700 dark:text-blue-300">
                              <strong>Redacted Version</strong> - Personally identifiable information has been removed
                            </p>
                          </div>
                        )}
                        {comment.mode === 'rephrase' && comment.rephrasedText && (
                          <div className="mt-2 p-2 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800/50">
                            <p className="text-xs text-green-700 dark:text-green-300">
                              <strong>Rephrased Version</strong> - Personally identifiable information has been anonymized
                            </p>
                          </div>
                        )}
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