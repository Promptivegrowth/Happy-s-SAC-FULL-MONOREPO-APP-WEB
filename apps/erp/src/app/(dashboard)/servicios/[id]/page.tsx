import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@happy/db/server';
import { Card, CardContent, CardHeader, CardTitle } from '@happy/ui/card';
import { Badge } from '@happy/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { PageShell } from '@/components/page-shell';
import { OsTransitions } from './client';
import { formatDate, formatPEN } from '@happy/lib';

export const dynamic = 'force-dynamic';

const COLOR: Record<string, 'success' | 'warning' | 'secondary' | 'default' | 'destructive'> = {
  EMITIDA: 'default',
  DESPACHADA: 'warning',
  EN_PROCESO: 'warning',
  RECEPCIONADA: 'success',
  CERRADA: 'success',
  ANULADA: 'destructive',
};

type LineaOS = {
  id: string;
  talla: string;
  cantidad: number;
  cantidad_recepcionada: number | null;
  cantidad_fallada: number | null;
  productos: { nombre: string; codigo: string } | null;
};
type AvioOS = {
  id: string;
  cantidad_enviada: number;
  cantidad_devuelta: number | null;
  observacion: string | null;
  materiales: { nombre: string; codigo: string; categoria: string } | null;
};

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await createClient();
  const [{ data: os }, { data: lineasData }, { data: aviosData }] = await Promise.all([
    sb
      .from('ordenes_servicio')
      .select('*, talleres(id, nombre, telefono, contacto_nombre), ot(numero, id), ot_corte(numero, id)')
      .eq('id', id)
      .single(),
    sb
      .from('ordenes_servicio_lineas')
      .select('id, talla, cantidad, cantidad_recepcionada, cantidad_fallada, productos(nombre, codigo)')
      .eq('os_id', id)
      .order('talla'),
    sb
      .from('ordenes_servicio_avios')
      .select('id, cantidad_enviada, cantidad_devuelta, observacion, materiales(nombre, codigo, categoria)')
      .eq('os_id', id),
  ]);
  if (!os) notFound();

  const t = (os as unknown as { talleres?: { id: string; nombre: string; telefono: string | null; contacto_nombre: string | null } | null }).talleres;
  const ot = (os as unknown as { ot?: { numero: string; id: string } | null }).ot;
  const corte = (os as unknown as { ot_corte?: { numero: string; id: string } | null }).ot_corte;
  const lineas = (lineasData ?? []) as unknown as LineaOS[];
  const avios = (aviosData ?? []) as unknown as AvioOS[];
  const totalUnidades = lineas.reduce((s, l) => s + Number(l.cantidad), 0);
  const totalRecep = lineas.reduce((s, l) => s + Number(l.cantidad_recepcionada ?? 0), 0);

  return (
    <PageShell
      title={`OS ${os.numero}`}
      description={
        <>
          Taller {t?.nombre} · Proceso {os.proceso}
          {ot && <> · OT <Link href={`/ot/${ot.id}`} className="text-happy-600 hover:underline">{ot.numero}</Link></>}
        </>
      }
      actions={<OsTransitions osId={id} estado={os.estado ?? 'EMITIDA'} />}
    >
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Estado" value={<Badge variant={COLOR[os.estado ?? 'EMITIDA'] ?? 'secondary'}>{(os.estado ?? 'EMITIDA').replace('_', ' ')}</Badge>} />
        <Stat label="Emisión" value={formatDate(os.fecha_emision)} />
        <Stat label="Entrega esperada" value={formatDate(os.fecha_entrega_esperada)} />
        <Stat label="Total" value={formatPEN(Number(os.monto_total ?? 0))} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Pago al taller</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableBody>
                <Row label="Monto base" value={formatPEN(Number(os.monto_base ?? 0))} />
                <Row label="Adicional movilidad" value={formatPEN(Number(os.adicional_movilidad ?? 0))} />
                <Row label="Adicional campaña" value={formatPEN(Number(os.adicional_campana ?? 0))} />
                <Row label="Total" value={<span className="font-display text-lg font-semibold text-happy-600">{formatPEN(Number(os.monto_total ?? 0))}</span>} />
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Notas y consideraciones</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            {os.observaciones && <Field label="Observaciones" value={os.observaciones} />}
            {os.cuidados && <Field label="Cuidados" value={os.cuidados} />}
            {os.consideraciones && <Field label="Consideraciones" value={os.consideraciones} />}
            {!os.observaciones && !os.cuidados && !os.consideraciones && <p className="text-slate-400">Sin notas adicionales.</p>}
          </CardContent>
        </Card>
      </div>

      {corte && (
        <Card>
          <CardHeader><CardTitle className="text-base">Corte vinculado</CardTitle></CardHeader>
          <CardContent>
            <Link href={`/corte/${corte.id}`} className="font-mono text-sm text-happy-600 hover:underline">{corte.numero}</Link>
          </CardContent>
        </Card>
      )}

      {/* Líneas de la OS — qué prendas se mandaron al taller */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Prendas enviadas al taller{' '}
            <Badge variant="secondary" className="ml-2 text-[10px]">
              {totalUnidades} unidad{totalUnidades === 1 ? '' : 'es'}
            </Badge>
            {totalRecep > 0 && (
              <Badge variant="success" className="ml-1 text-[10px]">
                {totalRecep} recepcionadas
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {lineas.length === 0 ? (
            <p className="px-6 py-6 text-sm text-slate-400">
              Sin líneas registradas. (Si esta OS se creó desde un corte, debería poblarse al
              recrearla.)
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead>Talla</TableHead>
                  <TableHead className="text-right">Enviado</TableHead>
                  <TableHead className="text-right">Recepcionado</TableHead>
                  <TableHead className="text-right">Falladas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lineas.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-medium">
                      {l.productos?.nombre ?? '—'}
                      {l.productos?.codigo && (
                        <span className="ml-2 font-mono text-[10px] text-slate-400">{l.productos.codigo}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{l.talla.replace('T', '')}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">{l.cantidad}</TableCell>
                    <TableCell className="text-right font-mono text-sm text-emerald-600">
                      {l.cantidad_recepcionada ?? 0}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-amber-600">
                      {l.cantidad_fallada ?? 0}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Avíos — materiales del BOM que viajan con el corte */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Avíos enviados{' '}
            <Badge variant="secondary" className="ml-2 text-[10px]">
              {avios.length} material{avios.length === 1 ? '' : 'es'}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {avios.length === 0 ? (
            <p className="px-6 py-6 text-sm text-slate-400">
              Sin avíos registrados. Esto pasa cuando el producto no tiene receta activa o cuando
              ningún material del BOM tiene marcado "va al taller".
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Material</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead className="text-right">Enviado</TableHead>
                  <TableHead className="text-right">Devuelto</TableHead>
                  <TableHead>Obs.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {avios.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">
                      {a.materiales?.nombre ?? '—'}
                      {a.materiales?.codigo && (
                        <span className="ml-2 font-mono text-[10px] text-slate-400">
                          {a.materiales.codigo}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {a.materiales?.categoria && (
                        <Badge variant="secondary" className="text-[10px]">
                          {a.materiales.categoria}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {Number(a.cantidad_enviada).toFixed(4)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-emerald-600">
                      {Number(a.cantidad_devuelta ?? 0).toFixed(4)}
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">{a.observacion ?? ''}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <div className="mt-1 font-display text-2xl font-semibold text-corp-900">{value}</div>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <TableRow>
      <TableCell className="text-sm text-slate-600">{label}</TableCell>
      <TableCell className="text-right font-medium">{value}</TableCell>
    </TableRow>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-corp-700">{label}</p>
      <p className="text-slate-700">{value}</p>
    </div>
  );
}
