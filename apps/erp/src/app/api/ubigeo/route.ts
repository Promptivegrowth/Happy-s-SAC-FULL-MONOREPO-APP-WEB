import { NextResponse } from 'next/server';
import { createClient } from '@happy/db/server';

export const dynamic = 'force-dynamic';

// PostgREST limita por defecto a 1000 filas por respuesta. La tabla `ubigeo`
// tiene ~1874 distritos, así que al dedupear en JS quedan sólo los primeros
// 11 departamentos (AMAZONAS → ICA) y algunos deptos pierden provincias.
// Usamos un límite explícito que cubre todo el dataset.
const UBIGEO_LIMIT = 5000;

/**
 * GET /api/ubigeo?dep=15 → provincias
 * GET /api/ubigeo?prov=1501 → distritos
 * GET /api/ubigeo?q=miraflores → búsqueda libre
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const dep = url.searchParams.get('dep');
  const prov = url.searchParams.get('prov');
  const q = url.searchParams.get('q');

  const sb = await createClient();

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
      .order('distrito')
      .limit(UBIGEO_LIMIT);
    return NextResponse.json(data ?? []);
  }

  if (dep) {
    const { data } = await sb.from('ubigeo')
      .select('provincia_codigo, provincia')
      .eq('departamento_codigo', dep)
      .limit(UBIGEO_LIMIT);
    const uniq = Array.from(new Map((data ?? []).map((r) => [r.provincia_codigo, r])).values())
      .sort((a, b) => a.provincia.localeCompare(b.provincia));
    return NextResponse.json(uniq);
  }

  // Sin filtros → devolver departamentos
  const { data } = await sb.from('ubigeo')
    .select('departamento_codigo, departamento')
    .limit(UBIGEO_LIMIT);
  const uniq = Array.from(new Map((data ?? []).map((r) => [r.departamento_codigo, r])).values())
    .sort((a, b) => a.departamento.localeCompare(b.departamento));
  return NextResponse.json(uniq);
}
