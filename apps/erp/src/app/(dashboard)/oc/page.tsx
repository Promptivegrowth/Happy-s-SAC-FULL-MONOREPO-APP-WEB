import Link from 'next/link';
import { createClient } from '@happy/db/server';
import { Badge } from '@happy/ui/badge';
import { Button } from '@happy/ui/button';
import { Card, CardContent } from '@happy/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { PageShell } from '@/components/page-shell';
import { formatDate, formatPEN } from '@happy/lib';
import { Plus, ExternalLink } from 'lucide-react';
import { ESTADO_LABEL, ESTADO_TONO, TIPO_LABEL, type EstadoOC, type TipoOC } from '@/server/actions/oc-helpers';

export const metadata = { title: 'Órdenes de Compra' };
export const dynamic = 'force-dynamic';

const TONE_CLS: Record<string, string> = {
  slate: 'bg-slate-100 text-slate-700 border-slate-300',
  amber: 'bg-amber-100 text-amber-800 border-amber-300',
  sky: 'bg-sky-100 text-sky-800 border-sky-300',
  indigo: 'bg-indigo-100 text-indigo-800 border-indigo-300',
  emerald: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  violet: 'bg-violet-100 text-violet-800 border-violet-300',
  rose: 'bg-rose-100 text-rose-800 border-rose-300',
};

export default async function OcPage() {
  const sb = await createClient();
  const { data } = await sb
    .from('oc')
    .select('id, numero, tipo, fecha, total, estado, proveedores(razon_social)')
    .order('fecha', { ascending: false })
    .limit(200);
  return (
    <PageShell
      title="Órdenes de Compra"
      description="Compras a proveedores nacionales y de importación."
      actions={
        <Link href="/oc/nueva">
          <Button><Plus className="h-4 w-4" /> Nueva OC</Button>
        </Link>
      }
    >
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>N°</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Proveedor</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-sm text-slate-500">
                    Sin órdenes de compra. Haga click en <strong>Nueva OC</strong> para crear la primera.
                  </TableCell>
                </TableRow>
              )}
              {data?.map((o) => {
                const p = (o as unknown as { proveedores?: { razon_social: string } }).proveedores;
                const estado = o.estado as EstadoOC;
                const tipo = o.tipo as TipoOC;
                const tono = ESTADO_TONO[estado] ?? 'slate';
                return (
                  <TableRow key={o.id}>
                    <TableCell className="font-mono text-xs">{o.numero}</TableCell>
                    <TableCell className="text-sm">{formatDate(o.fecha)}</TableCell>
                    <TableCell className="text-sm font-medium">{p?.razon_social ?? '—'}</TableCell>
                    <TableCell><Badge variant="secondary">{TIPO_LABEL[tipo] ?? o.tipo}</Badge></TableCell>
                    <TableCell className="text-right font-medium">{formatPEN(Number(o.total))}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${TONE_CLS[tono]}`}>
                        {ESTADO_LABEL[estado] ?? o.estado}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Link href={`/oc/${o.id}`} className="inline-flex items-center text-xs text-slate-500 hover:text-corp-900">
                        Ver <ExternalLink className="ml-1 h-3 w-3" />
                      </Link>
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
