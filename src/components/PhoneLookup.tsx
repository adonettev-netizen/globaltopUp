import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Loader2, MapPin, Phone, AlertCircle, Info, ShieldCheck, HelpCircle } from 'lucide-react';
import { callEdgeFunction } from '@/lib/supabase';
import type { LookupResult, Operator } from '@/types';

interface Props {
  onContinue: (data: {
    phone: string;
    country: LookupResult['country'];
    operator: Operator | null;
    nationalNumber: string;
  }) => void;
}

export function PhoneLookup({ onContinue }: Props) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LookupResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedOperator, setSelectedOperator] = useState<Operator | null>(null);
  const [showOperators, setShowOperators] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const requestIdRef = useRef(0);

  const lookup = useCallback(async (phone: string) => {
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

    const { data, error: fnError } = await callEdgeFunction<LookupResult>('lookup-operator', {
      method: 'GET',
      params: { phone },
    });

    // Stale response check — ignore if a newer request was fired
    if (currentRequestId !== requestIdRef.current) return;

    setLoading(false);

    if (fnError) {
      setError(fnError);
      setResult(null);
      return;
    }

    if (data) {
      setResult(data);
      if (data.detected_operator && data.operator_detection_method !== 'none') {
        setSelectedOperator(data.detected_operator);
      } else {
        setSelectedOperator(null);
      }
      if (!data.detected_operator) {
        setShowOperators(true);
      }
    }
  }, []);

  const handleInput = (value: string) => {
    setInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    // Reset state immediately on new input
    setError(null);
    if (value.replace(/[^0-9+]/g, '').replace('+', '').length < 2) {
      setResult(null);
      setLoading(false);
      requestIdRef.current++;
      return;
    }
    debounceRef.current = setTimeout(() => lookup(value), 600);
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
            placeholder="Enter recipient number, e.g. +509 3..."
            className="flex-1 text-lg font-medium outline-none bg-transparent placeholder:text-gray-400 placeholder:font-normal"
            autoFocus
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

              {/* Operator list — shown when manual selection needed or user clicked Change */}
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
                onClick={() => lookup(input)}
                className="text-sm text-red-700 font-medium underline mt-2"
              >
                Try again
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Empty hint */}
      {!input && !loading && (
        <div className="mt-3 flex items-center gap-2 text-sm text-gray-400">
          <Search className="w-4 h-4" />
          <span>Try entering a country code like 509 (Haiti) or 55 (Brazil)</span>
        </div>
      )}
    </div>
  );
}
