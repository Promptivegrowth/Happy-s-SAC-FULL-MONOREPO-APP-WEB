import { NextResponse } from 'next/server';
import { createClient } from '@happy/db/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/ubigeo?dep=15 → provincias
 * GET /api/ubigeo?prov=1501 → distritos
 * GET /api/ubigeo?q=miraflores → búsqueda libre
 *
 * Usa vistas v_ubigeo_departamentos y v_ubigeo_provincias (mig 41) que ya
 * devuelven únicos desde Postgres. Antes el endpoint dedupeaba en JS desde
 * la tabla cruda de 1874 distritos, pero PostgREST/Supabase tiene un cap
 * absoluto de 1000 filas que .limit() NO sobrescribe, así que sólo aparecían
 * 11 deptos (AMAZONAS → ICA).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const dep = url.searchParams.get('dep');
  const prov = url.searchParams.get('prov');
  const q = url.searchParams.get('q');

  const sb = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sbAny = sb as unknown as { from: (t: string) => any };

  if (q) {
    const { data } = await sb.from('v_ubigeo_completo')
      .select('codigo, ruta')
      .ilike('ruta', `%${q}%`)
      .limit(20);
    return NextResponse.json(data ?? []);
  }

  if (prov) {
    const { data } = await sb.from('ubigeo')
      .select('codigo, distrito')
      .eq('provincia_codigo', prov)
      .order('distrito');
    return NextResponse.json(data ?? []);
  }

  if (dep) {
    const { data } = await sbAny
      .from('v_ubigeo_provincias')
      .select('provincia_codigo, provincia')
      .eq('departamento_codigo', dep)
      .order('provincia');
    return NextResponse.json(data ?? []);
  }

  // Sin filtros → devolver departamentos (vista deduplicada, ~25 filas)
  const { data } = await sbAny
    .from('v_ubigeo_departamentos')
    .select('departamento_codigo, departamento')
    .order('departamento');
  return NextResponse.json(data ?? []);
}
