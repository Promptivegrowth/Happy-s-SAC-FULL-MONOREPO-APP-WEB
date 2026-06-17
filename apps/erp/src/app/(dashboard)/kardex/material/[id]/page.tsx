import { notFound } from 'next/navigation';
import { createClient } from '@happy/db/server';
import { PageShell } from '@/components/page-shell';
import { historicoMaterial } from '@/server/actions/kardex';
import { HistoricoTabla } from '../../historico-tabla';

export const dynamic = 'force-dynamic';

export default async function HistoricoMaterialPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ almacen?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const sb = await createClient();

  const { data: material } = await sb
    .from('materiales')
    .select('id, codigo, nombre, categoria, unidad_consumo:unidad_consumo_id(codigo)')
    .eq('id', id)
    .single();
  if (!material) notFound();
  const unidad = (material as unknown as { unidad_consumo?: { codigo: string } | null }).unidad_consumo?.codigo ?? '';

  const res = await historicoMaterial(id, sp.almacen || undefined);
  if (!res.ok) {
    return (
      <PageShell title="Error" description="">
        <div className="rounded border border-danger/40 bg-danger/5 p-4 text-sm text-danger">{res.error}</div>
      </PageShell>
    );
  }
  const { movimientos, stock_actual } = res.data!;

  return (
    <PageShell
      title={`Kardex de ${material.nombre}`}
      description={`Código ${material.codigo} · categoría ${material.categoria}${sp.almacen ? ' · almacén filtrado' : ' · todos los almacenes'}`}
    >
      <HistoricoTabla movimientos={movimientos} stockActual={stock_actual} unidadEtiqueta={unidad} />
    </PageShell>
  );
}
