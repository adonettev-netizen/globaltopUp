/*
# Global TopUp — Core Database Schema

## Overview
Creates the foundational tables for the Global TopUp international mobile recharge platform:
catalog data synced from DingConnect, customer orders, payments, webhook events,
pricing configuration, sync logs, and user profiles.

## New Tables
1. `profiles` — Customer/admin profile info linked to Supabase Auth.
2. `countries` — Destination countries synced from DingConnect.
3. `operators` — Mobile operators per country, synced from DingConnect.
4. `recharge_products` — Recharge denominations/products per operator.
5. `orders` — Customer recharge orders (guest or authenticated).
6. `payments` — Payment records linked to orders.
7. `webhook_events` — Idempotency log for provider webhooks.
8. `sync_logs` — DingConnect synchronization run history.
9. `pricing_config` — Configurable profit margins and service fees.

## Security
- RLS enabled on all tables.
- Catalog tables (countries, operators, recharge_products): public read, admin write only.
- orders/payments: owner-scoped for authenticated users; guests access via service-role edge functions only.
- webhook_events/sync_logs/pricing_config: admin-only (service role for edge functions).
- profiles: owner-scoped.
*/

-- ============================================================
-- PROFILES
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  full_name text,
  role text NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'admin')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_profile" ON profiles;
CREATE POLICY "select_own_profile" ON profiles FOR SELECT
  TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "update_own_profile" ON profiles;
CREATE POLICY "update_own_profile" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- ============================================================
-- COUNTRIES (DingConnect catalog — public read)
-- ============================================================
CREATE TABLE IF NOT EXISTS countries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ding_country_code text UNIQUE NOT NULL,
  name text NOT NULL,
  iso_code text,
  calling_code text,
  flag text,
  is_supported boolean NOT NULL DEFAULT true,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_countries_calling_code ON countries(calling_code);
CREATE INDEX IF NOT EXISTS idx_countries_iso ON countries(iso_code);
CREATE INDEX IF NOT EXISTS idx_countries_supported ON countries(is_supported);

ALTER TABLE countries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_countries" ON countries;
CREATE POLICY "public_read_countries" ON countries FOR SELECT
  TO anon, authenticated USING (true);

-- No insert/update/delete policies for anon/authenticated — only service role manages catalog.

-- ============================================================
-- OPERATORS
-- ============================================================
CREATE TABLE IF NOT EXISTS operators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ding_operator_code text UNIQUE NOT NULL,
  country_id uuid NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
  name text NOT NULL,
  logo_url text,
  is_active boolean NOT NULL DEFAULT true,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_operators_country ON operators(country_id);
CREATE INDEX IF NOT EXISTS idx_operators_active ON operators(is_active);

ALTER TABLE operators ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_operators" ON operators;
CREATE POLICY "public_read_operators" ON operators FOR SELECT
  TO anon, authenticated USING (true);

-- ============================================================
-- RECHARGE PRODUCTS
-- ============================================================
CREATE TABLE IF NOT EXISTS recharge_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ding_product_code text UNIQUE NOT NULL,
  operator_id uuid NOT NULL REFERENCES operators(id) ON DELETE CASCADE,
  product_name text NOT NULL,
  local_amount numeric(12,2) NOT NULL,
  local_currency text NOT NULL,
  wholesale_cost numeric(12,2),
  is_active boolean NOT NULL DEFAULT true,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_operator ON recharge_products(operator_id);
CREATE INDEX IF NOT EXISTS idx_products_active ON recharge_products(is_active);

ALTER TABLE recharge_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_products" ON recharge_products;
CREATE POLICY "public_read_products" ON recharge_products FOR SELECT
  TO anon, authenticated USING (true);

-- ============================================================
-- PRICING CONFIG (admin only)
-- ============================================================
CREATE TABLE IF NOT EXISTS pricing_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value text NOT NULL,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pricing_config ENABLE ROW LEVEL SECURITY;

-- No anon/authenticated policies — service role only (managed via edge functions / admin).
-- Seed default values.
INSERT INTO pricing_config (key, value, description) VALUES
  ('profit_margin_percent', '8', 'Default profit margin percentage applied on top of wholesale cost'),
  ('service_fee_fixed', '0', 'Fixed service fee added to each order in customer currency'),
  ('service_fee_percent', '0', 'Percentage service fee applied to subtotal'),
  ('default_customer_currency', 'USD', 'Default customer-facing currency'),
  ('brl_customer_currency', 'BRL', 'Currency used for Brazil (PIX) customers'),
  ('exchange_rate_usd_brl', '5.10', 'Exchange rate USD to BRL for price display'),
  ('brl_market_enabled', 'true', 'Whether PIX/Mercado Pago is enabled for BRL market'),
  ('stripe_market_enabled', 'true', 'Whether Stripe is enabled for non-BRL markets')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- ORDERS
-- ============================================================
CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  order_reference text UNIQUE NOT NULL,
  recipient_phone text NOT NULL,
  country_id uuid REFERENCES countries(id),
  operator_id uuid REFERENCES operators(id),
  product_id uuid REFERENCES recharge_products(id),
  customer_amount numeric(12,2) NOT NULL,
  customer_currency text NOT NULL,
  payment_provider text NOT NULL CHECK (payment_provider IN ('stripe', 'mercado_pago')),
  payment_status text NOT NULL DEFAULT 'pending_payment' CHECK (payment_status IN (
    'pending_payment', 'payment_confirmed', 'payment_failed', 'refund_pending', 'refunded'
  )),
  recharge_status text NOT NULL DEFAULT 'pending' CHECK (recharge_status IN (
    'pending', 'processing', 'completed', 'recharge_failed'
  )),
  provider_transaction_id text,
  access_token uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_reference ON orders(order_reference);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_recharge_status ON orders(recharge_status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Authenticated users can see their own orders.
DROP POLICY IF EXISTS "select_own_orders" ON orders;
CREATE POLICY "select_own_orders" ON orders FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_orders" ON orders;
CREATE POLICY "insert_own_orders" ON orders FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_orders" ON orders;
CREATE POLICY "update_own_orders" ON orders FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Guest orders: allow anon INSERT (edge function validates), but no anon SELECT
-- (guests retrieve their order via edge function using the access_token, not direct table access).

-- ============================================================
-- PAYMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('stripe', 'mercado_pago')),
  provider_payment_id text,
  amount numeric(12,2) NOT NULL,
  currency text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_provider_pid ON payments(provider, provider_payment_id);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Payments visible to order owner only (via join through orders ownership).
DROP POLICY IF EXISTS "select_own_payments" ON payments;
CREATE POLICY "select_own_payments" ON payments FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM orders WHERE orders.id = payments.order_id AND orders.user_id = auth.uid())
  );

-- ============================================================
-- WEBHOOK EVENTS (idempotency — service role only, no anon policies)
-- ============================================================
CREATE TABLE IF NOT EXISTS webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  event_id text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  processing_status text NOT NULL DEFAULT 'processed' CHECK (processing_status IN ('processed', 'failed', 'duplicate')),
  UNIQUE (provider, event_id)
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_lookup ON webhook_events(provider, event_id);

ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- SYNC LOGS (DingConnect sync history — service role only)
-- ============================================================
CREATE TABLE IF NOT EXISTS sync_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL CHECK (entity_type IN ('countries', 'operators', 'products', 'full')),
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'success', 'failed')),
  records_processed integer DEFAULT 0,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_sync_logs_started ON sync_logs(started_at DESC);

ALTER TABLE sync_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- updated_at triggers
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_countries_updated ON countries;
CREATE TRIGGER trigger_countries_updated BEFORE UPDATE ON countries
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trigger_operators_updated ON operators;
CREATE TRIGGER trigger_operators_updated BEFORE UPDATE ON operators
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trigger_products_updated ON recharge_products;
CREATE TRIGGER trigger_products_updated BEFORE UPDATE ON recharge_products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trigger_orders_updated ON orders;
CREATE TRIGGER trigger_orders_updated BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trigger_payments_updated ON payments;
CREATE TRIGGER trigger_payments_updated BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- Auto-create profile on signup
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
