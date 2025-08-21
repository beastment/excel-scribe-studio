import React from 'react';
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent } from '@dnd-kit/core';
import { useEditMode } from '@/contexts/EditModeContext';
import { toast } from 'sonner';

interface EditModeWrapperProps {
  children: React.ReactNode;
}

export const EditModeWrapper: React.FC<EditModeWrapperProps> = ({ children }) => {
  const { isEditMode, setContentPosition } = useEditMode();
  const [activeId, setActiveId] = React.useState<string | null>(null);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, delta } = event;
    
    if (delta.x !== 0 || delta.y !== 0) {
      setContentPosition(active.id as string, {
        x: delta.x,
        y: delta.y
      });
      toast.success('Item moved');
    }
    
    setActiveId(null);
  };

  if (!isEditMode) {
    return <>{children}</>;
  }

  return (
    <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      {children}
      <DragOverlay>
        {activeId ? <div className="opacity-50">Dragging...</div> : null}
      </DragOverlay>
    </DndContext>
  );
};