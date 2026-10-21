/*
# Seed recharge products for all operators

Generates standard recharge denominations for each operator based on
the country's local currency. Each operator gets 4 recharge amounts.
Wholesale cost is set to the local amount (face value) — the pricing
config markup handles the customer-facing price.
*/

DO $$
DECLARE
  op RECORD;
  currency TEXT;
  amounts NUMERIC[];
  amt NUMERIC;
  code TEXT;
BEGIN
  FOR op IN SELECT o.id, o.ding_operator_code, o.name, c.ding_country_code
            FROM operators o
            JOIN countries c ON c.id = o.country_id
            WHERE o.is_active = true
  LOOP
    -- Map country code to local currency
    currency := CASE op.ding_country_code
      WHEN 'DO' THEN 'DOP'
      WHEN 'HT' THEN 'HTG'
      WHEN 'MX' THEN 'MXN'
      WHEN 'CO' THEN 'COP'
      WHEN 'BR' THEN 'BRL'
      WHEN 'EC' THEN 'USD'
      WHEN 'PE' THEN 'PEN'
      WHEN 'GT' THEN 'GTQ'
      WHEN 'HN' THEN 'HNL'
      WHEN 'SV' THEN 'USD'
      WHEN 'NI' THEN 'NIO'
      WHEN 'CR' THEN 'CRC'
      WHEN 'PA' THEN 'USD'
      WHEN 'CU' THEN 'CUP'
      WHEN 'VE' THEN 'VES'
      WHEN 'AR' THEN 'ARS'
      WHEN 'BO' THEN 'BOB'
      WHEN 'PY' THEN 'PYG'
      WHEN 'UY' THEN 'UYU'
      WHEN 'CL' THEN 'CLP'
      WHEN 'US' THEN 'USD'
      WHEN 'CA' THEN 'CAD'
      WHEN 'ES' THEN 'EUR'
      ELSE 'USD'
    END;

    -- Denominations per currency (4 tiers)
    amounts := CASE currency
      WHEN 'DOP' THEN ARRAY[100, 200, 500, 1000]
      WHEN 'HTG' THEN ARRAY[50, 100, 250, 500]
      WHEN 'MXN' THEN ARRAY[50, 100, 200, 500]
      WHEN 'COP' THEN ARRAY[5000, 10000, 20000, 50000]
      WHEN 'BRL' THEN ARRAY[15, 25, 50, 100]
      WHEN 'PEN' THEN ARRAY[10, 20, 30, 50]
      WHEN 'GTQ' THEN ARRAY[25, 50, 100, 200]
      WHEN 'HNL' THEN ARRAY[50, 100, 200, 500]
      WHEN 'NIO' THEN ARRAY[50, 100, 200, 500]
      WHEN 'CRC' THEN ARRAY[1000, 2500, 5000, 10000]
      WHEN 'CUP' THEN ARRAY[500, 1000, 2000, 5000]
      WHEN 'VES' THEN ARRAY[500, 1000, 2000, 5000]
      WHEN 'ARS' THEN ARRAY[500, 1000, 2000, 5000]
      WHEN 'BOB' THEN ARRAY[10, 20, 50, 100]
      WHEN 'PYG' THEN ARRAY[10000, 20000, 50000, 100000]
      WHEN 'UYU' THEN ARRAY[50, 100, 200, 500]
      WHEN 'CLP' THEN ARRAY[1000, 2000, 5000, 10000]
      WHEN 'CAD' THEN ARRAY[10, 20, 30, 50]
      WHEN 'EUR' THEN ARRAY[5, 10, 20, 30]
      ELSE ARRAY[5, 10, 15, 25]  -- USD and fallback
    END;

    FOREACH amt IN ARRAY amounts
    LOOP
      code := op.ding_operator_code || '-P' || amt::TEXT;
      INSERT INTO recharge_products (ding_product_code, operator_id, product_name, local_amount, local_currency, wholesale_cost, is_active, last_synced_at)
      VALUES (code, op.id, currency || ' ' || amt::TEXT, amt, currency, amt, true, now())
      ON CONFLICT (ding_product_code) DO NOTHING;
    END LOOP;
  END LOOP;
END $$;
