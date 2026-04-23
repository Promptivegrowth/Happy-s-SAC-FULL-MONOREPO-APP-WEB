import Link from 'next/link';
import { createClient } from '@happy/db/server';
import { Badge } from '@happy/ui/badge';
import { Button } from '@happy/ui/button';
import { Card, CardContent } from '@happy/ui/card';
import { EmptyState } from '@happy/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { PageShell } from '@/components/page-shell';
import { Plus, Hammer, Pencil } from 'lucide-react';

export const metadata = { title: 'Talleres' };
export const dynamic = 'force-dynamic';

export default async function TalleresPage() {
  const sb = await createClient();
  const { data } = await sb.from('talleres').select('id, codigo, nombre, direccion, telefono, especialidades, calificacion, activo').order('nombre').limit(300);

  return (
    <PageShell
      title="Talleres externos"
      description="Talleres de servicio (confección, bordado, estampado, acabados)."
      actions={<Link href="/talleres/nuevo"><Button variant="premium"><Plus className="h-4 w-4" /> Nuevo taller</Button></Link>}
    >
      {(data ?? []).length === 0 ? (
        <EmptyState
          icon={<Hammer className="h-6 w-6" />}
          title="Sin talleres registrados"
          description="Crea talleres para asignarlos a las órdenes de servicio."
          action={<Link href="/talleres/nuevo"><Button variant="premium"><Plus className="h-4 w-4" /> Nuevo taller</Button></Link>}
        />
      ) : (
        <Card><CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Código</TableHead><TableHead>Nombre</TableHead><TableHead>Dirección</TableHead>
              <TableHead>Teléfono</TableHead><TableHead>Especialidades</TableHead><TableHead>Calif.</TableHead><TableHead></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {data?.map((t) => (
                <TableRow key={t.id} className="hover:bg-happy-50/50">
                  <TableCell className="font-mono text-xs">{t.codigo}</TableCell>
                  <TableCell className="font-medium">
                    <Link href={`/talleres/${t.id}`} className="hover:text-happy-600">{t.nombre}</Link>
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-sm text-slate-600">{t.direccion}</TableCell>
                  <TableCell className="text-sm">{t.telefono ?? '—'}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(t.especialidades ?? []).slice(0, 4).map((e: string) => <Badge key={e} variant="outline" className="text-[10px]">{e}</Badge>)}
                    </div>
                  </TableCell>
                  <TableCell><Badge variant="secondary">⭐ {Number(t.calificacion ?? 5).toFixed(1)}</Badge></TableCell>
                  <TableCell className="text-right">
                    <Link href={`/talleres/${t.id}`}><Button variant="ghost" size="sm"><Pencil className="h-3.5 w-3.5" /></Button></Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent></Card>
      )}
    </PageShell>
  );
}
