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

const DING_BASE = "https://api.dingconnect.com/api/V1";
const CONCURRENCY = 8;

async function getDingApiKey(): Promise<string> {
  const envKey = Deno.env.get("DINGCONNECT_API_KEY");
  if (envKey) return envKey;

  const supabase = supabaseAdmin();
  const { data } = await supabase
    .from("api_credentials")
    .select("key_value")
    .eq("provider", "dingconnect")
    .eq("key_name", "api_key")
    .eq("is_active", true)
    .maybeSingle();

  if (!data) {
    throw new Error("DingConnect API key is not configured. Set DINGCONNECT_API_KEY as an edge function secret or add it to the api_credentials table.");
  }
  return data.key_value;
}

let cachedApiKey: string | null = null;

async function dingFetch(path: string): Promise<any> {
  if (!cachedApiKey) cachedApiKey = await getDingApiKey();

  const res = await fetch(`${DING_BASE}${path}`, {
    headers: {
      "api_key": cachedApiKey,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`DingConnect ${path} failed (${res.status}): ${txt}`);
  }

  return res.json();
}

function extractItems(data: any): any[] {
  if (!data) return [];
  return data.Countries || data.Items || data.items || data.ProviderList || data.Providers || data.ProductList || data.Products || [];
}

async function parallelMap<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
}

interface DingCountry {
  CountryCode: string;
  CountryName: string;
  CountryIso?: string;
  CountryIso3?: string;
  CallingCode?: string;
  IsoCode?: string;
}

interface DingProvider {
  ProviderCode: string;
  ProviderName: string;
  CountryCode: string;
  ProviderLogoUrl?: string | null;
}

interface DingProduct {
  ProductCode: string;
  ProviderCode: string;
  ProductName?: string;
  LocalAmount: number;
  LocalCurrency: string;
  WholesalePrice?: number | null;
  WholesaleAmount?: number | null;
  ReceiveAmount?: number;
  ReceiveCurrency?: string;
}

async function syncCountries(supabase: any): Promise<number> {
  const data = await dingFetch("/GetCountries");
  const items: DingCountry[] = extractItems(data);

  const rows = items.map((c) => ({
    ding_country_code: c.CountryCode,
    name: c.CountryName,
    iso_code: c.CountryIso || c.CountryIso3 || null,
    calling_code: c.CallingCode || c.IsoCode || "",
    flag: null,
    is_supported: true,
    last_synced_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from("countries")
    .upsert(rows, { onConflict: "ding_country_code" });

  if (error) console.error("Country bulk upsert error:", error.message);

  return items.length;
}

async function syncProviders(supabase: any): Promise<number> {
  const { data: countries } = await supabase
    .from("countries")
    .select("id, ding_country_code")
    .eq("is_supported", true);

  if (!countries || countries.length === 0) return 0;

  const allProviders: any[] = [];

  await parallelMap(countries, CONCURRENCY, async (country: any) => {
    try {
      const data = await dingFetch(`/GetProviders?countryCode=${country.ding_country_code}`);
      const items: DingProvider[] = extractItems(data);
      for (const p of items) {
        allProviders.push({
          ding_operator_code: p.ProviderCode,
          country_id: country.id,
          name: p.ProviderName,
          logo_url: p.ProviderLogoUrl || null,
          is_active: true,
          last_synced_at: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.error(`Providers fetch failed for ${country.ding_country_code}:`, err.message);
    }
  });

  if (allProviders.length > 0) {
    const { error } = await supabase
      .from("operators")
      .upsert(allProviders, { onConflict: "ding_operator_code" });
    if (error) console.error("Provider bulk upsert error:", error.message);
  }

  return allProviders.length;
}

async function syncProducts(supabase: any): Promise<number> {
  const { data: providers } = await supabase
    .from("operators")
    .select("id, ding_operator_code")
    .eq("is_active", true);

  if (!providers || providers.length === 0) return 0;

  const allProducts: any[] = [];

  await parallelMap(providers, CONCURRENCY, async (provider: any) => {
    try {
      const data = await dingFetch(`/GetProducts?providerCode=${provider.ding_operator_code}`);
      const items: DingProduct[] = extractItems(data);
      for (const p of items) {
        allProducts.push({
          ding_product_code: p.ProductCode,
          operator_id: provider.id,
          product_name: p.ProductName || `${p.LocalCurrency} ${p.LocalAmount}`,
          local_amount: p.LocalAmount,
          local_currency: p.LocalCurrency,
          wholesale_cost: p.WholesalePrice ?? p.WholesaleAmount ?? null,
          is_active: true,
          last_synced_at: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.error(`Products fetch failed for ${provider.ding_operator_code}:`, err.message);
    }
  });

  if (allProducts.length > 0) {
    const { error } = await supabase
      .from("recharge_products")
      .upsert(allProducts, { onConflict: "ding_product_code" });
    if (error) console.error("Product bulk upsert error:", error.message);
  }

  return allProducts.length;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = supabaseAdmin();
    const url = new URL(req.url);
    const entity = url.searchParams.get("entity") || "full";

    const { data: log } = await supabase
      .from("sync_logs")
      .insert({ entity_type: entity, status: "running" })
      .select()
      .single();

    const logId = log?.id;

    try {
      let records = 0;
      const breakdown: Record<string, number> = {};

      if (entity === "countries" || entity === "full") {
        const n = await syncCountries(supabase);
        breakdown.countries = n;
        records += n;
      }
      if (entity === "operators" || entity === "full") {
        const n = await syncProviders(supabase);
        breakdown.operators = n;
        records += n;
      }
      if (entity === "products" || entity === "full") {
        const n = await syncProducts(supabase);
        breakdown.products = n;
        records += n;
      }

      if (logId) {
        await supabase
          .from("sync_logs")
          .update({ status: "success", records_processed: records, completed_at: new Date().toISOString() })
          .eq("id", logId);
      }

      return new Response(JSON.stringify({ success: true, entity, records, breakdown }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (innerErr) {
      if (logId) {
        await supabase
          .from("sync_logs")
          .update({ status: "failed", error_message: innerErr.message, completed_at: new Date().toISOString() })
          .eq("id", logId);
      }
      throw innerErr;
    }
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
