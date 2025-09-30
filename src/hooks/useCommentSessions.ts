import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { CommentData } from '@/components/FileUpload';
import type { Json } from '@/integrations/supabase/types';

export interface CommentSession {
  id: string;
  session_name: string;
  comments_data: CommentData[];
  has_scan_run: boolean;
  default_mode: 'redact' | 'rephrase';
  scroll_position?: number;
  created_at: string;
  updated_at: string;
}

interface DatabaseSession {
  id: string;
  session_name: string;
  comments_data: Json;
  has_scan_run: boolean;
  default_mode: string;
  created_at: string;
  updated_at: string;
  user_id: string;
}

export const useCommentSessions = () => {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<CommentSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadSessions = useCallback(async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('comment_sessions')
        .select('*')
        .order('updated_at', { ascending: false });

      if (error) throw error;
      
      // Transform database sessions to our interface
      const transformedSessions: CommentSession[] = (data as DatabaseSession[])?.map(session => ({
        ...session,
        comments_data: Array.isArray(session.comments_data) ? session.comments_data as unknown as CommentData[] : [],
        default_mode: session.default_mode as 'redact' | 'rephrase'
      })) || [];
      
      setSessions(transformedSessions);
    } catch (error) {
      console.error('Error loading sessions:', error);
      toast.error('Failed to load saved sessions');
    } finally {
      setLoading(false);
    }
  }, [user]);

  const saveSession = useCallback(async (
    sessionName: string,
    comments: CommentData[],
    hasScanRun: boolean,
    defaultMode: 'redact' | 'rephrase',
    scrollPosition?: number
  ) => {
    if (!user) {
      toast.error('Please sign in to save your progress');
      return false;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('comment_sessions')
        .upsert({
          user_id: user.id,
          session_name: sessionName,
          comments_data: comments as unknown as Json,
          has_scan_run: hasScanRun,
          default_mode: defaultMode,
          scroll_position: scrollPosition
        });

      if (error) throw error;
      
      toast.success('Session saved successfully');
      await loadSessions(); // Refresh the list
      return true;
    } catch (error) {
      console.error('Error saving session:', error);
      toast.error('Failed to save session');
      return false;
    } finally {
      setSaving(false);
    }
  }, [user, loadSessions]);

  const loadSession = useCallback(async (sessionId: string) => {
    if (!user) return null;

    try {
      const { data, error } = await supabase
        .from('comment_sessions')
        .select('*')
        .eq('id', sessionId)
        .single();

      if (error) throw error;
      
      // Transform database session to our interface
      const transformedSession: CommentSession = {
        ...data,
        comments_data: Array.isArray(data.comments_data) ? data.comments_data as unknown as CommentData[] : [],
        default_mode: data.default_mode as 'redact' | 'rephrase'
      };
      
      toast.success(`Loaded session: ${data.session_name}`);
      return transformedSession;
    } catch (error) {
      console.error('Error loading session:', error);
      toast.error('Failed to load session');
      return null;
    }
  }, [user]);

  const deleteSession = useCallback(async (sessionId: string) => {
    if (!user) return false;

    try {
      const { error } = await supabase
        .from('comment_sessions')
        .delete()
        .eq('id', sessionId);

      if (error) throw error;
      
      toast.success('Session deleted successfully');
      await loadSessions(); // Refresh the list
      return true;
    } catch (error) {
      console.error('Error deleting session:', error);
      toast.error('Failed to delete session');
      return false;
    }
  }, [user, loadSessions]);

  const deleteAllSessions = useCallback(async () => {
    if (!user) return false;

    try {
      const { error } = await supabase
        .from('comment_sessions')
        .delete()
        .eq('user_id', user.id);

      if (error) throw error;
      
      toast.success('All sessions deleted successfully');
      setSessions([]);
      return true;
    } catch (error) {
      console.error('Error deleting all sessions:', error);
      toast.error('Failed to delete all sessions');
      return false;
    }
  }, [user]);

  return {
    sessions,
    loading,
    saving,
    loadSessions,
    saveSession,
    loadSession,
    deleteSession,
    deleteAllSessions
  };
};

// Client-side scan orchestrator (recursive splitting on client)
export type ScanDiagnostics = {
  mode: "client_managed";
  batch: { start: number; size: number };
  scanA: {
    provider: string; model: string;
    harmfulRefusalDetected: boolean;
    partialCoverage: boolean;
    coverageRatio: number;
    missingIndices: number[];
    responseFormat: string;
    itemIdsUsed: number[];
    output_token_limit?: number;
    tpm_limit?: number; rpm_limit?: number;
    tokensPerComment: number;
  };
  scanB: {
    provider: string; model: string;
    harmfulRefusalDetected: boolean;
    partialCoverage: boolean;
    coverageRatio: number;
    missingIndices: number[];
    responseFormat: string;
    itemIdsUsed: number[];
    output_token_limit?: number;
    tpm_limit?: number; rpm_limit?: number;
    tokensPerComment: number;
  };
} | null;

export interface ScanOrchestratorOptions {
  maxSplits?: number;
}

export async function orchestrateScanClientSide(
  fetchScan: (payload: any) => Promise<any>,
  basePayload: any,
  options?: ScanOrchestratorOptions
): Promise<any> {
  const maxSplits = typeof options?.maxSplits === "number" ? Math.max(1, options!.maxSplits) : 3;

  // Ensure client-managed flag set
  const initial = await fetchScan({ ...basePayload, clientManagedBatching: true });
  const diagnostics: ScanDiagnostics = initial?.scanDiagnostics || null;
  if (!diagnostics) return initial;

  const needsSplit = (d: ScanDiagnostics) => {
    const a = d.scanA; const b = d.scanB;
    const aFail = a.harmfulRefusalDetected || a.coverageRatio < 1;
    const bFail = b.harmfulRefusalDetected || b.coverageRatio < 1;
    return aFail || bFail;
  };

  if (!needsSplit(diagnostics)) return initial;

  // Determine missing indices (union across scans)
  const missingSet = new Set<number>([...diagnostics.scanA.missingIndices, ...diagnostics.scanB.missingIndices]);
  const itemIds = diagnostics.scanA.itemIdsUsed || diagnostics.scanB.itemIdsUsed || [];
  const missingIds = itemIds.filter(id => missingSet.has(id));

  // Helper to split array roughly in half
  const splitIds = (arr: number[]): [number[], number[]] => {
    const mid = Math.floor(arr.length / 2);
    return [arr.slice(0, mid), arr.slice(mid)];
  };

  const mergeComments = (orig: any[], overlay: any[]) => {
    const byId = new Map<string, any>(orig.map((c) => [String(c.id), c]));
    for (const c of overlay) byId.set(String(c.id), c);
    return Array.from(byId.values());
  };

  let merged = initial;
  let attempts = 0;
  let queue: number[][] = [missingIds];
  while (queue.length > 0 && attempts < maxSplits) {
    const ids = queue.shift() as number[];
    attempts++;
    if (ids.length <= 0) continue;
    if (ids.length === 1) {
      // single re-try by index
      const res = await fetchScan({ ...basePayload, clientManagedBatching: true, restrictIndices: ids });
      merged = { ...merged, comments: mergeComments(merged.comments || [], res.comments || []) };
      continue;
    }
    const [a, b] = splitIds(ids);
    const [resA, resB] = await Promise.all([
      fetchScan({ ...basePayload, clientManagedBatching: true, restrictIndices: a }),
      fetchScan({ ...basePayload, clientManagedBatching: true, restrictIndices: b })
    ]);
    merged = { ...merged, comments: mergeComments(merged.comments || [], (resA.comments || []).concat(resB.comments || [])) };
  }

  return merged;
}