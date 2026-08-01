import { createClient } from '@happy/db/server';
import { PageShell } from '@/components/page-shell';
import { NuevaOSForm } from './form-client';
import { esGerente } from '@/server/actions/_helpers';

export const metadata = { title: 'Nueva orden de servicio' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const sb = await createClient();
  const gerente = await esGerente();

  // Cortes recientes con sus líneas + nombre del producto y número de OT.
  // Solo trae los que aún no fueron facturados al taller (estado relevante).
  const { data: cortesRaw } = await sb
    .from('ot_corte')
    .select(
      'id, numero, estado, ot_id, producto_id, ot:ot_id(numero), productos:producto_id(nombre)',
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
  };
  const cortesBase = (cortesRaw ?? []) as unknown as CorteRaw[];

  // Las tallas + cantidades del corte vinculado se toman de la OT
  // (ot_lineas.cantidad_cortada), que es la fuente reconciliada — NO de
  // ot_corte_lineas.cantidad_real (decisión del cliente 21/07/2026: la OS debe
  // reflejar lo real de la OT, no lo del corte, que estaba desconectado).
  const corteOtIds = Array.from(new Set(cortesBase.map((c) => c.ot_id).filter(Boolean)));
  const { data: otLineasCorte } = corteOtIds.length > 0
    ? await sb
        .from('ot_lineas')
        .select('ot_id, producto_id, talla, cantidad_planificada, cantidad_cortada')
        .in('ot_id', corteOtIds)
    : { data: [] as { ot_id: string; producto_id: string; talla: string; cantidad_planificada: number | null; cantidad_cortada: number | null }[] };
  const otLineasMap = new Map<string, { talla: string; cortada: number; plan: number }[]>();
  for (const l of (otLineasCorte ?? []) as { ot_id: string; producto_id: string; talla: string; cantidad_planificada: number | null; cantidad_cortada: number | null }[]) {
    const key = `${l.ot_id}::${l.producto_id}`;
    const arr = otLineasMap.get(key) ?? [];
    arr.push({ talla: l.talla, cortada: Number(l.cantidad_cortada ?? 0), plan: Number(l.cantidad_planificada ?? 0) });
    otLineasMap.set(key, arr);
  }

  const cortes = cortesBase.map((c) => ({
    id: c.id,
    numero: c.numero,
    estado: c.estado,
    ot_id: c.ot_id,
    ot_numero: c.ot?.numero ?? '—',
    producto_id: c.producto_id,
    producto_nombre: c.productos?.nombre ?? '—',
    // cantidad_real ahora lleva la cantidad CORTADA de la OT (no la del corte).
    lineas: (otLineasMap.get(`${c.ot_id}::${c.producto_id}`) ?? [])
      .filter((l) => l.cortada > 0)
      .map((l) => ({ talla: l.talla, cantidad_real: l.cortada, cantidad_teorica: l.plan })),
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
      description="Envío de trabajo a taller externo. Puede elegir un corte (carga las tallas con la cantidad CORTADA de la OT + los avíos del BOM) o directamente una OT y seleccionar las tallas a enviar."
    >
      <NuevaOSForm
        cortes={cortes}
        ots={ots}
        esGerente={gerente}
        talleres={(talleres ?? []).map((t) => ({
          id: t.id as string,
          codigo: t.codigo as string,
          nombre: t.nombre as string,
        }))}
      />
    </PageShell>
  );
}
