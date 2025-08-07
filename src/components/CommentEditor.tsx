import React, { useState, useEffect } from 'react';
import { Search, Download, Edit3, Check, X, User, Filter, Scan, AlertTriangle, Eye, EyeOff, ToggleLeft, ToggleRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { CommentData } from './FileUpload';
import { supabase } from '@/integrations/supabase/client';
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
  const [showConcerningOnly, setShowConcerningOnly] = useState(false);
  const [showIdentifiableOnly, setShowIdentifiableOnly] = useState(false);
  const [filteredComments, setFilteredComments] = useState<CommentData[]>(comments);
  const [isScanning, setIsScanning] = useState(false);
  const [defaultMode, setDefaultMode] = useState<'redact' | 'rephrase'>('redact');

  useEffect(() => {
    let filtered = comments.filter(comment => {
      const matchesSearch = comment.text.toLowerCase().includes(searchTerm.toLowerCase()) ||
        comment.originalText.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (comment.author && comment.author.toLowerCase().includes(searchTerm.toLowerCase()));
      
      const matchesConcerning = showConcerningOnly ? comment.concerning : true;
      const matchesIdentifiable = showIdentifiableOnly ? comment.identifiable : true;
      
      return matchesSearch && matchesConcerning && matchesIdentifiable;
    });
    setFilteredComments(filtered);
  }, [comments, searchTerm, showConcerningOnly, showIdentifiableOnly]);

  const startEditing = (comment: CommentData) => {
    setEditingId(comment.id);
    setEditText(comment.text);
  };

  const saveEdit = (commentId: string) => {
    const updatedComments = comments.map(comment =>
      comment.id === commentId ? { ...comment, text: editText, approved: true } : comment
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

  const toggleCommentCheck = (commentId: string, field: 'checked' | 'concerning' | 'identifiable' | 'approved') => {
    const updatedComments = comments.map(comment =>
      comment.id === commentId ? { ...comment, [field]: !comment[field] } : comment
    );
    onCommentsUpdate(updatedComments);
  };

  const toggleCommentMode = async (commentId: string, mode: 'redact' | 'rephrase') => {
    const comment = comments.find(c => c.id === commentId);
    if (!comment) return;

    // Update the mode immediately for UI feedback
    const updatedComments = comments.map(c =>
      c.id === commentId ? { ...c, mode } : c
    );
    onCommentsUpdate(updatedComments);

    // Only reprocess if the comment is concerning or identifiable
    if (comment.concerning || comment.identifiable) {
      await reprocessComment(commentId, mode);
    }
  };

  const scanComments = async () => {
    if (comments.length === 0) {
      toast.error('No comments to scan');
      return;
    }

    setIsScanning(true);
    toast.info(`Scanning ${comments.length} comments with AI...`);

    try {
      const { data, error } = await supabase.functions.invoke('scan-comments', {
        body: { comments, defaultMode }
      });

      if (error) {
        throw new Error(error.message);
      }

      if (data?.comments) {
        onCommentsUpdate(data.comments);
        const summary = data.summary;
        toast.success(
          `Scan complete! Found ${summary.concerning} concerning and ${summary.identifiable} identifiable comments`
        );
      } else {
        throw new Error('Invalid response from scan function');
      }
    } catch (error) {
      console.error('Scan error:', error);
      toast.error('Failed to scan comments. Please try again.');
    } finally {
      setIsScanning(false);
    }
  };

  const exportToExcel = () => {
    const exportData = comments.map((comment, index) => ({
      'Row': comment.originalRow || index + 1,
      'Original Comment': comment.originalText,
      'Final Comment': comment.text,
      'Author': comment.author || '',
      'Concerning': comment.concerning ? 'Yes' : 'No',
      'Identifiable': comment.identifiable ? 'Yes' : 'No',
      'AI Reasoning': comment.aiReasoning || '',
      'Redacted': comment.redactedText || '',
      'Rephrased': comment.rephrasedText || '',
      'Approved': comment.approved ? 'Yes' : 'No',
      'Last Modified': comment.timestamp || ''
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Comments');
    
    XLSX.writeFile(workbook, 'scanned_comments.xlsx');
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

  const concerningCount = comments.filter(c => c.concerning).length;
  const identifiableCount = comments.filter(c => c.identifiable).length;

  const reprocessComment = async (commentId: string, mode: 'redact' | 'rephrase') => {
    const comment = comments.find(c => c.id === commentId);
    if (!comment) return;

    try {
      const { data, error } = await supabase.functions.invoke('scan-comments', {
        body: { 
          comments: [{ ...comment, mode }], 
          defaultMode: mode
        }
      });

      if (error) throw new Error(error.message);

      if (data?.comments && data.comments.length > 0) {
        const updatedComment = data.comments[0];
        const updatedComments = comments.map(c =>
          c.id === commentId ? { ...c, ...updatedComment, mode } : c
        );
        onCommentsUpdate(updatedComments);
        toast.success(`Comment ${mode === 'redact' ? 'redacted' : 'rephrased'} successfully`);
      }
    } catch (error) {
      console.error('Reprocess error:', error);
      toast.error(`Failed to ${mode} comment. Please try again.`);
    }
  };

  return (
    <div className="w-full max-w-none">
      {/* Header */}
      <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between mb-6">
        <div className="flex flex-wrap gap-2">
          <Button 
            onClick={scanComments}
            disabled={isScanning}
            className="gap-2"
          >
            <Scan className="w-4 h-4" />
            {isScanning ? 'Scanning...' : 'Scan Comments'}
          </Button>
          
          {/* Default Mode Toggle */}
          <div className="flex items-center gap-2 px-3 py-2 border rounded-md">
            <span className="text-sm font-medium">Default Mode:</span>
            <div className="flex items-center gap-1">
              <Button
                variant={defaultMode === 'redact' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setDefaultMode('redact')}
                className="h-7 text-xs"
              >
                Redact
              </Button>
              <Button
                variant={defaultMode === 'rephrase' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setDefaultMode('rephrase')}
                className="h-7 text-xs"
              >
                Rephrase
              </Button>
            </div>
          </div>
        </div>
        
        <div>
          <h2 className="text-2xl font-bold">Comment Editor</h2>
          <p className="text-muted-foreground">
            {filteredComments.length} of {comments.length} comments
            {concerningCount > 0 && ` • ${concerningCount} concerning`}
            {identifiableCount > 0 && ` • ${identifiableCount} identifiable`}
          </p>
        </div>
        
        <div className="flex flex-wrap gap-2">
          <Button 
            onClick={() => setShowConcerningOnly(!showConcerningOnly)} 
            variant={showConcerningOnly ? "default" : "outline"} 
            className="gap-2"
          >
            <AlertTriangle className="w-4 h-4" />
            {showConcerningOnly ? 'Show All' : 'Show Concerning Only'}
          </Button>
          <Button 
            onClick={() => setShowIdentifiableOnly(!showIdentifiableOnly)} 
            variant={showIdentifiableOnly ? "default" : "outline"} 
            className="gap-2"
          >
            {showIdentifiableOnly ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            {showIdentifiableOnly ? 'Show All' : 'Show Identifiable Only'}
          </Button>
          <Button onClick={exportToExcel} variant="outline" className="gap-2">
            <Download className="w-4 h-4" />
            Export Excel
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-6">
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
              comment.approved ? 'bg-green-50 border-green-300 dark:bg-green-950/30 dark:border-green-800/50' :
              comment.concerning ? 'bg-red-100 border-red-300 dark:bg-red-950/30 dark:border-red-800/50' : 
              comment.identifiable && !comment.concerning ? 'bg-red-50 border-red-200 dark:bg-red-950/10 dark:border-red-800/20' : ''
            }`}
          >
            <div className="space-y-4">
              {/* Comment Header */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="flex items-center gap-3 flex-wrap">
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

              {/* Three Column Layout */}
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 lg:gap-6">
                {/* Original Comment Column */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-medium text-muted-foreground">Original Comment</h4>
                  </div>
                  <div className="p-3 sm:p-4 rounded-lg bg-muted/30 border">
                    <p className="text-foreground leading-relaxed text-sm sm:text-base">
                      {comment.originalText}
                    </p>
                  </div>
                  <div className="space-y-3 mt-4">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id={`concerning-${comment.id}`}
                        checked={comment.concerning || false}
                        onCheckedChange={() => toggleCommentCheck(comment.id, 'concerning')}
                      />
                      <label 
                        htmlFor={`concerning-${comment.id}`}
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                      >
                        Concerning
                      </label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id={`identifiable-${comment.id}`}
                        checked={comment.identifiable || false}
                        onCheckedChange={() => toggleCommentCheck(comment.id, 'identifiable')}
                      />
                      <label 
                        htmlFor={`identifiable-${comment.id}`}
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                      >
                        Identifiable
                      </label>
                    </div>
                    {comment.aiReasoning && (
                      <div className="p-2 rounded-lg bg-muted/50 border">
                        <p className="text-xs text-muted-foreground">
                          <strong>AI:</strong> {comment.aiReasoning}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* AI Processed Column */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-medium text-muted-foreground">
                      {(comment.concerning || comment.identifiable) ? 'AI Processed' : 'No Changes Needed'}
                    </h4>
                    {(comment.concerning || comment.identifiable) && (
                      <div className="flex items-center gap-1">
                        <Button
                          variant={comment.mode === 'redact' ? 'default' : 'ghost'}
                          size="sm"
                          onClick={() => toggleCommentMode(comment.id, 'redact')}
                          className="h-6 text-xs px-2"
                        >
                          Redact
                        </Button>
                        <Button
                          variant={comment.mode === 'rephrase' ? 'default' : 'ghost'}
                          size="sm"
                          onClick={() => toggleCommentMode(comment.id, 'rephrase')}
                          className="h-6 text-xs px-2"
                        >
                          Rephrase
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="p-3 sm:p-4 rounded-lg bg-muted/30 border">
                    <p className="text-foreground leading-relaxed text-sm sm:text-base">
                      {(comment.concerning || comment.identifiable) ? 
                        (comment.mode === 'rephrase' ? comment.rephrasedText : comment.redactedText) || comment.originalText :
                        'No processing needed'
                      }
                    </p>
                  </div>
                </div>

                {/* Final Editable Column */}
                <div className="space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-medium text-muted-foreground">Final Version</h4>
                      <Badge variant="secondary" className="text-xs">Editable</Badge>
                      {(comment.concerning || comment.identifiable) && (
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id={`approved-${comment.id}`}
                            checked={comment.approved || false}
                            onCheckedChange={() => toggleCommentCheck(comment.id, 'approved')}
                          />
                          <label 
                            htmlFor={`approved-${comment.id}`}
                            className="text-xs font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                          >
                            Approved
                          </label>
                        </div>
                      )}
                    </div>
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
                    <div 
                      className="p-3 sm:p-4 rounded-lg border border-dashed border-border hover:border-primary/50 transition-colors cursor-pointer"
                      onClick={() => startEditing(comment)}
                    >
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
                Try adjusting your search terms or filters
              </p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};