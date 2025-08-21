import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './AuthContext';
import { useUserRole } from '@/hooks/useUserRole';
import { toast } from 'sonner';

interface ContentEdit {
  content_key: string;
  original_content: string;
  edited_content: string;
}

interface EditModeContextType {
  isEditMode: boolean;
  toggleEditMode: () => void;
  contentEdits: Record<string, string>;
  pendingEdits: Record<string, string>;
  updateContent: (key: string, originalContent: string, newContent: string) => Promise<void>;
  setPendingEdit: (key: string, content: string) => void;
  getEditedContent: (key: string, defaultContent: string) => string;
  saveChanges: () => Promise<void>;
  discardChanges: () => void;
  hasPendingChanges: boolean;
}

const EditModeContext = createContext<EditModeContextType | undefined>(undefined);

export const EditModeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isEditMode, setIsEditMode] = useState(false);
  const [contentEdits, setContentEdits] = useState<Record<string, string>>({});
  const [pendingEdits, setPendingEdits] = useState<Record<string, string>>({});
  const { user } = useAuth();
  const { isAdmin } = useUserRole();

  useEffect(() => {
    fetchContentEdits();
  }, []);

  const fetchContentEdits = async () => {
    try {
      const { data, error } = await supabase
        .from('content_edits')
        .select('content_key, edited_content');

      if (error) throw error;

      const editsMap = data.reduce((acc, edit) => {
        acc[edit.content_key] = edit.edited_content;
        return acc;
      }, {} as Record<string, string>);

      setContentEdits(editsMap);
    } catch (error) {
      console.error('Error fetching content edits:', error);
    }
  };

  const toggleEditMode = async () => {
    if (!isAdmin()) {
      toast.error('Only admins can enter edit mode');
      return;
    }
    
    if (isEditMode && Object.keys(pendingEdits).length > 0) {
      // Show save/discard dialog - this will be handled by the component
      return;
    }
    
    setIsEditMode(!isEditMode);
    if (!isEditMode) {
      toast.success('Edit mode enabled. Click on text to edit.');
    } else {
      setPendingEdits({});
      toast.success('Edit mode disabled.');
    }
  };

  const setPendingEdit = (key: string, content: string) => {
    setPendingEdits(prev => ({
      ...prev,
      [key]: content
    }));
  };

  const updateContent = async (key: string, originalContent: string, newContent: string) => {
    if (!user || !isAdmin()) {
      toast.error('Unauthorized');
      return;
    }

    try {
      const { error } = await supabase
        .from('content_edits')
        .upsert({
          content_key: key,
          original_content: originalContent,
          edited_content: newContent,
          edited_by: user.id
        }, { onConflict: 'content_key' });

      if (error) throw error;

      setContentEdits(prev => ({
        ...prev,
        [key]: newContent
      }));

      toast.success('Content updated successfully');
    } catch (error) {
      console.error('Error updating content:', error);
      toast.error('Failed to update content');
    }
  };

  const getEditedContent = (key: string, defaultContent: string) => {
    return pendingEdits[key] || contentEdits[key] || defaultContent;
  };

  const saveChanges = async () => {
    if (!user || !isAdmin()) {
      toast.error('Unauthorized');
      return;
    }

    try {
      const updates = Object.entries(pendingEdits).map(([key, newContent]) => ({
        content_key: key,
        original_content: contentEdits[key] || '', // This might need refinement
        edited_content: newContent,
        edited_by: user.id
      }));

      if (updates.length === 0) return;

      for (const update of updates) {
        const { error } = await supabase
          .from('content_edits')
          .upsert(update, { onConflict: 'content_key' });

        if (error) throw error;
      }

      setContentEdits(prev => ({
        ...prev,
        ...pendingEdits
      }));

      setPendingEdits({});
      toast.success('Changes saved successfully');
    } catch (error) {
      console.error('Error saving changes:', error);
      toast.error('Failed to save changes');
    }
  };

  const discardChanges = () => {
    setPendingEdits({});
    toast.success('Changes discarded');
  };

  const hasPendingChanges = Object.keys(pendingEdits).length > 0;

  return (
    <EditModeContext.Provider value={{
      isEditMode,
      toggleEditMode,
      contentEdits,
      pendingEdits,
      updateContent,
      setPendingEdit,
      getEditedContent,
      saveChanges,
      discardChanges,
      hasPendingChanges
    }}>
      {children}
    </EditModeContext.Provider>
  );
};

export const useEditMode = () => {
  const context = useContext(EditModeContext);
  if (context === undefined) {
    throw new Error('useEditMode must be used within an EditModeProvider');
  }
  return context;
};