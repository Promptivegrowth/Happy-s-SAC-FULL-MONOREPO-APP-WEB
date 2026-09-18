import { createClient } from '@happy/db/server';
import { Badge } from '@happy/ui/badge';
import { Card, CardContent } from '@happy/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { PageShell } from '@/components/page-shell';
import { formatDateTime, formatPEN } from '@happy/lib';
import { VerComprobanteButton } from './ver-comprobante-button';

export const metadata = { title: 'Ventas' };
export const dynamic = 'force-dynamic';

/** Cómo se llama cada tipo fuera del sistema. */
const ETIQUETA_TIPO: Record<string, string> = {
  BOLETA: 'Boleta',
  FACTURA: 'Factura',
  NOTA_VENTA: 'Nota de venta',
  NOTA_CREDITO: 'Nota de crédito',
  NOTA_DEBITO: 'Nota de débito',
};

export default async function VentasPage() {
  const sb = await createClient();
  // `comprobante_pdf_path` es columna nueva (mig 85) aún no reflejada en los
  // tipos generados → cast puntual para evitar el SelectQueryError.
  const sbAny = sb as unknown as { from: (t: string) => any };
  const { data } = await sbAny.from('ventas')
    .select('id, numero, canal, fecha, total, estado, comprobante_pdf_path, almacenes(nombre), clientes(razon_social, nombres, apellido_paterno)')
    .order('fecha', { ascending: false }).limit(200) as {
      data: Array<{ id: string; numero: string; canal: string; fecha: string; total: number; estado: string; comprobante_pdf_path: string | null }> | null;
    };

  /*
   * El número del comprobante, que es el que tiene el cliente en la mano.
   *
   * Esta lista mostraba solo el VEN-000105, que es el número interno de la
   * venta: sirve para el kardex y el arqueo, pero no está impreso en ningún
   * papel. Quien venía con una boleta B005-00004048 a preguntar por su compra
   * no la podía encontrar acá. Es el mismo problema que tenían las notas de
   * venta y se arregla igual: mostrar el número del documento.
   *
   * Va en consulta aparte y no embebido para no depender del nombre que
   * PostgREST le dé a la relación.
   */
  const ids = (data ?? []).map((v) => v.id);
  const { data: comps } = ids.length
    ? await sbAny.from('comprobantes')
        .select('venta_id, numero_completo, tipo')
        .in('venta_id', ids) as {
          data: Array<{ venta_id: string; numero_completo: string; tipo: string }> | null;
        }
    : { data: [] };

  const documento = new Map<string, { numero: string; tipo: string }>();
  for (const c of comps ?? []) {
    // Una nota de crédito no reemplaza al comprobante de la venta: lo corrige.
    if (c.tipo === 'NOTA_CREDITO' || c.tipo === 'NOTA_DEBITO') continue;
    if (c.venta_id) documento.set(c.venta_id, { numero: c.numero_completo, tipo: c.tipo });
  }

  return (
    <PageShell
      title="Ventas (consolidadas)"
      description="Todas las ventas: POS (tiendas), Web y B2B."
    >
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Comprobante</TableHead><TableHead>Tipo</TableHead>
              <TableHead>Fecha</TableHead><TableHead>Canal</TableHead>
              <TableHead>Tienda/Almacén</TableHead><TableHead>Cliente</TableHead>
              <TableHead className="text-right">Total</TableHead><TableHead>Estado</TableHead>
              <TableHead className="text-right">PDF</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {(data ?? []).length === 0 && <TableRow><TableCell colSpan={9} className="py-10 text-center text-sm text-slate-500">Sin ventas registradas.</TableCell></TableRow>}
              {data?.map((v) => {
                const a = (v as unknown as { almacenes?: { nombre: string } }).almacenes;
                const c = (v as unknown as { clientes?: { razon_social?: string; nombres?: string; apellido_paterno?: string } }).clientes;
                const cliente = c?.razon_social ?? (`${c?.nombres ?? ''} ${c?.apellido_paterno ?? ''}`.trim() || '—');
                const doc = documento.get(v.id);
                return (
                  <TableRow key={v.id}>
                    <TableCell className="font-mono text-xs">
                      {/*
                        * Arriba el número del papel, abajo el interno.
                        *
                        * Los dos hacen falta: por el de arriba pregunta el
                        * cliente, y el de abajo es el que aparece en el arqueo
                        * de caja y en el kardex.
                        */}
                      <div className="font-semibold text-corp-900">{doc?.numero ?? '—'}</div>
                      <div className="text-[10px] font-normal text-slate-400">{v.numero}</div>
                    </TableCell>
                    <TableCell>
                      {doc
                        ? <Badge variant="secondary">{ETIQUETA_TIPO[doc.tipo] ?? doc.tipo}</Badge>
                        : <span className="text-xs text-slate-400">Sin comprobante</span>}
                    </TableCell>
                    <TableCell className="text-sm">{formatDateTime(v.fecha)}</TableCell>
                    <TableCell><Badge variant="secondary">{v.canal}</Badge></TableCell>
                    <TableCell className="text-sm">{a?.nombre}</TableCell>
                    <TableCell className="text-sm">{cliente}</TableCell>
                    <TableCell className="text-right font-medium">{formatPEN(Number(v.total))}</TableCell>
                    <TableCell><Badge variant={v.estado === 'COMPLETADA' ? 'success' : v.estado === 'ANULADA' ? 'destructive' : 'warning'}>{v.estado}</Badge></TableCell>
                    <TableCell className="text-right">
                      <VerComprobanteButton path={(v as unknown as { comprobante_pdf_path?: string | null }).comprobante_pdf_path} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </PageShell>
  );
}
