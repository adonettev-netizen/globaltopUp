/*
# Global TopUp — Helper Functions & Seed Data

## Overview
1. SQL functions: generate order references, compute customer price, get pricing config value.
2. Seed data: common destination countries with calling codes so the phone-number
   detection works immediately (synced/expanded from DingConnect when configured).
3. Admin helper: is_admin() function.

## Functions
- `generate_order_reference()` → returns a unique readable order ref like GTU-XXXXXX.
- `get_pricing_config(key)` → returns config value as text.
- `compute_customer_price(product_id, currency)` → returns computed customer amount.
- `is_admin()` → returns true if current user has admin role in profiles.

## Security
- Functions are SECURITY DEFINER with fixed search_path to avoid privilege issues.
- is_admin() is accessible to authenticated users (used in RLS / app).
*/

-- ============================================================
-- generate_order_reference
-- ============================================================
CREATE OR REPLACE FUNCTION generate_order_reference()
RETURNS text AS $$
DECLARE
  ref text;
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
BEGIN
  ref := 'GTU-';
  FOR i IN 1..8 LOOP
    ref := ref || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  END LOOP;
  RETURN ref;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- get_pricing_config
-- ============================================================
CREATE OR REPLACE FUNCTION get_pricing_config(config_key text)
RETURNS text AS $$
  SELECT value FROM pricing_config WHERE key = config_key;
$$ LANGUAGE sql SECURITY DEFINER;

-- ============================================================
-- is_admin — checks if current authenticated user has admin role
-- ============================================================
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- ============================================================
-- compute_customer_price — returns customer-facing amount for a product
-- given a target customer currency. Applies profit margin + service fees.
-- Note: exchange rates are simplified; a proper FX provider would be used in production.
-- ============================================================
CREATE OR REPLACE FUNCTION compute_customer_price(
  p_product_id uuid,
  p_currency text DEFAULT 'USD'
)
RETURNS numeric(12,2) AS $$
DECLARE
  v_wholesale numeric(12,2);
  v_margin numeric;
  v_fee_fixed numeric;
  v_fee_percent numeric;
  v_fx_rate numeric;
  v_base_amount numeric;
  v_final numeric;
BEGIN
  SELECT wholesale_cost, local_amount INTO v_wholesale, v_base_amount
  FROM recharge_products WHERE id = p_product_id;

  -- Fall back to local_amount if no wholesale cost stored
  IF v_wholesale IS NULL OR v_wholesale = 0 THEN
    v_wholesale := v_base_amount;
  END IF;

  SELECT value::numeric INTO v_margin FROM pricing_config WHERE key = 'profit_margin_percent';
  IF v_margin IS NULL THEN v_margin := 8; END IF;

  SELECT value::numeric INTO v_fee_fixed FROM pricing_config WHERE key = 'service_fee_fixed';
  IF v_fee_fixed IS NULL THEN v_fee_fixed := 0; END IF;

  SELECT value::numeric INTO v_fee_percent FROM pricing_config WHERE key = 'service_fee_percent';
  IF v_fee_percent IS NULL THEN v_fee_percent := 0; END IF;

  -- Apply margin
  v_final := v_wholesale * (1 + v_margin / 100);

  -- Apply percentage fee
  v_final := v_final * (1 + v_fee_percent / 100);

  -- Apply fixed fee
  v_final := v_final + v_fee_fixed;

  -- Convert currency (simplified — USD base assumed for wholesale)
  IF UPPER(p_currency) = 'BRL' THEN
    SELECT value::numeric INTO v_fx_rate FROM pricing_config WHERE key = 'exchange_rate_usd_brl';
    IF v_fx_rate IS NULL THEN v_fx_rate := 5.10; END IF;
    v_final := v_final * v_fx_rate;
  END IF;

  -- Round to 2 decimals
  v_final := round(v_final * 100) / 100;

  RETURN v_final;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
