import { PosTerminal } from './pos-terminal';
import { createClient } from '@happy/db/server';

export const metadata = { title: 'Venta — POS' };
export const dynamic = 'force-dynamic';

type VarianteRow = {
  id: string;
  sku: string;
  codigo_barras: string | null;
  talla: string;
  precio_publico: number | null;
  productos: {
    id: string;
    nombre: string;
    codigo: string;
    imagen_principal_url: string | null;
    categoria_id: string | null;
    categorias: { id: string; nombre: string; activo: boolean } | null;
  } | null;
};

export default async function VentaPage() {
  const sb = await createClient();
  const [{ data: variantesRaw }, { data: cajas }, { data: categoriasRaw }, { data: stocks }] =
    await Promise.all([
      sb
        .from('productos_variantes')
        .select(
          'id, sku, codigo_barras, talla, precio_publico, productos!inner(id, nombre, codigo, imagen_principal_url, categoria_id, activo, categorias(id, nombre, activo))',
        )
        .eq('activo', true)
        .eq('productos.activo', true)
        .limit(2000),
      sb.from('cajas').select('id, codigo, nombre, almacen_id').eq('activo', true),
      sb.from('categorias').select('id, nombre, activo').eq('activo', true).order('orden_web'),
      sb.from('v_stock_variante_total').select('variante_id, stock_total'),
    ]);

  // Cascada: filtrar variantes cuya categoría esté apagada (consistente con
  // la web, que también las oculta cuando categorias.activo = false).
  // Productos sin categoría (categoria_id null) se incluyen igual.
  const variantes = ((variantesRaw ?? []) as unknown as VarianteRow[]).filter((v) => {
    if (!v.productos) return false;
    if (v.productos.categoria_id == null) return true;
    return v.productos.categorias?.activo !== false;
  });

  const stockMap = new Map<string, number>();
  for (const s of stocks ?? []) {
    stockMap.set(s.variante_id as string, Number(s.stock_total ?? 0));
  }

  return (
    <PosTerminal
      variantes={variantes as unknown as Parameters<typeof PosTerminal>[0]['variantes']}
      cajas={(cajas ?? []) as unknown as Parameters<typeof PosTerminal>[0]['cajas']}
      categorias={(categoriasRaw ?? []) as unknown as Parameters<typeof PosTerminal>[0]['categorias']}
      stockPorVariante={Object.fromEntries(stockMap)}
    />
  );
}
