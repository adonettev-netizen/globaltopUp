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
 * NANP (North American Numbering Plan) area code ranges.
 * All these countries share calling code +1, so we disambiguate by
 * the 3-digit area code (the first 3 digits of the national number).
 *
 * Source: https://en.wikipedia.org/wiki/List_of_North_American_Numbering_Plan_area_codes
 */
const NANP_AREA_CODE_RANGES: { iso: string; ranges: [number, number][] }[] = [
  { iso: "US", ranges: [
    [201, 289], [290, 299], [300, 389], [400, 489], [500, 589],
    [600, 689], [700, 789], [800, 879], [881, 889], [900, 999],
  ]},
  // Jamaica: 658, 876
  { iso: "JM", ranges: [[658, 658], [876, 876]] },
  // Canada: specific area codes
  { iso: "CA", ranges: [
    [204, 204], [226, 226], [236, 236], [249, 249], [250, 250],
    [263, 263], [289, 289], [306, 306], [343, 343], [354, 354],
    [365, 365], [367, 367], [368, 368], [403, 403], [416, 416],
    [418, 418], [428, 428], [431, 431], [437, 437], [438, 438],
    [450, 450], [468, 468], [474, 474], [506, 506], [514, 514],
    [519, 519], [548, 548], [579, 579], [581, 581], [584, 584],
    [587, 587], [604, 604], [613, 613], [639, 639], [647, 647],
    [672, 672], [682, 682], [705, 705], [709, 709], [742, 742],
    [753, 753], [778, 778], [780, 780], [782, 782], [807, 807],
    [819, 819], [825, 825], [867, 867], [873, 873], [879, 879],
    [902, 902], [905, 905], [939, 939],
  ]},
  // Dominican Republic: 809, 829, 849
  { iso: "DO", ranges: [[809, 809], [829, 829], [849, 849]] },
  // Puerto Rico: 787, 939
  { iso: "PR", ranges: [[787, 787], [939, 939]] },
  // Trinidad & Tobago: 868
  { iso: "TT", ranges: [[868, 868]] },
  // Barbados: 246
  { iso: "BB", ranges: [[246, 246]] },
  // Bahamas: 242
  { iso: "BS", ranges: [[242, 242]] },
  // Grenada: 473
  { iso: "GD", ranges: [[473, 473]] },
  // Jamaica already above
  // Antigua: 268
  { iso: "AG", ranges: [[268, 268]] },
  // Dominica: 767
  { iso: "DM", ranges: [[767, 767]] },
  // St. Lucia: 758
  { iso: "LC", ranges: [[758, 758]] },
  // St. Vincent: 784
  { iso: "VC", ranges: [[784, 784]] },
  // St. Kitts: 869
  { iso: "KN", ranges: [[869, 869]] },
  // Cayman Islands: 345
  { iso: "KY", ranges: [[345, 345]] },
  // Bermuda: 441
  { iso: "BM", ranges: [[441, 441]] },
  // Guyana: 592
  { iso: "GY", ranges: [[592, 592]] },
  // Suriname: 597
  { iso: "SR", ranges: [[597, 597]] },
];

function resolveNanpCountry(areaCode: number): string | null {
  for (const entry of NANP_AREA_CODE_RANGES) {
    for (const [lo, hi] of entry.ranges) {
      if (areaCode >= lo && areaCode <= hi) return entry.iso;
    }
  }
  return null;
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
          if (nanpIso && countryByIso[nanpIso] && countryByIso[nanpIso].id !== matchedCountry.id) {
            matchedCountry = countryByIso[nanpIso];
            detectionSource = "nanp_area_code";
          } else if (nanpIso && countryByIso[nanpIso]) {
            // Already the right country, just confirm
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
