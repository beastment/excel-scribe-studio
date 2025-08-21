import React, { useState, useRef, useEffect } from 'react';
import { useEditMode } from '@/contexts/EditModeContext';
import { cn } from '@/lib/utils';

interface EditableTextProps {
  contentKey: string;
  children: string;
  className?: string;
  as?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'p' | 'span' | 'div';
}

export const EditableText: React.FC<EditableTextProps> = ({ 
  contentKey, 
  children, 
  className,
  as: Component = 'span'
}) => {
  const { isEditMode, updateContent, getEditedContent } = useEditMode();
  const [isEditing, setIsEditing] = useState(false);
  const [tempContent, setTempContent] = useState('');
  const editRef = useRef<HTMLDivElement>(null);

  const displayContent = getEditedContent(contentKey, children);

  useEffect(() => {
    if (isEditing && editRef.current) {
      editRef.current.focus();
      // Place cursor at end
      const range = document.createRange();
      const selection = window.getSelection();
      range.selectNodeContents(editRef.current);
      range.collapse(false);
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
  }, [isEditing]);

  const handleClick = () => {
    if (isEditMode) {
      setIsEditing(true);
      setTempContent(displayContent);
    }
  };

  const handleBlur = () => {
    if (isEditing) {
      const newContent = editRef.current?.textContent || '';
      if (newContent !== displayContent && newContent.trim() !== '') {
        updateContent(contentKey, children, newContent);
      }
      setIsEditing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      editRef.current?.blur();
    }
    if (e.key === 'Escape') {
      if (editRef.current) {
        editRef.current.textContent = displayContent;
      }
      setIsEditing(false);
    }
  };

  if (isEditMode) {
    return (
      <Component
        className={cn(
          className,
          'transition-all duration-200',
          isEditMode && 'cursor-pointer hover:bg-primary/10 hover:outline hover:outline-2 hover:outline-primary/30 rounded px-1',
          isEditing && 'bg-primary/10 outline outline-2 outline-primary/50 rounded px-1'
        )}
        onClick={handleClick}
      >
        {isEditing ? (
          <div
            ref={editRef}
            contentEditable
            suppressContentEditableWarning
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            className="outline-none"
            dangerouslySetInnerHTML={{ __html: displayContent }}
          />
        ) : (
          displayContent
        )}
      </Component>
    );
  }

  return (
    <Component className={className}>
      {displayContent}
    </Component>
  );
};