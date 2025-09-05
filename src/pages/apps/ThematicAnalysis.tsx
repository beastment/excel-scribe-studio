import React, { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  BrainCircuit, 
  Upload,
  FileText,
  Download,
  BarChart3,
  PieChart,
  TrendingUp,
  Users,
  Building,
  Calendar,
  Filter,
  Search,
  CheckCircle,
  AlertCircle,
  Loader2,
  FileSpreadsheet,
  FileImage
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { generateThematicAnalysisPDF } from '@/utils/pdfGenerator';

interface Comment {
  id: string;
  text: string;
  department?: string;
  gender?: string;
  age?: string;
  role?: string;
  location?: string;
  [key: string]: any;
}

interface Theme {
  id: string;
  name: string;
  description: string;
  frequency: number;
  sentiment: 'positive' | 'negative' | 'neutral';
  keywords: string[];
  comments: Comment[];
}

interface DemographicBreakdown {
  department: Record<string, Theme[]>;
  gender: Record<string, Theme[]>;
  age: Record<string, Theme[]>;
  role: Record<string, Theme[]>;
}

interface AnalysisResult {
  themes: Theme[];
  demographicBreakdown: DemographicBreakdown;
  summary: {
    totalComments: number;
    totalThemes: number;
    averageSentiment: number;
    topTheme: Theme;
  };
  taggedComments: Comment[];
}

const ThematicAnalysis = () => {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedTheme, setSelectedTheme] = useState<Theme | null>(null);
  const [filteredComments, setFilteredComments] = useState<Comment[]>([]);
  const [searchTerm, setSearchTerm] = useState("");

  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.type !== 'text/csv' && file.type !== 'application/vnd.ms-excel' && file.type !== 'text/plain') {
      setError("Please upload a CSV or text file");
      return;
    }

    setUploadedFile(file);
    setError(null);
    
    // Parse CSV file
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      parseCSVData(text);
    };
    reader.readAsText(file);
  }, []);

  const parseCSVData = (csvText: string) => {
    try {
      const lines = csvText.split('\n');
      const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
      
      const parsedComments: Comment[] = [];
      
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
        if (values.length >= 2) {
          const comment: Comment = {
            id: `comment-${i}`,
            text: values[0] || '',
          };
          
          // Map additional columns to demographic data
          headers.forEach((header, index) => {
            if (index > 0 && values[index]) {
              comment[header.toLowerCase()] = values[index];
            }
          });
          
          if (comment.text.trim()) {
            parsedComments.push(comment);
          }
        }
      }
      
      setComments(parsedComments);
      toast({
        title: "File uploaded successfully",
        description: `Parsed ${parsedComments.length} comments from ${uploadedFile?.name}`,
      });
    } catch (err) {
      setError("Error parsing CSV file. Please ensure it's properly formatted.");
    }
  };

  const analyzeComments = async () => {
    if (comments.length === 0) {
      setError("Please upload a file with comments first");
      return;
    }

    setIsAnalyzing(true);
    setProgress(0);
    setError(null);

    try {
      // Simulate progress updates
      const progressInterval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 500);

      // Call the thematic analysis function
      const { data, error } = await supabase.functions.invoke('thematic-analysis', {
        body: {
          comments: comments,
          userId: user?.id,
        }
      });

      clearInterval(progressInterval);
      setProgress(100);

      if (error) {
        throw new Error(error.message);
      }

      if (data.success) {
        setAnalysisResult(data.result);
        toast({
          title: "Analysis completed",
          description: `Identified ${data.result.themes.length} themes from ${comments.length} comments`,
        });
      } else {
        throw new Error(data.error || "Analysis failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
      toast({
        title: "Analysis failed",
        description: "Please try again or contact support if the issue persists",
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);
      setProgress(0);
    }
  };

  const downloadTaggedComments = () => {
    if (!analysisResult) return;

    const csvContent = [
      ['Comment ID', 'Text', 'Themes', 'Sentiment', 'Department', 'Gender', 'Age', 'Role'],
      ...analysisResult.taggedComments.map(comment => {
        const commentThemes = analysisResult.themes.filter(theme => 
          theme.comments.some(c => c.id === comment.id)
        );
        return [
          comment.id,
          `"${comment.text.replace(/"/g, '""')}"`,
          commentThemes.map(t => t.name).join('; '),
          commentThemes.length > 0 ? commentThemes[0].sentiment : 'neutral',
          comment.department || '',
          comment.gender || '',
          comment.age || '',
          comment.role || ''
        ];
      })
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tagged-comments.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const downloadPDFReport = () => {
    if (!analysisResult) return;
    
    try {
      generateThematicAnalysisPDF(analysisResult);
      toast({
        title: "PDF Report Generated",
        description: "Your thematic analysis report has been downloaded successfully",
      });
    } catch (error) {
      toast({
        title: "PDF Generation Failed",
        description: "There was an error generating the PDF report. Please try again.",
        variant: "destructive",
      });
    }
  };

  const filterCommentsByTheme = (theme: Theme) => {
    setSelectedTheme(theme);
    setFilteredComments(theme.comments);
  };

  const filteredThemes = analysisResult?.themes.filter(theme =>
    theme.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    theme.description.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  return (
    <div className="pt-20 min-h-screen bg-gradient-to-br from-slate-50 to-purple-50">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <BrainCircuit className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Thematic Analysis
          </h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Upload your employee feedback data and discover key themes, sentiment patterns, and demographic insights automatically.
          </p>
        </div>

        {/* Upload Section */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5" />
              Upload Data
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600 mb-4">
                  Upload a CSV file with employee comments and demographic data
                </p>
                <Button 
                  onClick={() => fileInputRef.current?.click()}
                  variant="outline"
                  className="mb-2"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Choose File
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.txt"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                {uploadedFile && (
                  <div className="mt-4 p-3 bg-green-50 rounded-lg">
                    <p className="text-green-800 font-medium">
                      {uploadedFile.name} ({comments.length} comments)
                    </p>
                  </div>
                )}
              </div>
              
              {comments.length > 0 && (
                <div className="flex gap-4">
                  <Button 
                    onClick={analyzeComments}
                    disabled={isAnalyzing}
                    className="flex-1"
                  >
                    {isAnalyzing ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Analyzing...
                      </>
                    ) : (
                      <>
                        <BrainCircuit className="w-4 h-4 mr-2" />
                        Analyze Comments
                      </>
                    )}
                  </Button>
                </div>
              )}

              {isAnalyzing && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>Processing comments...</span>
                    <span>{progress}%</span>
                  </div>
                  <Progress value={progress} className="w-full" />
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {error && (
          <Alert className="mb-8" variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Results Section */}
        {analysisResult && (
          <div className="space-y-8">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center">
                    <FileText className="h-8 w-8 text-blue-600" />
                    <div className="ml-4">
                      <p className="text-sm font-medium text-gray-600">Total Comments</p>
                      <p className="text-2xl font-bold">{analysisResult.summary.totalComments}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center">
                    <BrainCircuit className="h-8 w-8 text-purple-600" />
                    <div className="ml-4">
                      <p className="text-sm font-medium text-gray-600">Themes Found</p>
                      <p className="text-2xl font-bold">{analysisResult.summary.totalThemes}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center">
                    <TrendingUp className="h-8 w-8 text-green-600" />
                    <div className="ml-4">
                      <p className="text-sm font-medium text-gray-600">Avg Sentiment</p>
                      <p className="text-2xl font-bold">
                        {analysisResult.summary.averageSentiment > 0 ? '+' : ''}
                        {analysisResult.summary.averageSentiment.toFixed(1)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center">
                    <BarChart3 className="h-8 w-8 text-orange-600" />
                    <div className="ml-4">
                      <p className="text-sm font-medium text-gray-600">Top Theme</p>
                      <p className="text-sm font-bold truncate">{analysisResult.summary.topTheme.name}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Download Actions */}
            <Card>
              <CardContent className="p-6">
                <div className="flex gap-4">
                  <Button onClick={downloadTaggedComments} variant="outline">
                    <Download className="w-4 h-4 mr-2" />
                    Download Tagged Comments
                  </Button>
                  <Button onClick={downloadPDFReport} variant="outline">
                    <FileImage className="w-4 h-4 mr-2" />
                    Download PDF Report
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Analysis Tabs */}
            <Tabs defaultValue="themes" className="space-y-6">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="themes">Themes</TabsTrigger>
                <TabsTrigger value="demographics">Demographics</TabsTrigger>
                <TabsTrigger value="comments">Comments</TabsTrigger>
                <TabsTrigger value="visualizations">Charts</TabsTrigger>
              </TabsList>

              <TabsContent value="themes" className="space-y-4">
                <div className="flex gap-4 mb-4">
                  <div className="flex-1">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                      <input
                        type="text"
                        placeholder="Search themes..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid gap-4">
                  {filteredThemes.map((theme) => (
                    <Card key={theme.id} className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => filterCommentsByTheme(theme)}>
                      <CardContent className="p-6">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <h3 className="text-lg font-semibold">{theme.name}</h3>
                              <Badge variant={theme.sentiment === 'positive' ? 'default' : theme.sentiment === 'negative' ? 'destructive' : 'secondary'}>
                                {theme.sentiment}
                              </Badge>
                              <Badge variant="outline">
                                {theme.frequency} comments
                              </Badge>
                            </div>
                            <p className="text-gray-600 mb-3">{theme.description}</p>
                            <div className="flex flex-wrap gap-2">
                              {theme.keywords.slice(0, 5).map((keyword, index) => (
                                <Badge key={index} variant="outline" className="text-xs">
                                  {keyword}
                                </Badge>
                              ))}
                              {theme.keywords.length > 5 && (
                                <Badge variant="outline" className="text-xs">
                                  +{theme.keywords.length - 5} more
                                </Badge>
                              )}
                            </div>
                          </div>
                          <div className="ml-4">
                            <div className="w-16 h-16 bg-gradient-to-br from-purple-100 to-pink-100 rounded-lg flex items-center justify-center">
                              <span className="text-2xl font-bold text-purple-600">
                                {Math.round((theme.frequency / analysisResult.summary.totalComments) * 100)}%
                              </span>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="demographics" className="space-y-6">
                <div className="grid gap-6">
                  {Object.entries(analysisResult.demographicBreakdown).map(([category, themes]) => (
                    <Card key={category}>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2 capitalize">
                          {category === 'department' && <Building className="w-5 h-5" />}
                          {category === 'gender' && <Users className="w-5 h-5" />}
                          {category === 'age' && <Calendar className="w-5 h-5" />}
                          {category === 'role' && <Users className="w-5 h-5" />}
                          {category} Breakdown
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          {Object.entries(themes).map(([value, themeList]) => (
                            <div key={value} className="border rounded-lg p-4">
                              <h4 className="font-semibold mb-2">{value}</h4>
                              <div className="space-y-2">
                                {themeList.map((theme) => (
                                  <div key={theme.id} className="flex items-center justify-between">
                                    <span className="text-sm">{theme.name}</span>
                                    <Badge variant="outline">{theme.frequency}</Badge>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="comments" className="space-y-4">
                {selectedTheme ? (
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold">Comments for "{selectedTheme.name}"</h3>
                      <Button variant="outline" onClick={() => setSelectedTheme(null)}>
                        Show All Comments
                      </Button>
                    </div>
                    <div className="space-y-3">
                      {filteredComments.map((comment) => (
                        <Card key={comment.id}>
                          <CardContent className="p-4">
                            <p className="text-gray-800 mb-2">{comment.text}</p>
                            <div className="flex gap-2 text-sm text-gray-500">
                              {comment.department && <span>Dept: {comment.department}</span>}
                              {comment.gender && <span>Gender: {comment.gender}</span>}
                              {comment.age && <span>Age: {comment.age}</span>}
                              {comment.role && <span>Role: {comment.role}</span>}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {analysisResult.taggedComments.map((comment) => (
                      <Card key={comment.id}>
                        <CardContent className="p-4">
                          <p className="text-gray-800 mb-2">{comment.text}</p>
                          <div className="flex gap-2 text-sm text-gray-500">
                            {comment.department && <span>Dept: {comment.department}</span>}
                            {comment.gender && <span>Gender: {comment.gender}</span>}
                            {comment.age && <span>Age: {comment.age}</span>}
                            {comment.role && <span>Role: {comment.role}</span>}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="visualizations" className="space-y-6">
                <div className="grid gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <PieChart className="w-5 h-5" />
                        Theme Distribution
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {analysisResult.themes.slice(0, 10).map((theme) => (
                          <div key={theme.id} className="flex items-center gap-3">
                            <div className="w-4 h-4 rounded-full bg-purple-500"></div>
                            <span className="flex-1">{theme.name}</span>
                            <span className="text-sm text-gray-600">
                              {Math.round((theme.frequency / analysisResult.summary.totalComments) * 100)}%
                            </span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <BarChart3 className="w-5 h-5" />
                        Sentiment Analysis
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {analysisResult.themes.map((theme) => (
                          <div key={theme.id} className="space-y-1">
                            <div className="flex justify-between text-sm">
                              <span>{theme.name}</span>
                              <span className="capitalize">{theme.sentiment}</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2">
                              <div 
                                className={`h-2 rounded-full ${
                                  theme.sentiment === 'positive' ? 'bg-green-500' :
                                  theme.sentiment === 'negative' ? 'bg-red-500' : 'bg-gray-500'
                                }`}
                                style={{ width: `${(theme.frequency / analysisResult.summary.totalComments) * 100}%` }}
                              ></div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>
    </div>
  );
};

export default ThematicAnalysis;