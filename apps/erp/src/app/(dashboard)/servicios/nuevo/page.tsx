import { createClient } from '@happy/db/server';
import { PageShell } from '@/components/page-shell';
import { NuevaOSForm } from './form-client';

export const metadata = { title: 'Nueva orden de servicio' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const sb = await createClient();

  // Cortes recientes con sus líneas + nombre del producto y número de OT.
  // Solo trae los que aún no fueron facturados al taller (estado relevante).
  const { data: cortesRaw } = await sb
    .from('ot_corte')
    .select(
      'id, numero, estado, ot_id, producto_id, ot:ot_id(numero), productos:producto_id(nombre), ot_corte_lineas(talla, cantidad_real, cantidad_teorica)',
    )
    .in('estado', ['ABIERTO', 'EN_PROCESO', 'COMPLETADO'])
    .order('created_at', { ascending: false })
    .limit(80);

  type CorteRaw = {
    id: string;
    numero: string;
    estado: string;
    ot_id: string;
    producto_id: string;
    ot: { numero: string } | null;
    productos: { nombre: string } | null;
    ot_corte_lineas: { talla: string; cantidad_real: number | null; cantidad_teorica: number }[];
  };

  const cortes = ((cortesRaw ?? []) as unknown as CorteRaw[]).map((c) => ({
    id: c.id,
    numero: c.numero,
    estado: c.estado,
    ot_id: c.ot_id,
    ot_numero: c.ot?.numero ?? '—',
    producto_id: c.producto_id,
    producto_nombre: c.productos?.nombre ?? '—',
    lineas: c.ot_corte_lineas ?? [],
  }));

  // Traemos OTs activas con sus líneas (producto + talla + cantidades) para
  // que el form permita elegir tallas directamente desde la OT (sin
  // necesidad de un corte vinculado).
  const [{ data: otsRaw }, { data: talleres }] = await Promise.all([
    sb
      .from('ot')
      .select('id, numero, ot_lineas(producto_id, talla, cantidad_planificada, cantidad_cortada, productos:producto_id(nombre))')
      .not('estado', 'in', '("COMPLETADA","CANCELADA")')
      .order('numero', { ascending: false })
      .limit(200),
    sb
      .from('talleres')
      .select('id, codigo, nombre')
      .eq('activo', true)
      .order('nombre'),
  ]);

  type OTRaw = {
    id: string;
    numero: string;
    ot_lineas: { producto_id: string; talla: string; cantidad_planificada: number; cantidad_cortada: number | null; productos: { nombre: string } | null }[];
  };
  const ots = ((otsRaw ?? []) as unknown as OTRaw[]).map((o) => {
    // Producto principal de la OT (asumimos mono-producto; si hay varios,
    // tomamos el primero — el flujo nuevo permite agrupar por producto).
    const primeraLinea = o.ot_lineas?.[0];
    return {
      id: o.id,
      numero: o.numero,
      producto_id: primeraLinea?.producto_id ?? '',
      producto_nombre: primeraLinea?.productos?.nombre ?? '—',
      lineas: (o.ot_lineas ?? []).map((l) => ({
        talla: l.talla,
        cantidad_planificada: Number(l.cantidad_planificada ?? 0),
        cantidad_cortada: Number(l.cantidad_cortada ?? 0),
      })),
    };
  });

  return (
    <PageShell
      title="Nueva Orden de Servicio"
      description="Envío de trabajo a taller externo. Podés elegir un corte (carga prendas + avíos del BOM) o directamente una OT y seleccionar las tallas a enviar."
    >
      <NuevaOSForm
        cortes={cortes}
        ots={ots}
        talleres={(talleres ?? []).map((t) => ({
          id: t.id as string,
          codigo: t.codigo as string,
          nombre: t.nombre as string,
        }))}
      />
    </PageShell>
  );
}
