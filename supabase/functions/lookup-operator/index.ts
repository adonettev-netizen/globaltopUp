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
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`DingConnect ${path} failed (${res.status}): ${text.slice(0, 500)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`DingConnect ${path} returned non-JSON: ${text.slice(0, 200)}`);
  }
}

/**
 * DingConnect GetAccountLookup returns an AccountLookup object directly
 * (not wrapped in Items), containing ProviderCode, CountryCode, RegionCode.
 * Per the official FAQ: for non-valid/incomplete numbers, the API still
 * returns a result but it may default to the first provider for the
 * detected country — so this is an ESTIMATE, not authoritative.
 * We surface it as a "suggested" operator and always show the full list
 * for manual selection.
 */
async function lookupOperator(accountNumber: string): Promise<{
  providerCode: string | null;
  countryCode: string | null;
  isEstimate: boolean;
  error: string | null;
}> {
  try {
    const data = await dingFetch(`/GetAccountLookup?accountNumber=${encodeURIComponent(accountNumber)}`);

    // Response fields are PascalCase: ProviderCode, CountryCode, RegionCode, ResultCode
    const providerCode = data.ProviderCode || data.providerCode || null;
    const countryCode = data.CountryCode || data.countryCode || null;
    const resultCode = data.ResultCode ?? data.resultCode;

    // ResultCode 1 means "not sure about the products for the account"
    // — the provider returned is an estimate, not confirmed
    const isEstimate = resultCode === 1 || !providerCode;

    return { providerCode, countryCode, isEstimate, error: null };
  } catch (e) {
    return { providerCode: null, countryCode: null, isEstimate: true, error: e.message };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    // Normalize: strip everything except digits and leading +
    const rawPhone = (url.searchParams.get("phone") || "").trim();
    const phone = rawPhone.replace(/[^0-9+]/g, "");

    if (!phone || phone.replace("+", "").length < 2) {
      return new Response(JSON.stringify({
        detected: false,
        message: "Please enter a phone number with country code.",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = supabaseAdmin();
    const normalized = phone.replace(/^\+/, "");
    const digitsOnly = normalized;

    // Load all supported countries with calling codes
    const { data: countries } = await supabase
      .from("countries")
      .select("id, ding_country_code, name, iso_code, calling_code, flag")
      .eq("is_supported", true)
      .order("calling_code", { ascending: false });

    if (!countries || countries.length === 0) {
      return new Response(JSON.stringify({
        detected: false,
        message: "No supported destinations are configured yet. An administrator needs to run a catalog sync first.",
      }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Longest-prefix match on calling code
    let matchedCountry: any = null;
    let bestLen = 0;
    for (const c of countries) {
      const cc = (c.calling_code || "").replace(/[^0-9]/g, "");
      if (cc && digitsOnly.startsWith(cc) && cc.length > bestLen) {
        matchedCountry = c;
        bestLen = cc.length;
      }
    }

    if (!matchedCountry) {
      return new Response(JSON.stringify({
        detected: false,
        message: "Could not identify the destination country from this phone number. Please include the country code (e.g. +509 for Haiti).",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const nationalNumber = digitsOnly.slice(bestLen);

    // For +1 (NANP), we need at least 4 digits of the national number to disambiguate
    // For other countries, 2 digits is enough to show the country
    const minNationalForOperators = bestLen === 1 ? 4 : 2;
    const hasEnoughDigits = nationalNumber.length >= minNationalForOperators;

    // Get operators for the matched country from DB
    const { data: providers } = await supabase
      .from("operators")
      .select("id, ding_operator_code, name, logo_url")
      .eq("country_id", matchedCountry.id)
      .eq("is_active", true)
      .order("name");

    const operators = providers || [];

    // Attempt operator detection only when we have enough digits
    let detectedOperator: any = null;
    let operatorDetectionMethod: "none" | "estimate" | "confirmed" = "none";
    let lookupError: string | null = null;

    if (hasEnoughDigits && operators.length > 0) {
      const fullNumber = "+" + digitsOnly;
      const lookup = await lookupOperator(fullNumber);

      if (lookup.error) {
        lookupError = lookup.error;
      }

      if (lookup.providerCode) {
        // Match the DingConnect ProviderCode against our operators
        detectedOperator = operators.find(
          (p: any) => p.ding_operator_code === lookup.providerCode
        ) || null;

        if (detectedOperator) {
          // Per DingConnect FAQ, GetAccountLookup is an estimate for
          // non-validated numbers. Only mark "confirmed" if the API
          // explicitly validated (ResultCode !== 1).
          operatorDetectionMethod = lookup.isEstimate ? "estimate" : "confirmed";
        }
      }
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
      full_number: "+" + digitsOnly,
      operators,
      detected_operator: detectedOperator,
      operator_detection_method: operatorDetectionMethod,
      auto_detected: detectedOperator !== null,
      lookup_error: lookupError,
      needs_more_digits: !hasEnoughDigits,
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
