import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Loader2, MapPin, Phone, AlertCircle, ChevronDown } from 'lucide-react';
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

  const lookup = useCallback(async (phone: string) => {
    if (phone.replace(/[^0-9+]/g, '').replace('+', '').length < 2) {
      setResult(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    const { data, error } = await callEdgeFunction<LookupResult>('lookup-operator', {
      method: 'GET',
      params: { phone },
    });
    setLoading(false);
    if (error) {
      setError(error);
      setResult(null);
      return;
    }
    if (data) {
      setResult(data);
      if (data.detected_operator) {
        setSelectedOperator(data.detected_operator);
      } else {
        setSelectedOperator(null);
      }
    }
  }, []);

  const handleInput = (value: string) => {
    setInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => lookup(value), 500);
  };

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const canContinue =
    result?.detected &&
    result.country &&
    selectedOperator &&
    input.replace(/[^0-9+]/g, '').replace('+', '').length >= 6;

  const handleContinue = () => {
    if (!result?.country) return;
    onContinue({
      phone: result.full_number || input,
      country: result.country,
      operator: selectedOperator,
      nationalNumber: result.national_number || '',
    });
  };

  return (
    <div className="w-full">
      <div className="relative">
        <div className={`flex items-center gap-3 p-4 bg-white rounded-2xl border-2 transition-all ${
          error ? 'border-red-300' : result?.detected ? 'border-accent-400 shadow-lg shadow-accent-50' : 'border-gray-200 focus-within:border-brand-400 focus-within:shadow-lg focus-within:shadow-brand-50'
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
              }}
              className="text-gray-400 hover:text-gray-600 flex-shrink-0"
            >
              <AlertCircle className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Detection result */}
      {result?.detected && result.country && (
        <div className="mt-4 animate-fade-in-up space-y-3">
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

          {/* Operator detection */}
          {result.operators && result.operators.length > 0 && (
            <div>
              {result.auto_detected && selectedOperator ? (
                <div className="flex items-center justify-between p-3 bg-brand-50 rounded-xl border border-brand-100">
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
                      <p className="text-xs text-gray-500">Operator detected</p>
                      <p className="font-semibold text-gray-900">{selectedOperator.name}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowOperators(!showOperators)}
                    className="text-sm text-brand-600 hover:text-brand-700 font-medium"
                  >
                    Change
                  </button>
                </div>
              ) : (
                <div className="p-3 bg-amber-50 rounded-xl border border-amber-100">
                  <p className="text-sm text-amber-800 mb-2">
                    Could not auto-detect the operator. Please select it manually.
                  </p>
                </div>
              )}

              {showOperators || (!result.auto_detected && (result.operators.length > 0)) ? (
                <div className="mt-2 space-y-2">
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
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          )}

          {result.operators && result.operators.length === 0 && (
            <div className="p-3 bg-amber-50 rounded-xl border border-amber-100">
              <p className="text-sm text-amber-800">
                No operators are currently available for {result.country.name}. Please check back later or try a different number.
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

      {!result?.detected && result?.message && !loading && (
        <div className="mt-4 p-4 bg-amber-50 rounded-xl border border-amber-100 animate-fade-in">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800">{result.message}</p>
          </div>
        </div>
      )}

      {error && !loading && (
        <div className="mt-4 p-4 bg-red-50 rounded-xl border border-red-100 animate-fade-in">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-800">{error}</p>
          </div>
        </div>
      )}

      {!input && !loading && (
        <div className="mt-3 flex items-center gap-2 text-sm text-gray-400">
          <Search className="w-4 h-4" />
          <span>Try entering a country code like 509 (Haiti) or 55 (Brazil)</span>
        </div>
      )}
    </div>
  );
}
