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

interface Product {
  id: string;
  ding_product_code: string;
  product_name: string;
  local_amount: number;
  local_currency: string;
  wholesale_cost: number | null;
}

interface ExchangeRates {
  [currency: string]: number; // rate vs BRL (1 BRL = X currency)
  BRL: number; // always 1
  fetched_at: string;
}

// In-memory rate cache (per isolate)
let cachedRates: ExchangeRates | null = null;
let cacheTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function fetchExchangeRates(): Promise<ExchangeRates> {
  if (cachedRates && Date.now() - cacheTime < CACHE_TTL_MS) {
    return cachedRates;
  }

  // Try ExchangeRate-API (free, no key needed for open endpoint)
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/BRL");
    if (res.ok) {
      const data = await res.json();
      if (data.rates) {
        cachedRates = {
          ...data.rates,
          BRL: 1,
          fetched_at: data.time_last_update_utc || new Date().toISOString(),
        };
        cacheTime = Date.now();
        return cachedRates!;
      }
    }
  } catch (e) {
    console.error("Exchange rate fetch failed:", e.message);
  }

  // Fallback to static rates from pricing_config
  const supabase = supabaseAdmin();
  const { data: configRates } = await supabase
    .from("pricing_config")
    .select("key, value")
    .like("key", "exchange_rate_brl_%");

  const fallback: ExchangeRates = { BRL: 1, fetched_at: new Date().toISOString() };
  if (configRates) {
    for (const row of configRates) {
      const currency = row.key.replace("exchange_rate_brl_", "").toUpperCase();
      fallback[currency] = parseFloat(row.value);
    }
  }
  // Ensure common currencies have a fallback
  if (!fallback.USD) fallback.USD = 0.20;
  if (!fallback.HTG) fallback.HTG = 13.5;
  if (!fallback.EUR) fallback.EUR = 0.18;

  cachedRates = fallback;
  cacheTime = Date.now();
  return fallback;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const operatorId = url.searchParams.get("operator_id");
    const brlAmountStr = url.searchParams.get("amount_brl");
    const brlAmount = parseFloat(brlAmountStr || "0");

    if (!operatorId) {
      return new Response(JSON.stringify({ error: "operator_id is required" }), {
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

    if (brlAmount > 0 && brlAmount < minAmount) {
      return new Response(JSON.stringify({
        error: `Minimum recharge amount is R$ ${minAmount.toFixed(2)}`,
        minimum: minAmount,
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (brlAmount > 0 && brlAmount > maxAmount) {
      return new Response(JSON.stringify({
        error: `Maximum recharge amount is R$ ${maxAmount.toFixed(2)}`,
        maximum: maxAmount,
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load products for this operator
    const { data: products, error: prodErr } = await supabase
      .from("recharge_products")
      .select("id, ding_product_code, product_name, local_amount, local_currency, wholesale_cost")
      .eq("operator_id", operatorId)
      .eq("is_active", true)
      .order("local_amount", { ascending: true });

    if (prodErr || !products || products.length === 0) {
      return new Response(JSON.stringify({
        error: "No recharge products available for this operator",
        products: [],
      }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get destination currency from first product
    const destinationCurrency = products[0].local_currency;

    // Fetch exchange rates (BRL base)
    const rates = await fetchExchangeRates();
    const brlToDestRate = rates[destinationCurrency] || 1;

    // If no amount specified, just return product list with rates for display
    if (brlAmount <= 0) {
      return new Response(JSON.stringify({
        products: products.map((p: Product) => ({
          ...p,
          estimated_brl_cost: p.wholesale_cost
            ? round2(p.wholesale_cost / (rates["USD"] || 0.20))
            : round2(p.local_amount / brlToDestRate),
        })),
        destination_currency: destinationCurrency,
        exchange_rate_brl_to_dest: brlToDestRate,
        exchange_rate_timestamp: rates.fetched_at,
        minimum_brl: minAmount,
        maximum_brl: maxAmount,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Convert customer's BRL amount to destination currency
    const destAmount = round2(brlAmount * brlToDestRate);

    // Find the closest matching product by local_amount
    // Strategy: find the product whose local_amount is closest to the converted amount
    let bestProduct: Product | null = null;
    let bestDiff = Infinity;
    const alternatives: Product[] = [];

    for (const p of products as Product[]) {
      const diff = Math.abs(p.local_amount - destAmount);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestProduct = p;
      }
      alternatives.push(p);
    }

    if (!bestProduct) {
      return new Response(JSON.stringify({
        error: "No matching product found for the requested amount",
        destination_currency: destinationCurrency,
        estimated_destination_amount: destAmount,
      }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Compute final customer price using the pricing function
    const { data: customerPrice, error: priceErr } = await supabase.rpc("compute_customer_price", {
      p_product_id: bestProduct.id,
      p_currency: "BRL",
    });

    if (priceErr || customerPrice === null) {
      return new Response(JSON.stringify({ error: "Failed to compute price" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get pricing breakdown for transparency
    const { data: marginConfig } = await supabase
      .from("pricing_config")
      .select("value")
      .eq("key", "profit_margin_percent")
      .maybeSingle();
    const margin = marginConfig ? parseFloat(marginConfig.value) : 8;

    const providerCost = bestProduct.wholesale_cost || bestProduct.local_amount;
    const profitAmount = round2(Number(customerPrice) - providerCost);

    // Determine if the match is exact or approximate
    const isExactMatch = bestDiff < 0.01;
    const matchTolerance = bestProduct.local_amount * 0.05; // 5% tolerance
    const isWithinTolerance = bestDiff <= matchTolerance;

    return new Response(JSON.stringify({
      requested_amount_brl: brlAmount,
      destination_currency: destinationCurrency,
      exchange_rate_brl_to_dest: brlToDestRate,
      exchange_rate_timestamp: rates.fetched_at,
      estimated_destination_amount: destAmount,
      matched_product: {
        ...bestProduct,
        is_exact_match: isExactMatch,
        is_within_tolerance: isWithinTolerance,
        difference_from_requested: round2(bestDiff),
      },
      customer_price_brl: Number(customerPrice),
      pricing_breakdown: {
        provider_cost: providerCost,
        profit_margin_percent: margin,
        profit_amount: profitAmount,
        exchange_rate: brlToDestRate,
      },
      alternatives: alternatives
        .filter((p) => p.id !== bestProduct!.id)
        .slice(0, 5)
        .map((p) => ({
          ...p,
          estimated_brl_cost: round2(p.wholesale_cost
            ? p.wholesale_cost / (rates["USD"] || 0.20)
            : p.local_amount / brlToDestRate),
        })),
      minimum_brl: minAmount,
      maximum_brl: maxAmount,
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

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
