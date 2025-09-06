import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://13d0c9c0-7ea7-406e-82ca-eb239ce2af54.sandbox.lovable.dev",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const creditPackages = [
  { id: "100-credits", name: "100 Credits", credits: 100, price: 10000 }, // $100.00 AUD
  { id: "500-credits", name: "500 Credits", credits: 500, price: 50000 }, // $500.00 AUD
  { id: "1000-credits", name: "1,000 Credits", credits: 1000, price: 100000 }, // $1,000.00 AUD
];

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Create Supabase client using the anon key for user authentication
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    // Retrieve authenticated user
    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data } = await supabaseClient.auth.getUser(token);
    const user = data.user;
    if (!user?.email) throw new Error("User not authenticated or email not available");

    // Get request body
    const body = await req.json();
    const { packageId, customCredits } = body;

    let creditPackage;
    
    if (packageId === "custom-credits") {
      // Handle custom credit amount
      if (!customCredits || customCredits < 1 || customCredits > 50000) {
        throw new Error("Custom credit amount must be between 1 and 50,000 credits");
      }
      
      // Calculate tiered pricing
      let totalPrice = 0;
      
      if (customCredits <= 1000) {
        // Tier 1: $1.00 per credit
        totalPrice = customCredits * 100;
      } else if (customCredits <= 10000) {
        // Tier 2: $1000 + $0.50 per credit above 1000
        totalPrice = 100000 + ((customCredits - 1000) * 50);
      } else {
        // Tier 3: $5500 + $0.25 per credit above 10000
        totalPrice = 550000 + ((customCredits - 10000) * 25);
      }
      
      creditPackage = {
        id: "custom-credits",
        name: `${customCredits} Custom Credits`,
        credits: customCredits,
        price: totalPrice, // Calculated tiered pricing in cents
      };
    } else {
      // Find the predefined credit package
      creditPackage = creditPackages.find(pkg => pkg.id === packageId);
      if (!creditPackage) {
        throw new Error("Invalid credit package selected");
      }
    }

    // Initialize Stripe
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2023-10-16",
    });

    // Check if a Stripe customer record exists for this user
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    let customerId;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
    }

    // Create a one-time payment session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : user.email,
      line_items: [
        {
          price_data: {
            currency: "aud",
            product_data: { 
              name: creditPackage.name,
              description: `Purchase ${creditPackage.credits} credits for comment scanning`
            },
            unit_amount: creditPackage.price,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      locale: "auto",
      success_url: `https://13d0c9c0-7ea7-406e-82ca-eb239ce2af54.sandbox.lovable.dev/dashboard?payment=success&credits=${creditPackage.credits}`,
      cancel_url: `https://13d0c9c0-7ea7-406e-82ca-eb239ce2af54.sandbox.lovable.dev/dashboard?payment=cancelled`,
      metadata: {
        user_id: user.id,
        credits: creditPackage.credits.toString(),
        package_id: packageId,
      },
    });

    console.log(`Created AUD payment session for user ${user.id}: ${session.id}, amount: ${creditPackage.price} cents AUD`);

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("Payment creation error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});