import { createClient as createSb } from '@supabase/supabase-js';
import type { Database } from './types/supabase';

/**
 * Cliente Supabase con SERVICE ROLE.
 * ⚠️ Solo usar en server-side (Edge Functions, Route Handlers protegidas, scripts).
 * Bypassa RLS — nunca exponer al cliente.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY (server-only)');
  }
  return createSb<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
