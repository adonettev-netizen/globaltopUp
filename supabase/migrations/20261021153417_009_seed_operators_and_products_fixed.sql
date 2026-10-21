/*
# Seed operators and recharge products (fixed)

## Overview
The original seed migrations (007, 008) referenced hardcoded country UUIDs
that did not match the actual rows in `countries`, so no operators or
products were inserted. This migration re-seeds them by looking up the
real country IDs via `ding_country_code`, and then generates recharge
denominations for each operator.

## Changes
1. Insert 22 countries' major mobile operators with DingConnect-style
   provider codes, active flag, and the default UAT test number.
2. Generate 4 recharge product denominations per operator in the local
   currency of the operator's country, with wholesale cost = face value.
3. Idempotent: ON CONFLICT DO NOTHING for both operators and products.

## Security
No policy or RLS changes. Tables keep their existing public-read policies.
*/

-- ============================================================
-- Operators (look up country_id by ding_country_code)
-- ============================================================
INSERT INTO operators (ding_operator_code, country_id, name, is_active, uat_phone_number)
SELECT v.code, c.id, v.name, true, '910000000001'
FROM (VALUES
  -- Dominican Republic
  ('DO-OR',  'DO', 'Orange Dominicana'),
  ('DO-CL',  'DO', 'Claro Dominican Republic'),
  ('DO-VM',  'DO', 'Viva (Altice)'),
  -- Haiti
  ('HT-DG',  'HT', 'Digicel Haiti'),
  ('HT-NA',  'HT', 'Natcom Haiti'),
  -- Mexico
  ('MX-TM',  'MX', 'Telcel'),
  ('MX-AT',  'MX', 'AT&T Mexico'),
  ('MX-MB',  'MX', 'Movistar Mexico'),
  -- Colombia
  ('CO-CL',  'CO', 'Claro Colombia'),
  ('CO-TM',  'CO', 'Tigo Colombia'),
  ('CO-MB',  'CO', 'Movistar Colombia'),
  -- Brazil
  ('BR-VV',  'BR', 'Vivo'),
  ('BR-CL',  'BR', 'Claro Brazil'),
  ('BR-TM',  'BR', 'TIM Brazil'),
  -- Ecuador
  ('EC-CL',  'EC', 'Claro Ecuador'),
  ('EC-MB',  'EC', 'Movistar Ecuador'),
  ('EC-CN',  'EC', 'CNT Ecuador'),
  -- Peru
  ('PE-MB',  'PE', 'Movistar Peru'),
  ('PE-CL',  'PE', 'Claro Peru'),
  ('PE-BB',  'PE', 'Bitel Peru'),
  -- Guatemala
  ('GT-CL',  'GT', 'Claro Guatemala'),
  ('GT-TM',  'GT', 'Tigo Guatemala'),
  ('GT-MB',  'GT', 'Movistar Guatemala'),
  -- Honduras
  ('HN-TM',  'HN', 'Tigo Honduras'),
  ('HN-CL',  'HN', 'Claro Honduras'),
  ('HN-MB',  'HN', 'Movistar Honduras'),
  -- El Salvador
  ('SV-TM',  'SV', 'Tigo El Salvador'),
  ('SV-CL',  'SV', 'Claro El Salvador'),
  ('SV-MB',  'SV', 'Movistar El Salvador'),
  -- Nicaragua
  ('NI-TM',  'NI', 'Tigo Nicaragua'),
  ('NI-CL',  'NI', 'Claro Nicaragua'),
  ('NI-MB',  'NI', 'Movistar Nicaragua'),
  -- Costa Rica
  ('CR-KL',  'CR', 'Kolbi (ICE)'),
  ('CR-CL',  'CR', 'Claro Costa Rica'),
  ('CR-MB',  'CR', 'Movistar Costa Rica'),
  -- Panama
  ('PA-TM',  'PA', 'Tigo Panama'),
  ('PA-CL',  'PA', 'Claro Panama'),
  ('PA-MB',  'PA', 'Movistar Panama'),
  -- Cuba
  ('CU-CT',  'CU', 'Cubacel'),
  -- Venezuela
  ('VE-MB',  'VE', 'Movilnet'),
  ('VE-MV',  'VE', 'Movistar Venezuela'),
  ('VE-DG',  'VE', 'Digitel'),
  -- Argentina
  ('AR-CL',  'AR', 'Claro Argentina'),
  ('AR-MB',  'AR', 'Movistar Argentina'),
  ('AR-PX',  'AR', 'Personal Argentina'),
  -- Bolivia
  ('BO-TM',  'BO', 'Tigo Bolivia'),
  ('BO-CL',  'BO', 'Claro Bolivia'),
  ('BO-NB',  'BO', 'Nuevatel (Viva)'),
  -- Paraguay
  ('PY-TM',  'PY', 'Tigo Paraguay'),
  ('PY-CL',  'PY', 'Claro Paraguay'),
  ('PY-PX',  'PY', 'Personal Paraguay'),
  -- Uruguay
  ('UY-AN',  'UY', 'Antel'),
  ('UY-CL',  'UY', 'Claro Uruguay'),
  ('UY-MB',  'UY', 'Movistar Uruguay'),
  -- Chile
  ('CL-EN',  'CL', 'Entel'),
  ('CL-CL',  'CL', 'Claro Chile'),
  ('CL-MB',  'CL', 'Movistar Chile'),
  ('CL-WM',  'CL', 'WOM Chile'),
  -- United States
  ('US-TM',  'US', 'T-Mobile USA'),
  ('US-VZ',  'US', 'Verizon Wireless'),
  ('US-AT',  'US', 'AT&T Wireless'),
  -- Canada
  ('CA-RG',  'CA', 'Rogers'),
  ('CA-BL',  'CA', 'Bell Mobility'),
  ('CA-TL',  'CA', 'Telus Mobility'),
  -- Spain
  ('ES-MB',  'ES', 'Movistar Spain'),
  ('ES-OR',  'ES', 'Orange Spain'),
  ('ES-VF',  'ES', 'Vodafone Spain')
) AS v(code, country_code, name)
JOIN countries c ON c.ding_country_code = v.country_code
ON CONFLICT (ding_operator_code) DO NOTHING;

-- ============================================================
-- Recharge products (4 denominations per operator)
-- ============================================================
DO $$
DECLARE
  op RECORD;
  currency TEXT;
  amounts NUMERIC[];
  amt NUMERIC;
  code TEXT;
BEGIN
  FOR op IN SELECT o.id, o.ding_operator_code, c.ding_country_code
            FROM operators o
            JOIN countries c ON c.id = o.country_id
            WHERE o.is_active = true
  LOOP
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
      ELSE ARRAY[5, 10, 15, 25]
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
