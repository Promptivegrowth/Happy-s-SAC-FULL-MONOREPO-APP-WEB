import Link from 'next/link';
import { createClient } from '@happy/db/server';
import { Card, CardContent } from '@happy/ui/card';
import { Badge } from '@happy/ui/badge';
import { Button } from '@happy/ui/button';
import { EmptyState } from '@happy/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { PageShell } from '@/components/page-shell';
import { ArrowLeft, Landmark } from 'lucide-react';
import { NewButton, EditButton, DeleteButton, ToggleActiva } from './client';

export const metadata = { title: 'Cuentas bancarias' };
export const dynamic = 'force-dynamic';

export type Cuenta = {
  id: string;
  nombre_corto: string;
  banco: string | null;
  titular: string | null;
  numero_cuenta: string | null;
  numero_cci: string | null;
  numero_telefono: string | null;
  metodo_default: string;
  visible_pos: boolean;
  visible_web: boolean;
  orden: number;
  activo: boolean;
  notas: string | null;
};

export default async function Page() {
  const sb = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sbAny = sb as unknown as { from: (t: string) => any };
  const { data: cuentasData } = await sbAny
    .from('cuentas_bancarias')
    .select('id, nombre_corto, banco, titular, numero_cuenta, numero_cci, numero_telefono, metodo_default, visible_pos, visible_web, orden, activo, notas')
    .order('orden');
  const cuentas = (cuentasData ?? []) as Cuenta[];

  return (
    <PageShell
      title="Cuentas bancarias / medios de pago"
      description="Lista de cuentas destino (BCP HAPPYS, INTERBANK JAVIER, BBVA, YAPE/PLIN…). Se usan en el POS al cobrar por transferencia y en el checkout web para pagos Yape/Plin."
      actions={
        <div className="flex items-center gap-2">
          <Link href="/configuracion">
            <Button variant="outline" className="gap-1">
              <ArrowLeft className="h-4 w-4" /> Volver
            </Button>
          </Link>
          <NewButton />
        </div>
      }
    >
      <div className="rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 p-4 text-sm">
        <h3 className="mb-1 font-display font-semibold text-corp-900">Tips</h3>
        <ul className="ml-5 list-disc text-xs text-slate-600">
          <li>
            <strong>Visible POS</strong>: la cuenta aparece como botón al cobrar en el POS (además de EFECTIVO).
          </li>
          <li>
            <strong>Visible Web</strong>: la cuenta aparece en el checkout público de la web
            (típicamente el YAPE/PLIN con el número).
          </li>
          <li>
            <strong>Método por defecto</strong>: el valor del enum interno que se guarda en la venta.
            TRANSFERENCIA para cuentas bancarias, YAPE para YAPE/PLIN, EFECTIVO si aplica.
          </li>
          <li>
            <strong>Orden</strong>: números más bajos aparecen primero. Múltiplos de 10 para poder
            insertar en el medio después.
          </li>
        </ul>
      </div>

      {cuentas.length === 0 ? (
        <EmptyState
          icon={<Landmark className="h-6 w-6" />}
          title="Sin cuentas configuradas"
          description="Agregá las cuentas para que aparezcan como medios de pago en el POS y en la web."
          action={<NewButton />}
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14">Orden</TableHead>
                  <TableHead>Nombre corto</TableHead>
                  <TableHead>Banco / Titular</TableHead>
                  <TableHead>Nº cuenta / teléfono</TableHead>
                  <TableHead>Método</TableHead>
                  <TableHead className="text-center">POS</TableHead>
                  <TableHead className="text-center">Web</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cuentas.map((c) => (
                  <TableRow key={c.id} className={!c.activo ? 'opacity-60' : ''}>
                    <TableCell className="font-mono text-xs text-slate-400">{c.orden}</TableCell>
                    <TableCell className="font-medium">{c.nombre_corto}</TableCell>
                    <TableCell className="text-xs">
                      <div>{c.banco ?? <span className="text-slate-400">—</span>}</div>
                      {c.titular && <div className="text-[10px] text-slate-500">{c.titular}</div>}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {c.numero_telefono ? (
                        <div className="text-emerald-700">📱 {c.numero_telefono}</div>
                      ) : c.numero_cuenta ? (
                        <div>
                          <div>{c.numero_cuenta}</div>
                          {c.numero_cci && <div className="text-[10px] text-slate-500">CCI: {c.numero_cci}</div>}
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-[10px]">{c.metodo_default}</Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      {c.visible_pos ? <span className="text-emerald-600">✓</span> : <span className="text-slate-300">—</span>}
                    </TableCell>
                    <TableCell className="text-center">
                      {c.visible_web ? <span className="text-emerald-600">✓</span> : <span className="text-slate-300">—</span>}
                    </TableCell>
                    <TableCell>
                      <ToggleActiva id={c.id} activo={c.activo} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <EditButton cuenta={c} />
                        <DeleteButton id={c.id} nombre={c.nombre_corto} />
                      </div>
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
