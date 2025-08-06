import React, { useState, useEffect } from 'react';
import { Search, Download, Edit3, Check, X, User, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { CommentData } from './FileUpload';
import * as XLSX from 'xlsx';

interface CommentEditorProps {
  comments: CommentData[];
  onCommentsUpdate: (comments: CommentData[]) => void;
}

export const CommentEditor: React.FC<CommentEditorProps> = ({ 
  comments, 
  onCommentsUpdate 
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [showCheckedOnly, setShowCheckedOnly] = useState(false);
  const [filteredComments, setFilteredComments] = useState<CommentData[]>(comments);

  useEffect(() => {
    let filtered = comments.filter(comment => {
      const matchesSearch = comment.text.toLowerCase().includes(searchTerm.toLowerCase()) ||
        comment.originalText.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (comment.author && comment.author.toLowerCase().includes(searchTerm.toLowerCase()));
      
      const matchesFilter = showCheckedOnly ? comment.checked : true;
      
      return matchesSearch && matchesFilter;
    });
    setFilteredComments(filtered);
  }, [comments, searchTerm, showCheckedOnly]);

  const startEditing = (comment: CommentData) => {
    setEditingId(comment.id);
    setEditText(comment.text);
  };

  const saveEdit = (commentId: string) => {
    const updatedComments = comments.map(comment =>
      comment.id === commentId ? { ...comment, text: editText } : comment
    );
    onCommentsUpdate(updatedComments);
    setEditingId(null);
    setEditText('');
    toast.success('Comment updated successfully');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditText('');
  };

  const toggleCommentCheck = (commentId: string) => {
    const updatedComments = comments.map(comment =>
      comment.id === commentId ? { ...comment, checked: !comment.checked } : comment
    );
    onCommentsUpdate(updatedComments);
  };

  const exportToExcel = () => {
    const exportData = comments.map((comment, index) => ({
      'Row': comment.originalRow || index + 1,
      'Original Comment': comment.originalText,
      'Final Comment': comment.text,
      'Author': comment.author || '',
      'Last Modified': comment.timestamp || ''
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Comments');
    
    XLSX.writeFile(workbook, 'edited_comments.xlsx');
    toast.success('Comments exported successfully');
  };

  if (comments.length === 0) {
    return (
      <Card className="p-8 text-center">
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
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Comment Editor</h2>
          <p className="text-muted-foreground">
            {filteredComments.length} of {comments.length} comments
            {showCheckedOnly && ` (${comments.filter(c => c.checked).length} checked)`}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Button 
            onClick={() => setShowCheckedOnly(!showCheckedOnly)} 
            variant={showCheckedOnly ? "default" : "outline"} 
            className="gap-2"
          >
            <Filter className="w-4 h-4" />
            {showCheckedOnly ? 'Show All' : 'Show Checked Only'}
          </Button>
          <Button onClick={exportToExcel} variant="outline" className="gap-2">
            <Download className="w-4 h-4" />
            Export Excel
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
        <Input
          placeholder="Search comments or authors..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Comments List */}
      <div className="space-y-4">
        {filteredComments.map((comment, index) => (
          <Card 
            key={comment.id} 
            className={`p-4 sm:p-6 hover:shadow-md transition-all duration-300 animate-fade-in ${
              comment.checked ? 'bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800/30' : ''
            }`}
          >
            <div className="space-y-4">
              {/* Comment Header */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Badge variant="secondary" className="text-xs">
                    Row {comment.originalRow || index + 1}
                  </Badge>
                  {comment.author && (
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <User className="w-3 h-3" />
                      {comment.author}
                    </div>
                  )}
                </div>
              </div>

              {/* Two Column Layout */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 lg:gap-6">
                {/* Original Comment Column */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={comment.checked || false}
                      onCheckedChange={() => toggleCommentCheck(comment.id)}
                      className="mt-0.5"
                    />
                    <h4 className="text-sm font-medium text-muted-foreground">Original</h4>
                    <Badge variant="outline" className="text-xs">Read-only</Badge>
                  </div>
                  <div className="p-3 sm:p-4 rounded-lg bg-muted/30 border">
                    <p className="text-foreground leading-relaxed text-sm sm:text-base">
                      {comment.originalText}
                    </p>
                  </div>
                </div>

                {/* Editable Comment Column */}
                <div className="space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-medium text-muted-foreground">Final Version</h4>
                      <Badge variant="secondary" className="text-xs">Editable</Badge>
                    </div>
                    {editingId !== comment.id && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => startEditing(comment)}
                        className="gap-2 hover:bg-primary/10 self-start sm:self-center"
                      >
                        <Edit3 className="w-3 h-3" />
                        Edit
                      </Button>
                    )}
                  </div>
                  
                  {editingId === comment.id ? (
                    <div className="space-y-3">
                      <Textarea
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        className="min-h-[120px] resize-none text-sm sm:text-base"
                        placeholder="Edit your comment..."
                      />
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                        <Button
                          size="sm"
                          onClick={() => saveEdit(comment.id)}
                          className="gap-2"
                        >
                          <Check className="w-3 h-3" />
                          Save
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={cancelEdit}
                          className="gap-2"
                        >
                          <X className="w-3 h-3" />
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 sm:p-4 rounded-lg border border-dashed border-border hover:border-primary/50 transition-colors">
                      <p className="text-foreground leading-relaxed text-sm sm:text-base">
                        {comment.text}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {filteredComments.length === 0 && searchTerm && (
        <Card className="p-8 text-center">
          <div className="flex flex-col items-center gap-4">
            <div className="p-4 rounded-full bg-muted">
              <Search className="w-8 h-8 text-muted-foreground" />
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-2">No Results Found</h3>
              <p className="text-muted-foreground">
                Try adjusting your search terms
              </p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};