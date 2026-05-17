/** Cuenta materiales sin unidad_consumo_id configurado. */
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

console.log('=== Materiales sin unidad de consumo ===');
const sinUnidad = await q<Array<{ categoria: string; total: number; sin_consumo: number; sin_compra: number }>>(
  `select
     categoria,
     count(*)::int as total,
     sum(case when unidad_consumo_id is null then 1 else 0 end)::int as sin_consumo,
     sum(case when unidad_compra_id  is null then 1 else 0 end)::int as sin_compra
   from public.materiales
   where activo = true
   group by categoria
   order by categoria`,
);
console.table(sinUnidad);

const t = sinUnidad.reduce((s, r) => ({
  total: s.total + r.total,
  sin_consumo: s.sin_consumo + r.sin_consumo,
  sin_compra: s.sin_compra + r.sin_compra,
}), { total: 0, sin_consumo: 0, sin_compra: 0 });
console.log(`\nTotales: ${t.total} materiales activos`);
console.log(`  Sin unidad de CONSUMO: ${t.sin_consumo}`);
console.log(`  Sin unidad de COMPRA:  ${t.sin_compra}`);

if (t.sin_consumo > 0) {
  console.log('\n=== Muestra de materiales sin unidad de consumo (primeros 20) ===');
  const muestra = await q<Array<{ codigo: string; nombre: string; categoria: string; unidad_compra_id: string | null }>>(
    `select codigo, nombre, categoria, unidad_compra_id
     from public.materiales
     where activo = true and unidad_consumo_id is null
     order by categoria, codigo
     limit 20`,
  );
  console.table(muestra);
}

// Lo más útil: ver si hay materiales que tienen compra pero no consumo (caso típico:
// "lo importé y la columna de consumo quedó null pero la de compra sí está")
console.log('\n=== Distribución: compra vs consumo ===');
const distrib = await q<Array<{ situacion: string; count: number }>>(
  `select
     case
       when unidad_compra_id is not null and unidad_consumo_id is not null then 'Ambas configuradas'
       when unidad_compra_id is not null and unidad_consumo_id is null then 'Solo compra (falta consumo)'
       when unidad_compra_id is null and unidad_consumo_id is not null then 'Solo consumo (falta compra)'
       else 'Ninguna configurada'
     end as situacion,
     count(*)::int as count
   from public.materiales
   where activo = true
   group by 1
   order by 2 desc`,
);
console.table(distrib);
