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
    return { success: false, transactionId: null, error: "DingConnect API key not configured" };
  }

  try {
    const { data: product } = await supabase
      .from("recharge_products")
      .select("ding_product_code")
      .eq("id", order.product_id)
      .maybeSingle();
    if (!product) return { success: false, transactionId: null, error: "Product not found" };

    const { data: provider } = await supabase
      .from("operators")
      .select("ding_operator_code, uat_phone_number")
      .eq("id", order.operator_id)
      .maybeSingle();
    if (!provider) return { success: false, transactionId: null, error: "Provider not found" };

    const uatMode = await isUatMode(supabase);
    const beneficiaryNumber = uatMode && provider.uat_phone_number
      ? provider.uat_phone_number
      : order.recipient_phone;

    const transferRes = await fetch("https://api.dingconnect.com/api/V1/SendTransfer", {
      method: "POST",
      headers: { "api_key": apiKey, "Content-Type": "application/json" },
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
      return { success: false, transactionId: null, error: `Recharge failed (${transferRes.status}): ${txt}` };
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
    const supabase = supabaseAdmin();
    const rawBody = await req.text();
    let body: any;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mercado Pago webhook verification: check x-signature header against webhook secret
    // Mercado Pago sends: x-signature header = "ts=<timestamp>,v1=<hash>"
    // The hash is HMAC-SHA256 of "<data.id>.<ts>" using the webhook secret as key.
    const signature = req.headers.get("x-signature") || "";
    const requestId = req.headers.get("x-request-id") || "";
    const webhookSecret = Deno.env.get("MERCADO_PAGO_WEBHOOK_SECRET");

    // Extract resource ID and timestamp
    let dataId = body?.data?.id || body?.id || "";
    let ts = "";
    const sigParts = signature.split(",");
    for (const part of sigParts) {
      const [key, val] = part.split("=");
      if (key === "ts") ts = val;
    }

    // Verify signature if secret configured
    if (webhookSecret && ts && dataId) {
      const manifest = `${dataId}${ts}`;
      const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(webhookSecret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );
      const signatureBytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(manifest));
      const expectedHash = Array.from(new Uint8Array(signatureBytes))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      const providedHash = sigParts.find((p) => p.startsWith("v1="))?.split("=")[1] || "";

      if (providedHash !== expectedHash) {
        console.error("Mercado Pago webhook signature mismatch");
        return new Response(JSON.stringify({ error: "Invalid signature" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const eventId = body?.id || requestId || crypto.randomUUID();
    const eventType = body?.type || body?.topic || body?.event || "unknown";

    // Idempotency
    const { data: existing } = await supabase
      .from("webhook_events")
      .select("id")
      .eq("provider", "mercado_pago")
      .eq("event_id", String(eventId))
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({ received: true, duplicate: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase.from("webhook_events").insert({
      provider: "mercado_pago",
      event_id: String(eventId),
      processing_status: "processed",
    });

    // Handle payment approved
    const action = body?.action || eventType;
    const paymentId = body?.data?.id || body?.resource?.id;

    if (action === "payment.updated" || action === "payment.created" || eventType === "payment" || eventType === "merchant_order") {
      if (!paymentId) {
        return new Response(JSON.stringify({ received: true, note: "No payment ID" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Fetch payment details from Mercado Pago API to verify status
      const mpToken = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN");
      if (!mpToken) {
        return new Response(JSON.stringify({ received: true, note: "MP token not configured" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: { Authorization: `Bearer ${mpToken}` },
      });

      if (!mpRes.ok) {
        return new Response(JSON.stringify({ received: true, note: "Failed to fetch payment from MP" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const payment = await mpRes.json();
      const orderRef = payment.metadata?.order_reference || payment.external_reference;

      if (!orderRef) {
        return new Response(JSON.stringify({ received: true, note: "No order reference in payment metadata" }), {
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

      // Only proceed if payment is approved and order not already confirmed
      if (payment.status === "approved" && order.payment_status !== "payment_confirmed") {
        await supabase
          .from("orders")
          .update({ payment_status: "payment_confirmed", recharge_status: "processing" })
          .eq("id", order.id);

        await supabase
          .from("payments")
          .update({ status: "succeeded", provider_payment_id: String(paymentId), updated_at: new Date().toISOString() })
          .eq("order_id", order.id);

        const rechargeResult = await submitRecharge(supabase, order);
        if (rechargeResult.success) {
          await supabase
            .from("orders")
            .update({ recharge_status: "completed", provider_transaction_id: rechargeResult.transactionId })
            .eq("id", order.id);
        } else {
          await supabase
            .from("orders")
            .update({ recharge_status: "recharge_failed" })
            .eq("id", order.id);
          console.error("Recharge failed for", orderRef, rechargeResult.error);
        }
      } else if (payment.status === "cancelled" || payment.status === "rejected") {
        await supabase
          .from("orders")
          .update({ payment_status: "payment_failed" })
          .eq("id", order.id);
        await supabase
          .from("payments")
          .update({ status: "failed", provider_payment_id: String(paymentId), updated_at: new Date().toISOString() })
          .eq("order_id", order.id);
      } else if (payment.status === "refunded") {
        await supabase
          .from("orders")
          .update({ payment_status: "refunded", recharge_status: "recharge_failed" })
          .eq("id", order.id);
        await supabase
          .from("payments")
          .update({ status: "refunded" })
          .eq("order_id", order.id);
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
