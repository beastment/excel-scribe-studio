import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileText, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

interface FileUploadProps {
  onDataLoaded: (data: CommentData[]) => void;
}

export interface CommentData {
  id: string;
  originalText: string;
  text: string;
  author?: string;
  timestamp?: string;
  originalRow?: number;
  checked?: boolean;
  concerning?: boolean;
  identifiable?: boolean;
  aiReasoning?: string;
  redactedText?: string;
  rephrasedText?: string;
  approved?: boolean;
  mode?: 'redact' | 'rephrase' | 'revert' | 'edit';
  demographics?: string;
  hideAiResponse?: boolean;
  debugInfo?: {
    scanAResult?: { concerning: boolean; identifiable: boolean; reasoning?: string; model?: string };
    scanBResult?: { concerning: boolean; identifiable: boolean; reasoning?: string; model?: string };
    adjudicationResult?: { concerning: boolean; identifiable: boolean; reasoning?: string; model?: string };
    needsAdjudication?: boolean;
    finalDecision?: { concerning: boolean; identifiable: boolean; reasoning?: string };
    error?: string;
    rawResponses?: {
      scanAResponse?: string;
      scanBResponse?: string;
      adjudicationResponse?: string;
    };
    postProcessDiagnostics?: any;
  };
  needsAdjudication?: boolean;
}

export const FileUpload: React.FC<FileUploadProps> = ({ onDataLoaded }) => {
  const [isDragActive, setIsDragActive] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

  const processExcelFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        // Process the data to extract comments
        const comments: CommentData[] = [];
        const headers = jsonData[0] as string[];
        
        // Find comment-related columns
        const commentColumnIndex = headers.findIndex(header => 
          header && header.toLowerCase().includes('comment')
        );
        const authorColumnIndex = headers.findIndex(header => 
          header && (header.toLowerCase().includes('author') || header.toLowerCase().includes('name'))
        );
        
        // Find demographic columns (department, work area, etc.)
        const demographicColumnIndex = headers.findIndex(header => 
          header && (
            header.toLowerCase().includes('department') ||
            header.toLowerCase().includes('work area') ||
            header.toLowerCase().includes('area') ||
            header.toLowerCase().includes('division') ||
            header.toLowerCase().includes('team') ||
            header.toLowerCase().includes('location') ||
            header.toLowerCase().includes('region')
          )
        );
        
        if (commentColumnIndex === -1) {
          toast.error('No comment column found in the Excel file');
          return;
        }

        // Extract comments starting from row 1 (skip header)
        for (let i = 1; i < jsonData.length; i++) {
          const row = jsonData[i] as any[];
          const commentText = row[commentColumnIndex];
          
          if (commentText && typeof commentText === 'string' && commentText.trim()) {
            comments.push({
              id: `comment_${i}`,
              originalText: commentText.trim(),
              text: commentText.trim(),
              author: authorColumnIndex >= 0 ? row[authorColumnIndex] : undefined,
              originalRow: i + 1,
              timestamp: new Date().toISOString(),
              checked: false,
              concerning: false,
              identifiable: false,
              demographics: demographicColumnIndex >= 0 ? row[demographicColumnIndex] : undefined
            });
          }
        }

        if (comments.length === 0) {
          toast.error('No comments found in the Excel file');
          return;
        }

        onDataLoaded(comments);
        toast.success(`Successfully loaded ${comments.length} comments`);
      } catch (error) {
        toast.error('Error processing Excel file. Please check the file format.');
      }
    };
    reader.readAsArrayBuffer(file);
  }, [onDataLoaded]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      setUploadedFile(file);
      processExcelFile(file);
    }
  }, [processExcelFile]);

  const { getRootProps, getInputProps, isDragActive: dropzoneActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'text/csv': ['.csv']
    },
    multiple: false,
    onDragEnter: () => setIsDragActive(true),
    onDragLeave: () => setIsDragActive(false)
  });

  const removeFile = () => {
    setUploadedFile(null);
    onDataLoaded([]);
  };

  return (
    <Card className="p-8 border-2 border-dashed border-border hover:border-primary/50 transition-all duration-300">
      {!uploadedFile ? (
        <div
          {...getRootProps()}
          className={`cursor-pointer text-center transition-all duration-300 ${
            isDragActive || dropzoneActive ? 'scale-105' : ''
          }`}
        >
          <input {...getInputProps()} />
          <div className="flex flex-col items-center gap-4">
            <div className="p-4 rounded-full bg-primary/10">
              <Upload className="w-8 h-8 text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-2">Upload Excel File</h3>
              <p className="text-muted-foreground mb-4">
                Drag and drop your Excel file here, or click to browse
              </p>
              <p className="text-sm text-muted-foreground">
                Supports .xlsx, .xls, and .csv files
              </p>
            </div>
            <Button variant="hero" size="lg">
              Choose File
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between animate-fade-in">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-success/10">
              <FileText className="w-5 h-5 text-success" />
            </div>
            <div>
              <p className="font-medium">{uploadedFile.name}</p>
              <p className="text-sm text-muted-foreground">
                {(uploadedFile.size / 1024).toFixed(1)} KB
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={removeFile}
            className="hover:bg-destructive/10 hover:text-destructive"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      )}
    </Card>
  );
};