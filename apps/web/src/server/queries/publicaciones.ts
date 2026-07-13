import { createClient } from '@happy/db/server';
import type { ProductCardData } from '@/components/product-card';

type PubRow = {
  producto_id: string;
  slug: string | null;
  titulo_web: string | null;
  precio_oferta: number | null;
  descuento_porcentaje: number | null;
  descuento_excluir_tallas: string[] | null;
  etiquetas: string[] | null;
  productos: {
    id: string;
    nombre: string;
    imagen_principal_url: string | null;
    categoria_id: string | null;
    productos_variantes: { id: string; talla: string; precio_publico: number | null }[];
    categorias?: { activo: boolean } | null;
  } | null;
};

type LoadOpts = {
  q?: string;
  categoriaId?: string;
  campanaId?: string;
  /** Filtra productos.genero: MUJER/HOMBRE/UNISEX/NINO/NINA. UNISEX siempre se incluye junto con el género específico. */
  genero?: 'MUJER' | 'HOMBRE' | 'UNISEX' | 'NINO' | 'NINA' | 'ADULTO';
  destacado?: boolean;
  limit?: number;
};

export async function loadPublicaciones(opts: LoadOpts = {}): Promise<ProductCardData[]> {
  try {
    const sb = await createClient();

    let query = sb
      .from('productos_publicacion')
      .select(
        'producto_id, slug, titulo_web, precio_oferta, descuento_porcentaje, descuento_excluir_tallas, etiquetas, productos!inner(id, nombre, imagen_principal_url, categoria_id, campana_id, productos_variantes(id, talla, precio_publico), categorias!productos_categoria_id_fkey(activo))',
      )
      .eq('publicado', true)
      .order('orden_web')
      .limit(opts.limit ?? 60);

    // Búsqueda: matchea titulo_web O palabras_clave (sinónimos SEO) O el
    // NOMBRE del producto en el ERP. El tercer término se agregó el
    // 2026-07-12: el cliente publicó "Guardapolvo" con título web "MANDIL"
    // y al buscar "guardapolvo" no salía nada — el nombre interno del ERP
    // debe encontrar el producto siempre, aunque el título web sea otro.
    // Como PostgREST no permite mezclar columnas de la tabla padre y de la
    // embebida en un mismo or(), primero resolvemos los producto_id que
    // matchean por nombre y los sumamos como producto_id.in.(...).
    if (opts.q) {
      const q = opts.q.replace(/[%,]/g, '');  // sanitizar para .or()
      let idsPorNombre: string[] = [];
      try {
        const { data: porNombre } = await sb
          .from('productos')
          .select('id')
          .ilike('nombre', `%${q}%`)
          .eq('activo', true)
          .limit(100);
        idsPorNombre = (porNombre ?? []).map((r) => r.id as string);
      } catch { /* si falla, la búsqueda sigue por título/keywords */ }
      query = idsPorNombre.length > 0
        ? query.or(`titulo_web.ilike.%${q}%,palabras_clave.ilike.%${q}%,producto_id.in.(${idsPorNombre.join(',')})`)
        : query.or(`titulo_web.ilike.%${q}%,palabras_clave.ilike.%${q}%`);
    }
    if (opts.categoriaId) {
      // El producto puede aparecer en una categoría como principal O como
      // extra (red de seguridad para que no desaparezca al rotar temporada).
      // Cast: tabla productos_categorias_extra (mig 31) aún no está en
      // los tipos auto-generados — regenerar tipos cuando se aplique.
      try {
        const { data: pcex } = await (sb as unknown as { from: (t: string) => any }) // eslint-disable-line @typescript-eslint/no-explicit-any
          .from('productos_categorias_extra')
          .select('producto_id')
          .eq('categoria_id', opts.categoriaId);
        const extraIds = ((pcex ?? []) as { producto_id: string }[]).map((e) => e.producto_id);
        if (extraIds.length > 0) {
          query = query.or(
            `categoria_id.eq.${opts.categoriaId},id.in.(${extraIds.join(',')})`,
            { foreignTable: 'productos' },
          );
        } else {
          query = query.eq('productos.categoria_id', opts.categoriaId);
        }
      } catch {
        query = query.eq('productos.categoria_id', opts.categoriaId);
      }
    }
    if (opts.campanaId) query = query.eq('productos.campana_id', opts.campanaId);
    if (opts.destacado) query = query.eq('destacado_web', true);
    if (opts.genero) {
      // ADULTO en URL = MUJER + HOMBRE + UNISEX (cualquier no-niño)
      // NINO/NINA específicos: solo ese género (no incluir UNISEX porque
      // las prendas adultas marcadas UNISEX no son para niños).
      if (opts.genero === 'ADULTO') {
        query = query.in('productos.genero', ['MUJER', 'HOMBRE', 'UNISEX']);
      } else if (opts.genero === 'NINO' || opts.genero === 'NINA') {
        query = query.eq('productos.genero', opts.genero);
      } else {
        query = query.in('productos.genero', [opts.genero, 'UNISEX']);
      }
    }

    const { data, error } = await query;
    if (error) {
      console.warn('[loadPublicaciones] error:', error.message);
      return [];
    }
    const pubs = (data ?? []) as unknown as PubRow[];
    if (pubs.length === 0) return [];

    // Cargar ratings + stock + extras (con cat activa) en paralelo
    const productoIds = pubs.map((p) => p.producto_id);
    const varianteIds = pubs.flatMap((p) => (p.productos?.productos_variantes ?? []).map((v) => v.id));

    const [{ data: ratings }, { data: stocks }, extrasRes] = await Promise.all([
      sb
        .from('v_productos_rating')
        .select('producto_id, total_resenas, promedio_rating')
        .in('producto_id', productoIds),
      // v_stock_variante_web = stock SOLO de La Quinta (mig 63) — misma
      // fuente que la ficha del producto, para que el catálogo y el detalle
      // nunca se contradigan (antes el catálogo sumaba todos los almacenes).
      varianteIds.length > 0
        ? (sb as unknown as {
            from: (t: string) => {
              select: (s: string) => {
                in: (c: string, v: string[]) => PromiseLike<{ data: { variante_id: string; stock_total: number }[] | null }>;
              };
            };
          })
            .from('v_stock_variante_web')
            .select('variante_id, stock_total')
            .in('variante_id', varianteIds)
        : Promise.resolve({ data: [] as { variante_id: string; stock_total: number }[] }),
      // Extras: si alguna está activa, el producto queda visible aunque
      // la categoría principal esté apagada. Cast hasta regenerar tipos.
      (sb as unknown as { from: (t: string) => any }) // eslint-disable-line @typescript-eslint/no-explicit-any
        .from('productos_categorias_extra')
        .select('producto_id, categorias!inner(activo)')
        .in('producto_id', productoIds)
        .then(
          (r: { data: unknown[] | null }) => r,
          () => ({ data: [] as unknown[] }),
        ),
    ]);

    const tieneExtraActiva = new Map<string, boolean>();
    for (const e of (extrasRes.data ?? []) as { producto_id: string; categorias?: { activo: boolean } }[]) {
      if (e.categorias?.activo) tieneExtraActiva.set(e.producto_id, true);
    }

    const ratingMap = new Map<string, { total: number; promedio: number }>();
    for (const r of ratings ?? []) {
      ratingMap.set(r.producto_id as string, {
        total: r.total_resenas ?? 0,
        promedio: r.promedio_rating ? Number(r.promedio_rating) : 0,
      });
    }

    const stockPorVariante = new Map<string, number>();
    for (const s of stocks ?? []) {
      stockPorVariante.set(s.variante_id as string, Number(s.stock_total ?? 0));
    }

    return pubs
      .filter((p) => p.productos)
      // Si la categoría principal está apagada, el producto solo se muestra
      // si tiene al menos una categoría EXTRA activa (red de seguridad).
      .filter((p) => {
        const cat = p.productos!.categorias;
        if (p.productos!.categoria_id == null) return true;
        if (cat?.activo !== false) return true;
        return tieneExtraActiva.get(p.producto_id) === true;
      })
      .map((p) => {
        const prod = p.productos!;
        const variantes = prod.productos_variantes ?? [];
        const precios = variantes.map((v) => Number(v.precio_publico ?? 0)).filter((x) => x > 0);
        const stockTotal = variantes.reduce((sum, v) => sum + (stockPorVariante.get(v.id) ?? 0), 0);
        const rt = ratingMap.get(p.producto_id);

        // Calcular precio mostrado en la card considerando el descuento %.
        // Tomamos el precio mínimo entre las tallas que SÍ aplican descuento.
        const precioMin = precios.length ? Math.min(...precios) : null;
        const descPct = p.descuento_porcentaje ?? 0;
        const tallasExc = new Set(p.descuento_excluir_tallas ?? []);
        let precioOferta: number | null = null;
        if (descPct > 0) {
          // Encontrar el menor precio entre tallas NO excluidas, aplicar el %.
          const preciosConDescuento = variantes
            .filter((v) => !tallasExc.has(v.talla))
            .map((v) => Number(v.precio_publico ?? 0))
            .filter((x) => x > 0);
          if (preciosConDescuento.length > 0) {
            const minConDesc = Math.min(...preciosConDescuento);
            precioOferta = Math.round(minConDesc * (1 - descPct / 100) * 100) / 100;
          }
        } else if (p.precio_oferta) {
          // Fallback al precio oferta absoluto si no hay descuento %.
          precioOferta = Number(p.precio_oferta);
        }

        return {
          slug: p.slug,
          titulo: p.titulo_web ?? prod.nombre,
          imagen: prod.imagen_principal_url,
          precio: precioMin,
          precioOferta,
          descuentoPorcentaje: descPct > 0 ? descPct : null,
          etiquetas: p.etiquetas,
          rating: rt?.promedio ?? null,
          totalResenas: rt?.total ?? null,
          stockTotal,
          agotado: stockTotal <= 0,
        };
      });
  } catch (e) {
    console.warn('[loadPublicaciones] exception:', (e as Error).message);
    return [];
  }
}
