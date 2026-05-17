/** Diagnóstico: analizar el formato de los códigos de materiales para entender
 *  si son autogenerados o importados del sistema viejo. */
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

console.log('=== Total materiales y por categoría ===');
const totales = await q<Array<{ categoria: string; total: number }>>(
  `select categoria, count(*)::int as total from public.materiales group by categoria order by categoria`,
);
console.table(totales);

console.log('\n=== Largos de código por categoría ===');
const largos = await q<Array<{ categoria: string; largo: number; count: number; ejemplo: string }>>(
  `select categoria, length(codigo) as largo, count(*)::int as count,
          min(codigo) as ejemplo
   from public.materiales
   group by categoria, length(codigo)
   order by categoria, largo`,
);
console.table(largos);

console.log('\n=== Contadores actuales por categoría ===');
const contadores = await q<Array<{ clave: string; ultimo: number }>>(
  `select clave, ultimo from public.correlativos where clave like 'MAT_%' order by clave`,
);
console.table(contadores);

console.log('\n=== Análisis de patrón ===');
// Para cada categoría, ver si los números siguen un patrón consecutivo o son saltos grandes
for (const cat of totales) {
  const cods = await q<Array<{ codigo: string; nombre: string }>>(
    `select codigo, nombre from public.materiales where categoria = '${cat.categoria}' order by codigo limit 20`,
  );
  console.log(`\n--- ${cat.categoria} (primeros 20 de ${cat.total}) ---`);
  console.table(cods);
}
