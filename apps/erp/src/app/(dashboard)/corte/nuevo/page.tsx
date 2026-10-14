import { createClient } from '@happy/db/server';
import { PageShell } from '@/components/page-shell';
import { NuevoCorteForm, type OtConProductos } from './nuevo-corte-form';

export const metadata = { title: 'Nueva orden de corte' };
export const dynamic = 'force-dynamic';

type OtRow = {
  id: string;
  numero: string;
  estado: string;
  ot_lineas: Array<{
    producto_id: string; cantidad_planificada: number | null; cantidad_cortada: number | null;
    productos: { codigo: string; nombre: string } | null;
  }>;
};

/** Estados en que la OT ya pasó el corte: no se le crean más cortes (mismo criterio que crearCorte). */
const ESTADOS_POST_CORTE = ['EN_SERVICIO', 'EN_DECORADO', 'EN_CONTROL_CALIDAD', 'COMPLETADA', 'CANCELADA'];

export default async function Page({ searchParams }: { searchParams: Promise<{ ot?: string }> }) {
  const sp = await searchParams;
  const sb = await createClient();

  const { data: ots } = await sb
    .from('ot')
    .select('id, numero, estado, ot_lineas(producto_id, cantidad_planificada, cantidad_cortada, productos(codigo, nombre))')
    .not('estado', 'in', '("COMPLETADA","CANCELADA")')
    .order('numero', { ascending: false })
    .limit(100);

  /*
   * Solo OT con unidades PENDIENTES de cortar (pedido de Javier, 13/10/2026):
   * OT-26-00002 ya estaba cortada entera y seguía saliendo. Saldo = planificado
   * − cortado; también se dejan fuera las que ya pasaron el corte. Y de cada OT,
   * solo los modelos que todavía tienen saldo.
   */
  const conSaldo = (l: OtRow['ot_lineas'][number]) => Number(l.cantidad_planificada ?? 0) - Number(l.cantidad_cortada ?? 0) > 0;
  const otsPendientes = ((ots ?? []) as unknown as OtRow[])
    .filter((o) => !ESTADOS_POST_CORTE.includes(o.estado) && (o.ot_lineas ?? []).some(conSaldo));

  // De ot_lineas → lista de productos únicos por OT.
  const otsConProductos: OtConProductos[] = otsPendientes.map((o) => {
    const seen = new Map<string, { id: string; codigo: string; nombre: string }>();
    for (const l of o.ot_lineas ?? []) {
      if (!conSaldo(l)) continue;
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
      {otsConProductos.length === 0 && (
        <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          No hay órdenes de trabajo con unidades pendientes de cortar. Las OT ya cortadas por completo no aparecen aquí.
        </p>
      )}
      <NuevoCorteForm ots={otsConProductos} telasPorProducto={telasPorProducto} defaultOtId={sp.ot} />
    </PageShell>
  );
}
