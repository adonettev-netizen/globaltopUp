import { useState, useEffect, useCallback, useRef } from 'react';
import { ArrowLeft, ArrowRight, Check, Loader2, Shield, Smartphone, CreditCard, Lock, AlertCircle, DollarSign, TrendingUp, Info } from 'lucide-react';
import { PhoneLookup } from '@/components/PhoneLookup';
import { supabase, callEdgeFunction } from '@/lib/supabase';
import { navigate } from '@/lib/router';
import type { LookupResult, Operator, CreateOrderResponse, PricingQuote } from '@/types';

type Step = 'phone' | 'amount' | 'review' | 'payment';

interface PhoneData {
  phone: string;
  country: LookupResult['country'];
  operator: Operator | null;
  nationalNumber: string;
}

interface Props {
  onOrderCreated: (orderRef: string, accessToken: string) => void;
  initialPhoneData?: PhoneData | null;
}

const SUGGESTED_AMOUNTS = [10, 20, 30, 50, 100];
const MIN_BRL = 10;

function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function formatCurrency(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

export function RechargePage({ onOrderCreated, initialPhoneData }: Props) {
  const [step, setStep] = useState<Step>(initialPhoneData ? 'amount' : 'phone');
  const [phoneData, setPhoneData] = useState<PhoneData | null>(initialPhoneData ?? null);

  const [brlAmount, setBrlAmount] = useState<string>('');
  const [quote, setQuote] = useState<PricingQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [amountTouched, setAmountTouched] = useState(false);
  const [selectedAltProduct, setSelectedAltProduct] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const quoteRequestId = useRef(0);

  const [selectedProvider, setSelectedProvider] = useState<'stripe' | 'mercado_pago'>('mercado_pago');
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [createdOrder, setCreatedOrder] = useState<CreateOrderResponse | null>(null);

  const numericAmount = parseFloat(brlAmount) || 0;
  const isAmountValid = numericAmount >= MIN_BRL;

  // Fetch pricing quote when amount changes
  const fetchQuote = useCallback(async (amount: number, operatorId: string) => {
    const currentRequestId = ++quoteRequestId.current;
    if (amount < MIN_BRL) {
      setQuote(null);
      setQuoteError(null);
      return;
    }

    setQuoteLoading(true);
    setQuoteError(null);

    const { data, error } = await callEdgeFunction<PricingQuote>('pricing-quote', {
      method: 'GET',
      params: { operator_id: operatorId, amount_brl: amount.toString() },
    });

    if (currentRequestId !== quoteRequestId.current) return;

    setQuoteLoading(false);
    if (error) {
      setQuoteError(error);
      setQuote(null);
    } else if (data) {
      setQuote(data);
      setSelectedAltProduct(null);
    }
  }, []);

  const handleAmountInput = (value: string) => {
    // Only allow numbers and decimal point
    const cleaned = value.replace(/[^0-9.]/g, '');
    setBrlAmount(cleaned);
    setAmountTouched(true);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    const num = parseFloat(cleaned);
    if (num >= MIN_BRL && phoneData?.operator?.id) {
      debounceRef.current = setTimeout(() => fetchQuote(num, phoneData.operator!.id), 500);
    } else {
      setQuote(null);
      setQuoteError(null);
    }
  };

  const handleSuggestedAmount = (amount: number) => {
    setBrlAmount(amount.toString());
    setAmountTouched(true);
    if (phoneData?.operator?.id) {
      fetchQuote(amount, phoneData.operator.id);
    }
  };

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleContinue = (data: typeof phoneData) => {
    setPhoneData(data);
    setStep('amount');
  };

  const handleCreateOrder = async () => {
    if (!phoneData || !quote) return;
    setCreatingOrder(true);
    setOrderError(null);

    const productId = selectedAltProduct || quote.matched_product.id;

    const { data, error } = await callEdgeFunction<CreateOrderResponse>('create-order', {
      method: 'POST',
      body: {
        recipient_phone: phoneData.phone,
        country_id: phoneData.country!.id,
        operator_id: phoneData.operator?.id,
        product_id: productId,
        amount_brl: numericAmount.toString(),
        payment_provider: selectedProvider,
      },
    });

    setCreatingOrder(false);

    if (error || !data) {
      setOrderError(error || 'Failed to create order');
      return;
    }

    setCreatedOrder(data);
    setStep('payment');
  };

  const handlePay = () => {
    if (!createdOrder) return;
    if (createdOrder.checkout_url) {
      window.location.href = createdOrder.checkout_url;
    } else {
      onOrderCreated(createdOrder.order.order_reference, createdOrder.order.access_token);
    }
  };

  const steps: { key: Step; label: string }[] = [
    { key: 'phone', label: 'Phone' },
    { key: 'amount', label: 'Amount' },
    { key: 'review', label: 'Review' },
    { key: 'payment', label: 'Pay' },
  ];

  const currentStepIndex = steps.findIndex((s) => s.key === step);

  const canProceedToReview = isAmountValid && quote && !quoteLoading;

  return (
    <div className="min-h-screen bg-gray-50 pt-20 pb-16">
      <div className="max-w-2xl mx-auto px-4 sm:px-6">
        {/* Progress */}
        {step !== 'payment' && (
          <div className="mb-8">
            <div className="flex items-center justify-between">
              {steps.map((s, i) => (
                <div key={s.key} className="flex items-center flex-1 last:flex-none">
                  <div className="flex flex-col items-center gap-2">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm transition-all ${
                        i < currentStepIndex
                          ? 'bg-accent-500 text-white'
                          : i === currentStepIndex
                          ? 'bg-brand-600 text-white ring-4 ring-brand-100'
                          : 'bg-gray-200 text-gray-500'
                      }`}
                    >
                      {i < currentStepIndex ? <Check className="w-5 h-5" /> : i + 1}
                    </div>
                    <span className={`text-xs font-medium ${i === currentStepIndex ? 'text-brand-700' : 'text-gray-500'}`}>
                      {s.label}
                    </span>
                  </div>
                  {i < steps.length - 1 && (
                    <div className={`flex-1 h-0.5 mx-2 -mt-6 ${i < currentStepIndex ? 'bg-accent-500' : 'bg-gray-200'}`} />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step: Phone */}
        {step === 'phone' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8 animate-fade-in-up">
            <div className="flex items-center gap-3 mb-6">
              <button onClick={() => navigate('/')} className="text-gray-400 hover:text-gray-600">
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h2 className="font-display text-xl font-bold text-gray-900">Enter recipient number</h2>
            </div>
            <p className="text-gray-600 mb-6">
              Type the full phone number including the country code. We'll identify the destination country and mobile operator automatically.
            </p>
            <PhoneLookup onContinue={handleContinue} />
          </div>
        )}

        {/* Step: Amount */}
        {step === 'amount' && phoneData && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8 animate-fade-in-up">
            <div className="flex items-center gap-3 mb-6">
              <button onClick={() => setStep('phone')} className="text-gray-400 hover:text-gray-600">
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h2 className="font-display text-xl font-bold text-gray-900">Choose recharge amount</h2>
            </div>

            <div className="flex items-center gap-3 p-3 bg-brand-50 rounded-xl mb-6">
              <span className="text-2xl">{phoneData.country?.flag}</span>
              <div className="flex-1">
                <p className="font-semibold text-gray-900">{phoneData.country?.name}</p>
                <p className="text-sm text-gray-600">{phoneData.phone} · {phoneData.operator?.name || 'Operator not selected'}</p>
              </div>
            </div>

            {/* Amount input */}
            <div className="mb-4">
              <label className="block text-sm font-semibold text-gray-900 mb-2">Your recharge amount</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-bold text-gray-500">R$</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={brlAmount}
                  onChange={(e) => handleAmountInput(e.target.value)}
                  placeholder="0,00"
                  className={`w-full pl-12 pr-4 py-4 text-2xl font-bold font-display rounded-xl border-2 outline-none transition-all ${
                    amountTouched && !isAmountValid
                      ? 'border-red-300 bg-red-50'
                      : isAmountValid
                      ? 'border-brand-400 bg-brand-50'
                      : 'border-gray-200 focus:border-brand-400'
                  }`}
                  autoFocus
                />
                {quoteLoading && <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-brand-500 animate-spin" />}
              </div>
              <p className={`text-xs mt-2 ${amountTouched && !isAmountValid ? 'text-red-600' : 'text-gray-500'}`}>
                {amountTouched && !isAmountValid
                  ? `Minimum amount is ${formatBRL(MIN_BRL)}`
                  : `Minimum: ${formatBRL(MIN_BRL)}`}
              </p>
            </div>

            {/* Suggested amounts */}
            <div className="mb-6">
              <p className="text-xs font-medium text-gray-500 mb-2">Quick select</p>
              <div className="flex flex-wrap gap-2">
                {SUGGESTED_AMOUNTS.map((amt) => (
                  <button
                    key={amt}
                    onClick={() => handleSuggestedAmount(amt)}
                    className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
                      numericAmount === amt
                        ? 'bg-brand-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {formatBRL(amt)}
                  </button>
                ))}
              </div>
            </div>

            {/* Quote results */}
            {quote && !quoteLoading && (
              <div className="space-y-4 animate-fade-in-up">
                {/* Estimated recipient value */}
                <div className="p-4 bg-accent-50 rounded-xl border border-accent-100">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="w-4 h-4 text-accent-600" />
                    <span className="text-sm font-semibold text-gray-900">Estimated recipient value</span>
                  </div>
                  <p className="text-2xl font-bold font-display text-gray-900">
                    {formatCurrency(quote.matched_product.local_amount, quote.destination_currency)}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {quote.matched_product.is_exact_match
                      ? 'Exact match found'
                      : quote.matched_product.is_within_tolerance
                      ? `Close match (±${formatCurrency(quote.matched_product.difference_from_requested, quote.destination_currency)})`
                      : `Closest available denomination`}
                  </p>
                </div>

                {/* Exchange rate */}
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <span className="text-sm text-gray-600">Exchange rate</span>
                  <span className="text-sm font-medium text-gray-900">
                    1 BRL = {quote.exchange_rate_brl_to_dest.toFixed(2)} {quote.destination_currency}
                  </span>
                </div>

                {/* Total to pay */}
                <div className="p-4 bg-brand-50 rounded-xl border border-brand-100">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-gray-900">Total to pay</span>
                    <span className="text-2xl font-bold font-display text-brand-700">
                      {formatBRL(quote.customer_price_brl)}
                    </span>
                  </div>
                </div>

                {/* Alternatives (if not exact match) */}
                {!quote.matched_product.is_exact_match && quote.alternatives && quote.alternatives.length > 0 && (
                  <div className="p-4 bg-amber-50 rounded-xl border border-amber-100">
                    <div className="flex items-start gap-2 mb-3">
                      <Info className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-amber-800">
                        The exact amount isn't available. Here are the closest options — select one to continue:
                      </p>
                    </div>
                    <div className="space-y-2">
                      <button
                        onClick={() => setSelectedAltProduct(null)}
                        className={`w-full flex items-center justify-between p-3 rounded-lg border-2 transition-all text-left ${
                          !selectedAltProduct ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-brand-300'
                        }`}
                      >
                        <div>
                          <p className="font-semibold text-gray-900">
                            {formatCurrency(quote.matched_product.local_amount, quote.destination_currency)}
                          </p>
                          <p className="text-xs text-gray-500">{quote.matched_product.product_name}</p>
                        </div>
                        <span className="text-sm font-medium text-gray-700">
                          ~{formatBRL(quote.customer_price_brl)}
                        </span>
                      </button>
                      {quote.alternatives.slice(0, 4).map((alt) => (
                        <button
                          key={alt.id}
                          onClick={() => setSelectedAltProduct(alt.id)}
                          className={`w-full flex items-center justify-between p-3 rounded-lg border-2 transition-all text-left ${
                            selectedAltProduct === alt.id ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-brand-300'
                          }`}
                        >
                          <div>
                            <p className="font-semibold text-gray-900">
                              {formatCurrency(alt.local_amount, alt.local_currency)}
                            </p>
                            <p className="text-xs text-gray-500">{alt.product_name}</p>
                          </div>
                          <span className="text-sm font-medium text-gray-700">
                            ~{formatBRL(alt.estimated_brl_cost)}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {quoteError && (
                  <div className="p-3 bg-red-50 rounded-lg border border-red-100 flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-red-800">{quoteError}</p>
                  </div>
                )}

                <button
                  onClick={() => setStep('review')}
                  disabled={!canProceedToReview}
                  className="w-full py-4 rounded-xl bg-brand-600 text-white font-semibold text-lg hover:bg-brand-700 transition-all shadow-lg shadow-brand-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  Continue to review <ArrowRight className="w-5 h-5" />
                </button>
              </div>
            )}

            {/* Empty state when amount is valid but quote not loaded yet */}
            {isAmountValid && !quote && !quoteLoading && !quoteError && (
              <div className="p-4 bg-gray-50 rounded-xl text-center">
                <p className="text-sm text-gray-500">Calculating pricing...</p>
              </div>
            )}

            {quoteError && !quote && (
              <div className="p-3 bg-red-50 rounded-lg border border-red-100 flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-800">{quoteError}</p>
              </div>
            )}
          </div>
        )}

        {/* Step: Review */}
        {step === 'review' && phoneData && quote && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8 animate-fade-in-up">
            <div className="flex items-center gap-3 mb-6">
              <button onClick={() => setStep('amount')} className="text-gray-400 hover:text-gray-600">
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h2 className="font-display text-xl font-bold text-gray-900">Review your order</h2>
            </div>

            <div className="space-y-3 mb-6">
              <ReviewRow label="Destination" value={`${phoneData.country?.flag} ${phoneData.country?.name}`} />
              <ReviewRow label="Recipient" value={phoneData.phone} />
              <ReviewRow label="Operator" value={phoneData.operator?.name || 'Not selected'} />
              <ReviewRow label="Your amount" value={formatBRL(numericAmount)} />
              <ReviewRow
                label="Recipient receives"
                value={formatCurrency(quote.matched_product.local_amount, quote.destination_currency)}
              />
              <ReviewRow
                label="Exchange rate"
                value={`1 BRL = ${quote.exchange_rate_brl_to_dest.toFixed(2)} ${quote.destination_currency}`}
              />
              <ReviewRow label="Total to pay" value={formatBRL(quote.customer_price_brl)} highlight />
            </div>

            <div className="p-4 bg-brand-50 rounded-xl border border-brand-100 mb-6">
              <p className="text-sm text-gray-600 mb-1">You are sending a mobile recharge to:</p>
              <p className="font-semibold text-gray-900">{phoneData.phone}</p>
              <p className="text-sm text-gray-600 mt-1">
                The recipient will receive approximately {formatCurrency(quote.matched_product.local_amount, quote.destination_currency)} in airtime.
              </p>
            </div>

            {/* Payment method */}
            <div className="mb-6">
              <p className="text-sm font-semibold text-gray-900 mb-3">Payment method</p>
              <div className="space-y-2">
                <button
                  onClick={() => setSelectedProvider('mercado_pago')}
                  className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 transition-all text-left ${
                    selectedProvider === 'mercado_pago'
                      ? 'border-brand-500 bg-brand-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <Smartphone className={`w-6 h-6 ${selectedProvider === 'mercado_pago' ? 'text-brand-600' : 'text-gray-400'}`} />
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900">PIX (Mercado Pago)</p>
                    <p className="text-sm text-gray-600">Pay instantly with PIX QR code</p>
                  </div>
                  {selectedProvider === 'mercado_pago' && <Check className="w-5 h-5 text-brand-600" />}
                </button>

                <button
                  onClick={() => setSelectedProvider('stripe')}
                  className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 transition-all text-left ${
                    selectedProvider === 'stripe'
                      ? 'border-brand-500 bg-brand-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <CreditCard className={`w-6 h-6 ${selectedProvider === 'stripe' ? 'text-brand-600' : 'text-gray-400'}`} />
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900">Stripe</p>
                    <p className="text-sm text-gray-600">Credit card, Apple Pay, Google Pay</p>
                  </div>
                  {selectedProvider === 'stripe' && <Check className="w-5 h-5 text-brand-600" />}
                </button>
              </div>
            </div>

            {orderError && (
              <div className="mb-4 p-3 bg-red-50 rounded-lg border border-red-100 flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-800">{orderError}</p>
              </div>
            )}

            <button
              onClick={handleCreateOrder}
              disabled={creatingOrder}
              className="w-full py-4 rounded-xl bg-brand-600 text-white font-semibold text-lg hover:bg-brand-700 transition-all shadow-lg shadow-brand-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {creatingOrder ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> Creating order...</>
              ) : (
                <>Continue to payment <ArrowRight className="w-5 h-5" /></>
              )}
            </button>
          </div>
        )}

        {/* Step: Payment */}
        {step === 'payment' && createdOrder && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8 animate-fade-in-up">
            <div className="flex items-center gap-3 mb-6">
              <button onClick={() => setStep('review')} className="text-gray-400 hover:text-gray-600">
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h2 className="font-display text-xl font-bold text-gray-900">Complete payment</h2>
            </div>

            <div className="p-5 bg-gradient-to-br from-brand-50 to-accent-50 rounded-2xl mb-6">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm text-gray-600">Order reference</span>
                <span className="font-mono font-semibold text-gray-900">{createdOrder.order.order_reference}</span>
              </div>
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-sm text-gray-600">Total to pay</p>
                  <p className="text-3xl font-bold font-display text-gray-900">
                    {formatBRL(createdOrder.order.customer_amount)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-600">Recipient</p>
                  <p className="font-semibold text-gray-900">{createdOrder.order.recipient_phone}</p>
                </div>
              </div>
              {createdOrder.pricing && (
                <div className="mt-3 pt-3 border-t border-brand-100">
                  <p className="text-xs text-gray-500">
                    Recipient receives ~{formatCurrency(createdOrder.pricing.destination_amount, createdOrder.pricing.destination_currency)}
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-2 mb-6">
              <div className="flex items-center gap-3 p-4 rounded-xl border-2 border-brand-500 bg-brand-50">
                {createdOrder.order.payment_provider === 'mercado_pago'
                  ? <Smartphone className="w-6 h-6 text-brand-600" />
                  : <CreditCard className="w-6 h-6 text-brand-600" />}
                <div className="flex-1">
                  <p className="font-semibold text-gray-900">
                    {createdOrder.order.payment_provider === 'mercado_pago' ? 'PIX (Mercado Pago)' : 'Stripe'}
                  </p>
                  <p className="text-sm text-gray-600">
                    {createdOrder.order.payment_provider === 'mercado_pago'
                      ? 'Pay instantly with PIX QR code'
                      : 'Credit card, Apple Pay, Google Pay'}
                  </p>
                </div>
                <Check className="w-5 h-5 text-brand-600" />
              </div>
            </div>

            <div className="flex items-center gap-2 mb-6 text-sm text-gray-500">
              <Lock className="w-4 h-4" />
              <span>Payment is processed securely. We never see or store your card details.</span>
            </div>

            {createdOrder.checkout_error && (
              <div className="mb-4 p-3 bg-amber-50 rounded-lg border border-amber-100 flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-amber-800 font-medium">Payment provider not fully configured</p>
                  <p className="text-xs text-amber-700 mt-1">{createdOrder.checkout_error}</p>
                  <p className="text-xs text-amber-600 mt-1">Your order is created — you can still track it, but checkout redirect is unavailable.</p>
                </div>
              </div>
            )}

            <button
              onClick={handlePay}
              className="w-full py-4 rounded-xl bg-brand-600 text-white font-semibold text-lg hover:bg-brand-700 transition-all shadow-lg shadow-brand-200 flex items-center justify-center gap-2"
            >
              <Shield className="w-5 h-5" />
              {createdOrder.checkout_url ? `Pay ${formatBRL(createdOrder.order.customer_amount)}` : 'Continue'}
            </button>

            <p className="text-xs text-gray-400 mt-4 text-center">
              The recharge will be sent to {createdOrder.order.recipient_phone} after payment is verified by our secure webhook.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function ReviewRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-2 border-b border-gray-100 last:border-0 ${highlight ? 'bg-brand-50 -mx-2 px-2 rounded-lg' : ''}`}>
      <span className={`text-sm ${highlight ? 'font-semibold text-gray-900' : 'text-gray-500'}`}>{label}</span>
      <span className={`text-sm ${highlight ? 'font-bold text-brand-700 text-base' : 'font-medium text-gray-900'} text-right`}>{value}</span>
    </div>
  );
}
