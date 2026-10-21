import { useState, useEffect } from 'react';
import { Search, Loader2, ArrowLeft, CheckCircle2, XCircle, Clock, Smartphone, Globe } from 'lucide-react';
import { callEdgeFunction } from '@/lib/supabase';
import { navigate } from '@/lib/router';
import { StatusBadge } from '@/components/StatusBadge';
import type { Order } from '@/types';

export function TrackOrderPage() {
  const [orderRef, setOrderRef] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Auto-fill from URL params
  useEffect(() => {
    const hash = window.location.hash;
    const params = new URLSearchParams(hash.split('?')[1] || '');
    const ref = params.get('ref');
    const token = params.get('token');
    if (ref) {
      setOrderRef(ref);
      if (token) setAccessToken(token);
      // Auto-lookup
      lookupOrder(ref, token || '');
    }
  }, []);

  const lookupOrder = async (ref: string, token: string) => {
    if (!ref) return;
    setLoading(true);
    setError(null);
    const { data, error } = await callEdgeFunction<{ order: Order }>('order-status', {
      method: 'GET',
      params: { ref, ...(token ? { token } : {}) },
    });
    setLoading(false);
    if (error) {
      setError(error);
      setOrder(null);
      return;
    }
    if (data?.order) {
      setOrder(data.order);
    } else {
      setError('Order not found');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    lookupOrder(orderRef, accessToken);
  };

  return (
    <div className="min-h-screen bg-gray-50 pt-20 pb-16">
      <div className="max-w-2xl mx-auto px-4 sm:px-6">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate('/')} className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="font-display text-2xl font-bold text-gray-900">Track your order</h1>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Order reference</label>
          <div className="flex gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={orderRef}
                onChange={(e) => setOrderRef(e.target.value)}
                placeholder="GTU-XXXXXXXX"
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none font-mono"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !orderRef}
              className="px-6 py-3 rounded-xl bg-brand-600 text-white font-semibold hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
              Track
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            For guest orders, include the access token from your confirmation page.
          </p>
          <input
            type="text"
            value={accessToken}
            onChange={(e) => setAccessToken(e.target.value)}
            placeholder="Access token (for guest orders)"
            className="w-full mt-3 px-4 py-2 rounded-xl border border-gray-200 text-sm font-mono outline-none focus:border-brand-400"
          />
        </form>

        {error && (
          <div className="p-4 bg-red-50 rounded-xl border border-red-100 flex items-start gap-3">
            <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {order && <OrderDetails order={order} />}
      </div>
    </div>
  );
}

export function OrderDetails({ order }: { order: Order }) {
  const statusIcon = () => {
    if (order.payment_status === 'payment_confirmed' && order.recharge_status === 'completed') {
      return <CheckCircle2 className="w-16 h-16 text-accent-500" />;
    }
    if (order.payment_status === 'payment_failed' || order.recharge_status === 'recharge_failed') {
      return <XCircle className="w-16 h-16 text-red-500" />;
    }
    return <Clock className="w-16 h-16 text-brand-500 animate-pulse-soft" />;
  };

  return (
    <div className="space-y-4 animate-fade-in-up">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 text-center">
        <div className="flex justify-center mb-4">{statusIcon()}</div>
        <h2 className="font-display text-xl font-bold text-gray-900 mb-1">
          Order {order.order_reference}
        </h2>
        <div className="flex items-center justify-center gap-2 mt-3">
          <StatusBadge status={order.payment_status} />
          <StatusBadge status={order.recharge_status} />
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h3 className="font-semibold text-gray-900 mb-4">Order details</h3>
        <div className="space-y-3">
          <DetailRow icon={Globe} label="Destination" value={order.country ? `${order.country.flag} ${order.country.name}` : '—'} />
          <DetailRow icon={Smartphone} label="Recipient" value={order.recipient_phone} />
          <DetailRow icon={Smartphone} label="Operator" value={order.operator?.name || '—'} />
          <DetailRow icon={Globe} label="Recharge" value={order.product ? `${order.product.local_currency} ${order.product.local_amount}` : '—'} />
          <DetailRow icon={Globe} label="Amount paid" value={`${order.customer_currency} ${order.customer_amount.toFixed(2)}`} />
          <DetailRow icon={Globe} label="Payment method" value={order.payment_provider === 'mercado_pago' ? 'PIX (Mercado Pago)' : 'Stripe'} />
          {order.provider_transaction_id && (
            <DetailRow icon={Globe} label="Transaction ID" value={order.provider_transaction_id} mono />
          )}
          <DetailRow icon={Clock} label="Created" value={new Date(order.created_at).toLocaleString()} />
        </div>
      </div>
    </div>
  );
}

function DetailRow({ icon: Icon, label, value, mono }: { icon: any; label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-gray-400" />
        <span className="text-sm text-gray-500">{label}</span>
      </div>
      <span className={`text-sm font-medium text-gray-900 ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}
