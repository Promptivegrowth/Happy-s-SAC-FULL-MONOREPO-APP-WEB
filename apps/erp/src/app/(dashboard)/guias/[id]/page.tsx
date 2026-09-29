import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@happy/db/server';
import { Badge } from '@happy/ui/badge';
import { Button } from '@happy/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@happy/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { PageShell } from '@/components/page-shell';
import { MOTIVOS_TRASLADO } from '@happy/lib/sunat-ubl/despatch';
import { formatDateTime } from '@happy/lib';
import { estadoGuia } from '../estado';
import { AccionesGuia } from './acciones';
import { ArrowLeft } from 'lucide-react';

export const metadata = { title: 'Guía de remisión' };
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Guia = Record<string, string | number | boolean | null> & {
  id: string; numero_completo: string; estado: string; modalidad: string; motivo_traslado: string;
};

export default async function GuiaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = (await createClient()) as unknown as { from: (t: string) => any };
  const [{ data }, { data: items }] = await Promise.all([
    sb.from('guias_remision').select('*').eq('id', id).maybeSingle(),
    sb.from('guias_remision_items').select('id, codigo, descripcion, cantidad').eq('guia_id', id).order('id'),
  ]);
  const g = data as Guia | null;
  if (!g) notFound();

  let documento: { id: string; texto: string } | null = null;
  if (g.comprobante_id) {
    const { data: c } = await sb.from('comprobantes').select('id, tipo, numero_completo').eq('id', g.comprobante_id).maybeSingle();
    if (c) documento = { id: c.id, texto: `${c.tipo === 'FACTURA' ? 'Factura' : 'Boleta'} ${c.numero_completo}` };
  }

  const e = estadoGuia(g.estado);
  const publico = g.modalidad === 'PUBLICO';
  const motivo = MOTIVOS_TRASLADO[g.motivo_traslado as keyof typeof MOTIVOS_TRASLADO] ?? g.motivo_traslado;

  const explicacion =
    g.estado === 'ACEPTADO' ? 'SUNAT la aceptó. Descarga el PDF: es lo que se entrega a la agencia y viaja con la mercadería.'
    : g.estado === 'RECHAZADO' ? 'SUNAT la rechazó y ese número ya no se puede usar. Usa "Corregir y emitir otra": copia los datos para arreglarlos y sale con un número nuevo.'
    : g.estado === 'EMITIDO' ? 'SUNAT la recibió y está por contestar. El sistema vuelve a consultar solo cada 15 minutos; también puedes consultar ahora.'
    : 'Todavía no llegó a SUNAT. El sistema reintenta solo; si el motivo de abajo es algo por corregir (credenciales, datos), corrígelo y vuelve a enviar.';

  return (
    <PageShell
      title={`Guía ${g.numero_completo}`}
      description={<>{motivo} · {String(g.destinatario_nombre ?? '')}</>}
      actions={<Button asChild variant="ghost"><Link href="/guias"><ArrowLeft className="h-4 w-4" /> Volver</Link></Button>}
    >
      <Card>
        <CardContent className="space-y-3 py-5">
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant={e.tono} className="text-sm">{e.texto}</Badge>
            {g.sunat_codigo && <span className="font-mono text-xs text-slate-500">código {String(g.sunat_codigo)}</span>}
            {g.sunat_aceptado_en && <span className="text-xs text-slate-500">aceptada el {formatDateTime(String(g.sunat_aceptado_en))}</span>}
          </div>
          <p className="text-sm text-slate-600">{explicacion}</p>
          {g.sunat_mensaje && g.estado !== 'ACEPTADO' && (
            <p className="rounded-md bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700">{String(g.sunat_mensaje)}</p>
          )}
          <AccionesGuia id={g.id} estado={g.estado} tieneXml={Boolean(g.xml_firmado_url)} tieneCdr={Boolean(g.cdr_url)} />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Traslado</CardTitle></CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            <Dato l="Emitida" v={formatDateTime(String(g.fecha_emision))} />
            <Dato l="Inicio del traslado" v={String(g.fecha_traslado ?? '')} />
            <Dato l="Destinatario" v={`${g.destinatario_nombre ?? ''} · ${g.destinatario_num_doc ?? ''}`} />
            {documento && <Dato l="Documento" v={<Link className="underline" href={`/comprobantes/${documento.id}`}>{documento.texto}</Link>} />}
            <Dato l="Peso bruto" v={`${Number(g.peso_bruto_kg ?? 0)} kg${g.num_bultos ? ` · ${g.num_bultos} bulto(s)` : ''}`} />
            {publico ? (
              <>
                <Dato l="Agencia" v={`${g.transportista_razon_social ?? ''} · RUC ${g.transportista_ruc ?? ''}`} />
                {g.fecha_entrega_transportista && <Dato l="Entrega a la agencia" v={String(g.fecha_entrega_transportista)} />}
              </>
            ) : g.vehiculo_m1l ? (
              <Dato l="Vehículo" v="Propio, categoría M1 o L" />
            ) : (
              <>
                <Dato l="Vehículo" v={String(g.placa_vehiculo ?? '')} />
                <Dato l="Conductor" v={`${g.conductor_nombre ?? ''} ${g.conductor_apellidos ?? ''} · DNI ${g.conductor_dni ?? ''} · Lic. ${g.conductor_licencia ?? ''}`} />
              </>
            )}
            {g.observacion && <Dato l="Observación" v={String(g.observacion)} />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Recorrido</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div><p className="text-xs uppercase text-slate-500">Partida</p><p>{String(g.direccion_partida ?? '')}</p><p className="font-mono text-xs text-slate-500">{String(g.ubigeo_partida ?? '')}</p></div>
            <div><p className="text-xs uppercase text-slate-500">Llegada</p><p>{String(g.direccion_llegada ?? '')}</p><p className="font-mono text-xs text-slate-500">{String(g.ubigeo_llegada ?? '')}</p></div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Productos</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Código</TableHead><TableHead>Descripción</TableHead><TableHead className="text-right">Cantidad</TableHead></TableRow></TableHeader>
            <TableBody>
              {((items ?? []) as Array<{ id: string; codigo: string | null; descripcion: string; cantidad: number }>).map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="font-mono text-xs">{i.codigo ?? '—'}</TableCell>
                  <TableCell>{i.descripcion}</TableCell>
                  <TableCell className="text-right font-mono">{Number(i.cantidad)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </PageShell>
  );
}

function Dato({ l, v }: { l: string; v: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="w-36 shrink-0 text-slate-500">{l}</span>
      <span className="font-medium">{v}</span>
    </div>
  );
}
