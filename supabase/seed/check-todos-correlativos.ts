/** Diagnóstico GENERAL: chequea todos los correlativos vs los códigos reales en sus tablas. */
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

// Mapeo: clave del correlativo → query para sacar el max número real
const checks: Array<{ clave: string; sql: string; descripcion: string }> = [
  { clave: 'TALLER', descripcion: 'Talleres TAL-NNN', sql: `select coalesce(max(cast(substring(codigo from 'TAL-([0-9]+)') as int)), 0) as max from talleres where codigo ~ '^TAL-[0-9]+$'` },
  { clave: 'OPERARIO', descripcion: 'Operarios OP-NNN', sql: `select coalesce(max(cast(substring(codigo from 'OP-([0-9]+)') as int)), 0) as max from operarios where codigo ~ '^OP-[0-9]+$'` },
  { clave: 'CORTE', descripcion: 'Cortes COR-NNNNNN', sql: `select coalesce(max(cast(substring(numero from 'COR-([0-9]+)') as int)), 0) as max from ot_corte where numero ~ '^COR-[0-9]+$'` },
  { clave: 'OS', descripcion: 'OS OS-NNNNNN', sql: `select coalesce(max(cast(substring(numero from 'OS-([0-9]+)') as int)), 0) as max from ordenes_servicio where numero ~ '^OS-[0-9]+$'` },
];

console.log('=== Comparación contadores vs max real ===\n');
const todos = await q<Array<{ clave: string; ultimo: number }>>(
  `select clave, ultimo from public.correlativos order by clave`,
);
console.log('Contadores actuales:');
console.table(todos);

console.log('\n=== Análisis por clave ===');
for (const c of checks) {
  try {
    const max = (await q<Array<{ max: number }>>(c.sql))[0]?.max ?? 0;
    const cont = todos.find((t) => t.clave === c.clave)?.ultimo ?? 0;
    const status = cont >= max ? '✓ OK' : '❌ DESINCRONIZADO';
    console.log(`${c.descripcion}: contador=${cont}, max real=${max} → ${status}`);
    if (cont < max) {
      console.log(`   FIX: update correlativos set ultimo = ${max} where clave = '${c.clave}';`);
    }
  } catch (e) {
    console.log(`${c.descripcion}: error → ${(e as Error).message.slice(0, 100)}`);
  }
}

// También chequear contadores específicos de productos por categoría (MOD_HLW, VAR_HLW, etc.)
console.log('\n=== Contadores por categoría (productos / variantes) ===');
const porCat = todos.filter((t) => t.clave.startsWith('MOD_') || t.clave.startsWith('VAR_'));
if (porCat.length > 0) {
  console.table(porCat);
} else {
  console.log('Sin contadores MOD_/VAR_ aún (no se han creado productos via UI).');
}
