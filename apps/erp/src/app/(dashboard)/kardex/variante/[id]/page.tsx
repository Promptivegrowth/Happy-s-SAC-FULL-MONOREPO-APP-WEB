import { notFound } from 'next/navigation';
import { createClient } from '@happy/db/server';
import { PageShell } from '@/components/page-shell';
import { historicoVariante } from '@/server/actions/kardex';
import { HistoricoTabla } from '../../historico-tabla';

export const dynamic = 'force-dynamic';

export default async function HistoricoVariantePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ almacen?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const sb = await createClient();

  const { data: variante } = await sb
    .from('productos_variantes')
    .select('id, sku, talla, productos(id, nombre, codigo)')
    .eq('id', id)
    .single();
  if (!variante) notFound();
  const prod = (variante as unknown as { productos: { id: string; nombre: string; codigo: string } }).productos;

  const res = await historicoVariante(id, sp.almacen || undefined);
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
      title={`Kardex de ${prod.nombre} · talla ${variante.talla.replace('T', '')}`}
      description={`SKU ${variante.sku} · código producto ${prod.codigo}${sp.almacen ? ' · almacén filtrado' : ' · todos los almacenes'}`}
    >
      <HistoricoTabla movimientos={movimientos} stockActual={stock_actual} unidadEtiqueta="unid" />
    </PageShell>
  );
}
