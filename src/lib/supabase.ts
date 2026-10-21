import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase env vars. Check .env file.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const edgeFunctionUrl = (name: string) =>
  `${supabaseUrl}/functions/v1/${name}`;

export const edgeFunctionHeaders = (extra: Record<string, string> = {}) => ({
  Authorization: `Bearer ${supabaseAnonKey}`,
  'Content-Type': 'application/json',
  ...extra,
});

export async function callEdgeFunction<T = any>(
  name: string,
  options: { method?: string; body?: any; params?: Record<string, string> } = {},
): Promise<{ data: T | null; error: string | null }> {
  const { method = 'POST', body, params } = options;
  let url = edgeFunctionUrl(name);
  if (params) {
    const sp = new URLSearchParams(params);
    url += `?${sp.toString()}`;
  }
  try {
    const res = await fetch(url, {
      method,
      headers: edgeFunctionHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json();
    if (!res.ok) {
      return { data: null, error: json.error || `Request failed (${res.status})` };
    }
    return { data: json as T, error: null };
  } catch (e: any) {
    return { data: null, error: e.message || 'Network error' };
  }
}
