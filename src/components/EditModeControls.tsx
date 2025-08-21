import React from 'react';
import { Copy, Trash2, Move, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface EditModeControlsProps {
  contentKey: string;
  onCopy: (key: string) => void;
  onDelete: (key: string) => void;
  onAddNew: () => void;
  className?: string;
}

export const EditModeControls: React.FC<EditModeControlsProps> = ({
  contentKey,
  onCopy,
  onDelete,
  onAddNew,
  className
}) => {
  return (
    <div className={cn(
      "absolute -top-8 -right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-50",
      className
    )}>
      <div className="flex gap-1 bg-background border rounded-md p-1 shadow-lg">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onCopy(contentKey)}
          className="h-6 w-6 p-0"
          title="Copy"
        >
          <Copy className="h-3 w-3" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onDelete(contentKey)}
          className="h-6 w-6 p-0 text-destructive hover:text-destructive"
          title="Delete"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onAddNew}
          className="h-6 w-6 p-0"
          title="Add New"
        >
          <Plus className="h-3 w-3" />
        </Button>
        <div className="h-6 w-6 p-0 flex items-center justify-center cursor-move drag-handle" title="Drag to move">
          <Move className="h-3 w-3 text-muted-foreground" />
        </div>
      </div>
    </div>
  );
};