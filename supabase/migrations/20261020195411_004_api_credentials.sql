/*
# Global TopUp — API Credentials Storage

## Overview
Creates a secure `api_credentials` table for storing third-party API keys
that edge functions need at runtime. This is used as a fallback when edge
function secrets can't be set directly through the platform UI.

## Security
- RLS enabled, NO policies for anon/authenticated — service role only.
- Edge functions use the service role key to read these values.
*/

CREATE TABLE IF NOT EXISTS api_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  key_name text NOT NULL,
  key_value text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, key_name)
);

ALTER TABLE api_credentials ENABLE ROW LEVEL SECURITY;

-- Insert DingConnect API key
INSERT INTO api_credentials (provider, key_name, key_value, is_active)
VALUES ('dingconnect', 'api_key', '6XGJuyawDPA62Gez1D9krg', true)
ON CONFLICT (provider, key_name) DO UPDATE
  SET key_value = EXCLUDED.key_value, updated_at = now();
