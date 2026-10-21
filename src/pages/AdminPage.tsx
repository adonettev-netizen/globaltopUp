import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Loader2, Database, TrendingUp, AlertCircle, CheckCircle2, Globe, Smartphone, DollarSign, Activity } from 'lucide-react';
import { supabase, callEdgeFunction } from '@/lib/supabase';
import { StatusBadge } from '@/components/StatusBadge';

export function AdminPage() {
  const [activeTab, setActiveTab] = useState<'overview' | 'orders' | 'sync' | 'config'>('overview');
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<any>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const [stats, setStats] = useState({
    countries: 0,
    operators: 0,
    products: 0,
    orders: 0,
    pendingOrders: 0,
    completedOrders: 0,
    failedOrders: 0,
    revenue: 0,
  });
  const [orders, setOrders] = useState<any[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [syncLogs, setSyncLogs] = useState<any[]>([]);
  const [config, setConfig] = useState<any[]>([]);

  const loadStats = useCallback(async () => {
    const [countries, operators, products, ordersResult] = await Promise.all([
      supabase.from('countries').select('*', { count: 'exact', head: true }),
      supabase.from('operators').select('*', { count: 'exact', head: true }),
      supabase.from('recharge_products').select('*', { count: 'exact', head: true }),
      supabase.from('orders').select('customer_amount, customer_currency, payment_status, recharge_status'),
    ]);

    const allOrders = ordersResult.data || [];
    const completed = allOrders.filter((o: any) => o.recharge_status === 'completed');
    const revenue = completed.reduce((sum: number, o: any) => {
      if (o.customer_currency === 'USD') return sum + Number(o.customer_amount);
      return sum;
    }, 0);

    setStats({
      countries: countries.count || 0,
      operators: operators.count || 0,
      products: products.count || 0,
      orders: allOrders.length,
      pendingOrders: allOrders.filter((o: any) => o.payment_status === 'pending_payment').length,
      completedOrders: completed.length,
      failedOrders: allOrders.filter((o: any) => o.recharge_status === 'recharge_failed').length,
      revenue,
    });
  }, []);

  const loadOrders = useCallback(async () => {
    setLoadingOrders(true);
    const { data } = await supabase
      .from('orders')
      .select(`
        order_reference, recipient_phone, customer_amount, customer_currency,
        payment_status, recharge_status, created_at,
        country:countries(name, flag),
        operator:operators(name)
      `)
      .order('created_at', { ascending: false })
      .limit(50);
    setOrders(data || []);
    setLoadingOrders(false);
  }, []);

  const loadSyncLogs = useCallback(async () => {
    const { data } = await supabase
      .from('sync_logs')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(20);
    setSyncLogs(data || []);
  }, []);

  const loadConfig = useCallback(async () => {
    const { data } = await supabase.from('pricing_config').select('*').order('key');
    setConfig(data || []);
  }, []);

  useEffect(() => {
    loadStats();
    loadOrders();
    loadSyncLogs();
    loadConfig();
  }, [loadStats, loadOrders, loadSyncLogs, loadConfig]);

  const [savingUat, setSavingUat] = useState(false);

  const handleToggleUat = async (enable: boolean) => {
    setSavingUat(true);
    const { error } = await supabase
      .from('pricing_config')
      .update({ value: enable ? 'true' : 'false', updated_at: new Date().toISOString() })
      .eq('key', 'ding_uat_mode');
    setSavingUat(false);
    if (!error) loadConfig();
  };

  const handleSync = async (entity: string) => {
    setSyncing(true);
    setSyncError(null);
    setSyncResult(null);
    const { data, error } = await callEdgeFunction('dingconnect-sync', {
      method: 'GET',
      params: { entity },
    });
    setSyncing(false);
    if (error) {
      setSyncError(error);
    } else {
      setSyncResult(data);
      loadStats();
      loadSyncLogs();
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pt-20 pb-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <h1 className="font-display text-2xl font-bold text-gray-900 mb-2">Admin Dashboard</h1>
        <p className="text-gray-600 mb-8">Manage catalog, orders, pricing, and integrations.</p>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-gray-200 overflow-x-auto">
          {[
            { key: 'overview', label: 'Overview', icon: TrendingUp },
            { key: 'orders', label: 'Orders', icon: Activity },
            { key: 'sync', label: 'Catalog Sync', icon: Database },
            { key: 'config', label: 'Pricing Config', icon: DollarSign },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className={`px-4 py-3 font-medium text-sm border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${
                activeTab === tab.key
                  ? 'border-brand-600 text-brand-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Overview */}
        {activeTab === 'overview' && (
          <div className="space-y-6 animate-fade-in">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard icon={Globe} label="Countries" value={stats.countries} color="brand" />
              <StatCard icon={Smartphone} label="Operators" value={stats.operators} color="accent" />
              <StatCard icon={Database} label="Products" value={stats.products} color="brand" />
              <StatCard icon={TrendingUp} label="Orders" value={stats.orders} color="accent" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <StatCard icon={Activity} label="Pending payment" value={stats.pendingOrders} color="amber" />
              <StatCard icon={CheckCircle2} label="Completed" value={stats.completedOrders} color="accent" />
              <StatCard icon={AlertCircle} label="Failed" value={stats.failedOrders} color="red" />
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 p-6">
              <h3 className="font-semibold text-gray-900 mb-2">Total revenue (USD)</h3>
              <p className="text-3xl font-bold font-display text-gray-900">
                ${stats.revenue.toFixed(2)}
              </p>
              <p className="text-sm text-gray-500 mt-1">From completed recharges</p>
            </div>
          </div>
        )}

        {/* Orders */}
        {activeTab === 'orders' && (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden animate-fade-in">
            {loadingOrders ? (
              <div className="p-8 text-center">
                <Loader2 className="w-8 h-8 text-brand-500 animate-spin mx-auto" />
              </div>
            ) : orders.length === 0 ? (
              <div className="p-8 text-center text-gray-500">No orders yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">Reference</th>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">Recipient</th>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">Country</th>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">Amount</th>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">Payment</th>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">Recharge</th>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {orders.map((o: any) => (
                      <tr key={o.order_reference} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-mono text-sm text-gray-900">{o.order_reference}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{o.recipient_phone}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">
                          {o.country?.flag} {o.country?.name || '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">
                          {o.customer_currency} {o.customer_amount.toFixed(2)}
                        </td>
                        <td className="px-4 py-3"><StatusBadge status={o.payment_status} /></td>
                        <td className="px-4 py-3"><StatusBadge status={o.recharge_status} /></td>
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {new Date(o.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Sync */}
        {activeTab === 'sync' && (
          <div className="space-y-6 animate-fade-in">
            <div className="bg-white rounded-2xl border border-gray-100 p-6">
              <h3 className="font-semibold text-gray-900 mb-2">DingConnect Catalog Sync</h3>
              <p className="text-sm text-gray-600 mb-4">
                Synchronize countries, operators, and recharge products from DingConnect into the database.
                Requires DingConnect API credentials to be configured as edge function secrets.
              </p>
              <div className="flex flex-wrap gap-3">
                {[
                  { entity: 'full', label: 'Full sync (all)' },
                  { entity: 'countries', label: 'Countries only' },
                  { entity: 'operators', label: 'Operators only' },
                  { entity: 'products', label: 'Products only' },
                ].map((btn) => (
                  <button
                    key={btn.entity}
                    onClick={() => handleSync(btn.entity)}
                    disabled={syncing}
                    className="px-4 py-2.5 rounded-xl bg-brand-600 text-white font-medium text-sm hover:bg-brand-700 disabled:opacity-50 flex items-center gap-2"
                  >
                    {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    {btn.label}
                  </button>
                ))}
              </div>

              {syncResult && (
                <div className="mt-4 p-4 bg-accent-50 rounded-xl border border-accent-100">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 className="w-5 h-5 text-accent-600" />
                    <span className="font-semibold text-gray-900">Sync completed</span>
                  </div>
                  <p className="text-sm text-gray-700">
                    Records processed: {syncResult.records}
                  </p>
                  {syncResult.breakdown && (
                    <pre className="text-xs text-gray-600 mt-2 font-mono">{JSON.stringify(syncResult.breakdown, null, 2)}</pre>
                  )}
                </div>
              )}

              {syncError && (
                <div className="mt-4 p-4 bg-red-50 rounded-xl border border-red-100 flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-red-900">Sync failed</p>
                    <p className="text-sm text-red-800 mt-1">{syncError}</p>
                    <p className="text-xs text-red-700 mt-2">
                      This usually means the DingConnect API key is not configured. Set DINGCONNECT_API_KEY as an edge function secret or in the api_credentials table.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Sync logs */}
            <div className="bg-white rounded-2xl border border-gray-100 p-6">
              <h3 className="font-semibold text-gray-900 mb-4">Sync history</h3>
              {syncLogs.length === 0 ? (
                <p className="text-sm text-gray-500">No sync runs yet.</p>
              ) : (
                <div className="space-y-2">
                  {syncLogs.map((log: any) => (
                    <div key={log.id} className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
                      <div className="flex items-center gap-3">
                        <span className={`w-2 h-2 rounded-full ${log.status === 'success' ? 'bg-accent-500' : log.status === 'failed' ? 'bg-red-500' : 'bg-amber-500'}`} />
                        <span className="text-sm font-medium text-gray-900 capitalize">{log.entity_type}</span>
                        <span className="text-xs text-gray-500">{log.records_processed} records</span>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-gray-500">{new Date(log.started_at).toLocaleString()}</p>
                        {log.error_message && <p className="text-xs text-red-600 mt-0.5">{log.error_message}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Config */}
        {activeTab === 'config' && (
          <div className="space-y-6 animate-fade-in">
            {/* UAT Mode Toggle */}
            <div className="bg-white rounded-2xl border border-gray-100 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">DingConnect UAT Mode</h3>
                  <p className="text-sm text-gray-600 max-w-lg">
                    When enabled, recharge transactions use DingConnect test phone numbers instead of real recipient numbers. No real recharges are sent. Use this to test the full payment and recharge flow safely.
                  </p>
                </div>
                <UatToggle config={config} onToggle={handleToggleUat} />
              </div>
              <div className="mt-4 p-3 bg-amber-50 rounded-lg border border-amber-100">
                <p className="text-xs text-amber-800">
                  All operators are assigned the default UAT test number <span className="font-mono font-semibold">910000000001</span> (success path). You can assign different UAT numbers per operator to test error scenarios.
                </p>
              </div>
            </div>

            {/* Pricing config */}
            <div className="bg-white rounded-2xl border border-gray-100 p-6">
              <h3 className="font-semibold text-gray-900 mb-4">Pricing Configuration</h3>
              <p className="text-sm text-gray-600 mb-4">
                These values control how customer-facing prices are calculated from wholesale costs.
                Changes apply to new orders only.
              </p>
              <div className="space-y-2">
                {config.filter((c: any) => c.key !== 'ding_uat_mode').map((c: any) => (
                  <div key={c.id} className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
                    <div>
                      <p className="font-mono text-sm font-medium text-gray-900">{c.key}</p>
                      <p className="text-xs text-gray-500">{c.description}</p>
                    </div>
                    <span className="font-mono text-sm text-gray-700 px-3 py-1 bg-white rounded border border-gray-200">
                      {c.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function UatToggle({ config, onToggle }: { config: any[]; onToggle: (enable: boolean) => void }) {
  const uatEntry = config.find((c: any) => c.key === 'ding_uat_mode');
  const enabled = uatEntry?.value === 'true';
  return (
    <button
      onClick={() => onToggle(!enabled)}
      className={`relative w-14 h-7 rounded-full transition-colors ${enabled ? 'bg-brand-600' : 'bg-gray-300'}`}
      aria-label="Toggle UAT mode"
    >
      <span
        className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow-sm transition-transform ${enabled ? 'translate-x-7' : ''}`}
      />
    </button>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: number; color: string }) {
  const colors: Record<string, string> = {
    brand: 'bg-brand-50 text-brand-600',
    accent: 'bg-accent-50 text-accent-600',
    amber: 'bg-amber-50 text-amber-600',
    red: 'bg-red-50 text-red-600',
  };
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${colors[color]}`}>
        <Icon className="w-5 h-5" />
      </div>
      <p className="text-2xl font-bold font-display text-gray-900">{value}</p>
      <p className="text-sm text-gray-500">{label}</p>
    </div>
  );
}
