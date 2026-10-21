import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, ArrowRight, Check, Loader2, Shield, Smartphone, CreditCard, Lock, AlertCircle } from 'lucide-react';
import { PhoneLookup } from '@/components/PhoneLookup';
import { StatusBadge } from '@/components/StatusBadge';
import { supabase, callEdgeFunction } from '@/lib/supabase';
import { navigate } from '@/lib/router';
import type { LookupResult, Operator, RechargeProduct, CreateOrderResponse, Order } from '@/types';

type Step = 'phone' | 'product' | 'review' | 'payment' | 'processing';

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

export function RechargePage({ onOrderCreated, initialPhoneData }: Props) {
  const [step, setStep] = useState<Step>(initialPhoneData ? 'product' : 'phone');
  const [phoneData, setPhoneData] = useState<PhoneData | null>(initialPhoneData ?? null);

  const [products, setProducts] = useState<RechargeProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<RechargeProduct | null>(null);

  const [paymentCurrency, setPaymentCurrency] = useState('USD');
  const [selectedProvider, setSelectedProvider] = useState<'stripe' | 'mercado_pago'>('stripe');
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [createdOrder, setCreatedOrder] = useState<CreateOrderResponse | null>(null);

  // Load products when operator is confirmed
  const loadProducts = useCallback(async () => {
    if (!phoneData?.operator || !phoneData.operator.id) return;
    setLoadingProducts(true);
    const { data, error } = await supabase
      .from('recharge_products')
      .select('id, ding_product_code, product_name, local_amount, local_currency, wholesale_cost, is_active')
      .eq('operator_id', phoneData.operator.id)
      .eq('is_active', true)
      .order('local_amount', { ascending: true });

    setLoadingProducts(false);
    if (error) {
      console.error('Error loading products:', error);
      return;
    }
    setProducts((data as RechargeProduct[]) || []);
  }, [phoneData?.operator]);

  useEffect(() => {
    if (step === 'product' && phoneData?.operator) {
      loadProducts();
    }
  }, [step, phoneData?.operator, loadProducts]);

  // Detect if country is Brazil → BRL/PIX
  useEffect(() => {
    if (phoneData?.country?.iso_code === 'BR') {
      setPaymentCurrency('BRL');
    } else {
      setPaymentCurrency('USD');
    }
  }, [phoneData?.country]);

  const handleContinue = (data: typeof phoneData) => {
    setPhoneData(data);
    setStep('product');
  };

  const handleCreateOrder = async () => {
    if (!phoneData || !selectedProduct) return;
    setCreatingOrder(true);
    setOrderError(null);

    const { data, error } = await callEdgeFunction<CreateOrderResponse>('create-order', {
      method: 'POST',
      body: {
        recipient_phone: phoneData.phone,
        country_id: phoneData.country!.id,
        operator_id: phoneData.operator?.id,
        product_id: selectedProduct.id,
        payment_currency: paymentCurrency,
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
    { key: 'product', label: 'Amount' },
    { key: 'review', label: 'Review' },
    { key: 'payment', label: 'Pay' },
  ];

  const currentStepIndex = steps.findIndex((s) => s.key === step);

  return (
    <div className="min-h-screen bg-gray-50 pt-20 pb-16">
      <div className="max-w-2xl mx-auto px-4 sm:px-6">
        {/* Progress */}
        {step !== 'processing' && (
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

        {/* Step: Product */}
        {step === 'product' && phoneData && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8 animate-fade-in-up">
            <div className="flex items-center gap-3 mb-6">
              <button onClick={() => setStep('phone')} className="text-gray-400 hover:text-gray-600">
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h2 className="font-display text-xl font-bold text-gray-900">Select recharge amount</h2>
            </div>

            <div className="flex items-center gap-3 p-3 bg-brand-50 rounded-xl mb-6">
              <span className="text-2xl">{phoneData.country?.flag}</span>
              <div className="flex-1">
                <p className="font-semibold text-gray-900">{phoneData.country?.name}</p>
                <p className="text-sm text-gray-600">{phoneData.phone} · {phoneData.operator?.name || 'Operator not selected'}</p>
              </div>
            </div>

            {loadingProducts ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-20 skeleton rounded-xl" />
                ))}
              </div>
            ) : products.length === 0 ? (
              <div className="p-6 bg-amber-50 rounded-xl border border-amber-100 text-center">
                <AlertCircle className="w-8 h-8 text-amber-500 mx-auto mb-2" />
                <p className="text-amber-800 font-medium">No recharge products available</p>
                <p className="text-sm text-amber-700 mt-1">
                  No products are currently synced for this operator. An administrator needs to run a DingConnect synchronization to load available recharges.
                </p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {products.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        setSelectedProduct(p);
                        setStep('review');
                      }}
                      className="p-4 rounded-xl border-2 text-left transition-all hover:border-brand-400 hover:bg-brand-50 hover:shadow-sm active:scale-[0.98] ${
                        selectedProduct?.id === p.id ? 'border-brand-500 bg-brand-50' : 'border-gray-200'
                      }"
                    >
                      <div className="text-2xl font-bold text-gray-900 font-display">
                        {p.local_currency} {p.local_amount.toLocaleString()}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">{p.product_name}</div>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-4 text-center">
                  Prices shown in local currency. Your final price will be calculated in the next step.
                </p>
              </>
            )}
          </div>
        )}

        {/* Step: Review */}
        {step === 'review' && phoneData && selectedProduct && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8 animate-fade-in-up">
            <div className="flex items-center gap-3 mb-6">
              <button onClick={() => setStep('product')} className="text-gray-400 hover:text-gray-600">
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h2 className="font-display text-xl font-bold text-gray-900">Review your order</h2>
            </div>

            <div className="space-y-3 mb-6">
              <ReviewRow label="Destination" value={`${phoneData.country?.flag} ${phoneData.country?.name}`} />
              <ReviewRow label="Recipient" value={phoneData.phone} />
              <ReviewRow label="Operator" value={phoneData.operator?.name || 'Not selected'} />
              <ReviewRow label="Recharge" value={`${selectedProduct.local_currency} ${selectedProduct.local_amount.toLocaleString()} — ${selectedProduct.product_name}`} />
              <ReviewRow label="Payment currency" value={paymentCurrency} />
            </div>

            <div className="p-4 bg-brand-50 rounded-xl border border-brand-100 mb-6">
              <p className="text-sm text-gray-600 mb-1">You are purchasing a mobile recharge for:</p>
              <p className="font-semibold text-gray-900">{phoneData.phone}</p>
              <p className="text-sm text-gray-600 mt-1">
                The final price will be calculated securely on our servers and shown on the payment screen.
              </p>
            </div>

            <div className="mb-6">
              <p className="text-sm font-semibold text-gray-900 mb-3">Payment method</p>
              <div className="space-y-2">
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

                <button
                  onClick={() => {
                    setSelectedProvider('mercado_pago');
                    if (phoneData.country?.iso_code === 'BR') {
                      setPaymentCurrency('BRL');
                    }
                  }}
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
                    {createdOrder.order.customer_currency} {createdOrder.order.customer_amount.toFixed(2)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-600">Recipient</p>
                  <p className="font-semibold text-gray-900">{createdOrder.order.recipient_phone}</p>
                </div>
              </div>
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
              {createdOrder.checkout_url ? `Pay ${createdOrder.order.customer_currency} ${createdOrder.order.customer_amount.toFixed(2)}` : 'Continue'}
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

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-medium text-gray-900 text-right">{value}</span>
    </div>
  );
}
