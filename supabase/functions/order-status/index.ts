import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function supabaseAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const orderRef = url.searchParams.get("ref");
    const accessToken = url.searchParams.get("token");

    if (!orderRef) {
      return new Response(JSON.stringify({ error: "Order reference is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = supabaseAdmin();

    const { data: order, error } = await supabase
      .from("orders")
      .select(`
        id,
        order_reference,
        access_token,
        user_id,
        recipient_phone,
        customer_amount,
        customer_currency,
        payment_provider,
        payment_status,
        recharge_status,
        provider_transaction_id,
        created_at,
        updated_at,
        country:countries(name, iso_code, calling_code, flag),
        operator:operators(name, logo_url),
        product:recharge_products(product_name, local_amount, local_currency),
        payments(id, provider, provider_payment_id, amount, currency, status, created_at)
      `)
      .eq("order_reference", orderRef)
      .maybeSingle();

    if (error || !order) {
      return new Response(JSON.stringify({ error: "Order not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // For guest orders (no user_id), require access token
    const isGuest = !(order as any).user_id;
    if (isGuest && accessToken && accessToken !== (order as any).access_token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ order }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
