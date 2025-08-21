import React, { useState, useRef, useEffect } from 'react';
import { useEditMode } from '@/contexts/EditModeContext';
import { RichTextToolbar } from './RichTextToolbar';
import { EditModeControls } from './EditModeControls';
import { cn } from '@/lib/utils';
import { useDraggable } from '@dnd-kit/core';

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
  const { 
    isEditMode, 
    setPendingEdit, 
    getEditedContent, 
    setContentPosition,
    getContentPosition,
    copyContent,
    pasteContent,
    deleteContent,
    addNewContent
  } = useEditMode();
  const [isEditing, setIsEditing] = useState(false);
  const [showToolbar, setShowToolbar] = useState(false);
  const editRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

  const displayContent = getEditedContent(contentKey, children);
  
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useDraggable({
    id: contentKey,
    disabled: !isEditMode || isEditing,
  });

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
  } : undefined;

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

  const handleClick = (e: React.MouseEvent) => {
    // Don't start editing if we're dragging or if clicking on edit controls
    if (isDragging || (e.target as Element).closest('.edit-mode-controls')) {
      return;
    }
    
    if (isEditMode && !isEditing) {
      e.stopPropagation();
      setIsEditing(true);
      setShowToolbar(true);
    }
  };

  const handleBlur = (e: React.FocusEvent) => {
    // Don't blur if clicking on toolbar
    if (toolbarRef.current?.contains(e.relatedTarget as Node)) {
      return;
    }
    
    if (isEditing) {
      const newContent = editRef.current?.innerHTML || '';
      if (newContent !== displayContent && newContent.trim() !== '') {
        setPendingEdit(contentKey, newContent);
      }
      setIsEditing(false);
      setShowToolbar(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      editRef.current?.blur();
    }
    if (e.key === 'Escape') {
      if (editRef.current) {
        editRef.current.innerHTML = displayContent;
      }
      setIsEditing(false);
      setShowToolbar(false);
    }
  };

  const handleFormat = (type: string, value?: string) => {
    if (!editRef.current) return;

    editRef.current.focus();
    
    switch (type) {
      case 'bold':
        document.execCommand('bold');
        break;
      case 'italic':
        document.execCommand('italic');
        break;
      case 'color':
        if (value === 'color-branded-blend') {
          // Apply branded blend gradient
          const selection = window.getSelection();
          if (selection && !selection.isCollapsed) {
            const range = selection.getRangeAt(0);
            const span = document.createElement('span');
            span.className = 'bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent';
            range.surroundContents(span);
          }
        } else if (value === 'color-primary') {
          document.execCommand('foreColor', false, 'hsl(var(--primary))');
        } else if (value === 'color-success') {
          document.execCommand('foreColor', false, 'hsl(var(--success))');
        } else if (value === 'color-muted') {
          document.execCommand('foreColor', false, 'hsl(var(--muted-foreground))');
        } else {
          document.execCommand('removeFormat');
        }
        break;
      case 'size':
        if (value) {
          const selection = window.getSelection();
          if (selection && !selection.isCollapsed) {
            const range = selection.getRangeAt(0);
            const span = document.createElement('span');
            span.className = value;
            range.surroundContents(span);
          }
        }
        break;
    }
  };

  const handleCopy = (key: string) => {
    copyContent(key);
  };

  const handleDelete = (key: string) => {
    // Mark content as deleted by setting it to empty
    setPendingEdit(key, '');
  };

  const handleAddNew = () => {
    const newContent = pasteContent() || 'New content';
    addNewContent(newContent);
  };

  // Don't render if content is marked as deleted
  if (displayContent === '') {
    return null;
  }

  return (
    <div 
      ref={setNodeRef}
      style={style}
      className={cn(
        "relative group",
        isEditMode && !isEditing && "border-dashed border-2 border-transparent hover:border-primary/30 rounded",
        isDragging && "opacity-50"
      )}
    >
      <Component
        className={cn(
          className,
          'transition-all duration-200',
          isEditMode && !isEditing && 'cursor-pointer hover:bg-primary/10 hover:outline hover:outline-2 hover:outline-primary/30 rounded px-1',
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
          <div 
            dangerouslySetInnerHTML={{ __html: displayContent }}
            {...(isEditMode && !isEditing ? { ...attributes, ...listeners } : {})}
          />
        )}
      </Component>
      
      {isEditMode && !isEditing && (
        <EditModeControls
          contentKey={contentKey}
          onCopy={handleCopy}
          onDelete={handleDelete}
          onAddNew={handleAddNew}
          className="edit-mode-controls"
        />
      )}
      
      {showToolbar && isEditing && (
        <div ref={toolbarRef} className="absolute top-full left-0 mt-2 z-50">
          <RichTextToolbar onFormat={handleFormat} />
        </div>
      )}
    </div>
  );
};