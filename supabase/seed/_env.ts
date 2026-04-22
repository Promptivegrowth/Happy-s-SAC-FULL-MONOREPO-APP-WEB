import path from 'node:path';
import url from 'node:url';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

const __filename = url.fileURLToPath(import.meta.url);
export const __dirname = path.dirname(__filename);
export const ROOT = path.resolve(__dirname, '../..');
export const EXCEL_DIR = path.resolve(ROOT, 'documentos excels');

// Cargar .env desde la raíz del repo, sin importar el cwd actual.
dotenv.config({ path: path.resolve(ROOT, '.env') });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !SERVICE) {
  console.error('❌ Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env');
  process.exit(1);
}

export const sb = createClient(URL, SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export function log(...args: unknown[]) {
  console.info('[seed]', ...args);
}

export function error(...args: unknown[]) {
  console.error('[seed-error]', ...args);
}

export async function upsert<T extends Record<string, unknown>>(
  table: string,
  rows: T[],
  onConflict?: string,
): Promise<void> {
  if (rows.length === 0) return;
  const { error: err } = await sb.from(table).upsert(rows, { onConflict });
  if (err) {
    error(`upsert ${table}:`, err.message);
    throw err;
  }
  log(`✔ ${table}: ${rows.length} filas`);
}
