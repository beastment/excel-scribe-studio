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
  updateContent: (key: string, originalContent: string, newContent: string) => Promise<void>;
  getEditedContent: (key: string, defaultContent: string) => string;
}

const EditModeContext = createContext<EditModeContextType | undefined>(undefined);

export const EditModeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isEditMode, setIsEditMode] = useState(false);
  const [contentEdits, setContentEdits] = useState<Record<string, string>>({});
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

  const toggleEditMode = () => {
    if (!isAdmin()) {
      toast.error('Only admins can enter edit mode');
      return;
    }
    setIsEditMode(!isEditMode);
    if (!isEditMode) {
      toast.success('Edit mode enabled. Click on text to edit.');
    } else {
      toast.success('Edit mode disabled.');
    }
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
        });

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
    return contentEdits[key] || defaultContent;
  };

  return (
    <EditModeContext.Provider value={{
      isEditMode,
      toggleEditMode,
      contentEdits,
      updateContent,
      getEditedContent
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