/*
# DingConnect UAT Support

## Overview
Adds UAT (test) phone number support to operators and a global UAT mode
toggle so the recharge flow can be tested against DingConnect's test
environment without sending real recharges.

## Changes
1. Add `uat_phone_number` column to `operators` — stores the DingConnect
   UAT test number for each operator.
2. Add `ding_uat_mode` setting to `pricing_config` — when 'true', the
   webhook edge functions substitute the recipient phone with the
   operator's UAT test number before calling SendTransfer.
*/

-- 1. Add UAT phone number column to operators
ALTER TABLE operators
  ADD COLUMN IF NOT EXISTS uat_phone_number text;

-- 2. Add UAT mode config setting
INSERT INTO pricing_config (key, value, description)
VALUES ('ding_uat_mode', 'true', 'When true, recharge transactions use DingConnect UAT test phone numbers instead of real recipient numbers')
ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value,
      description = EXCLUDED.description,
      updated_at = now();

-- 3. Set a default UAT test number for all existing operators
-- DingConnect UAT number 910000000001 = success path
UPDATE operators SET uat_phone_number = '910000000001' WHERE uat_phone_number IS NULL;
