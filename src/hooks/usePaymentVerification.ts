import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export const usePaymentVerification = (onCreditsUpdated?: () => void) => {
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    const verifyPayment = async () => {
      const payment = searchParams.get('payment');
      const sessionId = searchParams.get('session_id');
      const credits = searchParams.get('credits');

      if (payment === 'success' && sessionId) {
        try {
          const { data, error } = await supabase.functions.invoke('verify-payment', {
            body: { sessionId }
          });

          if (error) throw error;

          if (data.success) {
            toast.success(`Payment successful! ${data.credits_added} credits added to your account.`);
            onCreditsUpdated?.();
          } else {
            toast.error('Payment verification failed. Please contact support.');
          }
        } catch (error) {
          console.error('Payment verification error:', error);
          toast.error('Failed to verify payment. Please contact support.');
        }

        // Clean up URL parameters
        searchParams.delete('payment');
        searchParams.delete('session_id');
        searchParams.delete('credits');
        setSearchParams(searchParams, { replace: true });
      } else if (payment === 'cancelled') {
        toast.error('Payment was cancelled.');
        
        // Clean up URL parameters
        searchParams.delete('payment');
        setSearchParams(searchParams, { replace: true });
      }
    };

    verifyPayment();
  }, [searchParams, setSearchParams, onCreditsUpdated]);
};