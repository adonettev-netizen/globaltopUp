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

    if (!orderRef) {
      return new Response(JSON.stringify({ error: "Missing order reference" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = supabaseAdmin();

    const { data: order } = await supabase
      .from("orders")
      .select(`
        id, order_reference, access_token, customer_amount, customer_currency,
        payment_provider, payment_status,
        product:recharge_products(product_name),
        operator:operators(name)
      `)
      .eq("order_reference", orderRef)
      .maybeSingle();

    if (!order) {
      return new Response(JSON.stringify({ error: "Order not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (order.payment_status !== "pending_payment") {
      return Response.redirect(`${new URL(req.url).origin}/#/confirmation?ref=${orderRef}&token=${order.access_token}`, 302);
    }

    const siteUrl = Deno.env.get("SITE_URL") || new URL(req.url).origin;
    const productName = order.product?.product_name || "Mobile recharge";
    const amount = Number(order.customer_amount);
    const currency = order.customer_currency;

    if (order.payment_provider === "stripe") {
      const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
      if (!stripeKey) {
        return new Response(JSON.stringify({ error: "Stripe not configured" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const stripe = await import("npm:stripe@16.10.0");
      const stripeInstance = stripe.default(stripeKey);

      const session = await stripeInstance.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [{
          price_data: {
            currency: currency.toLowerCase(),
            product_data: { name: `Mobile recharge: ${productName}` },
            unit_amount: Math.round(amount * 100),
          },
          quantity: 1,
        }],
        mode: "payment",
        success_url: `${siteUrl}/#/confirmation?ref=${orderRef}&token=${order.access_token}`,
        cancel_url: `${siteUrl}/#/track?ref=${orderRef}`,
        metadata: { order_reference: orderRef },
      });

      return Response.redirect(session.url, 302);
    }

    if (order.payment_provider === "mercado_pago") {
      const mpToken = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN");
      if (!mpToken) {
        return new Response(JSON.stringify({ error: "Mercado Pago not configured" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const mpRes = await fetch("https://api.mercadopago.com/checkout/preferences", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${mpToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          items: [{
            id: orderRef,
            title: `Recarga: ${productName}`,
            quantity: 1,
            unit_price: amount,
            currency_id: "BRL",
          }],
          external_reference: orderRef,
          back_urls: {
            success: `${siteUrl}/#/confirmation?ref=${orderRef}&token=${order.access_token}`,
            failure: `${siteUrl}/#/track?ref=${orderRef}`,
            pending: `${siteUrl}/#/confirmation?ref=${orderRef}&token=${order.access_token}`,
          },
          auto_return: "approved",
          metadata: { order_reference: orderRef },
        }),
      });

      if (!mpRes.ok) {
        const txt = await mpRes.text();
        return new Response(JSON.stringify({ error: `Mercado Pago error: ${txt}` }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const mpData = await mpRes.json();
      return Response.redirect(mpData.init_point || mpData.sandbox_init_point, 302);
    }

    return new Response(JSON.stringify({ error: "Unknown payment provider" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
