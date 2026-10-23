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

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`DingConnect ${path} failed (${res.status}): ${text.slice(0, 500)}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`DingConnect ${path} returned non-JSON response: ${text.slice(0, 200)}`);
  }
}

/**
 * DingConnect API responses use a consistent wrapper:
 * { ResultCode: number, ErrorCodes: [...], Items: [...] }
 * The Items array holds the actual data objects (countries, providers, products).
 */
function extractItems(data: any): any[] {
  if (!data) return [];
  // DingConnect uses "Items" consistently across all list endpoints
  return data.Items || data.items || [];
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
  CountryIso: string;
  CountryName: string;
  InternationalDialingInformation?: { Prefix: string; MinimumLength: number; MaximumLength: number }[];
  RegionCodes?: string[];
}

interface DingProvider {
  ProviderCode: string;
  Name?: string;
  CountryIso?: string;
  LogoUrl?: string | null;
  ValidationRegex?: string;
  PaymentTypes?: string[];
}

interface DingProduct {
  ProductCode: string;
  ProviderCode: string;
  Name?: string;
  ProductName?: string;
  LocalAmount: number;
  LocalCurrency: string;
  WholesalePrice?: number | null;
  UatNumber?: string | null;
}

async function syncCountries(supabase: any): Promise<{ count: number; error: string | null }> {
  try {
    const data = await dingFetch("/GetCountries");
    const items: DingCountry[] = extractItems(data);

    if (items.length === 0) {
      return { count: 0, error: "GetCountries returned 0 items — check API key permissions" };
    }

    const rows = items.map((c) => {
      // Extract calling code from InternationalDialingInformation array.
      // DingConnect stores the full dialing prefix (country code + area code)
      // for NANP countries (e.g. "1201" for US). We need just the country
      // calling code, so for any 4-digit prefix starting with "1", we use "1".
      let callingCode = c.InternationalDialingInformation?.[0]?.Prefix || "";
      if (/^1[0-9]{3}$/.test(callingCode)) {
        callingCode = "1";
      }
      return {
        ding_country_code: c.CountryIso,
        name: c.CountryName,
        iso_code: c.CountryIso,
        calling_code: callingCode,
        is_supported: true,
        last_synced_at: new Date().toISOString(),
      };
    });

    const { error } = await supabase
      .from("countries")
      .upsert(rows, { onConflict: "ding_country_code" });

    if (error) {
      return { count: 0, error: `Country upsert failed: ${error.message}` };
    }

    // Mark countries no longer returned as unsupported (without deleting — preserve orders)
    const returnedCodes = items.map((c) => c.CountryIso);
    await supabase
      .from("countries")
      .update({ is_supported: false })
      .not("ding_country_code", "in", `(${returnedCodes.map((c) => `'${c}'`).join(",")})`);

    return { count: items.length, error: null };
  } catch (e) {
    return { count: 0, error: e.message };
  }
}

async function syncProviders(supabase: any): Promise<{ count: number; error: string | null }> {
  try {
    // GetProviders returns ALL providers at once — no country filter parameter.
    const data = await dingFetch("/GetProviders");
    const items: DingProvider[] = extractItems(data);

    if (items.length === 0) {
      return { count: 0, error: "GetProviders returned 0 items — check API key permissions" };
    }

    // Build a lookup of country ISO code → country UUID
    const { data: countries } = await supabase
      .from("countries")
      .select("id, ding_country_code, iso_code");
    if (!countries || countries.length === 0) {
      return { count: 0, error: "No countries in database — sync countries first" };
    }

    // Map by both iso_code and ding_country_code for matching flexibility
    const countryByIso: Record<string, any> = {};
    const countryByCode: Record<string, any> = {};
    for (const c of countries) {
      if (c.iso_code) countryByIso[c.iso_code.toUpperCase()] = c;
      countryByCode[c.ding_country_code] = c;
    }

    const allProviders: any[] = [];
    let skipped = 0;

    for (const p of items) {
      // Match provider to country by CountryIso (preferred) or CountryCode fallback
      const countryMatch = (p.CountryIso && countryByIso[p.CountryIso.toUpperCase()]) ||
                           (p.CountryCode && countryByCode[p.CountryCode]) || null;
      if (!countryMatch) {
        skipped++;
        continue;
      }

      const providerName = p.Name || p.ProviderCode;
      allProviders.push({
        ding_operator_code: p.ProviderCode,
        country_id: countryMatch.id,
        name: providerName,
        logo_url: p.LogoUrl || null,
        is_active: true,
        last_synced_at: new Date().toISOString(),
      });
    }

    if (allProviders.length > 0) {
      const { error } = await supabase
        .from("operators")
        .upsert(allProviders, { onConflict: "ding_operator_code" });
      if (error) {
        return { count: 0, error: `Provider upsert failed: ${error.message}` };
      }
    }

    // Mark operators no longer returned as inactive (preserve orders/FKs)
    const returnedCodes = allProviders.map((p) => p.ding_operator_code);
    if (returnedCodes.length > 0) {
      await supabase
        .from("operators")
        .update({ is_active: false })
        .not("ding_operator_code", "in", `(${returnedCodes.map((c) => `'${c}'`).join(",")})`);
    }

    return { count: allProviders.length, error: skipped > 0 ? `${skipped} providers skipped (no matching country)` : null };
  } catch (e) {
    return { count: 0, error: e.message };
  }
}

async function syncProducts(supabase: any): Promise<{ count: number; error: string | null }> {
  try {
    const { data: providers } = await supabase
      .from("operators")
      .select("id, ding_operator_code")
      .eq("is_active", true);

    if (!providers || providers.length === 0) {
      return { count: 0, error: "No active operators in database — sync providers first" };
    }

    const allProducts: any[] = [];
    let errors = 0;

    await parallelMap(providers, CONCURRENCY, async (provider: any) => {
      try {
        const data = await dingFetch(`/GetProducts?providerCode=${encodeURIComponent(provider.ding_operator_code)}`);
        const items: DingProduct[] = extractItems(data);

        for (const p of items) {
          allProducts.push({
            ding_product_code: p.ProductCode,
            operator_id: provider.id,
            product_name: p.Name || p.ProductName || `${p.LocalCurrency} ${p.LocalAmount}`,
            local_amount: p.LocalAmount,
            local_currency: p.LocalCurrency,
            wholesale_cost: p.WholesalePrice ?? null,
            is_active: true,
            last_synced_at: new Date().toISOString(),
          });
        }
      } catch (err) {
        console.error(`Products fetch failed for ${provider.ding_operator_code}:`, err.message);
        errors++;
      }
    });

    if (allProducts.length > 0) {
      // Delete and re-insert for this provider batch to remove stale products
      // (upsert keeps old products that may no longer exist)
      const providerIds = providers.map((p: any) => p.id);
      await supabase
        .from("recharge_products")
        .delete()
        .in("operator_id", providerIds);

      const { error } = await supabase
        .from("recharge_products")
        .insert(allProducts);
      if (error) {
        return { count: 0, error: `Product insert failed: ${error.message}` };
      }
    }

    return { count: allProducts.length, error: errors > 0 ? `${errors} provider product fetches failed` : null };
  } catch (e) {
    return { count: 0, error: e.message };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = supabaseAdmin();
    const url = new URL(req.url);
    const entity = url.searchParams.get("entity") || "full";
    const debug = url.searchParams.get("debug") === "true";

    // Debug mode: return raw API response for inspection
    if (debug) {
      const debugCountry = url.searchParams.get("country")?.toUpperCase();
      const raw: Record<string, any> = {};
      if (entity === "countries" || entity === "full") {
        raw.countries = await dingFetch("/GetCountries");
      }
      if (entity === "operators" || entity === "full") {
        raw.providers = await dingFetch("/GetProviders");
      }
      const summary: Record<string, any> = {};
      for (const [key, val] of Object.entries(raw)) {
        const items = (val as any)?.Items || (val as any)?.items || [];
        const filtered = debugCountry && key === "providers"
          ? items.filter((p: any) => p.CountryIso === debugCountry)
          : items;
        summary[key] = {
          resultCode: (val as any)?.ResultCode,
          totalItems: items.length,
          filteredCount: filtered.length,
          first5: filtered.slice(0, 5),
          fieldNames: items.length > 0 ? Object.keys(items[0]) : [],
        };
      }
      return new Response(JSON.stringify(summary, null, 2), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: log } = await supabase
      .from("sync_logs")
      .insert({ entity_type: entity, status: "running" })
      .select()
      .single();

    const logId = log?.id;

    try {
      let records = 0;
      const breakdown: Record<string, { count: number; error: string | null }> = {};
      let fatalError: string | null = null;

      if (entity === "countries" || entity === "full") {
        const result = await syncCountries(supabase);
        breakdown.countries = result;
        records += result.count;
        if (result.error && entity === "countries") fatalError = result.error;
      }
      if ((entity === "operators" || entity === "full") && !fatalError) {
        const result = await syncProviders(supabase);
        breakdown.operators = result;
        records += result.count;
        if (result.error && entity === "operators") fatalError = result.error;
      }
      if ((entity === "products" || entity === "full") && !fatalError) {
        const result = await syncProducts(supabase);
        breakdown.products = result;
        records += result.count;
        if (result.error && entity === "products") fatalError = result.error;
      }

      if (logId) {
        await supabase
          .from("sync_logs")
          .update({ status: fatalError ? "failed" : "success", records_processed: records, error_message: fatalError, completed_at: new Date().toISOString() })
          .eq("id", logId);
      }

      return new Response(JSON.stringify({ success: !fatalError, entity, records, breakdown, error: fatalError }), {
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
