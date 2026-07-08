/**
 * Datos para el header público:
 *  - Campaña VIGENTE (por fecha actual) — reemplaza el link hardcoded del megamenú
 *  - Índice de productos publicados para el autocomplete del buscador
 *
 * Se ejecuta server-side en el layout y se pasa como prop al SiteHeader (client).
 * Ambas queries son idempotentes y read-only.
 */

import { createClient } from '@happy/db/server';

export type CampanaVigente = {
  slug: string;
  nombre: string;
};

export type ProductoBusqueda = {
  slug: string;
  nombre: string;
};

export async function cargarDatosHeader(): Promise<{
  campanaVigente: CampanaVigente | null;
  productosParaBusqueda: ProductoBusqueda[];
}> {
  try {
    const sb = await createClient();
    const hoy = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    // 1) Campaña vigente por fecha
    const { data: camp } = await sb
      .from('campanas')
      .select('slug, nombre, fecha_inicio, fecha_fin, activa')
      .eq('activa', true)
      .lte('fecha_inicio', hoy)
      .gte('fecha_fin', hoy)
      .order('fecha_fin', { ascending: true }) // la que termina primero es la más urgente
      .limit(1)
      .maybeSingle();

    const campanaVigente = camp?.slug
      ? { slug: camp.slug as string, nombre: camp.nombre as string }
      : null;

    // 2) Productos publicados para autocomplete — solo nombre + slug para
    //    minimizar payload. El filtro por letra se hace client-side.
    const { data: pubs } = await sb
      .from('productos_publicacion')
      .select('slug, titulo_web, productos!inner(nombre, activo)')
      .eq('publicado', true)
      .eq('productos.activo', true)
      .not('slug', 'is', null)
      .limit(500);

    type PubRow = { slug: string; titulo_web: string | null; productos: { nombre: string } | null };
    const productosParaBusqueda: ProductoBusqueda[] = ((pubs ?? []) as unknown as PubRow[])
      .filter((p) => p.slug && p.productos)
      .map((p) => ({
        slug: p.slug,
        nombre: p.titulo_web ?? p.productos!.nombre,
      }));

    return { campanaVigente, productosParaBusqueda };
  } catch {
    // Fail silencioso — el header debe renderizar aunque Supabase falle
    return { campanaVigente: null, productosParaBusqueda: [] };
  }
}
