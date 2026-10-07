/**
 * Una prenda no entra a producción sin su secuencia de operaciones.
 *
 * El 06/10/2026 se generó la primera OT real de un producto sin operaciones
 * cargadas: la OT avanzó, el producto quedó con sus tallas congeladas y ya no
 * se le podían agregar. El cliente lo pidió explícito: "si no te asignan los
 * procesos de una prenda no debería el sistema dejarme avanzar".
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = { from: (t: string) => any };

/** De estos productos, los que no tienen ninguna operación activa. "CODIGO nombre" de cada uno. */
export async function productosSinOperaciones(sb: Sb, productoIds: string[]): Promise<string[]> {
  const ids = [...new Set(productoIds.filter(Boolean))];
  if (ids.length === 0) return [];
  const con = new Set<string>();
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await sb
      .from('productos_procesos')
      .select('producto_id')
      .in('producto_id', ids.slice(i, i + 150))
      .eq('activo', true)
      .limit(5000);
    if (error) throw new Error(error.message);
    for (const p of (data ?? []) as { producto_id: string }[]) con.add(p.producto_id);
  }
  const faltan = ids.filter((id) => !con.has(id));
  if (faltan.length === 0) return [];
  const { data: prods } = await sb.from('productos').select('id, codigo, nombre').in('id', faltan);
  return ((prods ?? []) as { codigo: string | null; nombre: string | null }[])
    .map((p) => `${p.codigo ?? ''} ${p.nombre ?? ''}`.trim());
}

/** El mensaje para la pantalla, con qué hacer. */
export function mensajeSinOperaciones(productos: string[]): string {
  const lista = productos.slice(0, 5).join(', ') + (productos.length > 5 ? ` y ${productos.length - 5} más` : '');
  return (
    `Falta la secuencia de operaciones de: ${lista}. ` +
    'Cárgala en Recetas (BOM) → pestaña «Procesos / Operaciones» y vuelve a intentar. ' +
    'Sin operaciones la OT no puede registrar tiempos ni calcular el costo de mano de obra.'
  );
}
