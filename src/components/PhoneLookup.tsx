import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Search, Loader2, MapPin, Phone, AlertCircle, Info, ShieldCheck, HelpCircle, ChevronDown, Check } from 'lucide-react';
import { supabase, callEdgeFunction } from '@/lib/supabase';
import type { LookupResult, Operator, CountryOption } from '@/types';

interface Props {
  onContinue: (data: {
    phone: string;
    country: LookupResult['country'];
    operator: Operator | null;
    nationalNumber: string;
  }) => void;
}

// Common flag emojis by ISO code (for countries that don't have flags in the DB)
const FLAG_EMOJIS: Record<string, string> = {
  US: '🇺🇸', CA: '🇨🇦', GB: '🇬🇧', BR: '🇧🇷', HT: '🇭🇹', JM: '🇯🇲',
  DO: '🇩🇴', MX: '🇲🇽', ES: '🇪🇸', CO: '🇨🇴', AR: '🇦🇷', CL: '🇨🇱',
  PE: '🇵🇪', EC: '🇪🇨', BO: '🇧🇴', PY: '🇵🇾', UY: '🇺🇾', VE: '🇻🇪',
  GT: '🇬🇹', HN: '🇭🇳', SV: '🇸🇻', NI: '🇳🇮', CR: '🇨🇷', PA: '🇵🇦',
  CU: '🇨🇺', FR: '🇫🇷', DE: '🇩🇪', IT: '🇮🇹', PT: '🇵🇹', NL: '🇳🇱',
  PR: '🇵🇷', TT: '🇹🇹', BS: '🇧🇸', BB: '🇧🇧', GD: '🇬🇩', KY: '🇰🇾',
  BM: '🇧🇲', AG: '🇦🇬', DM: '🇩🇲', LC: '🇱🇨', VC: '🇻🇨', KN: '🇰🇳',
  GY: '🇬🇾', SR: '🇸🇷', BZ: '🇧🇿', AU: '🇦🇺', NZ: '🇳🇿', IN: '🇮🇳',
  NG: '🇳🇬', KE: '🇰🇪', GH: '🇬🇭', ZA: '🇿🇦', EG: '🇪🇬', MA: '🇲🇦',
  PK: '🇵🇰', BD: '🇧🇩', PH: '🇵🇭', VN: '🇻🇳', TH: '🇹🇭', ID: '🇮🇩',
  MY: '🇲🇾', SG: '🇸🇬', AE: '🇦🇪', SA: '🇸🇦', KW: '🇰🇼', QA: '🇶🇦',
  OM: '🇴🇲', BH: '🇧🇭', JO: '🇯🇴', LB: '🇱🇧', IQ: '🇮🇶', IR: '🇮🇷',
  TR: '🇹🇷', RU: '🇷🇺', UA: '🇺🇦', PL: '🇵🇱', RO: '🇷🇴', BE: '🇧🇪',
  IE: '🇮🇪', CH: '🇨🇭', AT: '🇦🇹', SE: '🇸🇪', NO: '🇳🇴', DK: '🇩🇰',
  FI: '🇫🇮', CZ: '🇨🇿', HU: '🇭🇺', GR: '🇬🇷', BG: '🇧🇬', HR: '🇭🇷',
  SK: '🇸🇰', SI: '🇸🇮', LT: '🇱🇹', LV: '🇱🇻', EE: '🇪🇪', IS: '🇮🇸',
  LU: '🇱🇺', MT: '🇲🇹', CY: '🇨🇾', AL: '🇦🇱', BA: '🇧🇦', RS: '🇷🇸',
  ME: '🇲🇪', MK: '🇲🇰', MD: '🇲🇩', BY: '🇧🇾', GE: '🇬🇪', AM: '🇦🇲',
  AZ: '🇦🇿', KZ: '🇰🇿', UZ: '🇺🇿', KG: '🇰🇬', TJ: '🇹🇯', TM: '🇹🇲',
  AF: '🇦🇫', CN: '🇨🇳', JP: '🇯🇵', KR: '🇰🇷', TW: '🇹🇼', HK: '🇭🇰',
  KH: '🇰🇭', LA: '🇱🇦', MM: '🇲🇲', NP: '🇳🇵', LK: '🇱🇰', MV: '🇲🇻',
  BN: '🇧🇳', TL: '🇹🇱', KP: '🇰🇵', MN: '🇲🇳', BT: '🇧🇹',
};

function getFlag(iso: string, dbFlag: string | null): string {
  if (dbFlag) return dbFlag;
  if (FLAG_EMOJIS[iso]) return FLAG_EMOJIS[iso];
  // Generate regional indicator symbols from ISO code
  if (iso.length === 2) {
    const A = 0x1F1E6;
    return String.fromCodePoint(A + iso.charCodeAt(0) - 65) +
           String.fromCodePoint(A + iso.charCodeAt(1) - 65);
  }
  return '🌍';
}

export function PhoneLookup({ onContinue }: Props) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LookupResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedOperator, setSelectedOperator] = useState<Operator | null>(null);
  const [showOperators, setShowOperators] = useState(false);

  // Country selector state
  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [selectedCountry, setSelectedCountry] = useState<CountryOption | null>(null);
  const [showCountryDropdown, setShowCountryDropdown] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');
  const countryDropdownRef = useRef<HTMLDivElement>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const requestIdRef = useRef(0);

  // Load countries from Supabase on mount
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('countries')
        .select('id, iso_code, name, calling_code, flag')
        .eq('is_supported', true)
        .order('name');

      if (!error && data) {
        const opts = (data as CountryOption[]).map(c => ({
          ...c,
          flag: getFlag(c.iso_code, c.flag),
        }));
        setCountries(opts);
      }
    })();
  }, []);

  // Close country dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (countryDropdownRef.current && !countryDropdownRef.current.contains(e.target as Node)) {
        setShowCountryDropdown(false);
        setCountrySearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filteredCountries = useMemo(() => {
    if (!countrySearch) return countries;
    const q = countrySearch.toLowerCase();
    return countries.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.iso_code.toLowerCase().includes(q) ||
      c.calling_code.includes(q)
    );
  }, [countries, countrySearch]);

  const lookup = useCallback(async (phone: string, countryIso?: string) => {
    const currentRequestId = ++requestIdRef.current;
    const digits = phone.replace(/[^0-9+]/g, '').replace('+', '');

    if (digits.length < 2) {
      setResult(null);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const params: Record<string, string> = { phone };
    if (countryIso) params.country_iso = countryIso;

    const { data, error: fnError } = await callEdgeFunction<LookupResult>('lookup-operator', {
      method: 'GET',
      params,
    });

    if (currentRequestId !== requestIdRef.current) return;

    setLoading(false);

    if (fnError) {
      setError(fnError);
      setResult(null);
      return;
    }

    if (data) {
      setResult(data);
      // Sync selected country with the detected/confirmed country
      if (data.country) {
        const matched = countries.find(c => c.iso_code === data.country!.iso_code);
        if (matched) setSelectedCountry(matched);
      }
      if (data.detected_operator && data.operator_detection_method !== 'none') {
        setSelectedOperator(data.detected_operator);
      } else {
        setSelectedOperator(null);
      }
      if (!data.detected_operator) {
        setShowOperators(true);
      }
    }
  }, [countries]);

  const handleInput = (value: string) => {
    setInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setError(null);
    const digits = value.replace(/[^0-9+]/g, '').replace('+', '');
    if (digits.length < 2) {
      setResult(null);
      setLoading(false);
      requestIdRef.current++;
      return;
    }
    debounceRef.current = setTimeout(
      () => lookup(value, selectedCountry?.iso_code),
      600
    );
  };

  const handleCountrySelect = (country: CountryOption) => {
    setSelectedCountry(country);
    setShowCountryDropdown(false);
    setCountrySearch('');
    setError(null);

    // Re-run lookup with the explicit country
    if (input.replace(/[^0-9+]/g, '').replace('+', '').length >= 2) {
      lookup(input, country.iso_code);
    } else {
      // Pre-fill the calling code if input is empty
      if (!input) {
        setInput('+' + country.calling_code);
      }
    }
  };

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const digitsLength = input.replace(/[^0-9+]/g, '').replace('+', '').length;

  const canContinue =
    result?.detected &&
    result.country &&
    selectedOperator &&
    digitsLength >= 6 &&
    !result.needs_more_digits;

  const handleContinue = () => {
    if (!result?.country) return;
    onContinue({
      phone: result.full_number || input,
      country: result.country,
      operator: selectedOperator,
      nationalNumber: result.national_number || '',
    });
  };

  const detectionMethodLabel = result?.operator_detection_method;
  const isEstimated = detectionMethodLabel === 'estimate';

  return (
    <div className="w-full">
      {/* Country selector */}
      <div className="mb-4">
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          Destination country
        </label>
        <div className="relative" ref={countryDropdownRef}>
          <button
            onClick={() => setShowCountryDropdown(!showCountryDropdown)}
            className="w-full flex items-center gap-3 p-4 bg-white rounded-2xl border-2 border-gray-200 hover:border-brand-300 transition-all text-left"
          >
            {selectedCountry ? (
              <>
                <span className="text-2xl">{selectedCountry.flag}</span>
                <div className="flex-1">
                  <p className="font-semibold text-gray-900">{selectedCountry.name}</p>
                  <p className="text-sm text-gray-500">+{selectedCountry.calling_code}</p>
                </div>
              </>
            ) : (
              <>
                <MapPin className="w-5 h-5 text-gray-400" />
                <span className="flex-1 text-gray-500">Select destination country</span>
              </>
            )}
            <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${showCountryDropdown ? 'rotate-180' : ''}`} />
          </button>

          {showCountryDropdown && (
            <div className="absolute z-50 w-full mt-2 bg-white rounded-2xl shadow-xl border border-gray-100 max-h-72 overflow-hidden flex flex-col animate-fade-in">
              <div className="p-3 border-b border-gray-100">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={countrySearch}
                    onChange={(e) => setCountrySearch(e.target.value)}
                    placeholder="Search country or code..."
                    className="w-full pl-10 pr-3 py-2 rounded-lg bg-gray-50 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-brand-200"
                    autoFocus
                  />
                </div>
              </div>
              <div className="overflow-y-auto flex-1">
                {filteredCountries.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => handleCountrySelect(c)}
                    className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-brand-50 transition-colors text-left ${
                      selectedCountry?.id === c.id ? 'bg-brand-50' : ''
                    }`}
                  >
                    <span className="text-xl">{c.flag}</span>
                    <span className="flex-1 font-medium text-gray-900">{c.name}</span>
                    <span className="text-sm text-gray-500">+{c.calling_code}</span>
                    {selectedCountry?.id === c.id && <Check className="w-4 h-4 text-brand-600" />}
                  </button>
                ))}
                {filteredCountries.length === 0 && (
                  <div className="p-4 text-center text-sm text-gray-500">No countries found</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Phone input */}
      <div className="relative">
        <div className={`flex items-center gap-3 p-4 bg-white rounded-2xl border-2 transition-all ${
          error ? 'border-red-300' :
          result?.detected ? 'border-accent-400 shadow-lg shadow-accent-50' :
          'border-gray-200 focus-within:border-brand-400 focus-within:shadow-lg focus-within:shadow-brand-50'
        }`}>
          <Phone className="w-5 h-5 text-gray-400 flex-shrink-0" />
          <input
            type="tel"
            inputMode="tel"
            value={input}
            onChange={(e) => handleInput(e.target.value)}
            placeholder={selectedCountry ? `+${selectedCountry.calling_code} ...` : 'Select a country first, then enter number'}
            className="flex-1 text-lg font-medium outline-none bg-transparent placeholder:text-gray-400 placeholder:font-normal"
            autoFocus={!selectedCountry}
          />
          {loading && <Loader2 className="w-5 h-5 text-brand-500 animate-spin flex-shrink-0" />}
          {!loading && input && (
            <button
              onClick={() => {
                setInput('');
                setResult(null);
                setError(null);
                setSelectedOperator(null);
                setShowOperators(false);
                requestIdRef.current++;
              }}
              className="text-gray-400 hover:text-gray-600 flex-shrink-0"
              aria-label="Clear"
            >
              <AlertCircle className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Detection result */}
      {result?.detected && result.country && (
        <div className="mt-4 animate-fade-in-up space-y-3">
          {/* Country banner */}
          <div className="flex items-center gap-3 p-4 bg-accent-50 rounded-xl border border-accent-100">
            <span className="text-3xl">{result.country.flag}</span>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-accent-600" />
                <span className="font-semibold text-gray-900">{result.country.name}</span>
                <span className="text-sm text-gray-500">+{result.country.calling_code}</span>
                {result.detection_source === 'explicit' && (
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">Selected</span>
                )}
                {result.detection_source === 'nanp_area_code' && (
                  <span className="text-xs bg-accent-100 text-accent-700 px-2 py-0.5 rounded-full font-medium">Area code match</span>
                )}
              </div>
              <p className="text-sm text-gray-600 mt-0.5">
                {result.full_number}
              </p>
            </div>
          </div>

          {/* Needs more digits */}
          {result.needs_more_digits && (
            <div className="p-3 bg-blue-50 rounded-xl border border-blue-100">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-blue-800">
                  Keep typing the phone number so we can look up the operator.
                </p>
              </div>
            </div>
          )}

          {/* Operator section */}
          {!result.needs_more_digits && result.operators && result.operators.length > 0 && (
            <div>
              {/* Auto-detected operator */}
              {result.auto_detected && selectedOperator && !showOperators ? (
                <div className="p-3 bg-brand-50 rounded-xl border border-brand-100">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {selectedOperator.logo_url ? (
                        <img src={selectedOperator.logo_url} alt={selectedOperator.name} className="w-8 h-8 rounded-lg object-contain" />
                      ) : (
                        <div className="w-8 h-8 rounded-lg bg-brand-100 flex items-center justify-center">
                          <span className="text-xs font-bold text-brand-700">
                            {selectedOperator.name.slice(0, 2).toUpperCase()}
                          </span>
                        </div>
                      )}
                      <div>
                        <p className="text-xs text-gray-500">
                          {isEstimated ? 'Suggested operator' : 'Operator detected'}
                        </p>
                        <p className="font-semibold text-gray-900">{selectedOperator.name}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setShowOperators(true)}
                      className="text-sm text-brand-600 hover:text-brand-700 font-medium"
                    >
                      Change
                    </button>
                  </div>
                  {isEstimated && (
                    <div className="mt-2 pt-2 border-t border-brand-100 flex items-start gap-1.5">
                      <HelpCircle className="w-3.5 h-3.5 text-brand-400 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-brand-600">
                        This is a best-guess match based on the phone number. Please confirm it's correct.
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-3 bg-amber-50 rounded-xl border border-amber-100">
                  <p className="text-sm text-amber-800 mb-1">
                    {result.lookup_error
                      ? 'Could not reach the operator lookup service. Please select the operator manually.'
                      : 'Could not auto-detect the operator. Please select it manually.'}
                  </p>
                </div>
              )}

              {/* Operator list */}
              {(showOperators || (!result.auto_detected && result.operators.length > 0)) && (
                <div className="mt-2 space-y-2">
                  <p className="text-xs font-medium text-gray-500 px-1">
                    {result.auto_detected ? 'Select a different operator:' : 'Available operators:'}
                  </p>
                  {result.operators.map((op) => (
                    <button
                      key={op.id}
                      onClick={() => {
                        setSelectedOperator(op);
                        setShowOperators(false);
                      }}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${
                        selectedOperator?.id === op.id
                          ? 'border-brand-500 bg-brand-50'
                          : 'border-gray-200 hover:border-brand-300 bg-white'
                      }`}
                    >
                      {op.logo_url ? (
                        <img src={op.logo_url} alt={op.name} className="w-8 h-8 rounded-lg object-contain" />
                      ) : (
                        <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
                          <span className="text-xs font-bold text-gray-600">{op.name.slice(0, 2).toUpperCase()}</span>
                        </div>
                      )}
                      <span className="font-medium text-gray-900">{op.name}</span>
                      {selectedOperator?.id === op.id && <ShieldCheck className="w-4 h-4 text-brand-600 ml-auto" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* No operators available */}
          {!result.needs_more_digits && result.operators && result.operators.length === 0 && (
            <div className="p-3 bg-amber-50 rounded-xl border border-amber-100">
              <p className="text-sm text-amber-800">
                No operators are currently available for {result.country.name}. An administrator may need to run a catalog sync, or this destination may not be supported by your DingConnect account.
              </p>
            </div>
          )}

          {canContinue && (
            <button
              onClick={handleContinue}
              className="w-full py-4 rounded-xl bg-brand-600 text-white font-semibold text-lg hover:bg-brand-700 transition-all shadow-lg shadow-brand-200 active:scale-[0.99] animate-fade-in-up"
            >
              Continue to recharge
            </button>
          )}
        </div>
      )}

      {/* Not detected message */}
      {!result?.detected && result?.message && !loading && (
        <div className="mt-4 p-4 bg-amber-50 rounded-xl border border-amber-100 animate-fade-in">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800">{result.message}</p>
          </div>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="mt-4 p-4 bg-red-50 rounded-xl border border-red-100 animate-fade-in">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-red-800">{error}</p>
              <button
                onClick={() => lookup(input, selectedCountry?.iso_code)}
                className="text-sm text-red-700 font-medium underline mt-2"
              >
                Try again
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Empty hint */}
      {!input && !loading && !selectedCountry && (
        <div className="mt-3 flex items-center gap-2 text-sm text-gray-400">
          <Search className="w-4 h-4" />
          <span>Select a country above, then enter the recipient's number</span>
        </div>
      )}
    </div>
  );
}
