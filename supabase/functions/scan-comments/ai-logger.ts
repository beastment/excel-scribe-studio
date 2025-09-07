// AI logging utility for storing requests and responses in the database
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { countTokens, TokenCounts } from './token-counter.ts';

export interface AILogEntry {
  userId: string;
  scanRunId?: string;
  functionName: string;
  provider: string;
  model: string;
  requestType: string;
  phase: string;
  requestPrompt: string;
  requestInput: string;
  requestTokens?: number;
  requestTemperature?: number;
  requestMaxTokens?: number;
  responseText?: string;
  responseTokens?: number;
  responseStatus: 'success' | 'error';
  responseError?: string;
  processingTimeMs?: number;
  timeStarted?: string;
  timeFinished?: string;
  totalRunTimeMs?: number;
}

export class AILogger {
  private supabase: any;
  private startTime: number;
  private functionStartTime: number;
  
  constructor() {
    this.supabase = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    );
    this.startTime = Date.now();
    this.functionStartTime = Date.now();
  }
  
  // Log an AI request (call this before making the AI call)
  async logRequest(entry: Omit<AILogEntry, 'responseText' | 'responseTokens' | 'responseStatus' | 'responseError' | 'processingTimeMs'>): Promise<void> {
    try {
      // Count input tokens
      const tokenCounts = await countTokens(entry.provider, entry.model, entry.requestInput);
      
      const timeStarted = new Date().toISOString();
      
      await this.supabase
        .from('ai_logs')
        .insert({
          user_id: entry.userId,
          scan_run_id: entry.scanRunId,
          function_name: entry.functionName,
          provider: entry.provider,
          model: entry.model,
          request_type: entry.requestType,
          phase: entry.phase,
          request_prompt: entry.requestPrompt,
          request_input: entry.requestInput,
          request_tokens: tokenCounts.inputTokens,
          request_temperature: entry.requestTemperature,
          request_max_tokens: entry.requestMaxTokens,
          response_status: 'pending',
          time_started: timeStarted
        });
        
      console.log(`[AI REQUEST] ${entry.provider}/${entry.model} type=${entry.requestType} phase=${entry.phase} input_tokens=${tokenCounts.inputTokens}`);
    } catch (error) {
      console.error('[AI LOGGER] Error logging request:', error);
      // Don't fail the main operation if logging fails
    }
  }
  
  // Log an AI response (call this after receiving the AI response)
  async logResponse(
    userId: string,
    scanRunId: string | undefined,
    functionName: string,
    provider: string,
    model: string,
    requestType: string,
    phase: string,
    responseText: string,
    error?: string,
    totalRunTimeMs?: number
  ): Promise<void> {
    try {
      const processingTimeMs = Date.now() - this.startTime;
      
      // Count output tokens
      const tokenCounts = await countTokens(provider, model, '', responseText);
      
      const responseStatus: 'success' | 'error' = error ? 'error' : 'success';
      
      // Calculate total run time if not provided
      const calculatedTotalRunTimeMs = totalRunTimeMs || (Date.now() - this.functionStartTime);
      // Robust update: select the most recent pending row first, then update by id
      // This avoids missing the row when multiple pending entries exist or phases overlap
      let selectQuery = this.supabase
        .from('ai_logs')
        .select('id')
        .eq('user_id', userId)
        .eq('function_name', functionName)
        .eq('request_type', requestType)
        .eq('phase', phase)
        .eq('response_status', 'pending')
        .order('time_started', { ascending: true })
        .limit(1);

      selectQuery = scanRunId
        ? selectQuery.eq('scan_run_id', scanRunId)
        : selectQuery.is('scan_run_id', null);

      const { data: pendingRows, error: selectError } = await selectQuery;
      if (selectError) {
        console.error('[AI LOGGER] Error selecting pending log to update:', selectError);
      }

      let updateError: any = null;
      if (pendingRows && pendingRows.length > 0) {
        const targetId = pendingRows[0].id;
        const { error } = await this.supabase
          .from('ai_logs')
          .update({
            response_text: responseText,
            response_tokens: tokenCounts.outputTokens,
            response_status: responseStatus,
            response_error: error,
            processing_time_ms: processingTimeMs,
            time_finished: new Date().toISOString(),
            total_run_time_ms: calculatedTotalRunTimeMs
          })
          .eq('id', targetId);
        updateError = error;
      } else {
        // Fallback: attempt a best-effort update using the broader filter
        const baseQuery = this.supabase
          .from('ai_logs')
          .update({
            response_text: responseText,
            response_tokens: tokenCounts.outputTokens,
            response_status: responseStatus,
            response_error: error,
            processing_time_ms: processingTimeMs,
            time_finished: new Date().toISOString(),
            total_run_time_ms: calculatedTotalRunTimeMs
          })
          .eq('user_id', userId)
          .eq('function_name', functionName)
          .eq('phase', phase)
          .eq('response_status', 'pending');

        const finalQuery = scanRunId
          ? baseQuery.eq('scan_run_id', scanRunId)
          : baseQuery.is('scan_run_id', null);
        const { error } = await finalQuery;
        updateError = error;
      }
        
      if (updateError) {
        console.error('[AI LOGGER] Error updating response log:', updateError);
      }
      
      console.log(`[AI RESPONSE] ${provider}/${model} type=${requestType} phase=${phase} output_tokens=${tokenCounts.outputTokens} total_tokens=${tokenCounts.totalTokens} processing_time_ms=${processingTimeMs}`);
    } catch (error) {
      console.error('[AI LOGGER] Error logging response:', error);
      // Don't fail the main operation if logging fails
    }
  }
  
  // Reset the timer for a new operation
  resetTimer(): void {
    this.startTime = Date.now();
  }
  
  // Set the function start time for total run time calculation
  setFunctionStartTime(startTime: number): void {
    this.functionStartTime = startTime;
  }
}
