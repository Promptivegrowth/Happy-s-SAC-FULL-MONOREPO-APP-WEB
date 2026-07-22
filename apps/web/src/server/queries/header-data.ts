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
    //    Familias (mig 65): los productos que son variantes de color de una
    //    misma familia (ej. "falda de marinera" en 7 colores) se colapsan en
    //    UNA sola sugerencia con el nombre de la familia — sino el buscador
    //    listaba los 7 colores por separado (reporte del cliente 21/07/2026).
    //    El color se elige en la ficha con el selector de color.
    const { data: pubs } = await sb
      .from('productos_publicacion')
      .select('slug, titulo_web, productos!inner(nombre, activo, familia_id, productos_familias(nombre))')
      .eq('publicado', true)
      .eq('productos.activo', true)
      .not('slug', 'is', null)
      .order('slug')
      .limit(500);

    type PubRow = {
      slug: string;
      titulo_web: string | null;
      productos: {
        nombre: string;
        familia_id: string | null;
        productos_familias: { nombre: string } | null;
      } | null;
    };
    const productosParaBusqueda: ProductoBusqueda[] = [];
    const familiasVistas = new Set<string>();
    for (const p of (pubs ?? []) as unknown as PubRow[]) {
      if (!p.slug || !p.productos) continue;
      const famId = p.productos.familia_id;
      const famNombre = p.productos.productos_familias?.nombre;
      if (famId && famNombre) {
        // Solo la primera publicación de cada familia entra al índice, con el
        // nombre de la familia; enlaza a esa ficha (que trae el selector de color).
        if (familiasVistas.has(famId)) continue;
        familiasVistas.add(famId);
        productosParaBusqueda.push({ slug: p.slug, nombre: famNombre });
      } else {
        productosParaBusqueda.push({ slug: p.slug, nombre: p.titulo_web ?? p.productos.nombre });
      }
    }

    return { campanaVigente, productosParaBusqueda };
  } catch {
    // Fail silencioso — el header debe renderizar aunque Supabase falle
    return { campanaVigente: null, productosParaBusqueda: [] };
  }
}
