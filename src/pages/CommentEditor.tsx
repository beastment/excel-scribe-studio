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
  return <div className="pt-20">
      {/* Header */}
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-50 to-blue-50 py-20 lg:py-32">
        <div className="absolute inset-0 bg-grid-slate-100 [mask-image:linear-gradient(0deg,white,rgba(255,255,255,0.6))] -z-10"></div>
        
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-4xl mx-auto">
            <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-3xl flex items-center justify-center mx-auto mb-8">
              <span className="text-white font-bold text-2xl">AI</span>
            </div>
            
            <h1 className="text-4xl lg:text-6xl font-bold text-gray-900 mb-6 leading-tight">
              Comment
              <span className="bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent"> De-Identification</span>
            </h1>
            
            <p className="text-xl text-gray-600 mb-10 leading-relaxed max-w-3xl mx-auto">
              Upload your comment files (.xlsx, .xls, .csv) and automatically remove sensitive information while preserving tone and context. Powered by enterprise-grade AI.
            </p>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <section className="py-20 bg-white">
        <div className="w-full px-6">
          <div className="w-full space-y-12">
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
      </section>
    </div>;
};
export default Index;