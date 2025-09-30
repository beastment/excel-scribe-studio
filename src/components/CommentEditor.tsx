import React, { useState, useEffect, useRef } from 'react';
import { Search, Download, Edit3, Check, X, User, Filter, Scan, AlertTriangle, Eye, EyeOff, ToggleLeft, ToggleRight, Upload, FileText, HelpCircle, Save, FolderOpen, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
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
  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  const [filteredComments, setFilteredComments] = useState<CommentData[]>(comments || []);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [defaultMode, setDefaultMode] = useState<'redact' | 'rephrase'>('redact');
  const [validationWarning, setValidationWarning] = useState<{
    hasMissing: boolean;
    missingCount: number;
    totalComments: number;
    missingDetails: Array<{
      commentId: string;
      commentIndex: number;
      missingScanA: boolean;
      missingScanB: boolean;
      scanAResult?: any;
      scanBResult?: any;
    }>;
  } | null>(null);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [focusedCommentId, setFocusedCommentId] = useState<string | null>(null);
  const [localHasScanRun, setLocalHasScanRun] = useState(false);
  
  // Use external state if provided, otherwise use local state
  const hasScanRun = externalHasScanRun !== undefined ? externalHasScanRun : localHasScanRun;
  const setHasScanRun = externalSetHasScanRun || setLocalHasScanRun;
  const [selectedDemographic, setSelectedDemographic] = useState<string | null>(null);
  const [debugMode, setDebugMode] = useState(false);
  const [redactionOutputMode, setRedactionOutputMode] = useState<'spans' | 'full_text'>('spans');
  const [debugPrompts, setDebugPrompts] = useState<{ scanA?: string; scanB?: string; adjudicator?: string; redaction?: string; rephrase?: string }>({});
  const scanInFlightRef = useRef(false);
  const lastScanTsRef = useRef<number>(0);
  const requestedBatchesRef = useRef<Set<number>>(new Set());
  // Track de-duplication keys for post-process requests within a run
  const postProcessDedupRef = useRef<Set<string>>(new Set());
  const postProcessInFlightRef = useRef<Set<string>>(new Set());
  // Per-model redaction barrier: ensures no rephrase requests are sent for a model
  // until all redaction batches for that model have completed in this Phase 3 run
  const modelRedactionGateRef = useRef<Map<string, { promise: Promise<void>; resolve: () => void }>>(new Map());
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
      const matchesSearch = (comment.text || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
                           (comment.originalText || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
                           (comment.author && comment.author.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesDemographic = selectedDemographic ? comment.demographics === selectedDemographic : true;
      
      // Filter logic based on active filters
      if (activeFilters.length === 0) {
        return matchesSearch && matchesDemographic; // Show all when no filters selected
      }
      
      const isError = (comment.concerning || comment.identifiable) && comment.text === comment.originalText;
      const matchesFilters = activeFilters.some(filter => {
        if (filter === 'concerning') return comment.concerning;
        if (filter === 'identifiable') return comment.identifiable;
        if (filter === 'error') return isError;
        return false;
      });
      
      return matchesSearch && matchesDemographic && matchesFilters;
    });
    console.log('[FILTER] Updating filteredComments, count:', filtered.length, 'from comments:', comments.length, 'activeFilters:', activeFilters);
    setFilteredComments(filtered);
  }, [comments, searchTerm, activeFilters, selectedDemographic]);

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
  // Validation function to check for complete scan results
  const validateScanResults = (comments: any[]): {
    hasMissingResults: boolean;
    missingCount: number;
    totalComments: number;
    missingDetails: Array<{
      commentId: string;
      commentIndex: number;
      missingScanA: boolean;
      missingScanB: boolean;
      scanAResult?: any;
      scanBResult?: any;
    }>;
  } => {
    console.log(`[VALIDATION] Starting validation of ${comments.length} comments`);
    
    const missingDetails: Array<{
      commentId: string;
      commentIndex: number;
      missingScanA: boolean;
      missingScanB: boolean;
      scanAResult?: any;
      scanBResult?: any;
    }> = [];
    
    comments.forEach((comment, index) => {
      const scanAResult = comment.adjudicationData?.scanAResult || comment.scanAResult;
      const scanBResult = comment.adjudicationData?.scanBResult || comment.scanBResult;
      
      // Check if results are missing or are default padded results
      const isDefaultResult = (result: any) => {
        return result && 
               typeof result === 'object' && 
               result.concerning === false && 
               result.identifiable === false &&
               (!result.model || result.model === 'default');
      };
      
      const missingScanA = !scanAResult || typeof scanAResult !== 'object' || 
        (scanAResult.concerning === undefined && scanAResult.identifiable === undefined) ||
        isDefaultResult(scanAResult);
      const missingScanB = !scanBResult || typeof scanBResult !== 'object' || 
        (scanBResult.concerning === undefined && scanBResult.identifiable === undefined) ||
        isDefaultResult(scanBResult);
      
      if (missingScanA || missingScanB) {
        const reasonA = !scanAResult ? 'no result' : 
                       typeof scanAResult !== 'object' ? 'invalid type' :
                       (scanAResult.concerning === undefined && scanAResult.identifiable === undefined) ? 'missing properties' :
                       isDefaultResult(scanAResult) ? 'default padded' : 'unknown';
        const reasonB = !scanBResult ? 'no result' : 
                       typeof scanBResult !== 'object' ? 'invalid type' :
                       (scanBResult.concerning === undefined && scanBResult.identifiable === undefined) ? 'missing properties' :
                       isDefaultResult(scanBResult) ? 'default padded' : 'unknown';
        
        console.log(`[VALIDATION] Missing results for comment ${index + 1}:`, {
          commentId: comment.id,
          missingScanA,
          missingScanB,
          reasonA,
          reasonB,
          scanAResult,
          scanBResult
        });
        missingDetails.push({
          commentId: comment.id,
          commentIndex: index + 1,
          missingScanA,
          missingScanB,
          scanAResult,
          scanBResult
        });
      }
    });
    
    console.log(`[VALIDATION] Validation complete:`, {
      hasMissingResults: missingDetails.length > 0,
      missingCount: missingDetails.length,
      totalComments: comments.length
    });
    
    return {
      hasMissingResults: missingDetails.length > 0,
      missingCount: missingDetails.length,
      totalComments: comments.length,
      missingDetails
    };
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
    // Reset per-run post-process de-duplication keys
    postProcessDedupRef.current = new Set<string>();
    setScanProgress(0);
    toast.info(`Scanning ${comments.length} comments with AI...`);

    // Generate a short 4-digit scanRunId so backend logs can be filtered to this click
    const scanRunId = String(Math.floor(1000 + Math.random() * 9000));
    
    // Clean up old deduplication entries to prevent localStorage from growing indefinitely
    try {
      const keysToRemove: string[] = [];
      const now = Date.now();
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours
      
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('pp:ttl:') || key.startsWith('pp:'))) {
          try {
            const value = localStorage.getItem(key);
            if (value) {
              const timestamp = Number(value);
              if (!Number.isNaN(timestamp) && now - timestamp > maxAge) {
                keysToRemove.push(key);
              }
            }
          } catch (_) {
            // If we can't parse the value, remove it
            keysToRemove.push(key);
          }
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key));
      if (keysToRemove.length > 0) {
        console.log(`[CLEANUP] Removed ${keysToRemove.length} old deduplication entries`);
      }
    } catch (error) {
      console.warn('[CLEANUP] Failed to clean up old deduplication entries:', error);
    }
    
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
      
      // Client-managed batch sizing for scan-comments
      // 1) Load Scan A/B configs and model limits
      const { data: aiConfigsAll } = await supabase
        .from('ai_configurations')
        .select('*');
      const scanA = Array.isArray(aiConfigsAll) ? aiConfigsAll.find((c: any) => c.scanner_type === 'scan_a') : undefined;
      const scanB = Array.isArray(aiConfigsAll) ? aiConfigsAll.find((c: any) => c.scanner_type === 'scan_b') : undefined;
      if (!scanA || !scanB) {
        throw new Error('Missing AI configurations for Scan A/B');
      }
      setDebugPrompts(prev => ({ ...prev, scanA: String(scanA.analysis_prompt || ''), scanB: String(scanB.analysis_prompt || '') }));

      const { data: modelConfigsAll } = await supabase
        .from('model_configurations')
        .select('*');
      const modelA = Array.isArray(modelConfigsAll) ? modelConfigsAll.find((m: any) => m.provider === scanA.provider && m.model === scanA.model) : undefined;
      const modelB = Array.isArray(modelConfigsAll) ? modelConfigsAll.find((m: any) => m.provider === scanB.provider && m.model === scanB.model) : undefined;
      if (!modelA?.output_token_limit || !modelB?.output_token_limit) {
        throw new Error('Model token limits missing for Scan A/B');
      }

      const { data: batchSizingData } = await supabase
        .from('batch_sizing_config')
        .select('*')
        .single();
      const safetyMarginPercent = Math.min(90, Math.max(0, Number.isFinite(batchSizingData?.safety_margin_percent) ? batchSizingData.safety_margin_percent : 15));
      const safetyMultiplier = 1 - (safetyMarginPercent / 100);

      // 2) Local token estimator
      const estimateTokens = (provider: string, model: string, text: string): number => {
        const t = String(text || '');
        const ms = model.toLowerCase();
        if (provider === 'bedrock') {
          if (ms.includes('claude')) return Math.ceil(t.length / 3.5);
          if (ms.includes('llama')) return Math.ceil(t.length / 4);
          if (ms.includes('titan')) return Math.ceil(t.length / 3.2);
          return Math.ceil(t.length / 3.8);
        }
        if (provider === 'openai' || provider === 'azure') {
          if (ms.includes('gpt-4')) return Math.ceil(t.length / 3.2);
          if (ms.includes('gpt-3.5')) return Math.ceil(t.length / 3.3);
          return Math.ceil(t.length / 4);
        }
        return Math.ceil(t.length / 4);
      };

      // 3) Compute per-model batch size
      const computeBatchSize = (phase: 'scan_a'|'scan_b', cfg: any, modelCfg: any): number => {
        const inLimit = Number.isFinite(modelCfg?.input_token_limit) && modelCfg.input_token_limit > 0 ? modelCfg.input_token_limit : 128000;
        const outLimit = Number.isFinite(modelCfg?.output_token_limit) && modelCfg.output_token_limit > 0 ? modelCfg.output_token_limit : 8192;
        const maxIn = Math.floor(inLimit * safetyMultiplier);
        const maxOut = Math.floor(outLimit * safetyMultiplier);
        const tokensPerComment = Number.isFinite(cfg?.tokens_per_comment) && cfg.tokens_per_comment > 0 ? cfg.tokens_per_comment : 13;
        const promptTokens = estimateTokens(cfg.provider, cfg.model, String(cfg.analysis_prompt || ''));
        const available = Math.max(0, maxIn - promptTokens);
        let count = 0;
        let used = 0;
        for (let i = 0; i < comments.length; i++) {
          const ct = estimateTokens(cfg.provider, cfg.model, String(comments[i].originalText || comments[i].text || ''));
          if (used + ct <= available) { used += ct; count += 1; } else { break; }
        }
        const maxByOutput = Math.floor(maxOut / Math.max(1, tokensPerComment));
        count = Math.max(1, Math.min(count, maxByOutput));
        console.log(`[SCAN][BATCH_CALC] ${phase} provider=${cfg.provider} model=${cfg.model} safety=${safetyMarginPercent}% perBatch=${count}`);
        return count;
      };

      const batchSizeA = computeBatchSize('scan_a', scanA, modelA);
      const batchSizeB = computeBatchSize('scan_b', scanB, modelB);
      const finalBatchSize = Math.max(1, Math.min(batchSizeA, batchSizeB));
      console.log(`[SCAN][BATCH_CALC] finalBatchSize=min(${batchSizeA}, ${batchSizeB})=${finalBatchSize}`);

      // 4) Invoke scan-comments sequentially per batch; server runs A/B in parallel per batch
      const aggregated: any[] = [];

      // Ensure we have a fresh access token for function auth
      let accessToken: string | undefined = undefined;
      try {
        const sessionRes = await supabase.auth.getSession();
        accessToken = sessionRes.data?.session?.access_token;
        if (!accessToken) {
          console.warn('[SCAN][AUTH] No access token found; proceeding without Authorization header');
        }
      } catch (e) {
        console.warn('[SCAN][AUTH] Failed to get session for access token:', e instanceof Error ? e.message : String(e));
      }

      // Helper: invoke scan-comments with retries to handle transient edge failures
      const sleep = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms));
      const invokeScanBatch = async (args: {
        batch: any[];
        batchStart: number;
        batchRunId: string;
        defaultMode: 'redact' | 'rephrase' | 'original';
        isDemoData: boolean;
        accessToken?: string;
      }): Promise<any> => {
        const { batch, batchStart, batchRunId, defaultMode, isDemoData, accessToken } = args;
        const maxAttempts = 3;
        let lastErr: unknown = undefined;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          try {
            const { data: sData, error: sErr } = await supabase.functions.invoke('scan-comments', {
            body: {
                comments: batch,
              defaultMode,
                scanRunId: batchRunId,
              isDemoScan: isDemoData,
                batchStart: batchStart,
              skipAdjudication: true,
                clientManagedBatching: true,
              maxBatchesPerRequest: 1,
              maxRunMs: 140000
              },
              headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined
            });
            if (sErr) {
              throw new Error(sErr.message || 'scan-comments invocation failed');
            }
            return sData;
          } catch (err) {
            lastErr = err;
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`[SCAN][RETRY] scan-comments batchStart=${batchStart} attempt ${attempt}/${maxAttempts} failed: ${msg}`);
            if (attempt < maxAttempts) {
              const backoff = Math.min(4000, 500 * Math.pow(2, attempt - 1)) + Math.floor(Math.random() * 250);
              await sleep(backoff);
              continue;
            }
            throw err;
          }
        }
        throw lastErr instanceof Error ? lastErr : new Error('scan-comments invoke failed');
      };

      // Orchestrated wrapper that performs client-side recursive splitting when diagnostics indicate refusal/partials
      const mergeById = (base: any[], overlay: any[]): any[] => {
        const byId = new Map<string, any>(Array.isArray(base) ? base.map((c: any) => [String(c.id), c]) : []);
        for (const c of (Array.isArray(overlay) ? overlay : [])) byId.set(String(c.id), c);
        return Array.from(byId.values());
      };

      const invokeScanBatchOrchestrated = async (args: {
        batch: any[];
        batchStart: number;
        batchRunId: string;
        defaultMode: 'redact' | 'rephrase' | 'original';
        isDemoData: boolean;
        accessToken?: string;
        maxSplits?: number;
      }): Promise<any> => {
        const { batch, batchStart, batchRunId, defaultMode, isDemoData, accessToken } = args;
        const maxSplits = Math.max(1, Math.min(5, args.maxSplits ?? 3));

        // Run once for the whole batch
        const runOnce = async (restrictIndices?: number[]): Promise<any> => {
          const { data: sData, error: sErr } = await supabase.functions.invoke('scan-comments', {
            body: {
              comments: batch,
              defaultMode,
              scanRunId: batchRunId,
              isDemoScan: isDemoData,
              batchStart: batchStart,
              skipAdjudication: true,
              clientManagedBatching: true,
              maxBatchesPerRequest: 1,
              maxRunMs: 140000,
              restrictIndices
            },
            headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined
          });
          if (sErr) throw new Error(sErr.message || 'scan-comments invocation failed');
          return sData;
        };

        const diagnosticsNeedSplit = (diag: any): boolean => {
          if (!diag) return false;
          const a = diag.scanA || {};
          const b = diag.scanB || {};
          const aFail = Boolean(a.harmfulRefusalDetected) || (typeof a.coverageRatio === 'number' && a.coverageRatio < 1);
          const bFail = Boolean(b.harmfulRefusalDetected) || (typeof b.coverageRatio === 'number' && b.coverageRatio < 1);
          return aFail || bFail;
        };

        const extractSeedIds = (diag: any): number[] => {
          const a = diag?.scanA || {}; const b = diag?.scanB || {};
          const itemIds: number[] = Array.isArray(a.itemIdsUsed) && a.itemIdsUsed.length > 0 ? a.itemIdsUsed : (Array.isArray(b.itemIdsUsed) ? b.itemIdsUsed : []);
          const missingSet = new Set<number>([...Array.isArray(a.missingIndices) ? a.missingIndices : [], ...Array.isArray(b.missingIndices) ? b.missingIndices : []]);
          const missing = itemIds.filter((id) => missingSet.has(id));
          const refusal = Boolean(a.harmfulRefusalDetected) || Boolean(b.harmfulRefusalDetected);
          if (missing.length > 0) return missing;
          if (refusal && itemIds.length > 1) return itemIds;
          return [];
        };

        let initial = await runOnce();
        const diag = initial?.scanDiagnostics;
        if (!diagnosticsNeedSplit(diag)) return initial;
        const seed = extractSeedIds(diag);
        if (seed.length === 0) return initial;

        const splitIds = (arr: number[]): [number[], number[]] => {
          const mid = Math.floor(arr.length / 2);
          return [arr.slice(0, mid), arr.slice(mid)];
        };

        let merged = initial;
        let attempts = 0;
        let queue: number[][] = [seed];
        while (queue.length > 0 && attempts < maxSplits) {
          const ids = queue.shift() as number[];
          attempts++;
          if (ids.length <= 1) {
            const res = await runOnce(ids.length === 1 ? ids : undefined);
            merged = { ...merged, comments: mergeById(merged.comments || [], res.comments || []) };
            continue;
          }
          const [aHalf, bHalf] = splitIds(ids);
          const [resA, resB] = await Promise.all([
            runOnce(aHalf),
            runOnce(bHalf)
          ]);
          merged = { ...merged, comments: mergeById(merged.comments || [], (resA.comments || []).concat(resB.comments || [])) };
        }
        return merged;
      };
      for (let i = 0; i < comments.length; i += finalBatchSize) {
        const batch = comments.slice(i, i + finalBatchSize);
        const batchNo = Math.floor(i / finalBatchSize) + 1;
        const batchRunId = `${scanRunId}-${batchNo}`;
        console.log(`[SCAN][SUBMIT] Batch ${batchNo} sending ${batch.length} comments (runId=${batchRunId})`);
        const sData = await invokeScanBatchOrchestrated({
          batch,
          batchStart: i,
          batchRunId,
          defaultMode,
          isDemoData,
          accessToken,
          maxSplits: 3
        });
        if (Array.isArray(sData?.comments) && sData.comments.length > 0) {
          aggregated.push(...sData.comments);
        }
      }

      let data = { comments: aggregated } as any;
      // Enforce flags from raw scan results (OR across models) to avoid any downstream downgrades
      if (Array.isArray(data.comments)) {
        data.comments = (data.comments as any[]).map((c: any) => {
          const a = c.adjudicationData?.scanAResult || c.scanAResult;
          const b = c.adjudicationData?.scanBResult || c.scanBResult;
          const orIdent = Boolean((a && a.identifiable) || (b && b.identifiable));
          const orConc = Boolean((a && a.concerning) || (b && b.concerning));
          return { ...c, identifiable: orIdent, concerning: orConc };
        });
      }

      console.log(`Scan response:`, { data });
      console.log(`[DEBUG] Data type:`, typeof data);
      console.log(`[DEBUG] Data keys:`, data ? Object.keys(data) : 'null');
      
      // Debug scan results
      if (data?.comments) {
        console.log(`[DEBUG] Scan results - ${(data.comments || []).length} comments:`);
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

      // Handle other errors would go here if needed

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

      // Validate that we have results from both models for every comment
      console.log('[VALIDATION] Checking for complete scan results...');
      const validationResults = validateScanResults(data.comments as any[]);
      
      if (validationResults.hasMissingResults) {
        console.warn('[VALIDATION] Missing scan results detected:', validationResults.missingDetails);
        console.warn(`[VALIDATION] Missing ${validationResults.missingCount} results out of ${validationResults.totalComments} comments`);
        
        // Show warning in debug panel
        setValidationWarning({
          hasMissing: true,
          missingCount: validationResults.missingCount,
          totalComments: validationResults.totalComments,
          missingDetails: validationResults.missingDetails
        });
        
        toast.warning(`Warning: ${validationResults.missingCount} comments missing scan results. Check console for details.`);
      } else {
        console.log('[VALIDATION] All comments have complete scan results from both models');
        setValidationWarning({
          hasMissing: false,
          missingCount: 0,
          totalComments: validationResults.totalComments,
          missingDetails: []
        });
      }

      // Phase 2: Adjudication (client-orchestrated)
      setScanProgress(60);
      console.log('[PHASE2] Client-side adjudication starting...');
      try {
        const needsAdj = (data.comments as any[]).filter((c: any) => {
          const a = c.adjudicationData?.scanAResult || c.scanAResult;
          const b = c.adjudicationData?.scanBResult || c.scanBResult;
          if (!a || !b) return false;
          return Boolean(a.concerning !== b.concerning || a.identifiable !== b.identifiable);
        });
        if (needsAdj.length > 0) {
          // Load adjudicator config and model limits from Dashboard
          const { data: adjCfg, error: adjCfgErr } = await supabase
            .from('ai_configurations')
            .select('*')
            .eq('scanner_type', 'adjudicator')
            .single();
          if (adjCfgErr || !adjCfg) {
            console.warn('[PHASE2][CFG] Failed to load adjudicator config; defaulting to conservative batching');
          }
          const provider: string = (adjCfg?.provider as string) || 'openai';
          const model: string = (adjCfg?.model as string) || 'gpt-4o';
          const analysisPrompt: string = typeof adjCfg?.analysis_prompt === 'string' ? adjCfg.analysis_prompt : '';
          const tokensPerComment: number = Number.isFinite(adjCfg?.tokens_per_comment) && adjCfg.tokens_per_comment > 0 ? adjCfg.tokens_per_comment : 13;
          setDebugPrompts(prev => ({ ...prev, adjudicator: analysisPrompt }));

          const { data: modelCfg } = await supabase
            .from('model_configurations')
            .select('*')
            .eq('provider', provider)
            .eq('model', model)
            .single();
          const inputTokenLimit: number = Number.isFinite(modelCfg?.input_token_limit) && modelCfg.input_token_limit > 0 ? modelCfg.input_token_limit : 128000;
          const outputTokenLimit: number = Number.isFinite(modelCfg?.output_token_limit) && modelCfg.output_token_limit > 0 ? modelCfg.output_token_limit : 8192;
          const tpmLimit: number | null = Number.isFinite(modelCfg?.tpm_limit) && modelCfg.tpm_limit > 0 ? modelCfg.tpm_limit : null;
          const rpmLimit: number | null = Number.isFinite(modelCfg?.rpm_limit) && modelCfg.rpm_limit > 0 ? modelCfg.rpm_limit : null;

          const { data: batchSizingData } = await supabase
            .from('batch_sizing_config')
            .select('*')
            .single();
          const safetyMarginPercent: number = Math.min(90, Math.max(0, Number.isFinite(batchSizingData?.safety_margin_percent) ? batchSizingData.safety_margin_percent : 15));
          const safetyMultiplier = 1 - (safetyMarginPercent / 100);

          // Local token estimator mirroring server logic
          const estimateTokens = (text: string): number => {
            const t = String(text || '');
            const ms = model.toLowerCase();
            if (provider === 'bedrock') {
              if (ms.includes('claude')) return Math.ceil(t.length / 3.5);
              if (ms.includes('llama')) return Math.ceil(t.length / 4);
              if (ms.includes('titan')) return Math.ceil(t.length / 3.2);
              return Math.ceil(t.length / 3.8);
            }
            if (provider === 'openai' || provider === 'azure') {
              if (ms.includes('gpt-4')) return Math.ceil(t.length / 3.2);
              if (ms.includes('gpt-3.5')) return Math.ceil(t.length / 3.3);
              return Math.ceil(t.length / 4);
            }
            return Math.ceil(t.length / 4);
          };

          // Calculate per-batch size based on token limits
          const maxIn = Math.floor(inputTokenLimit * safetyMultiplier);
          const maxOut = Math.floor(outputTokenLimit * safetyMultiplier);
          const maxTpm = tpmLimit ? Math.floor(tpmLimit * safetyMultiplier) : null;
          const promptTokens = estimateTokens(analysisPrompt);
          const availableForComments = Math.max(0, maxIn - promptTokens);
          
          let perBatch = 0;
          let usedInput = 0;
          for (let i = 0; i < needsAdj.length; i++) {
            const ct = estimateTokens(String(needsAdj[i].originalText || needsAdj[i].text || ''));
            if (usedInput + ct <= availableForComments) {
              usedInput += ct;
              perBatch += 1;
            } else {
              break;
            }
          }
          
          // Enforce output token constraint
          if (perBatch > 0) {
            const maxByOutput = Math.floor(maxOut / Math.max(1, tokensPerComment));
            perBatch = Math.max(1, Math.min(perBatch, maxByOutput));
          } else {
            perBatch = 1;
          }
          
          // Enforce TPM constraint (most restrictive)
          if (maxTpm && perBatch > 0) {
            // Calculate total tokens per batch (input + output)
            const estimatedInputTokens = promptTokens + usedInput;
            const estimatedOutputTokens = perBatch * tokensPerComment;
            const totalTokensPerBatch = estimatedInputTokens + estimatedOutputTokens;
            
            if (totalTokensPerBatch > maxTpm) {
              // Calculate tokens per comment (input + output)
              const tokensPerCommentTotal = (usedInput / perBatch) + tokensPerComment;
              const maxByTpm = Math.floor(maxTpm / tokensPerCommentTotal);
              const originalPerBatch = perBatch;
              perBatch = Math.max(1, Math.min(perBatch, maxByTpm));
              console.log(`[ADJ][TPM_CONSTRAINT] Reduced batch size from ${originalPerBatch} to ${perBatch} due to TPM limit (${totalTokensPerBatch} > ${maxTpm})`);
            }
          }
          
          console.log(`[ADJ][BATCH_CALC] provider=${provider} model=${model} safety=${safetyMarginPercent}% promptTokens=${promptTokens} perBatch=${perBatch} tpmLimit=${tpmLimit || 'none'}`);

          // Ensure Authorization header is included for adjudicator invoke
          const { data: sessionData } = await supabase.auth.getSession();
          const accessToken = sessionData?.session?.access_token;
          // Helper: invoke adjudicator with retry/backoff on transient rate limits
          const invokeAdjudicatorWithRetry = async (batch: any[]): Promise<{ data: any | null; error: any | null; isTpmExceeded: boolean }> => {
            const maxAttempts = 3;
            const baseDelayMs = 1200;
            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
              const { data: adjData, error: adjErr } = await supabase.functions.invoke('adjudicator', {
                body: {
                  comments: batch.map((c: any) => ({
                    id: c.id,
                    originalText: c.originalText || c.text,
                    originalRow: c.originalRow,
                    scannedIndex: c.scannedIndex,
                    scanAResult: c.adjudicationData?.scanAResult || c.scanAResult,
                    scanBResult: c.adjudicationData?.scanBResult || c.scanBResult,
                    agreements: c.adjudicationData?.agreements || c.agreements
                  })),
                  scanRunId,
                  clientCalculatedOutputTokens: batch.length * tokensPerComment
                },
                headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined
              });
              if (!adjErr) return { data: adjData, error: null, isTpmExceeded: false };
              const msg = String(adjErr?.message || adjErr);
              const isRateLimited = msg.includes('429') || /Too\s*Many\s*Requests/i.test(msg);
              const isTpmExceeded = msg.includes('TPM limit') || msg.includes('exceed TPM limit');
              const isRetryable = isRateLimited || isTpmExceeded || /ETIMEDOUT|ECONNRESET|ENETUNREACH|5\d{2}/i.test(msg);
              console.warn(`[PHASE2] Adjudicator attempt ${attempt} failed${isRateLimited ? ' (429)' : ''}${isTpmExceeded ? ' (TPM exceeded)' : ''}:`, adjErr);
              if (attempt < maxAttempts && isRetryable) {
                const sleep = baseDelayMs * attempt + Math.floor(Math.random() * 400);
                await new Promise(res => setTimeout(res, sleep));
                continue;
              }
              return { data: null, error: adjErr, isTpmExceeded };
            }
            return { data: null, error: null, isTpmExceeded: false };
          };

          for (let i = 0; i < needsAdj.length; i += perBatch) {
            let batch = needsAdj.slice(i, i + perBatch);
            let result = await invokeAdjudicatorWithRetry(batch);
            
            // If TPM limit exceeded, try with smaller batch
            if (!result.data && result.isTpmExceeded && batch.length > 1) {
              console.warn(`[PHASE2] TPM limit exceeded for batch of ${batch.length}, trying with smaller batch`);
              // Try with half the batch size
              const smallerBatchSize = Math.max(1, Math.floor(batch.length / 2));
              batch = needsAdj.slice(i, i + smallerBatchSize);
              result = await invokeAdjudicatorWithRetry(batch);
            }
            
            if (!result.data) {
              console.error('[PHASE2] Adjudicator failed after retries; continuing without adjudication for this batch');
              continue;
            }
            
            const adjData = result.data;
            if (adjData?.adjudicatedComments && Array.isArray(adjData.adjudicatedComments)) {
              const adjMap = new Map(adjData.adjudicatedComments.map((r: any) => [r.id, r]));
              (data as any).comments = (data.comments as any[]).map((c: any) => {
                const r = adjMap.get(c.id) as any;
                if (r && typeof r === 'object' && r !== null) {
                  // Never downgrade below model agreement: if both scans agree a flag is true,
                  // preserve it even if adjudicator says false.
                  const aRes = c.adjudicationData?.scanAResult || c.scanAResult;
                  const bRes = c.adjudicationData?.scanBResult || c.scanBResult;
                  const bothIdent = Boolean(aRes?.identifiable) && Boolean(bRes?.identifiable);
                  const bothConc = Boolean(aRes?.concerning) && Boolean(bRes?.concerning);
                  const resolvedConcerning = Boolean(r.concerning || bothConc);
                  const resolvedIdentifiable = Boolean(r.identifiable || bothIdent);
                  const debugSuffix = ` ScanA: Concerning ${aRes?.concerning ? "Y" : "N"}, Identifiable ${aRes?.identifiable ? "Y" : "N"}.` +
                                     ` ScanB: Concerning ${bRes?.concerning ? "Y" : "N"}, Identifiable ${bRes?.identifiable ? "Y" : "N"}`;
                  const baseReason = String(r.reasoning || c.aiReasoning || "Resolved by adjudicator");
                  const combinedReason = `${baseReason}.${debugSuffix}`;
                  const adjudicationResult = {
                    concerning: Boolean(r.concerning),
                    identifiable: Boolean(r.identifiable),
                    reasoning: typeof r.reasoning === 'string' ? r.reasoning : undefined,
                    model: typeof r.model === 'string' ? r.model : (typeof r.provider === 'string' && typeof r.model === 'string' ? `${r.provider}/${r.model}` : undefined)
                  } as any;
                  return { 
                    ...c, 
                    concerning: resolvedConcerning,
                    identifiable: resolvedIdentifiable,
                    isAdjudicated: true, 
                    aiReasoning: combinedReason,
                    adjudicationResult,
                    debugInfo: { ...(c.debugInfo || {}), adjudicationResult }
                  };
                }
                return c;
              });
            }
            // Gentle pacing between batches to avoid provider RPM spikes
            if (i + perBatch < needsAdj.length) {
              await new Promise(res => setTimeout(res, 300));
            }
          }
        }
        console.log('[PHASE2] Client-side adjudication completed.');
        try {
          if (Array.isArray((data as any).comments)) {
            onCommentsUpdate((data as any).comments);
            console.log('[PHASE2] Propagated adjudication results to comments state');
          }
        } catch (e) {
          console.warn('[PHASE2] Failed to propagate adjudication results to comments state:', e);
        }
      } catch (adjEx) {
        console.warn('[PHASE2] Client-side adjudication skipped due to error:', adjEx);
      }

      // Phase 3: Post-process flagged comments
      let didPostProcessUpdate = false;
      // Process comments that are identifiable OR concerning-only (per updated logic)
      // Also consider pre-adjudication flags from scanA/scanB to avoid skipping Phase 3 when adjudication logs are delayed
      const commentsToProcess = (data.comments || []).filter((c: any) => {
        const identifiable = Boolean(c.identifiable);
        const concerning = Boolean(c.concerning);
        const preA = Boolean(c.scanAResult?.identifiable || c.scanAResult?.concerning || c.adjudicationData?.scanAResult?.identifiable || c.adjudicationData?.scanAResult?.concerning);
        const preB = Boolean(c.scanBResult?.identifiable || c.scanBResult?.concerning || c.adjudicationData?.scanBResult?.identifiable || c.adjudicationData?.scanBResult?.concerning);
        return identifiable || concerning || preA || preB;
      });
      const phase3Counts = {
        total: (data.comments || []).length,
        identifiable: (data.comments || []).filter((c: any) => c.identifiable).length,
        concerning: (data.comments || []).filter((c: any) => c.concerning).length,
        concerningOnly: (data.comments || []).filter((c: any) => c.concerning && !c.identifiable).length,
        preScanFlagged: (data.comments || []).filter((c: any) => (c.scanAResult?.identifiable || c.scanAResult?.concerning || c.adjudicationData?.scanAResult?.identifiable || c.adjudicationData?.scanAResult?.concerning || c.scanBResult?.identifiable || c.scanBResult?.concerning || c.adjudicationData?.scanBResult?.identifiable || c.adjudicationData?.scanBResult?.concerning)).length,
        toProcess: commentsToProcess.length,
        adjudicationCompleted: Boolean((data as any).adjudicationCompleted)
      };
      console.log('[PHASE3] Readiness:', phase3Counts, 'scanRunId=', scanRunId);
      
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
        // Prepare and record final prompts sent for post-processing
        const baseRedPrompt = String(aiConfigs?.redact_prompt || '');
        const baseRephPrompt = String(aiConfigs?.rephrase_prompt || '');
        const spansInstruction = `For each <<<ITEM k>>> return JSON array objects only with fields index and redact (array of exact substrings). Do not return rewritten text. Example: [{"index": 1, "redact": ["substring 1", "substring 2"]}, ...]`;
        const finalRedPrompt = redactionOutputMode === 'spans'
          ? `${baseRedPrompt}\n\n${spansInstruction}\nReturn only valid JSON with no extra commentary.`
          : baseRedPrompt;
        setDebugPrompts(prev => ({ ...prev, redaction: finalRedPrompt, rephrase: baseRephPrompt }));
        
        // Build routing sets based on which scan flagged the comment
        const getScanResult = (c: any, key: 'scanAResult' | 'scanBResult') => (c.adjudicationData?.[key] || c[key]);
        const wasFlaggedBy = (c: any, key: 'scanAResult' | 'scanBResult') => {
          const r = getScanResult(c, key);
          return Boolean(r && (r.concerning || r.identifiable));
        };
        // Assign each flagged comment to a single model for BOTH redaction and rephrase,
        // based on adjudicated flags and which scanner flagged the relevant condition.
        const commentsForA: any[] = [];
        const commentsForB: any[] = [];
        let identToggle = 0;
        let concToggle = 0;
        const flaggedAll = commentsToProcess.filter((c: any) => Boolean(c.identifiable) || Boolean(c.concerning));
        for (const c of flaggedAll) {
          const aRes = c.adjudicationData?.scanAResult || c.scanAResult;
          const bRes = c.adjudicationData?.scanBResult || c.scanBResult;
          const adjudIdent = Boolean(c.identifiable);
          const adjudConc = Boolean(c.concerning) && !adjudIdent ? true : Boolean(c.concerning);
          if (adjudIdent) {
            const aIdent = Boolean(aRes?.identifiable);
            const bIdent = Boolean(bRes?.identifiable);
            if (aIdent && bIdent) {
              if (identToggle % 2 === 0) commentsForA.push(c); else commentsForB.push(c);
              identToggle++;
            } else if (aIdent) {
              commentsForA.push(c);
            } else if (bIdent) {
              commentsForB.push(c);
            } else {
              const aConc = Boolean(aRes?.concerning);
              const bConc = Boolean(bRes?.concerning);
              if (aConc && !bConc) commentsForA.push(c);
              else if (!aConc && bConc) commentsForB.push(c);
              else { if (identToggle % 2 === 0) commentsForA.push(c); else commentsForB.push(c); identToggle++; }
            }
          } else if (adjudConc) {
            const aConc = Boolean(aRes?.concerning);
            const bConc = Boolean(bRes?.concerning);
            if (aConc && bConc) {
              if (concToggle % 2 === 0) commentsForA.push(c); else commentsForB.push(c);
              concToggle++;
            } else if (aConc) {
              commentsForA.push(c);
            } else if (bConc) {
              commentsForB.push(c);
            } else {
              if (concToggle % 2 === 0) commentsForA.push(c); else commentsForB.push(c);
              concToggle++;
            }
          }
        }
        // Ensure routes are disjoint
        const uniqueById = (arr: any[]) => Array.from(new Map(arr.map((c: any) => [c.id, c])).values());
        const routeA = uniqueById(commentsForA);
        const idsInA = new Set(routeA.map((c: any) => c.id));
        const routeB = uniqueById(commentsForB.filter((c: any) => !idsInA.has(c.id)));

        // Helper: process items in chunks sequentially to ensure each call gets a fresh Edge invocation
        console.log('[HELPER OK]');
        
        // Calculate optimal batch size based on I/O ratios and model limits
        const calculateOptimalBatchSize = async (comments: any[], phase: 'redaction'|'rephrase') => {
          try {
            // Get batch sizing configuration
            const { data: batchSizingData } = await supabase
              .from('batch_sizing_config')
              .select('*')
              .single();
            
            const redactionIoRatio = batchSizingData?.redaction_io_ratio ?? 5.0;
            const rephraseIoRatio = batchSizingData?.rephrase_io_ratio ?? 1.0;
            const safetyMarginPercent = batchSizingData?.safety_margin_percent ?? 10;
            
            // Calculate average comment length
            const avgCommentLength = comments.reduce((sum, c) => sum + (c.originalText || c.text || '').length, 0) / comments.length;
            const estimatedInputTokensPerComment = Math.ceil(avgCommentLength / 5);
            
            // Calculate output tokens based on I/O ratio
            const ioRatio = phase === 'redaction' ? redactionIoRatio : rephraseIoRatio;
            const estimatedOutputTokensPerComment = Math.ceil(estimatedInputTokensPerComment / ioRatio);
            
            // Use conservative model limits
            const inputTokenLimit = 128000;
            const outputTokenLimit = 4096; // Conservative for most models
            const promptTokens = 2000;
            const availableInputTokens = inputTokenLimit - promptTokens;
            
            // Calculate max batch sizes
            const maxBatchByInput = Math.floor(availableInputTokens / estimatedInputTokensPerComment);
            const maxBatchByOutput = Math.floor(outputTokenLimit / estimatedOutputTokensPerComment);
            const maxBatchByTokens = Math.min(maxBatchByInput, maxBatchByOutput);
            
            // Apply safety margin
            const safetyMultiplier = 1 - (safetyMarginPercent / 100);
            const optimalBatchSize = Math.max(1, Math.floor(maxBatchByTokens * safetyMultiplier));
            
            console.log(`[BATCH_CALC] ${phase}: avgCommentLength=${Math.round(avgCommentLength)}, inputTokens=${estimatedInputTokensPerComment}, outputTokens=${estimatedOutputTokensPerComment}, ioRatio=${ioRatio}`);
            console.log(`[BATCH_CALC] ${phase}: maxBatchByInput=${maxBatchByInput}, maxBatchByOutput=${maxBatchByOutput}, optimal=${optimalBatchSize}`);
            
            return optimalBatchSize;
          } catch (error) {
            console.warn('[BATCH_CALC] Failed to calculate optimal batch size, using fallback:', error);
            return 40; // Fallback to original value
          }
        };
        
        const perChunk = await calculateOptimalBatchSize(commentsForA.concat(commentsForB), 'redaction');
        type Proc = { redactedText?: string; rephrasedText?: string; finalText: string; mode: 'redact'|'rephrase'|'original'; id: string; originalRow?: number; scannedIndex?: number };
        const invokeChunk = async (items: any[], phase: 'redaction'|'rephrase', routingMode: 'scan_a'|'scan_b', providerModelKey?: string): Promise<Proc[]> => {
          if (items.length === 0) return [];
          const out: Proc[] = [];
          for (let i = 0; i < items.length; i += perChunk) {
            const batch = items.slice(i, i + perChunk);
            const idsKey = batch.map((c: any) => (c.originalRow ?? c.scannedIndex ?? c.id)).map((v: any) => String(v)).sort().join(',');
            const submitKey = `${providerModelKey || 'auto'}|${phase}|${routingMode}|${idsKey}`;
            // If this is a rephrase call, wait for the model's redaction barrier to open
            if (phase === 'rephrase' && providerModelKey) {
              const gate = modelRedactionGateRef.current.get(providerModelKey);
              if (gate) {
                try { await gate.promise; } catch (_) {}
              }
            }
            // Time-window dedup within the same run (prevents duplicates within the same scan run)
            try {
              const ttlKey = `pp:ttl:${scanRunId}:${submitKey}`;
              const now = Date.now();
              const ttlMs = 2 * 60 * 1000; // 2 minutes
              const prev = window.localStorage.getItem(ttlKey);
              if (prev) {
                const ts = Number(prev);
                if (!Number.isNaN(ts) && now - ts < ttlMs) {
                  console.warn('[PHASE3][DEDUP][TTL] Skipping (recently submitted in this run):', submitKey);
                  continue;
                }
              }
              window.localStorage.setItem(ttlKey, String(now));
            } catch (_) {}
            // Cross-invocation dedup (persists even if component remounts)
            const storageKey = `pp:${scanRunId}:${submitKey}`;
            try {
              const existing = window.localStorage.getItem(storageKey);
              if (existing === 'pending' || existing === 'done') {
                console.warn('[PHASE3][DEDUP][LS] Skipping (seen before):', submitKey);
                continue;
              }
              window.localStorage.setItem(storageKey, 'pending');
            } catch (_) {}
            const inFlightKey = `${scanRunId}:${submitKey}`;
            if (postProcessInFlightRef.current.has(inFlightKey)) {
              console.warn('[PHASE3][INFLIGHT] Skipping (already in flight in this run):', submitKey);
              continue;
            }
            postProcessInFlightRef.current.add(inFlightKey);
            console.log('[PHASE3][SUBMIT] key=', submitKey);
            const { data: ppData, error: ppErr } = await supabase.functions.invoke('post-process-comments', {
            body: {
                comments: batch.map((c: any) => ({
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
                redaction_output_mode: redactionOutputMode,
                span_min_length: 2
              },
              defaultMode,
              scanRunId,
                phase,
                routingMode
              }
            });
            postProcessInFlightRef.current.delete(inFlightKey);
            try { window.localStorage.setItem(storageKey, 'done'); } catch (_) {}
            if (ppErr) {
              console.error('[PHASE3] post-process error:', ppErr);
              continue;
            }
            if (ppData?.processedComments) {
              out.push(...ppData.processedComments as Proc[]);
              // Attach diagnostics to comments for Debug UI
              try {
                const diagById = new Map<string, any>((ppData.processedComments as any[]).map((p: any) => [p.id, p.diagnostics]));
                for (const it of batch) {
                  const d = diagById.get(it.id);
                  if (d) {
                    it.debugInfo = { ...(it.debugInfo || {}), postProcessDiagnostics: d };
                  }
                }
              } catch (_) {}
            }
          }
          return out;
        };

        // Group by provider/model to enforce per-model ordering: all redactions, then all rephrases
        const processedCombined: Record<string, any> = {};
        const mergeInto = (arr: Proc[]) => {
          for (const item of arr) {
            const existing = processedCombined[item.id] || { id: item.id };
            processedCombined[item.id] = {
              ...existing,
              redactedText: item.redactedText !== undefined ? item.redactedText : existing.redactedText,
              rephrasedText: item.rephrasedText !== undefined ? item.rephrasedText : existing.rephrasedText,
              finalText: typeof item.finalText === 'string' ? item.finalText : existing.finalText,
              mode: item.mode || existing.mode,
              originalRow: item.originalRow ?? existing.originalRow,
              scannedIndex: item.scannedIndex ?? existing.scannedIndex
            };
          }
        };

        const parseProviderModel = (modelStr?: string): { provider: string; model: string } => {
          const raw = modelStr || '';
          if (raw.includes('/')) {
            const [prov, ...rest] = raw.split('/');
            const mdl = rest.join('/');
            return { provider: prov || (aiConfigs?.provider || 'openai'), model: mdl || (aiConfigs?.model || 'gpt-4o-mini') };
          }
          const ms = raw.toLowerCase();
          if (ms.startsWith('openai')) return { provider: 'openai', model: raw.replace(/^openai\//, '') || (aiConfigs?.model || 'gpt-4o-mini') };
          if (ms.startsWith('bedrock')) return { provider: 'bedrock', model: raw.replace(/^bedrock\//, '') || 'anthropic.claude-3-haiku-20240307-v1:0' };
          if (ms.startsWith('anthropic.') || ms.startsWith('mistral.') || ms.startsWith('amazon.titan')) {
            return { provider: 'bedrock', model: raw };
          }
          if (ms.startsWith('gpt') || ms.includes('gpt-4')) return { provider: 'openai', model: raw };
          return { provider: aiConfigs?.provider || 'openai', model: raw || (aiConfigs?.model || 'gpt-4o-mini') };
        };

        type ModelGroup = { key: string; provider: string; model: string; aItems: any[]; bItems: any[] };
        const byModel = new Map<string, ModelGroup>();
        const addToGroup = (item: any, route: 'scan_a'|'scan_b') => {
          const modelStr = route === 'scan_a' ? (item.adjudicationData?.scanAResult?.model || item.scanAResult?.model) : (item.adjudicationData?.scanBResult?.model || item.scanBResult?.model);
          const { provider, model } = parseProviderModel(modelStr);
          const key = `${provider}/${model}`;
          if (!byModel.has(key)) byModel.set(key, { key, provider, model, aItems: [], bItems: [] });
          const grp = byModel.get(key)!;
          if (route === 'scan_a') grp.aItems.push(item); else grp.bItems.push(item);
        };
        routeA.forEach(item => addToGroup(item, 'scan_a'));
        routeB.forEach(item => addToGroup(item, 'scan_b'));

        // Initialize per-model redaction barriers
        for (const grp of byModel.values()) {
          const key = `${grp.provider}/${grp.model}`;
          if (!modelRedactionGateRef.current.has(key)) {
            let resolveFn: () => void = () => {};
            const promise = new Promise<void>((resolve) => { resolveFn = resolve; });
            modelRedactionGateRef.current.set(key, { promise, resolve: resolveFn });
          } else {
            // Reset the barrier for this run
            let resolveFn: () => void = () => {};
            const promise = new Promise<void>((resolve) => { resolveFn = resolve; });
            modelRedactionGateRef.current.set(key, { promise, resolve: resolveFn });
          }
        }

        const buildKey = (provider: string, model: string, phase: 'redaction'|'rephrase', items: any[]) => {
          const ids = items.map((c: any) => (c.originalRow ?? c.scannedIndex ?? c.id)).map((v: any) => String(v)).sort().join(',');
          return `${provider}/${model}|${phase}|${ids}`;
        };
        // Phase 1: run redactions for all models in parallel (sequential within each model)
        const redactionTasks: Array<Promise<Proc[]>> = [];
        for (const grp of byModel.values()) {
          const task = (async (): Promise<Proc[]> => {
            const local: Proc[] = [];
            if (grp.aItems.length > 0) {
              const kA = buildKey(grp.provider, grp.model, 'redaction', grp.aItems);
              if (!postProcessDedupRef.current.has(kA)) {
                postProcessDedupRef.current.add(kA);
                local.push(...await invokeChunk(grp.aItems, 'redaction', 'scan_a', `${grp.provider}/${grp.model}`));
              } else {
                console.warn('[PHASE3][DEDUP] Skipping duplicate redaction chunk (scan_a)', kA);
              }
            }
            if (grp.bItems.length > 0) {
              const kB = buildKey(grp.provider, grp.model, 'redaction', grp.bItems);
              if (!postProcessDedupRef.current.has(kB)) {
                postProcessDedupRef.current.add(kB);
                local.push(...await invokeChunk(grp.bItems, 'redaction', 'scan_b', `${grp.provider}/${grp.model}`));
              } else {
                console.warn('[PHASE3][DEDUP] Skipping duplicate redaction chunk (scan_b)', kB);
              }
            }
            // Open the redaction barrier for this model now that all redaction batches completed
            const gateKey = `${grp.provider}/${grp.model}`;
            const gate = modelRedactionGateRef.current.get(gateKey);
            if (gate) {
              try { gate.resolve(); } catch (_) {}
            }
            return local;
          })();
          redactionTasks.push(task);
        }
        const redactionResults = await Promise.all(redactionTasks);
        for (const arr of redactionResults) mergeInto(arr);

        // Phase 2: after all redactions complete, run rephrases for all models in parallel (sequential within each model)
        const rephraseTasks: Array<Promise<Proc[]>> = [];
        for (const grp of byModel.values()) {
          const task = (async (): Promise<Proc[]> => {
            const local: Proc[] = [];
            if (grp.aItems.length > 0) {
              const kRA = buildKey(grp.provider, grp.model, 'rephrase', grp.aItems);
              if (!postProcessDedupRef.current.has(kRA)) {
                postProcessDedupRef.current.add(kRA);
                local.push(...await invokeChunk(grp.aItems, 'rephrase', 'scan_a', `${grp.provider}/${grp.model}`));
              } else {
                console.warn('[PHASE3][DEDUP] Skipping duplicate rephrase chunk (scan_a)', kRA);
              }
            }
            if (grp.bItems.length > 0) {
              const kRB = buildKey(grp.provider, grp.model, 'rephrase', grp.bItems);
              if (!postProcessDedupRef.current.has(kRB)) {
                postProcessDedupRef.current.add(kRB);
                local.push(...await invokeChunk(grp.bItems, 'rephrase', 'scan_b', `${grp.provider}/${grp.model}`));
              } else {
                console.warn('[PHASE3][DEDUP] Skipping duplicate rephrase chunk (scan_b)', kRB);
              }
            }
            return local;
          })();
          rephraseTasks.push(task);
        }
        const rephraseResults = await Promise.all(rephraseTasks);
        for (const arr of rephraseResults) mergeInto(arr);

        let mergedProcessed = Object.values(processedCombined);

        // Build processedBy* indices for fallback lookup
        const processedByOriginalRow: Map<number, any> = new Map();
        const processedByScannedIndex: Map<number, any> = new Map();
        for (const v of mergedProcessed as any[]) {
          if (typeof v.originalRow === 'number') processedByOriginalRow.set(v.originalRow, v);
          if (typeof v.scannedIndex === 'number') processedByScannedIndex.set(v.scannedIndex, v);
        }

        // Combined fallback disabled to prevent duplicate submissions of the same batches
        if (mergedProcessed.length === 0) {
          console.warn('[PHASE3] No processed results from chunked routes; skipping combined fallback to avoid duplicates');
        }

        // Safety: ensure concerning-only comments are present (rephrase-only) and route to the original scanner
        const concerningOnly = commentsToProcess.filter((c: any) => c.concerning && !c.identifiable);
        const missingConcerning = concerningOnly.filter((c: any) => !(processedByOriginalRow.has(c.originalRow) || processedByScannedIndex.has(c.scannedIndex)));
        if (missingConcerning.length > 0) {
          console.log(`[PHASE3] Safety rephrase for concerning-only: ${missingConcerning.length} items`);
          // Split by which scan originally flagged concerning
          const missingAOnly = missingConcerning.filter((c: any) => Boolean((c.adjudicationData?.scanAResult || c.scanAResult)?.concerning) && !Boolean((c.adjudicationData?.scanBResult || c.scanBResult)?.concerning));
          const missingBOnly = missingConcerning.filter((c: any) => Boolean((c.adjudicationData?.scanBResult || c.scanBResult)?.concerning) && !Boolean((c.adjudicationData?.scanAResult || c.scanAResult)?.concerning));
          const missingBoth = missingConcerning.filter((c: any) => Boolean((c.adjudicationData?.scanAResult || c.scanAResult)?.concerning) && Boolean((c.adjudicationData?.scanBResult || c.scanBResult)?.concerning));
          const bothToA: any[] = [];
          const bothToB: any[] = [];
          missingBoth.forEach((c: any, idx: number) => { if (idx % 2 === 0) bothToA.push(c); else bothToB.push(c); });
          const safetyA = [...missingAOnly, ...bothToA];
          const safetyB = [...missingBOnly, ...bothToB];

          const safetyMerged: any[] = [];
          // Group safety items by provider/model and reuse the same dedup keying
          const safetyGroups = new Map<string, { provider: string; model: string; route: 'scan_a'|'scan_b'; items: any[] }>();
          const addSafety = (items: any[], route: 'scan_a'|'scan_b') => {
            for (const it of items) {
              const modelStr = route === 'scan_a' ? (it.adjudicationData?.scanAResult?.model || it.scanAResult?.model) : (it.adjudicationData?.scanBResult?.model || it.scanBResult?.model);
              const pm = parseProviderModel(modelStr);
              const key = `${pm.provider}/${pm.model}|${route}`;
              if (!safetyGroups.has(key)) safetyGroups.set(key, { provider: pm.provider!, model: pm.model!, route, items: [] });
              safetyGroups.get(key)!.items.push(it);
            }
          };
          addSafety(safetyA, 'scan_a');
          addSafety(safetyB, 'scan_b');

          for (const grp of safetyGroups.values()) {
            const k = buildKey(grp.provider, grp.model, 'rephrase', grp.items);
            console.log('[PHASE3][DEDUP][SAFETY] key=', k);
            if (!postProcessDedupRef.current.has(k)) {
              postProcessDedupRef.current.add(k);
              safetyMerged.push(...await invokeChunk(grp.items, 'rephrase', grp.route, `${grp.provider}/${grp.model}`));
            } else {
              console.warn('[PHASE3][DEDUP] Skipping duplicate safety rephrase', k);
            }
          }
          if (safetyMerged.length > 0) mergedProcessed = (mergedProcessed as any[]).concat(safetyMerged);
        }

        if (mergedProcessed.length > 0) {
          console.log(`Post-processing completed: merged ${mergedProcessed.length} items`);
          
          // Create a map of processed comments by ID
          const processedMap = new Map(
            (mergedProcessed as any[]).map((c: any) => [c.id, c])
          );
          
          console.log(`Created processedMap with ${processedMap.size} entries:`, Array.from(processedMap.keys()));
          
          // Merge post-processing results back into the scan data
          const finalComments = (data.comments || []).map((comment: any) => {
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
                
                // Determine the final text based on the backend finalText first, then fallback logic
                let finalText = comment.text; // Default to existing text
                let finalMode = processed.mode || defaultMode; // Use backend mode if available, otherwise use default mode
                
                // Priority:
                // 1) For identifiable items, prefer redactedText if available
                if (comment.identifiable && typeof processed.redactedText === 'string' && processed.redactedText.trim().length > 0) {
                  finalText = processed.redactedText;
                  finalMode = 'redact';
                }
                // 2) For concerning-only items, prefer rephrasedText if available
                else if (comment.concerning && !comment.identifiable && typeof processed.rephrasedText === 'string' && processed.rephrasedText.trim().length > 0) {
                  finalText = processed.rephrasedText;
                  finalMode = 'rephrase';
                }
                // 3) Otherwise, if backend provided a definitive finalText, use it
                else if (typeof processed.finalText === 'string' && processed.finalText.trim().length > 0 && processed.finalText.trim() !== String(comment.text || '').trim()) {
                  finalText = processed.finalText;
                  finalMode = processed.mode || finalMode;
                }
                 const result = {
                   ...comment,
                   text: finalText,
                   redactedText: processed.redactedText,
                   rephrasedText: processed.rephrasedText,
                   mode: finalMode, // Use the determined final mode
                   needsPostProcessing: false, // Mark as processed
                   isPostProcessed: true, // Add flag to prevent re-processing
                   debugInfo: {
                     ...(comment.debugInfo || {}),
                     postProcessDiagnostics: processed.diagnostics || (comment.debugInfo ? comment.debugInfo.postProcessDiagnostics : undefined)
                   }
                 };
                 
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
         console.log('Full post-process responses:', { /* removed vars due chunking */ });
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
      
      
      if (!didPostProcessUpdate) {
        onCommentsUpdate(data.comments || []);
      }
      toast.success(`Scan complete: ${(data.comments || []).length} comments processed`);
      
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
  const errorCount = comments.filter(c => (c.concerning || c.identifiable) && c.text === c.originalText).length;

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
    // At this point, a scan has run and the item is not flagged and has no AI output text
    // Treat as scanned with no changes needed
    return 'AI: No Changes';
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
        // Attach diagnostics into debugInfo for visibility in Debug Mode
        try {
          if (updatedComment?.diagnostics) {
            updatedComment = {
              ...updatedComment,
              debugInfo: {
                ...(comment.debugInfo || {}),
                postProcessDiagnostics: updatedComment.diagnostics
              }
            };
          }
        } catch (_) {}
        
        // Update the comment with the processed text
        const updatedComments = comments.map(c => c.id === commentId ? {
          ...c,
          ...updatedComment,
          mode,
          text: mode === 'rephrase' ? (updatedComment.rephrasedText || c.text) : 
                 mode === 'redact' ? (updatedComment.redactedText || c.text) : c.text,
          approved: false,
          debugInfo: {
            ...(c.debugInfo || {}),
            postProcessDiagnostics: updatedComment.diagnostics || (c.debugInfo ? c.debugInfo.postProcessDiagnostics : undefined)
          }
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

            {/* Redaction Output Mode */}
            <div className="flex items-center gap-2 px-3 py-2 border rounded-md">
              <span className="text-sm font-medium">Redaction Output:</span>
              <div className="flex items-center gap-1">
                <Button
                  variant={redactionOutputMode === 'spans' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setRedactionOutputMode('spans')}
                  className="h-7 text-xs"
                  title="Return JSON spans and apply locally (fewer output tokens)"
                >
                  Spans
                </Button>
                <Button
                  variant={redactionOutputMode === 'full_text' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setRedactionOutputMode('full_text')}
                  className="h-7 text-xs"
                  title="Return full redacted text from the model"
                >
                  Full text
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
            {errorCount > 0 && ` • ${errorCount} errors`}
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
            <div className="flex items-center gap-2 px-3 py-2 border rounded-md">
              <span className="text-sm font-medium">Filter:</span>
              <ToggleGroup type="multiple" value={activeFilters} onValueChange={setActiveFilters} className="gap-1">
                <ToggleGroupItem value="concerning" aria-label="Concerning" size="sm">
                  <AlertTriangle className="w-4 h-4 mr-1" />
                  Concerning
                </ToggleGroupItem>
                <ToggleGroupItem value="identifiable" aria-label="Identifiable" size="sm">
                  <Eye className="w-4 h-4 mr-1" />
                  Identifiable
                </ToggleGroupItem>
                <ToggleGroupItem value="error" aria-label="Error" size="sm">
                  <X className="w-4 h-4 mr-1" />
                  Error
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
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

      {/* Debug: Validation Warning */}
      {debugMode && isAdmin && validationWarning && (
        <div className="mb-6">
          <Card className={`p-4 ${validationWarning.hasMissing ? 'border-orange-300 bg-orange-50 dark:border-orange-700 dark:bg-orange-950/30' : 'border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-950/30'}`}>
            <h4 className={`text-sm font-semibold mb-3 ${validationWarning.hasMissing ? 'text-orange-800 dark:text-orange-200' : 'text-green-800 dark:text-green-200'}`}>
              {validationWarning.hasMissing ? '⚠️ Validation Warning: Missing Scan Results' : '✅ Validation Passed: Complete Scan Results'}
            </h4>
            <div className="space-y-2">
              <p className="text-sm">
                <strong>Total Comments:</strong> {validationWarning.totalComments}
              </p>
              <p className="text-sm">
                <strong>Missing Results:</strong> {validationWarning.missingCount}
              </p>
              {validationWarning.hasMissing && validationWarning.missingDetails.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">Missing Details:</p>
                  <div className="max-h-40 overflow-y-auto">
                    {validationWarning.missingDetails.map((detail, index) => (
                      <div key={index} className="text-xs p-2 bg-white/50 dark:bg-black/20 rounded mb-1">
                        <strong>Comment #{detail.commentIndex}</strong> (ID: {detail.commentId})
                        <br />
                        Missing Scan A: {detail.missingScanA ? 'Yes' : 'No'}
                        <br />
                        Missing Scan B: {detail.missingScanB ? 'Yes' : 'No'}
                        {detail.scanAResult && (
                          <div className="mt-1">
                            <strong>Scan A Result:</strong> {JSON.stringify(detail.scanAResult, null, 2)}
                          </div>
                        )}
                        {detail.scanBResult && (
                          <div className="mt-1">
                            <strong>Scan B Result:</strong> {JSON.stringify(detail.scanBResult, null, 2)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Expandable Full Scan Results */}
              {validationWarning.totalComments > 0 && (
                <div className="mt-4">
                  <details className="group">
                    <summary className="cursor-pointer text-sm font-medium text-green-800 dark:text-green-200 hover:text-green-900 dark:hover:text-green-100">
                      📋 View Full Scan Results
                    </summary>
                    <div className="mt-3">
                      <div className="bg-white/50 dark:bg-black/20 rounded p-3">
                        <h5 className="text-xs font-semibold mb-2 text-green-800 dark:text-green-200">ScanA | ScanB | Adjudicator</h5>
                        <div className="max-h-64 overflow-auto">
                          <pre className="text-xs font-mono whitespace-pre">
                            {comments.map((comment, index) => {
                              const idx = (comment as any).scannedIndex || (index + 1);
                              const a = (comment as any).scanAResult || (comment as any).adjudicationData?.scanAResult;
                              const b = (comment as any).scanBResult || (comment as any).adjudicationData?.scanBResult;
                              const adj = (comment as any).adjudicationResult || (comment as any).debugInfo?.adjudicationResult || (comment as any).adjudicationData?.adjudicationResult;
                              const aC = a ? (a.concerning ? 'Y' : 'N') : '?';
                              const aI = a ? (a.identifiable ? 'Y' : 'N') : '?';
                              const bC = b ? (b.concerning ? 'Y' : 'N') : '?';
                              const bI = b ? (b.identifiable ? 'Y' : 'N') : '?';
                              const jC = adj ? (adj.concerning ? 'Y' : 'N') : '?';
                              const jI = adj ? (adj.identifiable ? 'Y' : 'N') : '?';
                              const left = `i:${String(idx).padStart(4,' ')}  ScanA: C:${aC} I:${aI}`;
                              const middle = `ScanB: C:${bC} I:${bI}`;
                              const right = `Adj: C:${jC} I:${jI}`;
                              const pad = (s: string, len: number) => s.length >= len ? s : (s + ' '.repeat(len - s.length));
                              return `${pad(left, 28)}  ${pad(middle, 18)}  ${right}`;
                            }).join("\n")}
                          </pre>
                        </div>
                      </div>
                    </div>
                  </details>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* Removed Final Prompts debug panel per request */}

      {/* Comments List - Scrollable Container */}
      <div ref={scrollContainerRef} className="h-[70vh] overflow-y-auto border rounded-lg bg-background/50 backdrop-blur-sm">
        <div className="space-y-4 p-4">
        {(filteredComments || []).map((comment, index) => <Card key={comment.id} className={`p-4 sm:p-6 hover:shadow-md transition-all duration-300 animate-fade-in ${comment.approved ? 'bg-green-50 border-green-300 dark:bg-green-950/30 dark:border-green-800/50' : comment.concerning ? 'bg-red-200 border-red-500 dark:bg-red-900/40 dark:border-red-700/60' : comment.identifiable && !comment.concerning ? 'bg-red-50 border-red-200 dark:bg-red-950/10 dark:border-red-800/20' : ''}`}>
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
                           
                           {(comment.needsAdjudication || comment.debugInfo?.needsAdjudication) && (
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
                        {comment.debugInfo?.postProcessDiagnostics && (
                          <div className="mt-2 p-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50">
                            <p className="text-xs text-amber-800 dark:text-amber-200">
                              <strong>Post-process diagnostics</strong>: {String(comment.debugInfo.postProcessDiagnostics.cause || 'unknown')}
                              {comment.debugInfo.postProcessDiagnostics.notes ? ` – ${String(comment.debugInfo.postProcessDiagnostics.notes)}` : ''}
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