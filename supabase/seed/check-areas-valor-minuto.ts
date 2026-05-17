/** Inspecciona áreas_produccion y sus valores por minuto. */
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

console.log('=== Áreas de producción (todas) ===');
const areas = await q<Array<{ codigo: string; nombre: string; valor_minuto: number | null; activa: boolean }>>(
  `select codigo, nombre, valor_minuto, activa
   from public.areas_produccion
   order by nombre`,
);
console.table(areas);

console.log('\n=== Resumen ===');
const sinValor = areas.filter((a) => a.valor_minuto === null || a.valor_minuto === 0);
const conValor = areas.filter((a) => a.valor_minuto && a.valor_minuto > 0);
console.log(`Total áreas: ${areas.length}`);
console.log(`Con valor_minuto > 0: ${conValor.length}`);
console.log(`Sin valor_minuto (null o 0): ${sinValor.length}`);
if (sinValor.length > 0) {
  console.log('\nÁreas sin valor configurado:');
  sinValor.forEach((a) => console.log(`  - ${a.nombre} (${a.codigo})`));
}
