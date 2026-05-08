/** Diagnóstico: contadores MOD_* y VAR_* vs códigos reales en productos / variantes. */
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

// Productos con código tipo <ABV>M<NNNN> — extraer el ABV y el número, agrupar por ABV
console.log('=== Productos: max número por prefijo (ej. HLW, DNZ) ===');
const prods = await q<Array<{ prefijo: string; max: number }>>(
  `select substring(codigo from '^([A-Z]{3})M[0-9]+$') as prefijo,
          max(cast(substring(codigo from '^[A-Z]{3}M([0-9]+)$') as int)) as max
   from public.productos
   where codigo ~ '^[A-Z]{3}M[0-9]+$'
   group by 1
   order by 1`,
);
console.table(prods);

console.log('\n=== Variantes: max número por prefijo (SKU <ABV><NNNN>) ===');
const vars_ = await q<Array<{ prefijo: string; max: number }>>(
  `select substring(sku from '^([A-Z]{3})[0-9]+$') as prefijo,
          max(cast(substring(sku from '^[A-Z]{3}([0-9]+)$') as int)) as max
   from public.productos_variantes
   where sku ~ '^[A-Z]{3}[0-9]+$'
   group by 1
   order by 1`,
);
console.table(vars_);

console.log('\n=== Cruzando con contadores ===');
const conts = await q<Array<{ clave: string; ultimo: number }>>(
  `select clave, ultimo from public.correlativos where clave like 'MOD\\_%' or clave like 'VAR\\_%' order by clave`,
);

const fixes: string[] = [];
for (const p of prods) {
  const cont = conts.find((c) => c.clave === `MOD_${p.prefijo}`)?.ultimo ?? 0;
  const status = cont >= p.max ? '✓' : '❌';
  console.log(`${status} MOD_${p.prefijo}: contador=${cont}, max real=${p.max}`);
  if (cont < p.max) fixes.push(`update correlativos set ultimo = ${p.max} where clave = 'MOD_${p.prefijo}';`);
}
for (const v of vars_) {
  const cont = conts.find((c) => c.clave === `VAR_${v.prefijo}`)?.ultimo ?? 0;
  const status = cont >= v.max ? '✓' : '❌';
  console.log(`${status} VAR_${v.prefijo}: contador=${cont}, max real=${v.max}`);
  if (cont < v.max) fixes.push(`update correlativos set ultimo = ${v.max} where clave = 'VAR_${v.prefijo}';`);
}

if (fixes.length > 0) {
  console.log('\n=== SQL de fix ===');
  fixes.forEach((s) => console.log(s));
}
