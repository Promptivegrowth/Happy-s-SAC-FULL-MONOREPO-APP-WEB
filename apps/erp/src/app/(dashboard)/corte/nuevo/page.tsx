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

  return (
    <PageShell
      title="Nueva orden de corte"
      description="Una orden por OT. El modelo se toma automáticamente del plan de la OT."
    >
      <NuevoCorteForm ots={otsConProductos} operarios={operarios} defaultOtId={sp.ot} />
    </PageShell>
  );
}
