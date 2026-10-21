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

async function getDingApiKey(): Promise<string> {
  const envKey = Deno.env.get("DINGCONNECT_API_KEY");
  if (envKey) return envKey;

  const { createClient } = await import("npm:@supabase/supabase-js@2.57.4");
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data } = await supabase
    .from("api_credentials")
    .select("key_value")
    .eq("provider", "dingconnect")
    .eq("key_name", "api_key")
    .eq("is_active", true)
    .maybeSingle();

  if (!data) return "";
  return data.key_value;
}

async function isUatMode(supabase: any): Promise<boolean> {
  const { data } = await supabase
    .from("pricing_config")
    .select("value")
    .eq("key", "ding_uat_mode")
    .maybeSingle();
  return data?.value === "true";
}

async function submitRecharge(supabase: any, order: any): Promise<{ success: boolean; transactionId: string | null; error: string | null }> {
  const apiKey = await getDingApiKey();

  if (!apiKey) {
    return { success: false, transactionId: null, error: "DingConnect API key not configured — recharge cannot be submitted" };
  }

  try {
    const { data: product } = await supabase
      .from("recharge_products")
      .select("ding_product_code")
      .eq("id", order.product_id)
      .maybeSingle();

    if (!product) {
      return { success: false, transactionId: null, error: "Product not found for recharge" };
    }

    const { data: provider } = await supabase
      .from("operators")
      .select("ding_operator_code, uat_phone_number")
      .eq("id", order.operator_id)
      .maybeSingle();

    if (!provider) {
      return { success: false, transactionId: null, error: "Provider not found for recharge" };
    }

    const uatMode = await isUatMode(supabase);
    const beneficiaryNumber = uatMode && provider.uat_phone_number
      ? provider.uat_phone_number
      : order.recipient_phone;

    const transferRes = await fetch("https://api.dingconnect.com/api/V1/SendTransfer", {
      method: "POST",
      headers: {
        "api_key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ProductCode: product.ding_product_code,
        SendAmount: null,
        BeneficiaryAccountNumber: beneficiaryNumber,
        ProviderCode: provider.ding_operator_code,
        ExternalRef: order.order_reference,
      }),
    });

    if (!transferRes.ok) {
      const txt = await transferRes.text();
      return { success: false, transactionId: null, error: `Recharge submission failed (${transferRes.status}): ${txt}` };
    }

    const transferData = await transferRes.json();
    const txnId = transferData.TransferRecordNo || transferData.transferRecordNo || transferData.TransactionId || null;

    return { success: true, transactionId: txnId, error: null };
  } catch (e) {
    return { success: false, transactionId: null, error: e.message };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const sig = req.headers.get("stripe-signature");
    const endpointSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

    if (!endpointSecret) {
      return new Response(JSON.stringify({ error: "Stripe webhook secret not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rawBody = await req.text();

    // Verify Stripe signature
    let event: any;
    try {
      const stripe = await import("npm:stripe@16.10.0");
      const stripeInstance = stripe.default(Deno.env.get("STRIPE_SECRET_KEY") || "");
      event = await stripeInstance.webhooks.constructEventAsync(
        rawBody,
        sig || "",
        endpointSecret,
      );
    } catch (e) {
      return new Response(JSON.stringify({ error: `Webhook signature verification failed: ${e.message}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = supabaseAdmin();

    // Idempotency: check if event already processed
    const { data: existing } = await supabase
      .from("webhook_events")
      .select("id")
      .eq("provider", "stripe")
      .eq("event_id", event.id)
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({ received: true, duplicate: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Record event
    await supabase.from("webhook_events").insert({
      provider: "stripe",
      event_id: event.id,
      processing_status: "processed",
    });

    // Handle checkout.session.completed
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const orderRef = session.metadata?.order_reference;

      if (!orderRef) {
        return new Response(JSON.stringify({ received: true, note: "No order reference in metadata" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: order } = await supabase
        .from("orders")
        .select("id, order_reference, product_id, operator_id, recipient_phone, payment_status, recharge_status")
        .eq("order_reference", orderRef)
        .maybeSingle();

      if (!order) {
        return new Response(JSON.stringify({ received: true, note: "Order not found" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Only proceed if payment is not already confirmed (idempotent)
      if (order.payment_status !== "payment_confirmed") {
        await supabase
          .from("orders")
          .update({ payment_status: "payment_confirmed", recharge_status: "processing" })
          .eq("id", order.id);

        // Update payment record
        await supabase
          .from("payments")
          .update({ status: "succeeded", provider_payment_id: session.payment_intent || session.id, updated_at: new Date().toISOString() })
          .eq("order_id", order.id);

        // Submit recharge to DingConnect
        const rechargeResult = await submitRecharge(supabase, order);

        if (rechargeResult.success) {
          await supabase
            .from("orders")
            .update({
              recharge_status: "completed",
              provider_transaction_id: rechargeResult.transactionId,
            })
            .eq("id", order.id);
        } else {
          await supabase
            .from("orders")
            .update({
              recharge_status: "recharge_failed",
            })
            .eq("id", order.id);
          console.error("Recharge failed for order", orderRef, rechargeResult.error);
        }
      }
    }

    if (event.type === "charge.refunded") {
      const charge = event.data.object;
      const orderRef = charge.metadata?.order_reference;
      if (orderRef) {
        await supabase
          .from("orders")
          .update({ payment_status: "refunded", recharge_status: "recharge_failed" })
          .eq("order_reference", orderRef);
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
