import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@happy/db/server';
import { Card, CardContent, CardHeader, CardTitle } from '@happy/ui/card';
import { Badge } from '@happy/ui/badge';
import { Button } from '@happy/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { PageShell } from '@/components/page-shell';
import { EmitirSunatButton } from './client';
import { formatDateTime, formatPEN } from '@happy/lib';
import { Download } from 'lucide-react';

export const dynamic = 'force-dynamic';

const TONO: Record<string, 'success' | 'warning' | 'destructive' | 'secondary' | 'default'> = {
  ACEPTADO: 'success',
  EMITIDO: 'default',
  BORRADOR: 'secondary',
  OBSERVADO: 'warning',
  RECHAZADO: 'destructive',
  ANULADO: 'destructive',
};

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await createClient();
  const [{ data: comp }, { data: lineas }, { data: envios }] = await Promise.all([
    sb.from('comprobantes').select('*').eq('id', id).single(),
    sb.from('comprobantes_lineas').select('*').eq('comprobante_id', id),
    sb.from('sunat_envios').select('*').eq('comprobante_id', id).order('fecha', { ascending: false }),
  ]);
  if (!comp) notFound();

  return (
    <PageShell
      title={comp.numero_completo ?? `${comp.serie}-${comp.numero}`}
      description={
        <>
          {comp.tipo} · {comp.razon_social_cliente} ({comp.numero_documento_cliente})
        </>
      }
      actions={
        <div className="flex gap-2">
          {comp.pdf_url && (
            <a href={comp.pdf_url} target="_blank" rel="noopener noreferrer">
              <Button variant="outline"><Download className="h-4 w-4" /> PDF</Button>
            </a>
          )}
          {comp.estado !== 'ACEPTADO' && comp.estado !== 'ANULADO' && (
            <EmitirSunatButton comprobanteId={id} estado={comp.estado} />
          )}
        </div>
      }
    >
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Estado SUNAT" value={<Badge variant={TONO[comp.estado] ?? 'secondary'}>{comp.estado}</Badge>} />
        <Stat label="Fecha emisión" value={formatDateTime(comp.fecha_emision)} />
        <Stat label="Forma pago" value={comp.forma_pago ?? '—'} />
        <Stat label="Total" value={formatPEN(Number(comp.total))} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Líneas del comprobante</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Código</TableHead><TableHead>Descripción</TableHead>
              <TableHead className="text-right">Cant.</TableHead>
              <TableHead className="text-right">Precio</TableHead>
              <TableHead className="text-right">IGV</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {lineas?.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="font-mono text-xs">{l.codigo}</TableCell>
                  <TableCell>{l.descripcion}</TableCell>
                  <TableCell className="text-right font-mono">{l.cantidad}</TableCell>
                  <TableCell className="text-right">{formatPEN(Number(l.precio_unitario))}</TableCell>
                  <TableCell className="text-right text-sm">{formatPEN(Number(l.igv ?? 0))}</TableCell>
                  <TableCell className="text-right font-medium">{formatPEN(Number(l.total))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Totales</CardTitle></CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            <Row label="Subtotal" value={formatPEN(Number(comp.sub_total))} />
            <Row label="IGV (18%)" value={formatPEN(Number(comp.igv))} />
            {Number(comp.descuento_global ?? 0) > 0 && <Row label="Descuento" value={formatPEN(Number(comp.descuento_global))} />}
            <hr className="my-2" />
            <Row label="Total" value={<span className="font-display text-xl font-semibold text-happy-600">{formatPEN(Number(comp.total))}</span>} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Cliente</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p><span className="text-slate-500">Razón social:</span> <span className="font-medium">{comp.razon_social_cliente}</span></p>
            <p><span className="text-slate-500">Documento:</span> <span className="font-mono">{comp.tipo_documento_cliente} {comp.numero_documento_cliente}</span></p>
            {comp.direccion_cliente && <p><span className="text-slate-500">Dirección:</span> {comp.direccion_cliente}</p>}
          </CardContent>
        </Card>
      </div>

      {(envios ?? []).length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Envíos SUNAT ({(envios ?? []).length})</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Código</TableHead>
                <TableHead>Mensaje</TableHead>
                <TableHead>HTTP</TableHead>
                <TableHead className="text-right">Tiempo</TableHead>
                <TableHead></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {envios?.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="text-sm">{formatDateTime(e.fecha)}</TableCell>
                    <TableCell><Badge variant={e.exitoso ? 'success' : 'destructive'} className="font-mono text-[10px]">{e.sunat_codigo ?? '—'}</Badge></TableCell>
                    <TableCell className="max-w-md truncate text-sm">{e.sunat_descripcion ?? e.soap_fault?.slice(0, 80)}</TableCell>
                    <TableCell className="text-sm">{e.http_status ?? '—'}</TableCell>
                    <TableCell className="text-right text-xs text-slate-500">{e.duracion_ms ?? 0}ms</TableCell>
                    <TableCell>
                      {e.cdr_path && (
                        <Link href={`https://trkokphwmkedhxwjriod.supabase.co/storage/v1/object/sign/comprobantes/${e.cdr_path}`} target="_blank">
                          <Button variant="ghost" size="sm"><Download className="h-3 w-3" /> CDR</Button>
                        </Link>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <div className="mt-1 font-display text-base font-semibold text-corp-900">{value}</div>
    </Card>
  );
}
function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-600">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
