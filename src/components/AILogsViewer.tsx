import React, { useState, useEffect } from 'react';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { 
  RefreshCw, 
  Eye, 
  EyeOff, 
  Download,
  Clock,
  Hash,
  Zap
} from 'lucide-react';

interface AILog {
  id: string;
  user_id: string;
  scan_run_id?: string;
  function_name: string;
  provider: string;
  model: string;
  request_type: string;
  phase: string;
  request_prompt: string;
  request_input: string;
  request_tokens?: number;
  request_temperature?: number;
  request_max_tokens?: number;
  response_text?: string;
  response_tokens?: number;
  response_status: 'success' | 'error' | 'pending';
  response_error?: string;
  processing_time_ms?: number;
  created_at: string;
}

export function AILogsViewer() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<AILog[]>([]);
  const [loading, setLoading] = useState(false);
  const [showFullContent, setShowFullContent] = useState(false);
  const [selectedLog, setSelectedLog] = useState<AILog | null>(null);

  useEffect(() => {
    if (user) {
      fetchLogs();
    }
  }, [user]);

  const fetchLogs = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('ai_logs')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) {
        console.error('Error fetching AI logs:', error);
        return;
      }

      setLogs(data || []);
    } catch (error) {
      console.error('Error fetching AI logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const exportLogs = () => {
    const csvContent = [
      ['Timestamp', 'Function', 'Provider/Model', 'Type', 'Phase', 'Input Tokens', 'Output Tokens', 'Total Tokens', 'Status', 'Processing Time (ms)'],
      ...logs.map(log => [
        new Date(log.created_at).toLocaleString(),
        log.function_name,
        `${log.provider}/${log.model}`,
        log.request_type,
        log.phase,
        log.request_tokens || 0,
        log.response_tokens || 0,
        (log.request_tokens || 0) + (log.response_tokens || 0),
        log.response_status,
        log.processing_time_ms || 0
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ai_logs_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success': return 'bg-green-100 text-green-800';
      case 'error': return 'bg-red-100 text-red-800';
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const formatTokenCount = (tokens?: number) => {
    if (!tokens) return '0';
    if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}k`;
    return tokens.toString();
  };

  const formatProcessingTime = (ms?: number) => {
    if (!ms) return 'N/A';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const truncateText = (text: string, maxLength: number = 100) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  if (!user) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>AI Logs Viewer</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Please log in to view AI logs.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            AI Request & Response Logs
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFullContent(!showFullContent)}
            >
              {showFullContent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              {showFullContent ? 'Hide Details' : 'Show Details'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={exportLogs}
              disabled={logs.length === 0}
            >
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchLogs}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin" />
            <span className="ml-2">Loading logs...</span>
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No AI logs found. Run a comment scan to see logs.
          </div>
        ) : (
          <Tabs defaultValue="summary" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="summary">Summary</TabsTrigger>
              <TabsTrigger value="detailed">Detailed</TabsTrigger>
              <TabsTrigger value="raw">Raw Data</TabsTrigger>
            </TabsList>
            
            <TabsContent value="summary" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-2">
                      <Hash className="h-4 w-4 text-blue-500" />
                      <span className="text-sm font-medium">Total Requests</span>
                    </div>
                    <p className="text-2xl font-bold">{logs.length}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-2">
                      <Zap className="h-4 w-4 text-green-500" />
                      <span className="text-sm font-medium">Total Tokens</span>
                    </div>
                    <p className="text-2xl font-bold">
                      {formatTokenCount(logs.reduce((sum, log) => 
                        sum + (log.request_tokens || 0) + (log.response_tokens || 0), 0
                      ))}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-purple-500" />
                      <span className="text-sm font-medium">Avg Response Time</span>
                    </div>
                    <p className="text-2xl font-bold">
                      {formatProcessingTime(
                        logs
                          .filter(log => log.processing_time_ms)
                          .reduce((sum, log) => sum + (log.processing_time_ms || 0), 0) / 
                        logs.filter(log => log.processing_time_ms).length
                      )}
                    </p>
                  </CardContent>
                </Card>
              </div>
              
              <div className="space-y-2">
                <h3 className="text-lg font-semibold">Recent Activity</h3>
                <ScrollArea className="h-64">
                  {logs.slice(0, 20).map((log) => (
                    <div
                      key={log.id}
                      className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 cursor-pointer"
                      onClick={() => setSelectedLog(log)}
                    >
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="text-xs">
                          {log.function_name}
                        </Badge>
                        <span className="text-sm font-medium">
                          {log.provider}/{log.model}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {log.phase}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground">
                        <span>{formatTokenCount(log.request_tokens)} → {formatTokenCount(log.response_tokens)}</span>
                        <Badge className={getStatusColor(log.response_status)}>
                          {log.response_status}
                        </Badge>
                        <span>{new Date(log.created_at).toLocaleTimeString()}</span>
                      </div>
                    </div>
                  ))}
                </ScrollArea>
              </div>
            </TabsContent>
            
            <TabsContent value="detailed" className="space-y-4">
              <ScrollArea className="h-96">
                {logs.map((log) => (
                  <Card key={log.id} className="mb-4">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{log.function_name}</Badge>
                          <Badge variant="outline">{log.provider}/{log.model}</Badge>
                          <Badge variant="outline">{log.phase}</Badge>
                          <Badge className={getStatusColor(log.response_status)}>
                            {log.response_status}
                          </Badge>
                        </div>
                        <span className="text-sm text-muted-foreground">
                          {new Date(log.created_at).toLocaleString()}
                        </span>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <span className="font-medium">Input Tokens:</span>
                          <p>{formatTokenCount(log.request_tokens)}</p>
                        </div>
                        <div>
                          <span className="font-medium">Output Tokens:</span>
                          <p>{formatTokenCount(log.response_tokens)}</p>
                        </div>
                        <div>
                          <span className="font-medium">Total Tokens:</span>
                          <p>{formatTokenCount((log.request_tokens || 0) + (log.response_tokens || 0))}</p>
                        </div>
                        <div>
                          <span className="font-medium">Processing Time:</span>
                          <p>{formatProcessingTime(log.processing_time_ms)}</p>
                        </div>
                      </div>
                      
                      {showFullContent && (
                        <>
                          <div>
                            <span className="font-medium text-sm">Request Prompt:</span>
                            <p className="text-sm bg-gray-50 p-2 rounded mt-1 font-mono">
                              {truncateText(log.request_prompt, 200)}
                            </p>
                          </div>
                          <div>
                            <span className="font-medium text-sm">Request Input:</span>
                            <p className="text-sm bg-gray-50 p-2 rounded mt-1 font-mono">
                              {truncateText(log.request_input, 200)}
                            </p>
                          </div>
                          {log.response_text && (
                            <div>
                              <span className="font-medium text-sm">Response:</span>
                              <p className="text-sm bg-gray-50 p-2 rounded mt-1 font-mono">
                                {truncateText(log.response_text, 200)}
                              </p>
                            </div>
                          )}
                          {log.response_error && (
                            <div>
                              <span className="font-medium text-sm text-red-600">Error:</span>
                              <p className="text-sm bg-red-50 p-2 rounded mt-1 font-mono text-red-600">
                                {log.response_error}
                              </p>
                            </div>
                          )}
                        </>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </ScrollArea>
            </TabsContent>
            
            <TabsContent value="raw" className="space-y-4">
              <ScrollArea className="h-96">
                <pre className="text-xs bg-gray-900 text-green-400 p-4 rounded-lg overflow-auto">
                  {JSON.stringify(logs, null, 2)}
                </pre>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
      
      {/* Log Detail Modal */}
      {selectedLog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-4xl max-h-[90vh] overflow-hidden">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Log Details</CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedLog(null)}
                >
                  Close
                </Button>
              </div>
            </CardHeader>
            <CardContent className="overflow-auto">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="font-medium">Function:</span>
                    <p>{selectedLog.function_name}</p>
                  </div>
                  <div>
                    <span className="font-medium">Provider/Model:</span>
                    <p>{selectedLog.provider}/{selectedLog.model}</p>
                  </div>
                  <div>
                    <span className="font-medium">Type:</span>
                    <p>{selectedLog.request_type}</p>
                  </div>
                  <div>
                    <span className="font-medium">Phase:</span>
                    <p>{selectedLog.phase}</p>
                  </div>
                  <div>
                    <span className="font-medium">Status:</span>
                    <p>{selectedLog.response_status}</p>
                  </div>
                  <div>
                    <span className="font-medium">Created:</span>
                    <p>{new Date(selectedLog.created_at).toLocaleString()}</p>
                  </div>
                </div>
                
                <div>
                  <span className="font-medium">Request Prompt:</span>
                  <pre className="bg-gray-50 p-3 rounded mt-1 text-sm overflow-auto">
                    {selectedLog.request_prompt}
                  </pre>
                </div>
                
                <div>
                  <span className="font-medium">Request Input:</span>
                  <pre className="bg-gray-50 p-3 rounded mt-1 text-sm overflow-auto">
                    {selectedLog.request_input}
                  </pre>
                </div>
                
                {selectedLog.response_text && (
                  <div>
                    <span className="font-medium">Response:</span>
                    <pre className="bg-gray-50 p-3 rounded mt-1 text-sm overflow-auto">
                      {selectedLog.response_text}
                    </pre>
                  </div>
                )}
                
                {selectedLog.response_error && (
                  <div>
                    <span className="font-medium text-red-600">Error:</span>
                    <pre className="bg-red-50 p-3 rounded mt-1 text-sm overflow-auto text-red-600">
                      {selectedLog.response_error}
                    </pre>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </Card>
  );
}
