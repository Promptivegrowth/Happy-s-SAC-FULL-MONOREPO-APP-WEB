/** Diagnóstico: comparar el contador 'TALLER' contra los códigos reales en talleres. */
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

console.log('=== Contador TALLER ===');
const cont = await q<Array<{ clave: string; ultimo: number }>>(
  `select clave, ultimo from public.correlativos where clave = 'TALLER'`,
);
console.table(cont);

console.log('\n=== Talleres existentes (todos los códigos TAL-*) ===');
const talleres = await q<Array<{ codigo: string; nombre: string; activo: boolean }>>(
  `select codigo, nombre, activo from public.talleres where codigo like 'TAL-%' order by codigo`,
);
console.table(talleres);

console.log('\n=== Diagnóstico ===');
const max = talleres.reduce((m, t) => {
  const n = parseInt(t.codigo.replace('TAL-', ''), 10);
  return Number.isFinite(n) ? Math.max(m, n) : m;
}, 0);
const ultimoContador = cont[0]?.ultimo ?? 0;
console.log(`Max número en talleres existentes: ${max}`);
console.log(`Último del contador 'TALLER': ${ultimoContador}`);
console.log(`Próximo que generaría: TAL-${String(ultimoContador + 1).padStart(3, '0')}`);
if (ultimoContador < max) {
  console.log(`❌ BUG: el contador (${ultimoContador}) está atrasado respecto al max real (${max}).`);
  console.log(`   Próximas generaciones colisionarán hasta llegar a ${max}.`);
} else {
  console.log(`✓ El contador está alineado o adelantado. No debería colisionar.`);
}
