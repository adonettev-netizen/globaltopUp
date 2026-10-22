-- BRL base currency support: custom recharge amounts, exchange rates, destination currency fields

-- Add new columns to orders for BRL-based pricing
ALTER TABLE orders ADD COLUMN IF NOT EXISTS base_amount_brl numeric(12,2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS exchange_rate numeric(12,6);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS exchange_rate_timestamp timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS destination_amount numeric(12,2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS destination_currency text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS provider_cost numeric(12,2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS profit_margin_percent numeric(5,2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS service_fee numeric(12,2);

-- Add currency column to countries (destination currency from DingConnect)
ALTER TABLE countries ADD COLUMN IF NOT EXISTS currency_code text;

-- Update pricing config defaults for BRL base
INSERT INTO pricing_config (key, value, description) VALUES
  ('base_currency', 'BRL', 'Base pricing currency for all transactions'),
  ('minimum_recharge_brl', '10.00', 'Minimum customer recharge amount in BRL'),
  ('maximum_recharge_brl', '500.00', 'Maximum customer recharge amount in BRL'),
  ('exchange_rate_provider', 'exchangerate-api', 'API used for live exchange rates'),
  ('exchange_rate_cache_seconds', '300', 'How long to cache exchange rates (5 min)')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description, updated_at = now();

-- Update compute_customer_price to support BRL base with custom amounts
-- This function now takes a custom BRL amount and product_id, computes the final price
CREATE OR REPLACE FUNCTION compute_customer_price(
  p_product_id uuid,
  p_currency text DEFAULT 'BRL'
)
RETURNS numeric(12,2) AS $$
DECLARE
  v_wholesale numeric(12,2);
  v_margin numeric;
  v_fee_fixed numeric;
  v_fee_percent numeric;
  v_final numeric;
BEGIN
  SELECT wholesale_cost INTO v_wholesale
  FROM recharge_products WHERE id = p_product_id;

  IF v_wholesale IS NULL OR v_wholesale = 0 THEN
    SELECT local_amount INTO v_wholesale FROM recharge_products WHERE id = p_product_id;
  END IF;

  SELECT value::numeric INTO v_margin FROM pricing_config WHERE key = 'profit_margin_percent';
  IF v_margin IS NULL THEN v_margin := 8; END IF;

  SELECT value::numeric INTO v_fee_fixed FROM pricing_config WHERE key = 'service_fee_fixed';
  IF v_fee_fixed IS NULL THEN v_fee_fixed := 0; END IF;

  SELECT value::numeric INTO v_fee_percent FROM pricing_config WHERE key = 'service_fee_percent';
  IF v_fee_percent IS NULL THEN v_fee_percent := 0; END IF;

  -- Apply margin + percentage fee + fixed fee
  v_final := v_wholesale * (1 + v_margin / 100);
  v_final := v_final * (1 + v_fee_percent / 100);
  v_final := v_final + v_fee_fixed;
  v_final := round(v_final * 100) / 100;

  RETURN v_final;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
