import { supabase } from '@/integrations/supabase/client';

/**
 * Rate limiting utilities for authentication
 */

interface RateLimitResponse {
  allowed: boolean;
  message?: string;
}

/**
 * Check if the current client is rate limited for authentication
 */
export async function checkAuthRateLimit(): Promise<RateLimitResponse> {
  try {
    const { data, error } = await supabase.functions.invoke('auth-rate-limit', {
      body: { action: 'check' }
    });

    if (error) {
      console.warn('Rate limit check failed:', error);
      return { allowed: true }; // Fail open for better user experience
    }

    return data;
  } catch (error) {
    console.warn('Rate limit check error:', error);
    return { allowed: true }; // Fail open
  }
}

/**
 * Record an authentication attempt for rate limiting
 */
export async function recordAuthAttempt(): Promise<void> {
  try {
    await supabase.functions.invoke('auth-rate-limit', {
      body: { action: 'record' }
    });
  } catch (error) {
    console.warn('Failed to record auth attempt:', error);
    // Don't throw - this is non-critical
  }
}

/**
 * Enhanced authentication wrapper with rate limiting
 */
export async function authenticateWithRateLimit<T>(
  authFunction: () => Promise<T>,
  operation: 'signin' | 'signup' = 'signin'
): Promise<T> {
  // Check rate limit before attempting authentication
  const rateLimitCheck = await checkAuthRateLimit();
  
  if (!rateLimitCheck.allowed) {
    throw new Error(rateLimitCheck.message || 'Rate limit exceeded');
  }

  // Record the attempt
  await recordAuthAttempt();

  // Perform the authentication
  return await authFunction();
}