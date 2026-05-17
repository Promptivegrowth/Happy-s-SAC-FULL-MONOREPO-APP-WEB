/** Drift: contador MAT_* vs el max real de cada prefijo (TEL/AVI/INS/EMP). */
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

console.log('=== Por prefijo: max número detectado vs contador ===');
for (const pref of ['TEL', 'AVI', 'INS', 'EMP']) {
  // Buscar todos los códigos que arrancan con el prefijo seguido de números
  const max = await q<Array<{ max: number }>>(
    `select coalesce(max(cast(substring(codigo from '^${pref}([0-9]+)$') as int)), 0) as max
     from public.materiales
     where codigo ~ '^${pref}[0-9]+$'`,
  );
  const cont = await q<Array<{ ultimo: number }>>(
    `select ultimo from public.correlativos where clave = 'MAT_${pref}'`,
  );
  const ultimo = cont[0]?.ultimo ?? 0;
  const maxReal = max[0]?.max ?? 0;
  const status = ultimo >= maxReal ? '✓' : '❌';
  console.log(`${status} ${pref}: contador=${ultimo}, max real=${maxReal}${ultimo < maxReal ? ` → DESINCRONIZADO (próximo intentaría ${pref}${String(ultimo + 1).padStart(4, '0')})` : ''}`);
}

console.log('\n=== Códigos que NO siguen el patrón <PREF><N> ===');
const raros = await q<Array<{ categoria: string; codigo: string; count: number }>>(
  `select categoria, codigo, count(*)::int as count
   from public.materiales
   where codigo !~ '^(TEL|AVI|INS|EMP)[0-9]+$'
   group by categoria, codigo
   order by categoria, codigo
   limit 30`,
);
console.log(`Total códigos "raros" (fuera de patrón): ${raros.length}`);
if (raros.length > 0) {
  console.table(raros);
}
