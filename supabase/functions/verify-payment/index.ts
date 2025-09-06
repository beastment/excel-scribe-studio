import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://13d0c9c0-7ea7-406e-82ca-eb239ce2af54.sandbox.lovable.dev",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Create Supabase client for user authentication
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    // Get authenticated user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authorization header required" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid authentication token" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    // Get request body
    const body = await req.json();
    const { sessionId } = body;

    if (!sessionId) {
      throw new Error("Session ID is required");
    }

    // Create service role client for administrative operations
    const supabaseService = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Initialize Stripe
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2023-10-16",
    });

    // Retrieve the checkout session
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    
    if (session.payment_status !== "paid") {
      return new Response(JSON.stringify({ success: false, message: "Payment not completed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    // Extract metadata
    const userId = session.metadata?.user_id;
    const credits = parseInt(session.metadata?.credits || "0");

    if (!userId || !credits) {
      throw new Error("Invalid session metadata");
    }

    // Validate that the authenticated user matches the payment user
    if (userId !== user.id) {
      return new Response(JSON.stringify({ error: "Payment user mismatch" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 403,
      });
    }

    // Check for idempotency - has this payment already been processed?
    const { data: existingPayment } = await supabaseService
      .from('payments_processed')
      .select('*')
      .eq('session_id', sessionId)
      .single();

    if (existingPayment) {
      return new Response(JSON.stringify({ 
        success: false, 
        message: "Payment already processed",
        credits_added: existingPayment.credits_added
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Record payment as processed first (for idempotency)
    const { error: recordError } = await supabaseService
      .from('payments_processed')
      .insert({
        session_id: sessionId,
        user_id: userId,
        credits_added: credits
      });

    if (recordError) {
      console.error("Error recording payment:", recordError);
      throw new Error("Failed to record payment");
    }

    // Add credits to user account using RPC function
    const { data, error } = await supabaseService.rpc('add_user_credits', {
      user_uuid: userId,
      credits_to_add: credits
    });

    if (error) {
      console.error("Error adding credits:", error);
      throw new Error("Failed to add credits to account");
    }

    console.log(`Successfully added ${credits} credits to user ${userId}`);

    return new Response(JSON.stringify({ 
      success: true, 
      credits_added: credits,
      message: `Successfully added ${credits} credits to your account`
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("Payment verification error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});