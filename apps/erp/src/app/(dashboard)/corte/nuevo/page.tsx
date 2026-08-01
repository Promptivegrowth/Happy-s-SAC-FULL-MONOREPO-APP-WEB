import { createClient } from '@happy/db/server';
import { PageShell } from '@/components/page-shell';
import { NuevoCorteForm, type OtConProductos } from './nuevo-corte-form';

export const metadata = { title: 'Nueva orden de corte' };
export const dynamic = 'force-dynamic';

type OtRow = {
  id: string;
  numero: string;
  ot_lineas: Array<{ producto_id: string; productos: { codigo: string; nombre: string } | null }>;
};

export default async function Page({ searchParams }: { searchParams: Promise<{ ot?: string }> }) {
  const sp = await searchParams;
  const sb = await createClient();

  const [{ data: ots }, { data: ops }] = await Promise.all([
    sb
      .from('ot')
      .select('id, numero, ot_lineas(producto_id, productos(codigo, nombre))')
      .not('estado', 'in', '("COMPLETADA","CANCELADA")')
      .order('numero', { ascending: false })
      .limit(100),
    sb.from('operarios').select('id, codigo, nombres, apellido_paterno').eq('activo', true).order('nombres'),
  ]);

  // De ot_lineas → lista de productos únicos por OT.
  const otsConProductos: OtConProductos[] = ((ots ?? []) as unknown as OtRow[]).map((o) => {
    const seen = new Map<string, { id: string; codigo: string; nombre: string }>();
    for (const l of o.ot_lineas ?? []) {
      if (l.producto_id && l.productos && !seen.has(l.producto_id)) {
        seen.set(l.producto_id, {
          id: l.producto_id,
          codigo: l.productos.codigo,
          nombre: l.productos.nombre,
        });
      }
    }
    return { id: o.id, numero: o.numero, productos: Array.from(seen.values()) };
  });

  const operarios = (ops ?? []).map((o) => ({
    id: o.id as string,
    codigo: (o.codigo as string) ?? '',
    nombre: `${o.nombres ?? ''} ${o.apellido_paterno ?? ''}`.trim(),
  }));

  // Telas de la receta ACTIVA de cada producto — pedido del cliente
  // (21/07/2026): mostrar en la orden de corte qué telas usa el modelo.
  const productoIds = Array.from(new Set(otsConProductos.flatMap((o) => o.productos.map((p) => p.id))));
  const telasPorProducto: Record<string, { codigo: string; nombre: string }[]> = {};
  if (productoIds.length > 0) {
    const { data: recetas } = await sb
      .from('recetas')
      .select('id, producto_id')
      .eq('activa', true)
      .in('producto_id', productoIds);
    const recetaToProducto = new Map<string, string>(
      ((recetas ?? []) as { id: string; producto_id: string }[]).map((r) => [r.id, r.producto_id]),
    );
    const recetaIds = Array.from(recetaToProducto.keys());
    if (recetaIds.length > 0) {
      const { data: lineasRec } = await sb
        .from('recetas_lineas')
        .select('receta_id, material:material_id(codigo, nombre, categoria)')
        .in('receta_id', recetaIds);
      type LR = { receta_id: string; material: { codigo: string; nombre: string; categoria: string } | null };
      const vistos = new Set<string>(); // producto|codigo para no duplicar
      for (const l of (lineasRec ?? []) as unknown as LR[]) {
        if (!l.material || String(l.material.categoria) !== 'TELA') continue;
        const prod = recetaToProducto.get(l.receta_id);
        if (!prod) continue;
        const key = `${prod}|${l.material.codigo}`;
        if (vistos.has(key)) continue;
        vistos.add(key);
        (telasPorProducto[prod] ??= []).push({ codigo: l.material.codigo, nombre: l.material.nombre });
      }
      for (const arr of Object.values(telasPorProducto)) arr.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    }
  }

  return (
    <PageShell
      title="Nueva orden de corte"
      description="Una orden por OT. El modelo se toma automáticamente del plan de la OT."
    >
      <NuevoCorteForm ots={otsConProductos} operarios={operarios} telasPorProducto={telasPorProducto} defaultOtId={sp.ot} />
    </PageShell>
  );
}
