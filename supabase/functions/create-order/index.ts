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

function genRef(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let ref = "GTU-";
  for (let i = 0; i < 8; i++) {
    ref += chars[Math.floor(Math.random() * chars.length)];
  }
  return ref;
}

async function createStripeCheckoutSession(
  orderRef: string,
  accessToken: string,
  amount: number,
  currency: string,
  productName: string,
  recipientPhone: string,
): Promise<{ url: string } | { error: string }> {
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeKey) return { error: "Stripe secret key not configured" };

  const stripe = await import("npm:stripe@16.10.0");
  const stripeInstance = stripe.default(stripeKey);

  const siteUrl = Deno.env.get("SITE_URL") || "https://dacvrbiidzzeuusrgnww.supabase.co";

  try {
    const session = await stripeInstance.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [{
        price_data: {
          currency: currency.toLowerCase(),
          product_data: { name: `Mobile recharge: ${productName} → ${recipientPhone}` },
          unit_amount: Math.round(amount * 100),
        },
        quantity: 1,
      }],
      mode: "payment",
      success_url: `${siteUrl}/#/confirmation?ref=${orderRef}&token=${accessToken}`,
      cancel_url: `${siteUrl}/#/track?ref=${orderRef}`,
      metadata: { order_reference: orderRef },
    });
    return { url: session.url };
  } catch (e: any) {
    return { error: e.message };
  }
}

async function createMercadoPagoPreference(
  orderRef: string,
  accessToken: string,
  amount: number,
  currency: string,
  productName: string,
  recipientPhone: string,
): Promise<{ url: string } | { error: string }> {
  const mpToken = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN");
  if (!mpToken) return { error: "Mercado Pago access token not configured" };

  const siteUrl = Deno.env.get("SITE_URL") || "https://dacvrbiidzzeuusrgnww.supabase.co";

  try {
    const body: any = {
      items: [{
        id: orderRef,
        title: `Recarga: ${productName} → ${recipientPhone}`,
        quantity: 1,
        unit_price: amount,
        currency_id: currency === "BRL" ? "BRL" : "USD",
      }],
      external_reference: orderRef,
      payment_methods: currency === "BRL"
        ? { installments: 1, default_payment_method_id: "pix" }
        : undefined,
      back_urls: {
        success: `${siteUrl}/#/confirmation?ref=${orderRef}&token=${accessToken}`,
        failure: `${siteUrl}/#/track?ref=${orderRef}`,
        pending: `${siteUrl}/#/confirmation?ref=${orderRef}&token=${accessToken}`,
      },
      auto_return: "approved",
      metadata: { order_reference: orderRef },
    };

    const res = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${mpToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const txt = await res.text();
      return { error: `Mercado Pago preference failed (${res.status}): ${txt}` };
    }

    const data = await res.json();
    return { url: data.init_point || data.sandbox_init_point };
  } catch (e: any) {
    return { error: e.message };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const {
      recipient_phone,
      country_id,
      operator_id,
      product_id,
      payment_currency,
      payment_provider: requestedProvider,
      user_id,
    } = body;

    // Validate required fields
    if (!recipient_phone || !country_id || !product_id) {
      return new Response(JSON.stringify({ error: "Missing required fields: recipient_phone, country_id, product_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = supabaseAdmin();

    // Verify the product exists and belongs to the given operator/country
    const { data: product, error: productErr } = await supabase
      .from("recharge_products")
      .select(`
        id,
        ding_product_code,
        product_name,
        local_amount,
        local_currency,
        wholesale_cost,
        is_active,
        operator:operators!inner(
          id,
          name,
          country_id,
          country:countries!inner(name, iso_code, calling_code, flag)
        )
      `)
      .eq("id", product_id)
      .eq("is_active", true)
      .maybeSingle();

    if (productErr || !product) {
      return new Response(JSON.stringify({ error: "Invalid or unavailable recharge product" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (operator_id && product.operator.id !== operator_id) {
      return new Response(JSON.stringify({ error: "Product does not match the selected operator" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Determine payment provider — client can request a specific one,
    // otherwise default based on currency/market
    const requestedCurrency = (payment_currency || "USD").toUpperCase();
    const validProviders = ["stripe", "mercado_pago"];
    let provider: "stripe" | "mercado_pago";
    if (requestedProvider && validProviders.includes(requestedProvider)) {
      provider = requestedProvider as "stripe" | "mercado_pago";
    } else if (requestedCurrency === "BRL") {
      provider = "mercado_pago";
    } else {
      provider = "stripe";
    }

    // Mercado Pago only supports BRL — always compute in BRL when that provider is selected
    const currency = provider === "mercado_pago" ? "BRL" : requestedCurrency;

    // Compute customer price server-side (never trust frontend amounts)
    const { data: priceData, error: priceErr } = await supabase.rpc("compute_customer_price", {
      p_product_id: product_id,
      p_currency: currency,
    });

    if (priceErr || priceData === null) {
      return new Response(JSON.stringify({ error: "Failed to compute price" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const customerAmount = Number(priceData);

    // Generate unique order reference
    let orderRef = genRef();
    let attempts = 0;
    while (attempts < 5) {
      const { data: existing } = await supabase
        .from("orders")
        .select("id")
        .eq("order_reference", orderRef)
        .maybeSingle();
      if (!existing) break;
      orderRef = genRef();
      attempts++;
    }

    // Create the order
    const insertPayload: any = {
      order_reference: orderRef,
      recipient_phone,
      country_id,
      operator_id: product.operator.id,
      product_id: product.id,
      customer_amount: customerAmount,
      customer_currency: currency,
      payment_provider: provider,
      payment_status: "pending_payment",
      recharge_status: "pending",
    };

    if (user_id) {
      insertPayload.user_id = user_id;
    }

    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .insert(insertPayload)
      .select()
      .single();

    if (orderErr || !order) {
      return new Response(JSON.stringify({ error: "Failed to create order", detail: orderErr?.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create initial payment record
    await supabase.from("payments").insert({
      order_id: order.id,
      provider,
      amount: customerAmount,
      currency,
      status: "pending",
    });

    // Create checkout session with the payment provider
    let checkoutUrl: string | null = null;
    let checkoutError: string | null = null;

    if (provider === "stripe") {
      const result = await createStripeCheckoutSession(
        orderRef, order.access_token, customerAmount, currency, product.product_name, recipient_phone,
      );
      if ("url" in result) {
        checkoutUrl = result.url;
      } else {
        checkoutError = result.error;
      }
    } else if (provider === "mercado_pago") {
      const result = await createMercadoPagoPreference(
        orderRef, order.access_token, customerAmount, currency, product.product_name, recipient_phone,
      );
      if ("url" in result) {
        checkoutUrl = result.url;
      } else {
        checkoutError = result.error;
      }
    }

    // Return order details + checkout URL for redirect
    return new Response(JSON.stringify({
      success: true,
      order: {
        id: order.id,
        order_reference: order.order_reference,
        access_token: order.access_token,
        recipient_phone,
        customer_amount: customerAmount,
        customer_currency: currency,
        payment_provider: provider,
        payment_status: order.payment_status,
        recharge_status: order.recharge_status,
      },
      checkout_url: checkoutUrl,
      checkout_error: checkoutError,
      product: {
        id: product.id,
        product_name: product.product_name,
        local_amount: product.local_amount,
        local_currency: product.local_currency,
      },
      operator: {
        id: product.operator.id,
        name: product.operator.name,
      },
      country: product.operator.country,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
