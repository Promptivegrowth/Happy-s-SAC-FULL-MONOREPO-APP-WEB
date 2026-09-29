import Link from 'next/link';
import { createClient } from '@happy/db/server';
import { createServiceClient } from '@happy/db/service';
import { Badge } from '@happy/ui/badge';
import { Button } from '@happy/ui/button';
import { Card, CardContent } from '@happy/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { PageShell } from '@/components/page-shell';
import { MOTIVOS_TRASLADO } from '@happy/lib/sunat-ubl/despatch';
import { formatDateTime } from '@happy/lib';
import { estadoGuia } from './estado';
import { hayCredencialesGRE } from '@/server/gre-core';
import { AlertTriangle, Plus } from 'lucide-react';

export const metadata = { title: 'Guías de remisión' };
export const dynamic = 'force-dynamic';

type Fila = {
  id: string; numero_completo: string; fecha_emision: string; fecha_traslado: string;
  destinatario_nombre: string | null; destinatario_num_doc: string | null;
  direccion_llegada: string | null; motivo_traslado: string; modalidad: string;
  transportista_razon_social: string | null; estado: string; sunat_mensaje: string | null;
};

/** Si ya se cargaron las credenciales de la API. Solo se devuelve sí o no. */
async function hayCredenciales(): Promise<boolean> {
  try {
    return await hayCredencialesGRE(createServiceClient());
  } catch {
    return false;
  }
}

export default async function GuiasPage() {
  const sb = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [{ data }, credenciales] = await Promise.all([
    (sb as unknown as { from: (t: string) => any }).from('guias_remision')
      .select('id, numero_completo, fecha_emision, fecha_traslado, destinatario_nombre, destinatario_num_doc, direccion_llegada, motivo_traslado, modalidad, transportista_razon_social, estado, sunat_mensaje')
      .order('fecha_emision', { ascending: false })
      .limit(200),
    hayCredenciales(),
  ]);
  const guias = (data ?? []) as Fila[];

  return (
    <PageShell
      title="Guías de remisión electrónicas"
      description="La guía que acompaña la mercadería: envíos a provincia por agencia, traslados y consignaciones."
      actions={
        <Button asChild variant="premium">
          <Link href="/guias/nueva"><Plus className="h-4 w-4" /> Nueva guía</Link>
        </Button>
      }
    >
      {!credenciales && (
        <Card className="border-amber-200 bg-amber-50/60">
          <CardContent className="flex gap-3 py-4 text-sm text-slate-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div>
              <p className="font-semibold">Falta un paso para que SUNAT reciba las guías</p>
              <p className="mt-1">
                SUNAT recibe las guías por su API, que pide credenciales propias (client_id y client_secret). Se generan una
                sola vez en SOL, en <em>Credenciales de API SUNAT → Gestión Credenciales de API SUNAT</em>, marcando
                &quot;GRE Emisión de Comprobantes&quot;, y se cargan en{' '}
                <Link href="/configuracion/sunat" className="underline">Configuración → SUNAT</Link>. Mientras tanto
                no se pueden emitir guías.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>N°</TableHead>
            <TableHead>Emitida</TableHead>
            <TableHead>Destinatario</TableHead>
            <TableHead>Llegada</TableHead>
            <TableHead>Motivo / transporte</TableHead>
            <TableHead>SUNAT</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {guias.length === 0 && (
              <TableRow><TableCell colSpan={6} className="py-10 text-center text-sm text-slate-500">
                Todavía no hay guías. Se emiten desde aquí o desde el botón &quot;Guía de remisión&quot; de una boleta o factura.
              </TableCell></TableRow>
            )}
            {guias.map((g) => {
              const e = estadoGuia(g.estado);
              return (
                <TableRow key={g.id} className="hover:bg-happy-50/50">
                  <TableCell className="font-mono text-xs">
                    <Link href={`/guias/${g.id}`} className="hover:text-happy-600">{g.numero_completo}</Link>
                  </TableCell>
                  <TableCell className="text-sm">{formatDateTime(g.fecha_emision)}</TableCell>
                  <TableCell className="text-sm">
                    <div>{g.destinatario_nombre}</div>
                    <div className="font-mono text-xs text-slate-500">{g.destinatario_num_doc}</div>
                  </TableCell>
                  <TableCell className="max-w-[220px] truncate text-sm" title={g.direccion_llegada ?? ''}>{g.direccion_llegada}</TableCell>
                  <TableCell className="text-sm">
                    <div>{MOTIVOS_TRASLADO[g.motivo_traslado as keyof typeof MOTIVOS_TRASLADO] ?? g.motivo_traslado}</div>
                    <div className="text-xs text-slate-500">
                      {g.modalidad === 'PUBLICO' ? (g.transportista_razon_social ?? 'Agencia') : 'Vehículo propio'}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={e.tono} title={g.sunat_mensaje ?? ''}>{e.texto}</Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent></Card>
    </PageShell>
  );
}
