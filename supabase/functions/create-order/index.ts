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

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// In-memory rate cache
let cachedRates: Record<string, number> | null = null;
let cacheTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

async function fetchExchangeRates(): Promise<{ rates: Record<string, number>; timestamp: string }> {
  if (cachedRates && Date.now() - cacheTime < CACHE_TTL_MS) {
    return { rates: cachedRates!, timestamp: new Date().toISOString() };
  }

  try {
    const res = await fetch("https://open.er-api.com/v6/latest/BRL");
    if (res.ok) {
      const data = await res.json();
      if (data.rates) {
        cachedRates = { ...data.rates, BRL: 1 };
        cacheTime = Date.now();
        return { rates: cachedRates!, timestamp: data.time_last_update_utc || new Date().toISOString() };
      }
    }
  } catch (e) {
    console.error("Exchange rate fetch failed:", e.message);
  }

  // Fallback static rates
  const fallback = { BRL: 1, USD: 0.20, HTG: 13.5, EUR: 0.18 };
  cachedRates = fallback;
  cacheTime = Date.now();
  return { rates: fallback, timestamp: new Date().toISOString() };
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
        currency_id: "BRL",
      }],
      external_reference: orderRef,
      payment_methods: { installments: 1, default_payment_method_id: "pix" },
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
      amount_brl,
      payment_currency,
      payment_provider: requestedProvider,
      user_id,
    } = body;

    if (!recipient_phone || !country_id || !operator_id) {
      return new Response(JSON.stringify({ error: "Missing required fields: recipient_phone, country_id, operator_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = supabaseAdmin();

    // Validate minimum amount
    const { data: minConfig } = await supabase
      .from("pricing_config")
      .select("value")
      .eq("key", "minimum_recharge_brl")
      .maybeSingle();
    const minAmount = minConfig ? parseFloat(minConfig.value) : 10.0;

    const { data: maxConfig } = await supabase
      .from("pricing_config")
      .select("value")
      .eq("key", "maximum_recharge_brl")
      .maybeSingle();
    const maxAmount = maxConfig ? parseFloat(maxConfig.value) : 500.0;

    const brlAmount = parseFloat(amount_brl);
    if (!brlAmount || brlAmount < minAmount) {
      return new Response(JSON.stringify({ error: `Minimum recharge amount is R$ ${minAmount.toFixed(2)}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (brlAmount > maxAmount) {
      return new Response(JSON.stringify({ error: `Maximum recharge amount is R$ ${maxAmount.toFixed(2)}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load products for this operator
    const { data: products, error: prodErr } = await supabase
      .from("recharge_products")
      .select("id, ding_product_code, product_name, local_amount, local_currency, wholesale_cost, is_active")
      .eq("operator_id", operator_id)
      .eq("is_active", true)
      .order("local_amount", { ascending: true });

    if (prodErr || !products || products.length === 0) {
      return new Response(JSON.stringify({ error: "No recharge products available for this operator" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const destinationCurrency = products[0].local_currency;

    // Fetch exchange rates
    const { rates, timestamp: rateTimestamp } = await fetchExchangeRates();
    const brlToDestRate = rates[destinationCurrency] || 1;
    const destAmount = round2(brlAmount * brlToDestRate);

    // Find closest matching product
    let matchedProduct: any = null;
    let bestDiff = Infinity;

    for (const p of products) {
      const diff = Math.abs(p.local_amount - destAmount);
      if (diff < bestDiff) {
        bestDiff = diff;
        matchedProduct = p;
      }
    }

    if (!matchedProduct) {
      return new Response(JSON.stringify({ error: "No matching product found for the requested amount" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify the matched product belongs to the correct operator and country
    const { data: productVerify, error: productErr } = await supabase
      .from("recharge_products")
      .select(`
        id, ding_product_code, product_name, local_amount, local_currency, wholesale_cost,
        operator:operators!inner(id, name, country_id, country:countries!inner(name, iso_code, calling_code, flag))
      `)
      .eq("id", matchedProduct.id)
      .eq("is_active", true)
      .maybeSingle();

    if (productErr || !productVerify) {
      return new Response(JSON.stringify({ error: "Invalid or unavailable recharge product" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (productVerify.operator.id !== operator_id) {
      return new Response(JSON.stringify({ error: "Product does not match the selected operator" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Determine payment provider — BRL always uses Mercado Pago (PIX)
    const validProviders = ["stripe", "mercado_pago"];
    let provider: "stripe" | "mercado_pago";
    if (requestedProvider && validProviders.includes(requestedProvider)) {
      provider = requestedProvider as "stripe" | "mercado_pago";
    } else {
      provider = "mercado_pago";
    }

    // Always charge in BRL (base currency)
    const checkoutCurrency = "BRL";

    // Compute customer price server-side
    const { data: priceData, error: priceErr } = await supabase.rpc("compute_customer_price", {
      p_product_id: matchedProduct.id,
      p_currency: "BRL",
    });

    if (priceErr || priceData === null) {
      return new Response(JSON.stringify({ error: "Failed to compute price" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const customerAmount = Number(priceData);
    const providerCost = matchedProduct.wholesale_cost || matchedProduct.local_amount;

    // Get margin for storage
    const { data: marginConfig } = await supabase
      .from("pricing_config")
      .select("value")
      .eq("key", "profit_margin_percent")
      .maybeSingle();
    const margin = marginConfig ? parseFloat(marginConfig.value) : 8;

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

    // Create the order with full pricing snapshot
    const insertPayload: any = {
      order_reference: orderRef,
      recipient_phone,
      country_id,
      operator_id: productVerify.operator.id,
      product_id: matchedProduct.id,
      customer_amount: customerAmount,
      customer_currency: checkoutCurrency,
      base_amount_brl: brlAmount,
      exchange_rate: brlToDestRate,
      exchange_rate_timestamp: rateTimestamp,
      destination_amount: matchedProduct.local_amount,
      destination_currency: destinationCurrency,
      provider_cost: providerCost,
      profit_margin_percent: margin,
      service_fee: 0,
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
      currency: checkoutCurrency,
      status: "pending",
    });

    // Create checkout session
    let checkoutUrl: string | null = null;
    let checkoutError: string | null = null;

    if (provider === "stripe") {
      const result = await createStripeCheckoutSession(
        orderRef, order.access_token, customerAmount, "BRL", matchedProduct.product_name, recipient_phone,
      );
      if ("url" in result) {
        checkoutUrl = result.url;
      } else {
        checkoutError = result.error;
      }
    } else if (provider === "mercado_pago") {
      const result = await createMercadoPagoPreference(
        orderRef, order.access_token, customerAmount, matchedProduct.product_name, recipient_phone,
      );
      if ("url" in result) {
        checkoutUrl = result.url;
      } else {
        checkoutError = result.error;
      }
    }

    return new Response(JSON.stringify({
      success: true,
      order: {
        id: order.id,
        order_reference: order.order_reference,
        access_token: order.access_token,
        recipient_phone,
        customer_amount: customerAmount,
        customer_currency: checkoutCurrency,
        payment_provider: provider,
        payment_status: order.payment_status,
        recharge_status: order.recharge_status,
      },
      checkout_url: checkoutUrl,
      checkout_error: checkoutError,
      product: {
        id: matchedProduct.id,
        product_name: matchedProduct.product_name,
        local_amount: matchedProduct.local_amount,
        local_currency: matchedProduct.local_currency,
      },
      operator: {
        id: productVerify.operator.id,
        name: productVerify.operator.name,
      },
      country: productVerify.operator.country,
      pricing: {
        base_amount_brl: brlAmount,
        exchange_rate: brlToDestRate,
        exchange_rate_timestamp: rateTimestamp,
        destination_amount: matchedProduct.local_amount,
        destination_currency: destinationCurrency,
      },
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
