/*
# Global TopUp — Seed Countries

## Overview
Seeds common destination countries with calling codes so the phone-number
detection interface works immediately. When DingConnect is configured,
the sync edge function will update/expand this list with DingConnect country codes,
operator data, and product data.

## Security
- Insert only — no security changes. Catalog remains public-read.

## Notes
- `ding_country_code` is set to ISO code as a placeholder; the DingConnect sync
  will overwrite with the actual DingConnect provider code.
- `is_supported = true` for all — the sync process may set to false if DingConnect
  reports a country as unavailable.
*/

INSERT INTO countries (ding_country_code, name, iso_code, calling_code, flag, is_supported, last_synced_at) VALUES
  ('HT', 'Haiti', 'HT', '509', '🇭🇹', true, NULL),
  ('BR', 'Brazil', 'BR', '55', '🇧🇷', true, NULL),
  ('US', 'United States', 'US', '1', '🇺🇸', true, NULL),
  ('CA', 'Canada', 'CA', '1', '🇨🇦', true, NULL),
  ('GB', 'United Kingdom', 'GB', '44', '🇬🇧', true, NULL),
  ('FR', 'France', 'FR', '33', '🇫🇷', true, NULL),
  ('DO', 'Dominican Republic', 'DO', '1', '🇩🇴', true, NULL),
  ('CU', 'Cuba', 'CU', '53', '🇨🇺', true, NULL),
  ('JM', 'Jamaica', 'JM', '1', '🇯🇲', true, NULL),
  ('MX', 'Mexico', 'MX', '52', '🇲🇽', true, NULL),
  ('CO', 'Colombia', 'CO', '57', '🇨🇴', true, NULL),
  ('AR', 'Argentina', 'AR', '54', '🇦🇷', true, NULL),
  ('PE', 'Peru', 'PE', '51', '🇵🇪', true, NULL),
  ('EC', 'Ecuador', 'EC', '593', '🇪🇨', true, NULL),
  ('VE', 'Venezuela', 'VE', '58', '🇻🇪', true, NULL),
  ('CL', 'Chile', 'CL', '56', '🇨🇱', true, NULL),
  ('UY', 'Uruguay', 'UY', '598', '🇺🇾', true, NULL),
  ('PY', 'Paraguay', 'PY', '595', '🇵🇾', true, NULL),
  ('BO', 'Bolivia', 'BO', '591', '🇧🇴', true, NULL),
  ('HN', 'Honduras', 'HN', '504', '🇭🇳', true, NULL),
  ('GT', 'Guatemala', 'GT', '502', '🇬🇹', true, NULL),
  ('SV', 'El Salvador', 'SV', '503', '🇸🇻', true, NULL),
  ('NI', 'Nicaragua', 'NI', '505', '🇳🇮', true, NULL),
  ('CR', 'Costa Rica', 'CR', '506', '🇨🇷', true, NULL),
  ('PA', 'Panama', 'PA', '507', '🇵🇦', true, NULL),
  ('PH', 'Philippines', 'PH', '63', '🇵🇭', true, NULL),
  ('IN', 'India', 'IN', '91', '🇮🇳', true, NULL),
  ('NG', 'Nigeria', 'NG', '234', '🇳🇬', true, NULL),
  ('GH', 'Ghana', 'GH', '233', '🇬🇭', true, NULL),
  ('KE', 'Kenya', 'KE', '254', '🇰🇪', true, NULL),
  ('SN', 'Senegal', 'SN', '221', '🇸🇳', true, NULL),
  ('CI', 'Ivory Coast', 'CI', '225', '🇨🇮', true, NULL),
  ('ML', 'Mali', 'ML', '223', '🇲🇱', true, NULL),
  ('BF', 'Burkina Faso', 'BF', '226', '🇧🇫', true, NULL),
  ('TG', 'Togo', 'TG', '228', '🇹🇬', true, NULL),
  ('BJ', 'Benin', 'BJ', '229', '🇧🇯', true, NULL),
  ('CM', 'Cameroon', 'CM', '237', '🇨🇲', true, NULL),
  ('CD', 'DR Congo', 'CD', '243', '🇨🇩', true, NULL),
  ('CG', 'Congo', 'CG', '242', '🇨🇬', true, NULL),
  ('ZA', 'South Africa', 'ZA', '27', '🇿🇦', true, NULL),
  ('EG', 'Egypt', 'EG', '20', '🇪🇬', true, NULL),
  ('MA', 'Morocco', 'MA', '212', '🇲🇦', true, NULL),
  ('DZ', 'Algeria', 'DZ', '213', '🇩🇿', true, NULL),
  ('TN', 'Tunisia', 'TN', '216', '🇹🇳', true, NULL),
  ('PK', 'Pakistan', 'PK', '92', '🇵🇰', true, NULL),
  ('BD', 'Bangladesh', 'BD', '880', '🇧🇩', true, NULL),
  ('LK', 'Sri Lanka', 'LK', '94', '🇱🇰', true, NULL),
  ('NP', 'Nepal', 'NP', '977', '🇳🇵', true, NULL),
  ('ID', 'Indonesia', 'ID', '62', '🇮🇩', true, NULL),
  ('VN', 'Vietnam', 'VN', '84', '🇻🇳', true, NULL),
  ('TH', 'Thailand', 'TH', '66', '🇹🇭', true, NULL),
  ('MY', 'Malaysia', 'MY', '60', '🇲🇾', true, NULL),
  ('SG', 'Singapore', 'SG', '65', '🇸🇬', true, NULL),
  ('ES', 'Spain', 'ES', '34', '🇪🇸', true, NULL),
  ('PT', 'Portugal', 'PT', '351', '🇵🇹', true, NULL),
  ('IT', 'Italy', 'IT', '39', '🇮🇹', true, NULL),
  ('DE', 'Germany', 'DE', '49', '🇩🇪', true, NULL),
  ('BE', 'Belgium', 'BE', '32', '🇧🇪', true, NULL),
  ('NL', 'Netherlands', 'NL', '31', '🇳🇱', true, NULL),
  ('CH', 'Switzerland', 'CH', '41', '🇨🇭', true, NULL),
  ('IE', 'Ireland', 'IE', '353', '🇮🇪', true, NULL),
  ('AU', 'Australia', 'AU', '61', '🇦🇺', true, NULL),
  ('NZ', 'New Zealand', 'NZ', '64', '🇳🇿', true, NULL),
  ('RU', 'Russia', 'RU', '7', '🇷🇺', true, NULL),
  ('UA', 'Ukraine', 'UA', '380', '🇺🇦', true, NULL),
  ('PL', 'Poland', 'PL', '48', '🇵🇱', true, NULL),
  ('RO', 'Romania', 'RO', '40', '🇷🇴', true, NULL),
  ('TR', 'Turkey', 'TR', '90', '🇹🇷', true, NULL),
  ('AE', 'United Arab Emirates', 'AE', '971', '🇦🇪', true, NULL),
  ('SA', 'Saudi Arabia', 'SA', '966', '🇸🇦', true, NULL),
  ('QA', 'Qatar', 'QA', '974', '🇶🇦', true, NULL),
  ('KW', 'Kuwait', 'KW', '965', '🇰🇼', true, NULL),
  ('BH', 'Bahrain', 'BH', '973', '🇧🇭', true, NULL),
  ('OM', 'Oman', 'OM', '968', '🇴🇲', true, NULL),
  ('JO', 'Jordan', 'JO', '962', '🇯🇴', true, NULL),
  ('LB', 'Lebanon', 'LB', '961', '🇱🇧', true, NULL),
  ('IQ', 'Iraq', 'IQ', '964', '🇮🇶', true, NULL),
  ('IR', 'Iran', 'IR', '98', '🇮🇷', true, NULL),
  ('AF', 'Afghanistan', 'AF', '93', '🇦🇫', true, NULL)
ON CONFLICT (ding_country_code) DO UPDATE
  SET name = EXCLUDED.name,
      iso_code = EXCLUDED.iso_code,
      calling_code = EXCLUDED.calling_code,
      flag = EXCLUDED.flag,
      is_supported = EXCLUDED.is_supported,
      updated_at = now();
