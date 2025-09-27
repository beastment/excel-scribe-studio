import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/button';
import { sanitizeForExport } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { RefreshCw, Eye, EyeOff, Download, Clock, Hash, Zap, Timer, Activity, BarChart3 } from 'lucide-react';
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
  time_started?: string;
  time_finished?: string;
  total_run_time_ms?: number;
  created_at: string;
}
interface AILogsViewerProps {
  debugMode?: boolean;
  onRef?: (ref: {
    clearLogs: () => void;
  }) => void;
  skipInitialFetch?: boolean;
}
export function AILogsViewer({
  debugMode = false,
  onRef,
  skipInitialFetch = false
}: AILogsViewerProps) {
  const {
    user
  } = useAuth();
  const [logs, setLogs] = useState<AILog[]>([]);
  const [modelFilter, setModelFilter] = useState<string>('');
  const [modeFilter, setModeFilter] = useState<string>('');
  const [phaseFilter, setPhaseFilter] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [clearingLogs, setClearingLogs] = useState(false);
  const [showFullContent, setShowFullContent] = useState(true); // Auto-expand by default
  const [selectedLog, setSelectedLog] = useState<AILog | null>(null);
  const [mostRecentRunId, setMostRecentRunId] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [runStats, setRunStats] = useState<{
    totalRequests: number;
    totalTokens: number;
    totalProcessingTime: number;
    totalRunTime: number;
    averageEfficiency: number;
    functions: {
      [key: string]: number;
    };
  } | null>(null);

  // Track if we've already fetched logs to prevent unnecessary re-fetches
  const hasFetchedRef = useRef(false);
  const clearLogs = () => {
    setClearingLogs(true); // Show clearing state
    setLogs([]);
    setMostRecentRunId(null);
    setRunStats(null);
    setLastRefresh(null);
    setSelectedLog(null);
    hasFetchedRef.current = false; // Reset fetch flag
    setClearingLogs(false); // Hide clearing state
  };
  useEffect(() => {
    if (user && !skipInitialFetch && !hasFetchedRef.current && debugMode) {
      hasFetchedRef.current = true;
      fetchLogs();
    }
  }, [user, skipInitialFetch, debugMode]);

  // Fetch logs when skipInitialFetch changes from true to false
  useEffect(() => {
    if (user && !skipInitialFetch && logs.length === 0 && !loading && !hasFetchedRef.current && debugMode) {
      hasFetchedRef.current = true;
      fetchLogs();
    }
  }, [skipInitialFetch, debugMode]);

  // Clear logs immediately when skipInitialFetch becomes true
  useEffect(() => {
    if (skipInitialFetch && logs.length > 0) {
      setClearingLogs(true); // Show clearing state immediately
      clearLogs();
    }
  }, [skipInitialFetch, logs.length]);

  // Expose clearLogs function to parent component
  useEffect(() => {
    if (onRef) {
      onRef({
        clearLogs
      });
    }
  }, [onRef]);
  const calculateRunStats = (logs: AILog[]) => {
    if (logs.length === 0) {
      setRunStats(null);
      return;
    }
    const stats = {
      totalRequests: logs.length,
      totalTokens: 0,
      totalProcessingTime: 0,
      totalRunTime: 0,
      averageEfficiency: 0,
      functions: {} as {
        [key: string]: number;
      }
    };
    let totalEfficiency = 0;
    let efficiencyCount = 0;

    // Calculate actual end-to-end run time from first scan_a to last post-process-comments
    const scanALogs = logs.filter(log => log.function_name === 'scan-comments' && log.phase === 'scan_a');
    const postProcessLogs = logs.filter(log => log.function_name === 'post-process-comments');
    let actualRunTime = 0;
    if (scanALogs.length > 0 && postProcessLogs.length > 0) {
      // Find the earliest scan_a start time
      const earliestScanStart = scanALogs.filter(log => log.time_started).map(log => new Date(log.time_started!).getTime()).sort((a, b) => a - b)[0];

      // Find the latest post-process-comments end time
      const latestPostProcessEnd = postProcessLogs.filter(log => log.time_finished).map(log => new Date(log.time_finished!).getTime()).sort((a, b) => b - a)[0];
      if (earliestScanStart && latestPostProcessEnd) {
        actualRunTime = latestPostProcessEnd - earliestScanStart;
      }
    }
    logs.forEach(log => {
      // Count tokens
      stats.totalTokens += (log.request_tokens || 0) + (log.response_tokens || 0);

      // Count processing time
      if (log.processing_time_ms) {
        stats.totalProcessingTime += log.processing_time_ms;
      }

      // Count functions
      if (log.function_name) {
        stats.functions[log.function_name] = (stats.functions[log.function_name] || 0) + 1;
      }

      // Calculate efficiency
      if (log.processing_time_ms && log.total_run_time_ms) {
        const efficiency = log.processing_time_ms / log.total_run_time_ms * 100;
        totalEfficiency += efficiency;
        efficiencyCount++;
      }
    });

    // Use actual run time if available, otherwise fall back to max total_run_time_ms
    if (actualRunTime > 0) {
      stats.totalRunTime = actualRunTime;
    } else {
      // Fallback to the maximum total_run_time_ms from individual logs
      logs.forEach(log => {
        if (log.total_run_time_ms) {
          stats.totalRunTime = Math.max(stats.totalRunTime, log.total_run_time_ms);
        }
      });
    }
    if (efficiencyCount > 0) {
      stats.averageEfficiency = totalEfficiency / efficiencyCount;
    }
    setRunStats(stats);
  };
  const FETCH_TIMEOUT_MS = 60000; // Increase timeout to reduce spurious client-side timeouts

  const fetchLogs = async () => {
    if (!user) {
      console.log('AILogsViewer: No user, skipping fetch');
      return;
    }
    console.log('AILogsViewer: Starting fetch for user:', user.id);
    setLoading(true);

    // Add timeout to prevent infinite loading
    const timeoutId = setTimeout(() => {
      console.error(`AILogsViewer: Fetch timeout after ${Math.floor(FETCH_TIMEOUT_MS / 1000)} seconds`);
      setLoading(false);
    }, FETCH_TIMEOUT_MS);
    try {
      // Test authentication first with a simple query
      console.log('AILogsViewer: Testing authentication...');
      const {
        data: authTest,
        error: authError
      } = await supabase.auth.getUser();
      if (authError) {
        console.error('AILogsViewer: Auth error:', authError);
        setLoading(false);
        return;
      }
      console.log('AILogsViewer: Auth test passed, user:', authTest.user?.id);
      console.log('AILogsViewer: Context user ID:', user.id);
      console.log('AILogsViewer: Auth user ID matches context:', authTest.user?.id === user.id);

      // Test with a simple count query first
      console.log('AILogsViewer: Testing simple count query...');
      const {
        count,
        error: countError
      } = await supabase.from('ai_logs').select('*', {
        count: 'exact',
        head: true
      }).eq('user_id', user.id);
      if (countError) {
        console.error('AILogsViewer: Count query error:', countError);
        // Try a simpler approach - just get recent logs without user filter
        console.log('AILogsViewer: Trying fallback query without user filter...');
        const {
          data: fallbackLogs,
          error: fallbackError
        } = await supabase.from('ai_logs').select('*').order('created_at', {
          ascending: false
        }).limit(20);
        if (fallbackError) {
          console.error('AILogsViewer: Fallback query also failed:', fallbackError);
          setLoading(false);
          return;
        }
        console.log('AILogsViewer: Fallback query successful, found', fallbackLogs?.length || 0, 'logs');
        const typedLogs = fallbackLogs as unknown as AILog[];
        setLogs(typedLogs || []);
        setMostRecentRunId(null);
        calculateRunStats(typedLogs || []);
        setLoading(false);
        return;
      }
      console.log('AILogsViewer: Count query successful, found', count, 'logs');

      // If no logs for this user, try to get recent logs from all users (for debugging)
      if (count === 0) {
        console.log('AILogsViewer: No logs for current user, fetching recent logs from all users...');
        const {
          data: recentLogs,
          error: recentError
        } = await supabase.from('ai_logs').select('*').order('created_at', {
          ascending: false
        }).limit(50);
        if (recentError) {
          console.error('AILogsViewer: Recent logs query error:', recentError);
          setLoading(false);
          return;
        }
        console.log('AILogsViewer: Found', recentLogs?.length || 0, 'recent logs from all users');
        const typedLogs = recentLogs as unknown as AILog[];
        setLogs(typedLogs || []);
        setMostRecentRunId(null);
        calculateRunStats(typedLogs || []);
        setLoading(false);
        return;
      }

      // Now do the full query for the current user
      console.log('AILogsViewer: Starting full query for user...');
      // Reduce volume and prioritize recent activity to avoid long responses
      const {
        data: allLogs,
        error: allLogsError
      } = await supabase.from('ai_logs').select('id, scan_run_id, function_name, provider, model, request_type, phase, request_tokens, response_tokens, response_status, processing_time_ms, time_started, time_finished, total_run_time_ms, created_at, request_input, response_text, response_error').eq('user_id', user.id).order('created_at', {
        ascending: false
      }).limit(250);
      if (allLogsError) {
        console.error('Error fetching AI logs:', allLogsError);
        setLoading(false);
        return;
      }
      if (!allLogs) {
        console.log('AILogsViewer: No logs returned from database');
        setLogs([]);
        setMostRecentRunId(null);
        setRunStats(null);
        return;
      }
      const typedLogs = allLogs as unknown as AILog[];
      console.log('AILogsViewer: Fetched logs:', typedLogs.length);

      // Find the most recent run ID, normalizing batch-suffixed IDs like "1234-2" → "1234"
      const normalizeRunId = (id?: string | null) => {
        if (!id) return '';
        const m = id.match(/^(.*?)(?:-\d+)?$/);
        return m ? m[1] : id;
      };

      const logsWithRunId = typedLogs.filter(log => log.scan_run_id) || [];
      if (logsWithRunId.length > 0) {
        // Group by normalized run id (base id without -batch suffix)
        const runGroups = logsWithRunId.reduce((groups, log) => {
          const baseId = normalizeRunId(log.scan_run_id);
          if (!groups[baseId]) {
            groups[baseId] = [];
          }
          groups[baseId].push(log);
          return groups;
        }, {} as Record<string, AILog[]>);

        // Find the most recent group by newest log timestamp
        let mostRecentRun = '';
        let mostRecentTime = 0;
        Object.entries(runGroups).forEach(([baseId, runLogs]) => {
          const runTime = Math.max(...runLogs.map(l => new Date(l.created_at).getTime()));
          if (runTime > mostRecentTime) {
            mostRecentTime = runTime;
            mostRecentRun = baseId;
          }
        });
        setMostRecentRunId(mostRecentRun);

        // Filter logs to only show the most recent normalized run (include all batch-suffixed entries)
        const filteredLogs = typedLogs.filter(log => normalizeRunId(log.scan_run_id) === mostRecentRun) || [];
        setLogs(filteredLogs);

        // Calculate run statistics
        calculateRunStats(filteredLogs);
      } else {
        // If no logs with run ID, show all logs
        setLogs(typedLogs || []);
        setMostRecentRunId(null);
        calculateRunStats(typedLogs || []);
      }
    } catch (error) {
      console.error('Error fetching AI logs:', error);
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
      setLastRefresh(new Date());
    }
  };
  const exportLogs = () => {
    let csvContent = '';

    // Add run summary if available
    if (runStats && mostRecentRunId) {
      const totalCommentsProcessed = logs.reduce((sum, log) => sum + extractCommentsCount(log.request_input), 0);
      csvContent += `Run Summary for ${mostRecentRunId}\n`;
      csvContent += `Total Requests,${runStats.totalRequests}\n`;
      csvContent += `Total Comments Processed,${totalCommentsProcessed}\n`;
      csvContent += `Total Tokens,${runStats.totalTokens}\n`;
      csvContent += `Total Processing Time (ms),${runStats.totalProcessingTime}\n`;
      csvContent += `Total Run Time (ms),${runStats.totalRunTime}\n`;
      csvContent += `Overhead Time (ms),${Math.max(0, runStats.totalRunTime - runStats.totalProcessingTime)}\n`;
      csvContent += `Average Efficiency (%),${runStats.averageEfficiency.toFixed(1)}\n`;
      csvContent += `Functions Used,${Object.keys(runStats.functions).join('; ')}\n`;
      csvContent += '\n';
    }

    // Add detailed logs
    // Use secure sanitization function

    csvContent += [['Timestamp', 'Run ID', 'Function', 'Provider/Model', 'Type', 'Phase', 'Comments Processed', 'Batch Info', 'Input Tokens', 'Output Tokens', 'Total Tokens', 'Status', 'Processing Time (ms)', 'Time Started', 'Time Finished', 'Duration', 'Total Run Time (ms)', 'Efficiency (%)'], ...logs.map(log => [sanitizeForExport(new Date(log.created_at).toLocaleString()), sanitizeForExport(log.scan_run_id || 'N/A'), sanitizeForExport(log.function_name), sanitizeForExport(`${log.provider}/${log.model}`), sanitizeForExport(log.request_type), sanitizeForExport(log.phase), sanitizeForExport(extractCommentsCount(log.request_input)), sanitizeForExport(extractBatchInfo(log)), sanitizeForExport(log.request_tokens || 0), sanitizeForExport(log.response_tokens || 0), sanitizeForExport((log.request_tokens || 0) + (log.response_tokens || 0)), sanitizeForExport(log.response_status), sanitizeForExport(log.processing_time_ms || 0), sanitizeForExport(log.time_started ? new Date(log.time_started).toLocaleString() : 'N/A'), sanitizeForExport(log.time_finished ? new Date(log.time_finished).toLocaleString() : 'N/A'), sanitizeForExport(formatTimeDuration(log.time_started, log.time_finished)), sanitizeForExport(log.total_run_time_ms || 0), sanitizeForExport(log.processing_time_ms && log.total_run_time_ms ? (log.processing_time_ms / log.total_run_time_ms * 100).toFixed(1) : 'N/A')])].map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], {
      type: 'text/csv'
    });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ai_logs_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success':
        return 'bg-green-100 text-green-800';
      case 'error':
        return 'bg-red-100 text-red-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'splitting':
        return 'bg-amber-100 text-amber-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };
  const isRefusalLikely = (text?: string): boolean => {
    if (!text || typeof text !== 'string') return false;
    const lower = text.toLowerCase();
    const refusalKeywords: string[] = [
      'cannot analyze',
      'refuse to analyze',
      'cannot process',
      'cannot assist',
      'cannot comply',
      'violates content policy',
      'violates safety guidelines',
      'unsafe',
      'harmful',
      'concerning',
      'inappropriate',
      'sensitive'
    ];
    const hasExpectedFormat = lower.includes('i:') && (lower.includes('a:') || lower.includes('concerning:'));
    const containsRefusal = refusalKeywords.some(k => lower.includes(k));
    return !hasExpectedFormat && containsRefusal;
  };
  const getDisplayStatus = (log: AILog): 'success' | 'error' | 'pending' | 'splitting' => {
    if (log.function_name === 'scan-comments' && (log.phase === 'scan_a' || log.phase === 'scan_b')) {
      if (log.response_status === 'success' && isRefusalLikely(log.response_text)) {
        return 'splitting';
      }
    }
    return log.response_status;
  };
  const formatTokenCount = (tokens?: number) => {
    if (!tokens) return '0';
    if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}k`;
    return tokens.toString();
  };
  const formatProcessingTime = (ms?: number): string => {
    if (ms === undefined || ms === null) return 'N/A';
    if (ms < 0) return 'N/A'; // Handle negative values
    if (ms === 0) return '0.0s'; // Handle zero values

    // For very small values (under 1 second), show with more precision
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
    return `${(ms / 3600000).toFixed(1)}h`;
  };
  const formatTimeDuration = (startTime?: string, endTime?: string) => {
    if (!startTime || !endTime) return 'N/A';
    try {
      const start = new Date(startTime);
      const end = new Date(endTime);
      const duration = end.getTime() - start.getTime();

      // Always show in seconds or minutes for better readability
      if (duration < 60000) return `${(duration / 1000).toFixed(1)}s`;
      if (duration < 3600000) return `${(duration / 60000).toFixed(1)}m`;
      return `${(duration / 3600000).toFixed(1)}h`;
    } catch (error) {
      return 'N/A';
    }
  };
  const truncateText = (text: unknown, maxLength: number = 100): string => {
    const s = typeof text === 'string' ? text : text == null ? '' : String(text);
    if (s.length <= maxLength) return s;
    return s.substring(0, maxLength) + '...';
  };
  const extractCommentsCount = (requestInput: string): number => {
    if (!requestInput) return 0;
    const matches = requestInput.match(/<<<ITEM \d+>>>/g);
    return matches ? matches.length : 0;
  };
  const extractBatchInfo = (log: AILog): string => {
    if (!log.request_input) return '';
    const commentsCount = extractCommentsCount(log.request_input);
    if (commentsCount === 0) return '';

    // Extract item numbers to determine batch range
    const itemMatches = log.request_input.match(/<<<ITEM (\d+)>>>/g);
    if (!itemMatches || itemMatches.length === 0) return `${commentsCount} comments`;
    const itemNumbers = itemMatches.map(match => {
      const num = match.match(/<<<ITEM (\d+)>>>/);
      return num ? parseInt(num[1]) : 0;
    }).filter(num => num > 0);
    if (itemNumbers.length === 0) return `${commentsCount} comments`;
    const minItem = Math.min(...itemNumbers);
    const maxItem = Math.max(...itemNumbers);
    if (minItem === maxItem) {
      return `Item ${minItem}`;
    } else {
      return `Items ${minItem}-${maxItem}`;
    }
  };
  if (!user) {
    return <Card>
        <CardHeader>
          <CardTitle>AI Logs Viewer</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Please log in to view AI logs.</p>
        </CardContent>
      </Card>;
  }
  if (!debugMode) {
    return null; // Don't show anything when debug mode is off
  }
  return <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            AI Request & Response Logs
            
          </CardTitle>
          <div className="flex items-center gap-2">
            {/* Model Filter */}
            <select className="border rounded px-2 py-1 text-sm" value={modelFilter} onChange={e => setModelFilter(e.target.value)} title="Filter by Provider/Model">
              <option value="">All Models</option>
              {Array.from(new Set(logs.map(l => `${l.provider}/${l.model}`))).sort().map(k => <option key={k} value={k}>{k}</option>)}
            </select>
            
            {/* Mode Filter */}
            <select className="border rounded px-2 py-1 text-sm" value={modeFilter} onChange={e => setModeFilter(e.target.value)} title="Filter by Mode">
              <option value="">All Modes</option>
              {Array.from(new Set(logs.map(l => l.request_type).filter(Boolean))).sort().map(k => <option key={k} value={k}>{k}</option>)}
            </select>
            
            {/* Phase Filter */}
            <select className="border rounded px-2 py-1 text-sm" value={phaseFilter} onChange={e => setPhaseFilter(e.target.value)} title="Filter by Phase">
              <option value="">All Phases</option>
              {Array.from(new Set(logs.map(l => l.phase).filter(Boolean))).sort().map(k => <option key={k} value={k}>{k}</option>)}
            </select>
            <Button variant="outline" size="sm" onClick={() => setShowFullContent(!showFullContent)}>
              {showFullContent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              {showFullContent ? 'Hide Details' : 'Show Details'}
            </Button>
            <Button variant="outline" size="sm" onClick={exportLogs} disabled={logs.length === 0}>
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => {
            hasFetchedRef.current = false; // Allow manual refresh
            fetchLogs();
          }} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            {lastRefresh && <span className="text-xs text-muted-foreground">
                Last: {lastRefresh.toLocaleTimeString()}
              </span>}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading || clearingLogs ? <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin" />
            <span className="ml-2">{clearingLogs ? 'Clearing logs...' : 'Loading logs...'}</span>
          </div> : logs.length === 0 ? <div className="text-center py-8 text-muted-foreground">
            {mostRecentRunId ? `No AI logs found for run ${mostRecentRunId}. Run a comment scan to see logs.` : 'No AI logs found. Run a comment scan to see logs.'}
          </div> : <Tabs defaultValue="summary" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="summary">Summary</TabsTrigger>
              <TabsTrigger value="detailed">Detailed</TabsTrigger>
              <TabsTrigger value="raw">Raw Data</TabsTrigger>
            </TabsList>
            
            <TabsContent value="summary" className="space-y-4">
              {/* RUN ID Display */}
              {mostRecentRunId && <Card className="bg-blue-50 border-blue-200">
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-2">
                      <Hash className="h-5 w-5 text-blue-600" />
                      <span className="text-lg font-semibold text-blue-800">Current Run ID: {mostRecentRunId}</span>
                    </div>
                    <p className="text-sm text-blue-600 mt-1">
                      Showing {logs.length} AI interactions from the most recent scan run
                    </p>
                  </CardContent>
                </Card>}
              
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
                      {formatTokenCount(logs.reduce((sum, log) => sum + (log.request_tokens || 0) + (log.response_tokens || 0), 0))}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-2">
                      <Hash className="h-4 w-4 text-indigo-500" />
                      <span className="text-sm font-medium">Comments Processed</span>
                    </div>
                    <p className="text-2xl font-bold">
                      {logs.reduce((sum, log) => sum + extractCommentsCount(log.request_input), 0)}
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
                      {formatProcessingTime(logs.filter(log => log.processing_time_ms).reduce((sum, log) => sum + (log.processing_time_ms || 0), 0) / logs.filter(log => log.processing_time_ms).length)}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {runStats && <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card>
                      <CardContent className="pt-6">
                        <div className="flex items-center gap-2">
                          <Timer className="h-4 w-4 text-orange-500" />
                          <span className="text-sm font-medium">Total Run Time</span>
                        </div>
                        <p className="text-2xl font-bold text-orange-600">
                          {formatProcessingTime(runStats.totalRunTime)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          End-to-end process
                        </p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-6">
                        <div className="flex items-center gap-2">
                          <Activity className="h-4 w-4 text-emerald-500" />
                          <span className="text-sm font-medium">Avg Efficiency</span>
                        </div>
                        <p className="text-2xl font-bold text-emerald-600">
                          {runStats.averageEfficiency.toFixed(1)}%
                        </p>
                        <p className="text-xs text-muted-foreground">
                          AI processing / Total time
                        </p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-6">
                        <div className="flex items-center gap-2">
                          <BarChart3 className="h-4 w-4 text-indigo-500" />
                          <span className="text-sm font-medium">Functions Used</span>
                        </div>
                        <p className="text-2xl font-bold text-indigo-600">
                          {Object.keys(runStats.functions).length}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Different Edge Functions
                        </p>
                      </CardContent>
                    </Card>
                  </div>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Function Breakdown</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {Object.entries(runStats.functions).map(([funcName, count]) => <div key={funcName} className="flex justify-between items-center p-3 border rounded-lg">
                            <span className="text-sm font-medium capitalize">
                              {funcName.replace(/-/g, ' ')}
                            </span>
                            <Badge variant="secondary" className="text-lg px-3 py-1">
                              {count}
                            </Badge>
                          </div>)}
                      </div>
                    </CardContent>
                  </Card>

                  
                </>}
              
              <div className="space-y-2">
                <h3 className="text-lg font-semibold">Recent Activity</h3>
                <ScrollArea className="h-64">
                  {logs.filter(l => 
                    (!modelFilter || `${l.provider}/${l.model}` === modelFilter) &&
                    (!modeFilter || l.request_type === modeFilter) &&
                    (!phaseFilter || l.phase === phaseFilter)
                  ).slice(0, 50).map(log => <div key={log.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 cursor-pointer" onClick={() => setSelectedLog(log)}>
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
                        <Badge variant="secondary" className="text-xs">
                          {extractCommentsCount(log.request_input)} comments
                        </Badge>
                        {extractBatchInfo(log) && <Badge variant="secondary" className="text-xs">
                            {extractBatchInfo(log)}
                          </Badge>}
                      </div>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground">
                        <span>{formatTokenCount(log.request_tokens)} → {formatTokenCount(log.response_tokens)}</span>
                        <Badge className={getStatusColor(getDisplayStatus(log))}>
                          {getDisplayStatus(log)}
                        </Badge>
                        <span>{formatTimeDuration(log.time_started, log.time_finished)}</span>
                        <span>{formatProcessingTime(log.total_run_time_ms)}</span>
                        <span>{new Date(log.created_at).toLocaleTimeString()}</span>
                      </div>
                    </div>)}
                </ScrollArea>
              </div>
            </TabsContent>
            
            <TabsContent value="detailed" className="space-y-4">
              <ScrollArea className="h-96">
                {logs.filter(l => 
                  (!modelFilter || `${l.provider}/${l.model}` === modelFilter) &&
                  (!modeFilter || l.request_type === modeFilter) &&
                  (!phaseFilter || l.phase === phaseFilter)
                ).map(log => <Card key={log.id} className="mb-4">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{log.function_name}</Badge>
                          <Badge variant="outline">{log.provider}/{log.model}</Badge>
                          <Badge variant="outline">{log.phase}</Badge>
                          {extractBatchInfo(log) && <Badge variant="secondary" className="text-xs">
                              {extractBatchInfo(log)}
                            </Badge>}
                          <Badge className={getStatusColor(getDisplayStatus(log))}>
                            {getDisplayStatus(log)}
                          </Badge>
                          {log.scan_run_id && <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-300">
                              RUN: {log.scan_run_id}
                            </Badge>}
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
                      
                                             <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                         <div>
                           <span className="font-medium">Time Started:</span>
                           <p>{log.time_started ? new Date(log.time_started).toLocaleString() : 'N/A'}</p>
                         </div>
                         <div>
                           <span className="font-medium">Time Finished:</span>
                           <p>{log.time_finished ? new Date(log.time_finished).toLocaleString() : 'N/A'}</p>
                         </div>
                         <div>
                           <span className="font-medium">Duration:</span>
                           <p>{formatTimeDuration(log.time_started, log.time_finished)}</p>
                         </div>
                         <div>
                           <span className="font-medium">Created:</span>
                           <p>{new Date(log.created_at).toLocaleString()}</p>
                         </div>
                       </div>
                       
                       <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                         <div>
                           <span className="font-medium">Processing Time:</span>
                           <p>{formatProcessingTime(log.processing_time_ms)}</p>
                         </div>
                         <div>
                           <span className="font-medium">Total Run Time:</span>
                           <p>{formatProcessingTime(log.total_run_time_ms)}</p>
                         </div>
                         <div>
                           <span className="font-medium">Efficiency:</span>
                           <p>{log.processing_time_ms && log.total_run_time_ms ? `${(log.processing_time_ms / log.total_run_time_ms * 100).toFixed(1)}%` : 'N/A'}</p>
                         </div>
                         <div>
                           <span className="font-medium">Overhead:</span>
                                                   <p>{log.processing_time_ms && log.total_run_time_ms ? `${(Math.max(0, (log.total_run_time_ms - log.processing_time_ms) / log.total_run_time_ms) * 100).toFixed(1)}%` : 'N/A'}</p>
                         </div>
                       </div>
                      
                      {showFullContent && <>
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
                          {log.response_text && <div>
                              <span className="font-medium text-sm">Response:</span>
                              <p className="text-sm bg-gray-50 p-2 rounded mt-1 font-mono">
                                {truncateText(log.response_text, 200)}
                              </p>
                            </div>}
                          {log.response_error && <div>
                              <span className="font-medium text-sm text-red-600">Error:</span>
                              <p className="text-sm bg-red-50 p-2 rounded mt-1 font-mono text-red-600">
                                {log.response_error}
                              </p>
                            </div>}
                        </>}
                    </CardContent>
                  </Card>)}
              </ScrollArea>
            </TabsContent>
            
            <TabsContent value="raw" className="space-y-4">
              <ScrollArea className="h-96">
                <pre className="text-xs bg-gray-900 text-green-400 p-4 rounded-lg overflow-auto">
                  {JSON.stringify(logs.filter(l => 
                    (!modelFilter || `${l.provider}/${l.model}` === modelFilter) &&
                    (!modeFilter || l.request_type === modeFilter) &&
                    (!phaseFilter || l.phase === phaseFilter)
                  ), null, 2)}
                </pre>
              </ScrollArea>
            </TabsContent>
          </Tabs>}
      </CardContent>
      
      {/* Log Detail Modal */}
      {selectedLog && <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-4xl max-h-[90vh] overflow-hidden">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Log Details</CardTitle>
                <Button variant="outline" size="sm" onClick={() => setSelectedLog(null)}>
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
                  <div>
                    <span className="font-medium">Time Started:</span>
                    <p>{selectedLog.time_started ? new Date(selectedLog.time_started).toLocaleString() : 'N/A'}</p>
                  </div>
                  <div>
                    <span className="font-medium">Time Finished:</span>
                    <p>{selectedLog.time_finished ? new Date(selectedLog.time_finished).toLocaleString() : 'N/A'}</p>
                  </div>
                                     <div>
                     <span className="font-medium">Duration:</span>
                     <p>{formatTimeDuration(selectedLog.time_started, selectedLog.time_finished)}</p>
                   </div>
                   <div>
                     <span className="font-medium">Total Run Time:</span>
                     <p>{formatProcessingTime(selectedLog.total_run_time_ms)}</p>
                   </div>
                   <div>
                     <span className="font-medium">Efficiency:</span>
                     <p>{selectedLog.processing_time_ms && selectedLog.total_run_time_ms ? `${(selectedLog.processing_time_ms / selectedLog.total_run_time_ms * 100).toFixed(1)}%` : 'N/A'}</p>
                   </div>
                   {selectedLog.scan_run_id && <div>
                       <span className="font-medium">Run ID:</span>
                       <p className="font-mono bg-blue-50 p-2 rounded">{selectedLog.scan_run_id}</p>
                     </div>}
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
                
                {selectedLog.response_text && <div>
                    <span className="font-medium">Response:</span>
                    <pre className="bg-gray-50 p-3 rounded mt-1 text-sm overflow-auto">
                      {selectedLog.response_text}
                    </pre>
                  </div>}
                
                {selectedLog.response_error && <div>
                    <span className="font-medium text-red-600">Error:</span>
                    <pre className="bg-red-50 p-3 rounded mt-1 text-sm overflow-auto text-red-600">
                      {selectedLog.response_error}
                    </pre>
                  </div>}
              </div>
            </CardContent>
          </Card>
        </div>}
    </Card>;
}