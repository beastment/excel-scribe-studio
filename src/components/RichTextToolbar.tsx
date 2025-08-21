import React from 'react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Bold, Italic, Type, Palette } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RichTextToolbarProps {
  onFormat: (type: string, value?: string) => void;
  className?: string;
}

export const RichTextToolbar: React.FC<RichTextToolbarProps> = ({ onFormat, className }) => {
  const colorOptions = [
    { name: 'Default', value: '', class: 'text-foreground' },
    { name: 'Primary', value: 'color-primary', class: 'text-primary' },
    { name: 'Branded Blend', value: 'color-branded-blend', class: 'bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent' },
    { name: 'Success', value: 'color-success', class: 'text-success' },
    { name: 'Muted', value: 'color-muted', class: 'text-muted-foreground' },
  ];

  const sizeOptions = [
    { name: 'Small', value: 'text-sm' },
    { name: 'Normal', value: '' },
    { name: 'Large', value: 'text-lg' },
    { name: 'XL', value: 'text-xl' },
    { name: '2XL', value: 'text-2xl' },
    { name: '3XL', value: 'text-3xl' },
  ];

  return (
    <div className={cn(
      'flex items-center gap-2 p-2 bg-card border border-border rounded-lg shadow-lg',
      className
    )}>
      {/* Text Formatting */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onFormat('bold')}
        className="h-8 w-8 p-0"
      >
        <Bold className="h-4 w-4" />
      </Button>
      
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onFormat('italic')}
        className="h-8 w-8 p-0"
      >
        <Italic className="h-4 w-4" />
      </Button>

      <Separator orientation="vertical" className="h-6" />

      {/* Color Options */}
      <div className="flex items-center gap-1">
        <Palette className="h-4 w-4 text-muted-foreground" />
        <select 
          onChange={(e) => onFormat('color', e.target.value)}
          className="text-sm border-0 bg-transparent focus:outline-none"
          defaultValue=""
        >
          {colorOptions.map((color) => (
            <option key={color.value} value={color.value}>
              {color.name}
            </option>
          ))}
        </select>
      </div>

      <Separator orientation="vertical" className="h-6" />

      {/* Size Options */}
      <div className="flex items-center gap-1">
        <Type className="h-4 w-4 text-muted-foreground" />
        <select 
          onChange={(e) => onFormat('size', e.target.value)}
          className="text-sm border-0 bg-transparent focus:outline-none"
          defaultValue=""
        >
          {sizeOptions.map((size) => (
            <option key={size.value} value={size.value}>
              {size.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};