/** Diagnóstico: para cada prefijo, max número del rango "limpio" (≤ 999999),
 *  count de códigos raros (> 999999) y huecos en el rango consecutivo. */
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

for (const pref of ['TEL', 'AVI', 'INS', 'EMP']) {
  console.log(`\n=== Prefijo ${pref} ===`);
  // Max del rango limpio (≤ 999999)
  const limpio = await q<Array<{ max: number; count: number }>>(
    `select coalesce(max(cast(substring(codigo from '^${pref}([0-9]+)$') as int)), 0) as max,
            count(*)::int as count
     from public.materiales
     where codigo ~ '^${pref}[0-9]+$' and cast(substring(codigo from '^${pref}([0-9]+)$') as int) <= 999999`,
  );
  // Códigos raros (> 999999)
  const raros = await q<Array<{ count: number; ejemplo: string }>>(
    `select count(*)::int as count,
            min(codigo) as ejemplo
     from public.materiales
     where codigo ~ '^${pref}[0-9]+$' and cast(substring(codigo from '^${pref}([0-9]+)$') as int) > 999999`,
  );
  console.log(`Rango limpio (≤999999): max=${limpio[0]?.max ?? 0}, count=${limpio[0]?.count ?? 0}`);
  console.log(`Códigos raros (>999999): count=${raros[0]?.count ?? 0}, ejemplo=${raros[0]?.ejemplo ?? '-'}`);

  // Verificar si hay huecos en el rango limpio (1..max)
  if ((limpio[0]?.max ?? 0) > 0) {
    const huecos = await q<Array<{ esperados: number; reales: number; huecos: number }>>(
      `with rango as (select generate_series(1, ${limpio[0]!.max}) as n),
            existentes as (
              select cast(substring(codigo from '^${pref}([0-9]+)$') as int) as n
              from public.materiales
              where codigo ~ '^${pref}[0-9]+$' and cast(substring(codigo from '^${pref}([0-9]+)$') as int) <= 999999
            )
       select ${limpio[0]!.max}::int as esperados,
              (select count(*)::int from existentes) as reales,
              (${limpio[0]!.max} - (select count(*)::int from existentes))::int as huecos`,
    );
    console.log(`Huecos en rango 1..${limpio[0]!.max}: ${huecos[0]?.huecos ?? 0}`);
  }
}

console.log('\n=== Recomendación de sincronización ===');
console.log('Sincronizar cada contador MAT_* al max del rango limpio.');
console.log('Si hay códigos raros >999999, no se tocan — quedan como están.');
console.log('Los códigos NUEVOS arrancarán desde max_limpio+1 con padding 7.');
