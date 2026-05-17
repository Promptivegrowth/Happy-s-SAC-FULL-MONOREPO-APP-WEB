/** Verifica que el histórico de valor_minuto se haya creado correctamente. */
import dotenv from 'dotenv';
import path from 'node:path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN!;
const REF = process.env.SUPABASE_PROJECT_REF!;

async function q<T = unknown>(sql: string): Promise<T> {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
  return r.json() as Promise<T>;
}

console.log('=== Histórico de valor_minuto (backfill inicial) ===');
const rows = await q<Array<{ area: string; valor: string; notas: string; created_at: string }>>(
  `select ap.nombre as area, h.valor_minuto::text as valor, h.notas, h.created_at::text
   from public.areas_valor_minuto_historial h
   join public.areas_produccion ap on ap.id = h.area_id
   order by ap.nombre, h.created_at`,
);
console.table(rows);
console.log(`Total snapshots: ${rows.length}`);
