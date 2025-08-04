import React, { useState, useEffect } from 'react';
import { Search, Download, Edit3, Check, X, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
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
  const [filteredComments, setFilteredComments] = useState<CommentData[]>(comments);

  useEffect(() => {
    const filtered = comments.filter(comment =>
      comment.text.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (comment.author && comment.author.toLowerCase().includes(searchTerm.toLowerCase()))
    );
    setFilteredComments(filtered);
  }, [comments, searchTerm]);

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

  const exportToExcel = () => {
    const exportData = comments.map((comment, index) => ({
      'Row': comment.originalRow || index + 1,
      'Comment': comment.text,
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
          </p>
        </div>
        <Button onClick={exportToExcel} variant="outline" className="gap-2">
          <Download className="w-4 h-4" />
          Export Excel
        </Button>
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
          <Card key={comment.id} className="p-6 hover:shadow-md transition-all duration-300 animate-fade-in">
            <div className="space-y-4">
              {/* Comment Header */}
              <div className="flex items-start justify-between">
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
                {editingId !== comment.id && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => startEditing(comment)}
                    className="gap-2 hover:bg-primary/10"
                  >
                    <Edit3 className="w-3 h-3" />
                    Edit
                  </Button>
                )}
              </div>

              {/* Comment Content */}
              {editingId === comment.id ? (
                <div className="space-y-3">
                  <Textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    className="min-h-[100px] resize-none"
                    placeholder="Edit your comment..."
                  />
                  <div className="flex items-center gap-2">
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
                <div className="prose prose-sm max-w-none">
                  <p className="text-foreground leading-relaxed">
                    {comment.text}
                  </p>
                </div>
              )}
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