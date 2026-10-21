import { useState, useEffect, useCallback } from 'react';
import { CheckCircle2, Loader2, Clock, XCircle, ArrowRight, RefreshCw } from 'lucide-react';
import { callEdgeFunction } from '@/lib/supabase';
import { navigate } from '@/lib/router';
import { StatusBadge } from '@/components/StatusBadge';
import type { Order } from '@/types';

interface Props {
  orderRef: string;
  accessToken: string;
}

export function ConfirmationPage({ orderRef, accessToken }: Props) {
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOrder = useCallback(async () => {
    setLoading(true);
    const { data, error } = await callEdgeFunction<{ order: Order }>('order-status', {
      method: 'GET',
      params: { ref: orderRef, token: accessToken },
    });
    setLoading(false);
    if (error) {
      setError(error);
      return;
    }
    if (data?.order) {
      setOrder(data.order);
    }
  }, [orderRef, accessToken]);

  useEffect(() => {
    fetchOrder();
    // Poll for updates while pending
    const interval = setInterval(() => {
      fetchOrder();
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchOrder]);

  // Stop polling when terminal state reached
  useEffect(() => {
    if (order && (order.recharge_status === 'completed' || order.recharge_status === 'recharge_failed')) {
      // Let the last fetch settle
    }
  }, [order?.recharge_status]);

  const isPending = order && order.payment_status === 'pending_payment';
  const isProcessing = order && (order.recharge_status === 'processing' || order.payment_status === 'payment_confirmed');
  const isComplete = order && order.recharge_status === 'completed';
  const isFailed = order && (order.payment_status === 'payment_failed' || order.recharge_status === 'recharge_failed');

  return (
    <div className="min-h-screen bg-gray-50 pt-20 pb-16">
      <div className="max-w-2xl mx-auto px-4 sm:px-6">
        {loading && !order && (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-12 h-12 text-brand-500 animate-spin mb-4" />
            <p className="text-gray-600">Loading your order...</p>
          </div>
        )}

        {error && (
          <div className="p-6 bg-red-50 rounded-2xl border border-red-100 text-center">
            <XCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
            <p className="text-red-800 font-medium">{error}</p>
          </div>
        )}

        {order && (
          <div className="animate-fade-in-up">
            {/* Status hero */}
            <div className={`rounded-2xl p-8 text-center mb-6 ${
              isComplete ? 'bg-accent-50 border border-accent-200' :
              isFailed ? 'bg-red-50 border border-red-200' :
              'bg-brand-50 border border-brand-200'
            }`}>
              {isComplete && <CheckCircle2 className="w-16 h-16 text-accent-500 mx-auto mb-4 animate-fade-in" />}
              {isFailed && <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4 animate-fade-in" />}
              {(isPending || isProcessing) && <Clock className="w-16 h-16 text-brand-500 mx-auto mb-4 animate-pulse-soft" />}

              <h1 className="font-display text-2xl font-bold text-gray-900 mb-2">
                {isComplete ? 'Recharge delivered!' :
                 isFailed ? 'Order issue' :
                 isPending ? 'Awaiting payment' :
                 'Recharge processing'}
              </h1>
              <p className="text-gray-600 mb-4">
                {isComplete ? 'Your mobile recharge has been successfully delivered.' :
                 isFailed ? 'There was an issue with your order. Please contact support.' :
                 isPending ? 'Complete your payment to send the recharge.' :
                 'Payment confirmed. Your recharge is being sent to the operator.'}
              </p>
              <div className="flex items-center justify-center gap-2">
                <StatusBadge status={order.payment_status} />
                <StatusBadge status={order.recharge_status} />
              </div>
            </div>

            {/* Payment instructions for pending */}
            {isPending && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
                <h2 className="font-semibold text-gray-900 mb-3">Complete your payment</h2>
                <p className="text-sm text-gray-600 mb-4">
                  {order.payment_provider === 'mercado_pago'
                    ? 'You will be redirected to Mercado Pago to complete your PIX payment.'
                    : 'You will be redirected to Stripe to complete your payment securely.'}
                </p>
                <button
                  className="w-full py-3 rounded-xl bg-brand-600 text-white font-semibold hover:bg-brand-700 flex items-center justify-center gap-2"
                  onClick={() => {
                    window.location.href = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-checkout?ref=${orderRef}`;
                  }}
                >
                  Pay now <ArrowRight className="w-5 h-5" />
                </button>
              </div>
            )}

            {/* Order summary */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-gray-900">Order summary</h2>
                <button
                  onClick={fetchOrder}
                  className="text-sm text-brand-600 hover:text-brand-700 flex items-center gap-1"
                >
                  <RefreshCw className="w-4 h-4" /> Refresh
                </button>
              </div>

              <div className="space-y-3">
                <Row label="Order reference" value={order.order_reference} mono />
                <Row label="Recipient" value={order.recipient_phone} />
                <Row label="Destination" value={order.country ? `${order.country.flag} ${order.country.name}` : '—'} />
                <Row label="Operator" value={order.operator?.name || '—'} />
                <Row label="Recharge" value={order.product ? `${order.product.product_name} — ${order.product.local_currency} ${order.product.local_amount}` : '—'} />
                <Row label="Amount paid" value={`${order.customer_currency} ${order.customer_amount.toFixed(2)}`} />
                <Row label="Payment method" value={order.payment_provider === 'mercado_pago' ? 'PIX (Mercado Pago)' : 'Stripe'} />
                {order.provider_transaction_id && (
                  <Row label="Transaction ID" value={order.provider_transaction_id} mono />
                )}
                <Row label="Date" value={new Date(order.created_at).toLocaleString()} />
              </div>

              <div className="mt-6 pt-6 border-t border-gray-100">
                <p className="text-sm text-gray-500 mb-3">
                  Save your order reference to check the status later.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => navigate('/')}
                    className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-700 font-medium hover:bg-gray-50"
                  >
                    Back to home
                  </button>
                  <button
                    onClick={() => navigate(`/track?ref=${order.order_reference}&token=${accessToken}`)}
                    className="flex-1 py-2.5 rounded-xl bg-brand-600 text-white font-medium hover:bg-brand-700"
                  >
                    Track order
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-500">{label}</span>
      <span className={`text-sm font-medium text-gray-900 ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}
