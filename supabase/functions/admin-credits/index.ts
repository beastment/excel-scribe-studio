import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://13d0c9c0-7ea7-406e-82ca-eb239ce2af54.sandbox.lovable.dev",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CreditAdjustmentRequest {
  userId: string;
  credits: number;
  action: 'add' | 'subtract';
}

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

    // Check if user is admin
    const { data: isAdmin } = await supabaseClient.rpc('is_admin', { user_uuid: user.id });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 403,
      });
    }

    // Get request body
    const { userId, credits, action }: CreditAdjustmentRequest = await req.json();

    if (!userId || !credits || !action) {
      return new Response(JSON.stringify({ error: "Missing required fields: userId, credits, action" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    if (credits <= 0) {
      return new Response(JSON.stringify({ error: "Credits must be a positive number" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    if (!['add', 'subtract'].includes(action)) {
      return new Response(JSON.stringify({ error: "Action must be 'add' or 'subtract'" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    // Create service role client for admin operations
    const supabaseService = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    let result;
    if (action === 'add') {
      // Add credits using the existing function
      const { data, error } = await supabaseService.rpc('add_user_credits', {
        user_uuid: userId,
        credits_to_add: credits
      });
      
      if (error) {
        console.error("Error adding credits:", error);
        throw new Error("Failed to add credits");
      }
      result = { success: true, action: 'added', credits, userId };
    } else {
      // Subtract credits using the existing function
      const { data, error } = await supabaseService.rpc('deduct_user_credits', {
        user_uuid: userId,
        credits_to_deduct: credits,
        scan_run_id: `admin-adjustment-${Date.now()}`,
        comments_scanned: 0,
        scan_type: 'admin_adjustment'
      });
      
      if (error) {
        console.error("Error deducting credits:", error);
        throw new Error("Failed to deduct credits");
      }
      
      if (!data) {
        return new Response(JSON.stringify({ error: "Insufficient credits to deduct" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        });
      }
      result = { success: true, action: 'subtracted', credits, userId };
    }

    console.log(`Admin ${user.id} ${action}ed ${credits} credits for user ${userId}`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("Admin credit adjustment error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});