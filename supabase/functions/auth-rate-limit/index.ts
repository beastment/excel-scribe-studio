import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Rate limiting configuration
const RATE_LIMIT_CONFIG = {
  // Max attempts per IP per time window
  maxAttempts: 5,
  // Time window in minutes
  windowMinutes: 15,
  // Lockout duration in minutes after max attempts
  lockoutMinutes: 30,
};

interface RateLimitRecord {
  ip: string;
  attempts: number;
  firstAttempt: string;
  isLocked: boolean;
  lockoutUntil?: string;
}

serve(async (req) => {
  // Restricted CORS headers for security
  const corsHeaders = {
    'Access-Control-Allow-Origin': 'https://13d0c9c0-7ea7-406e-82ca-eb239ce2af54.sandbox.lovable.dev',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400'
  };

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Get client IP with improved validation
    const forwardedFor = req.headers.get('x-forwarded-for');
    const realIP = req.headers.get('x-real-ip');
    
    let clientIP = '127.0.0.1'; // Default fallback
    
    if (forwardedFor) {
      // Take the first IP and validate it's not private/local
      const ips = forwardedFor.split(',').map(ip => ip.trim());
      const firstIP = ips[0];
      
      // Basic IP validation and reject private ranges
      if (firstIP && !isPrivateIP(firstIP)) {
        clientIP = firstIP;
      }
    } else if (realIP && !isPrivateIP(realIP)) {
      clientIP = realIP;
    }
    
    // Additional fingerprinting with user agent to prevent simple bypass
    const userAgent = req.headers.get('user-agent') || 'unknown';
    const fingerprint = `${clientIP}:${userAgent.substring(0, 50)}`;

    // Initialize Supabase client for storing rate limit data
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { action } = await req.json();

    if (action === 'check') {
      // Check if fingerprint is rate limited
      const isLimited = await checkRateLimit(supabase, fingerprint);
      
      return new Response(
        JSON.stringify({ 
          allowed: !isLimited,
          message: isLimited ? 'Rate limit exceeded. Please try again later.' : 'Request allowed'
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: isLimited ? 429 : 200,
        }
      );
    }

    if (action === 'record') {
      // Record an authentication attempt
      await recordAttempt(supabase, fingerprint);
      
      return new Response(
        JSON.stringify({ success: true }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );

  } catch (error) {
    console.error('Rate limit error:', error);
    
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});

function isPrivateIP(ip: string): boolean {
  // Check for private IP ranges (IPv4)
  const privateRanges = [
    /^10\./,                    // 10.0.0.0/8
    /^172\.(1[6-9]|2[0-9]|3[01])\./, // 172.16.0.0/12  
    /^192\.168\./,             // 192.168.0.0/16
    /^127\./,                  // 127.0.0.0/8 (localhost)
    /^169\.254\./,             // 169.254.0.0/16 (link-local)
    /^::1$/,                   // IPv6 localhost
    /^fc00:/,                  // IPv6 private
    /^fe80:/                   // IPv6 link-local
  ];
  
  return privateRanges.some(range => range.test(ip));
}

async function checkRateLimit(supabase: any, fingerprint: string): Promise<boolean> {
  try {
    // Get rate limit record for this fingerprint
    const { data: record } = await supabase
      .from('auth_rate_limits')
      .select('*')
      .eq('ip', fingerprint)
      .single();

    if (!record) {
      return false; // No record, allow request
    }

    const now = new Date();
    const lockoutUntil = record.lockout_until ? new Date(record.lockout_until) : null;

    // Check if still in lockout period
    if (lockoutUntil && now < lockoutUntil) {
      return true; // Still locked out
    }

    // Check if window has expired
    const firstAttempt = new Date(record.first_attempt);
    const windowExpired = (now.getTime() - firstAttempt.getTime()) > (RATE_LIMIT_CONFIG.windowMinutes * 60 * 1000);

    if (windowExpired) {
      // Reset the record
      await supabase
        .from('auth_rate_limits')
        .update({
          attempts: 0,
          first_attempt: now.toISOString(),
          is_locked: false,
          lockout_until: null,
        })
        .eq('ip', fingerprint);
      
      return false;
    }

    // Check if exceeded max attempts
    return record.attempts >= RATE_LIMIT_CONFIG.maxAttempts;

  } catch (error) {
    console.error('Error checking rate limit:', error);
    return false; // On error, allow request (fail open)
  }
}

async function recordAttempt(supabase: any, fingerprint: string): Promise<void> {
  try {
    const now = new Date();

    // Try to get existing record
    const { data: existingRecord } = await supabase
      .from('auth_rate_limits')
      .select('*')
      .eq('ip', fingerprint)
      .single();

    if (!existingRecord) {
      // Create new record
      await supabase
        .from('auth_rate_limits')
        .insert({
          ip: fingerprint,
          attempts: 1,
          first_attempt: now.toISOString(),
          is_locked: false,
        });
      return;
    }

    const firstAttempt = new Date(existingRecord.first_attempt);
    const windowExpired = (now.getTime() - firstAttempt.getTime()) > (RATE_LIMIT_CONFIG.windowMinutes * 60 * 1000);

    if (windowExpired) {
      // Reset window
      await supabase
        .from('auth_rate_limits')
        .update({
          attempts: 1,
          first_attempt: now.toISOString(),
          is_locked: false,
          lockout_until: null,
        })
        .eq('ip', fingerprint);
    } else {
      // Increment attempts
      const newAttempts = existingRecord.attempts + 1;
      const shouldLock = newAttempts >= RATE_LIMIT_CONFIG.maxAttempts;
      const lockoutUntil = shouldLock 
        ? new Date(now.getTime() + (RATE_LIMIT_CONFIG.lockoutMinutes * 60 * 1000)).toISOString()
        : null;

      await supabase
        .from('auth_rate_limits')
        .update({
          attempts: newAttempts,
          is_locked: shouldLock,
          lockout_until: lockoutUntil,
        })
        .eq('ip', fingerprint);
    }

  } catch (error) {
    console.error('Error recording attempt:', error);
  }
}