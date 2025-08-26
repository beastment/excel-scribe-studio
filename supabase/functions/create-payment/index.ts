import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const creditPackages = [
  { id: "100-credits", name: "100 Credits", credits: 100, price: 10000 }, // $100.00
  { id: "500-credits", name: "500 Credits", credits: 500, price: 50000 }, // $500.00
  { id: "1000-credits", name: "1,000 Credits", credits: 1000, price: 100000 }, // $1,000.00
  { id: "3000-credits", name: "3,000 Credits", credits: 3000, price: 200000 }, // $2,000.00
  { id: "5000-credits", name: "5,000 Credits", credits: 5000, price: 300000 }, // $3,000.00
  { id: "10000-credits", name: "10,000 Credits", credits: 10000, price: 550000 }, // $5,500.00
  { id: "20000-credits", name: "20,000 Credits", credits: 20000, price: 800000 }, // $8,000.00
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
    const { packageId } = body;

    // Find the credit package
    const creditPackage = creditPackages.find(pkg => pkg.id === packageId);
    if (!creditPackage) {
      throw new Error("Invalid credit package selected");
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
      success_url: `${req.headers.get("origin")}/dashboard?payment=success&credits=${creditPackage.credits}`,
      cancel_url: `${req.headers.get("origin")}/dashboard?payment=cancelled`,
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