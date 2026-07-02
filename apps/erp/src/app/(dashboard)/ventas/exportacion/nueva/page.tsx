import { createClient } from '@happy/db/server';
import { PageShell } from '@/components/page-shell';
import { requireRol } from '@/server/session';
import { listarPaisesExportacion } from '@/server/actions/paises-exportacion';
import { NuevaVentaExportForm } from './form';
import { redirect } from 'next/navigation';

export const metadata = { title: 'Nueva venta de exportación' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  await requireRol('gerente');
  const sb = await createClient();

  // Verificar serie SUNAT activa — sin ella no se puede emitir
  const { data: serieExp } = await sb
    .from('series_comprobantes')
    .select('serie')
    .eq('tipo', 'FACTURA')
    .eq('canal', 'EXPORTACION')
    .eq('activa', true)
    .maybeSingle();
  if (!serieExp) {
    redirect('/ventas/exportacion');
  }

  const [paises, { data: almacenes }, { data: variantes }] = await Promise.all([
    listarPaisesExportacion(true),
    sb.from('almacenes').select('id, codigo, nombre').eq('activo', true).order('codigo'),
    sb
      .from('productos_variantes')
      .select('id, sku, talla, precio_publico, productos(nombre, codigo)')
      .order('sku')
      .limit(2000),
  ]);

  return (
    <PageShell
      title="Nueva venta de exportación"
      description={`Factura de exportación con serie ${serieExp.serie} — Art. 33 Ley IGV (IGV 0%).`}
    >
      <NuevaVentaExportForm
        paises={paises}
        almacenes={(almacenes ?? []) as { id: string; codigo: string; nombre: string }[]}
        variantes={
          ((variantes ?? []) as unknown as Array<{
            id: string;
            sku: string;
            talla: string;
            precio_publico: number | null;
            productos: { nombre: string; codigo: string } | null;
          }>)
        }
        serie={serieExp.serie}
      />
    </PageShell>
  );
}
