/**
 * Diagnóstico: identifica OS donde el backfill de la migración 36 dejó
 * `movilidad_por_unidad` o `campana_por_unidad` en 0 mientras los totales
 * (`adicional_movilidad` / `adicional_campana`) son > 0. Esto pasa cuando
 * la OS tenía monto cargado pero sin líneas al momento de la migración.
 */
import dotenv from 'dotenv';
import path from 'node:path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN!;
const REF = process.env.SUPABASE_PROJECT_REF!;

async function query<T = unknown>(sql: string): Promise<T> {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
  return r.json() as Promise<T>;
}

const afectados = await query<Array<{
  id: string;
  numero: string;
  estado: string;
  adicional_movilidad: number;
  adicional_campana: number;
  movilidad_por_unidad: number;
  campana_por_unidad: number;
  unidades: number;
}>>(`
  select
    os.id,
    os.numero,
    os.estado,
    coalesce(os.adicional_movilidad, 0) as adicional_movilidad,
    coalesce(os.adicional_campana, 0)   as adicional_campana,
    coalesce(os.movilidad_por_unidad, 0) as movilidad_por_unidad,
    coalesce(os.campana_por_unidad, 0)   as campana_por_unidad,
    coalesce((select sum(cantidad) from public.ordenes_servicio_lineas l where l.os_id = os.id), 0) as unidades
  from public.ordenes_servicio os
  where (coalesce(os.adicional_movilidad, 0) > 0 and coalesce(os.movilidad_por_unidad, 0) = 0)
     or (coalesce(os.adicional_campana, 0)   > 0 and coalesce(os.campana_por_unidad, 0)   = 0)
  order by os.numero
`);

console.log(`OS afectadas: ${afectados.length}`);
if (afectados.length > 0) {
  console.table(afectados);
}

// Total de OS para contexto
const totalOs = await query<Array<{ count: number }>>(`select count(*)::int as count from public.ordenes_servicio`);
console.log(`Total OS en sistema: ${totalOs[0]?.count ?? 0}`);
