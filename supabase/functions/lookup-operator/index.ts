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
    throw new Error("DingConnect API key is not configured.");
  }
  return data.key_value;
}

async function dingFetch(path: string): Promise<any> {
  const apiKey = await getDingApiKey();
  const res = await fetch(`${DING_BASE}${path}`, {
    headers: { "api_key": apiKey, "Content-Type": "application/json" },
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const phone = (url.searchParams.get("phone") || "").replace(/[^0-9+]/g, "");

    if (!phone || phone.replace("+", "").length < 4) {
      return new Response(JSON.stringify({ error: "A valid phone number is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = supabaseAdmin();
    let normalized = phone.replace(/^\+/, "");

    // Find matching country by calling code (longest prefix match)
    const { data: countries } = await supabase
      .from("countries")
      .select("id, ding_country_code, name, iso_code, calling_code, flag")
      .eq("is_supported", true)
      .order("calling_code", { ascending: false });

    if (!countries || countries.length === 0) {
      return new Response(JSON.stringify({ error: "No supported countries available in the catalog" }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let matchedCountry: any = null;
    let bestLen = 0;
    for (const c of countries) {
      const cc = (c.calling_code || "").replace(/[^0-9]/g, "");
      if (cc && normalized.startsWith(cc) && cc.length > bestLen) {
        matchedCountry = c;
        bestLen = cc.length;
      }
    }

    if (!matchedCountry) {
      return new Response(JSON.stringify({
        detected: false,
        message: "Could not identify the destination country from this phone number. Please check the number and try again.",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const nationalNumber = normalized.slice(bestLen);

    // Get providers/operators for the matched country from DB
    const { data: providers } = await supabase
      .from("operators")
      .select("id, ding_operator_code, name, logo_url")
      .eq("country_id", matchedCountry.id)
      .eq("is_active", true)
      .order("name");

    // Attempt operator detection via DingConnect GetAccountLookup
    let detectedProvider: any = null;

    try {
      const lookupData = await dingFetch(`/GetAccountLookup?accountNumber=${encodeURIComponent("+" + normalized)}`);
        const lookupProviderCode = lookupData.ProviderCode || lookupData.providerCode;
        if (lookupProviderCode && providers) {
          detectedProvider = providers.find((p: any) => p.ding_operator_code === lookupProviderCode) || null;
        }
    } catch (e) {
        console.error("Account lookup failed:", e.message);
    }

    return new Response(JSON.stringify({
      detected: true,
      country: {
        id: matchedCountry.id,
        name: matchedCountry.name,
        iso_code: matchedCountry.iso_code,
        calling_code: matchedCountry.calling_code,
        flag: matchedCountry.flag,
      },
      national_number: nationalNumber,
      full_number: "+" + normalized,
      operators: providers || [],
      detected_operator: detectedProvider,
      auto_detected: detectedProvider !== null,
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
