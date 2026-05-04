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

  const [{ data: ots }, { data: talleres }] = await Promise.all([
    sb
      .from('ot')
      .select('id, numero')
      .not('estado', 'in', '("COMPLETADA","CANCELADA")')
      .order('numero', { ascending: false })
      .limit(200),
    sb
      .from('talleres')
      .select('id, codigo, nombre')
      .eq('activo', true)
      .order('nombre'),
  ]);

  return (
    <PageShell
      title="Nueva Orden de Servicio"
      description="Envío de trabajo a taller externo. Si vinculás un corte, las prendas y los avíos del BOM se cargan solos."
    >
      <NuevaOSForm
        cortes={cortes}
        ots={(ots ?? []).map((o) => ({ id: o.id as string, numero: o.numero as string }))}
        talleres={(talleres ?? []).map((t) => ({
          id: t.id as string,
          codigo: t.codigo as string,
          nombre: t.nombre as string,
        }))}
      />
    </PageShell>
  );
}
