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
 * DingConnect GetAccountLookup returns ProviderCode, CountryCode, RegionCode.
 * ResultCode 1 = estimate (not confirmed). The API may not work in UAT/sandbox.
 */
async function lookupOperator(accountNumber: string): Promise<{
  providerCode: string | null;
  countryCode: string | null;
  isEstimate: boolean;
  error: string | null;
}> {
  try {
    const data = await dingFetch(`/GetAccountLookup?accountNumber=${encodeURIComponent(accountNumber)}`);
    const providerCode = data.ProviderCode || data.providerCode || null;
    const countryCode = data.CountryCode || data.countryCode || null;
    const resultCode = data.ResultCode ?? data.resultCode;
    const isEstimate = resultCode === 1 || !providerCode;
    return { providerCode, countryCode, isEstimate, error: null };
  } catch (e) {
    return { providerCode: null, countryCode: null, isEstimate: true, error: e.message };
  }
}

/**
 * NANP (North American Numbering Plan) area code mapping.
 * All these countries share calling code +1, so we disambiguate by
 * the 3-digit area code (NPA).
 *
 * Rather than listing every US area code (there are 300+), we list the
 * area codes belonging to OTHER NANP countries. Any area code not in
 * this map defaults to the United States.
 *
 * Source: https://en.wikipedia.org/wiki/List_of_North_American_Numbering_Plan_area_codes
 */
const NANP_NON_US_AREA_CODES: Record<number, string> = {
  // Canada
  204: "CA", 226: "CA", 236: "CA", 249: "CA", 250: "CA", 263: "CA",
  289: "CA", 306: "CA", 343: "CA", 354: "CA", 365: "CA", 367: "CA",
  368: "CA", 403: "CA", 416: "CA", 418: "CA", 428: "CA", 431: "CA",
  437: "CA", 438: "CA", 450: "CA", 468: "CA", 474: "CA", 506: "CA",
  514: "CA", 519: "CA", 548: "CA", 579: "CA", 581: "CA", 584: "CA",
  587: "CA", 604: "CA", 613: "CA", 639: "CA", 647: "CA", 672: "CA",
  682: "CA", 705: "CA", 709: "CA", 742: "CA", 753: "CA", 778: "CA",
  780: "CA", 782: "CA", 807: "CA", 819: "CA", 825: "CA", 867: "CA",
  873: "CA", 879: "CA", 902: "CA", 905: "CA",
  // Jamaica
  658: "JM", 876: "JM",
  // Dominican Republic
  809: "DO", 829: "DO", 849: "DO",
  // Puerto Rico
  787: "PR", 939: "PR",
  // Trinidad & Tobago
  868: "TT",
  // Barbados
  246: "BB",
  // Bahamas
  242: "BS",
  // Grenada
  473: "GD",
  // Antigua & Barbuda
  268: "AG",
  // Dominica
  767: "DM",
  // St. Lucia
  758: "LC",
  // St. Vincent & Grenadines
  784: "VC",
  // St. Kitts & Nevis
  869: "KN",
  // Cayman Islands
  345: "KY",
  // Bermuda
  441: "BM",
  // Guyana
  592: "GY",
  // Suriname
  597: "SR",
  // Anguilla
  264: "AI",
  // British Virgin Islands
  284: "VG",
  // Turks & Caicos
  649: "TC",
  // Montserrat
  664: "MS",
  // Sint Maarten
  721: "SX",
  // US Virgin Islands (these are US territory but have separate area code)
  340: "US",
  // American Samoa
  684: "US",
  // Guam / Northern Mariana
  671: "US", 670: "US",
};

function resolveNanpCountry(areaCode: number): string {
  const iso = NANP_NON_US_AREA_CODES[areaCode];
  return iso || "US";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const rawPhone = (url.searchParams.get("phone") || "").trim();
    const explicitCountryIso = (url.searchParams.get("country_iso") || "").trim().toUpperCase();

    // Normalize: keep digits and leading +
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
    const digitsOnly = phone.replace(/^\+/, "");

    // Load all supported countries
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

    // Build lookup maps
    const countryByIso: Record<string, any> = {};
    for (const c of countries) {
      if (c.iso_code) countryByIso[c.iso_code.toUpperCase()] = c;
    }

    // If an explicit country ISO is provided, validate and use it
    let matchedCountry: any = null;
    let nationalNumber = "";
    let detectionSource: "explicit" | "nanp_area_code" | "calling_code" = "calling_code";

    if (explicitCountryIso && countryByIso[explicitCountryIso]) {
      matchedCountry = countryByIso[explicitCountryIso];
      const cc = (matchedCountry.calling_code || "").replace(/[^0-9]/g, "");
      // Strip the calling code prefix if present
      if (cc && digitsOnly.startsWith(cc)) {
        nationalNumber = digitsOnly.slice(cc.length);
      } else {
        nationalNumber = digitsOnly;
      }
      detectionSource = "explicit";
    } else {
      // Auto-detect via longest-prefix match on calling code
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
          message: "Could not identify the destination country from this phone number. Please select the country manually.",
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      nationalNumber = digitsOnly.slice(bestLen);

      // NANP disambiguation: if calling code is 1, use area code to determine the real country
      if (bestLen === 1 && nationalNumber.length >= 3) {
        const areaCode = parseInt(nationalNumber.slice(0, 3), 10);
        if (!isNaN(areaCode)) {
          const nanpIso = resolveNanpCountry(areaCode);
          if (nanpIso && countryByIso[nanpIso]) {
            matchedCountry = countryByIso[nanpIso];
            detectionSource = "nanp_area_code";
          }
        }
      }
    }

    // For +1 (NANP), need at least 4 national digits. For others, 2.
    const callingCodeDigits = (matchedCountry.calling_code || "").replace(/[^0-9]/g, "").length;
    const minNationalForOperators = callingCodeDigits === 1 ? 4 : 2;
    const hasEnoughDigits = nationalNumber.length >= minNationalForOperators;

    // Get operators for the matched country
    const { data: providers } = await supabase
      .from("operators")
      .select("id, ding_operator_code, name, logo_url")
      .eq("country_id", matchedCountry.id)
      .eq("is_active", true)
      .order("name");

    const operators = providers || [];

    // Attempt DingConnect operator detection
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
        detectedOperator = operators.find(
          (p: any) => p.ding_operator_code === lookup.providerCode
        ) || null;

        if (detectedOperator) {
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
      detection_source: detectionSource,
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
