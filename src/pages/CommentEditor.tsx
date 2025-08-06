import React, { useState } from 'react';
import { FileUpload, CommentData } from '@/components/FileUpload';
import { CommentEditor } from '@/components/CommentEditor';
const Index = () => {
  const [comments, setComments] = useState<CommentData[]>([]);
  const handleDataLoaded = (newComments: CommentData[]) => {
    setComments(newComments);
  };
  const handleCommentsUpdate = (updatedComments: CommentData[]) => {
    setComments(updatedComments);
  };
  return <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary via-primary-glow to-primary text-primary-foreground">
        <div className="container mx-auto px-4 py-12">
          <div className="text-center max-w-3xl mx-auto animate-fade-in">
            <h1 className="text-4xl md:text-5xl font-bold mb-4">Text Comment Screening</h1>
            <p className="text-lg md:text-xl opacity-90">Upload your comment files (.xlsx, .xls, .csv) and edit comments with ease. A powerful, intuitive tool for managing text content.</p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-6xl mx-auto space-y-12">
          {comments.length === 0 ? <div className="animate-slide-up">
              <h2 className="text-2xl font-bold text-center mb-8">
                Get Started
              </h2>
              <FileUpload onDataLoaded={handleDataLoaded} />
            </div> : <div className="grid gap-8">
              <div className="animate-slide-up">
                <CommentEditor comments={comments} onCommentsUpdate={handleCommentsUpdate} />
              </div>
              
              {/* Upload New File Section */}
              <div className="animate-slide-up">
                <h3 className="text-lg font-semibold mb-4">Upload New File</h3>
                <FileUpload onDataLoaded={handleDataLoaded} />
              </div>
            </div>}
        </div>
      </div>
    </div>;
};
export default Index;