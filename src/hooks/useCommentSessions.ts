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
    defaultMode: 'redact' | 'rephrase'
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
          default_mode: defaultMode
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