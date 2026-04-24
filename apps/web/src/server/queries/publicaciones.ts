import { createClient } from '@happy/db/server';
import type { ProductCardData } from '@/components/product-card';

type PubRow = {
  producto_id: string;
  slug: string | null;
  titulo_web: string | null;
  precio_oferta: number | null;
  etiquetas: string[] | null;
  productos: {
    id: string;
    nombre: string;
    imagen_principal_url: string | null;
    productos_variantes: { id: string; precio_publico: number | null }[];
  } | null;
};

type LoadOpts = {
  q?: string;
  categoriaId?: string;
  campanaId?: string;
  destacado?: boolean;
  limit?: number;
};

export async function loadPublicaciones(opts: LoadOpts = {}): Promise<ProductCardData[]> {
  try {
    const sb = await createClient();

    let query = sb
      .from('productos_publicacion')
      .select(
        'producto_id, slug, titulo_web, precio_oferta, etiquetas, productos!inner(id, nombre, imagen_principal_url, categoria_id, campana_id, productos_variantes(id, precio_publico))',
      )
      .eq('publicado', true)
      .order('orden_web')
      .limit(opts.limit ?? 60);

    if (opts.q) query = query.ilike('titulo_web', `%${opts.q}%`);
    if (opts.categoriaId) query = query.eq('productos.categoria_id', opts.categoriaId);
    if (opts.campanaId) query = query.eq('productos.campana_id', opts.campanaId);
    if (opts.destacado) query = query.eq('destacado_web', true);

    const { data, error } = await query;
    if (error) {
      console.warn('[loadPublicaciones] error:', error.message);
      return [];
    }
    const pubs = (data ?? []) as unknown as PubRow[];
    if (pubs.length === 0) return [];

    // Cargar ratings + stock en paralelo
    const productoIds = pubs.map((p) => p.producto_id);
    const varianteIds = pubs.flatMap((p) => (p.productos?.productos_variantes ?? []).map((v) => v.id));

    const [{ data: ratings }, { data: stocks }] = await Promise.all([
      sb
        .from('v_productos_rating')
        .select('producto_id, total_resenas, promedio_rating')
        .in('producto_id', productoIds),
      varianteIds.length > 0
        ? sb
            .from('v_stock_variante_total')
            .select('variante_id, stock_total')
            .in('variante_id', varianteIds)
        : Promise.resolve({ data: [] as { variante_id: string; stock_total: number }[] }),
    ]);

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
      .map((p) => {
        const prod = p.productos!;
        const variantes = prod.productos_variantes ?? [];
        const precios = variantes.map((v) => Number(v.precio_publico ?? 0)).filter((x) => x > 0);
        const stockTotal = variantes.reduce((sum, v) => sum + (stockPorVariante.get(v.id) ?? 0), 0);
        const rt = ratingMap.get(p.producto_id);
        return {
          slug: p.slug,
          titulo: p.titulo_web ?? prod.nombre,
          imagen: prod.imagen_principal_url,
          precio: precios.length ? Math.min(...precios) : null,
          precioOferta: p.precio_oferta ? Number(p.precio_oferta) : null,
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
