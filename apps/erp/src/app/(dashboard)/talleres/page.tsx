import Link from 'next/link';
import { createClient } from '@happy/db/server';
import { Badge } from '@happy/ui/badge';
import { Button } from '@happy/ui/button';
import { Card, CardContent } from '@happy/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { PageShell } from '@/components/page-shell';
import { Plus } from 'lucide-react';

export const metadata = { title: 'Talleres' };
export const dynamic = 'force-dynamic';

export default async function TalleresPage() {
  const sb = await createClient();
  const { data } = await sb.from('talleres').select('id, codigo, nombre, direccion, telefono, especialidades, calificacion, activo').order('nombre').limit(300);

  return (
    <PageShell
      title="Talleres externos"
      description="Talleres de servicio (confección, bordado, estampado, acabados)."
      actions={<Link href="/talleres/nuevo"><Button><Plus className="h-4 w-4" /> Nuevo taller</Button></Link>}
    >
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Código</TableHead><TableHead>Nombre</TableHead><TableHead>Dirección</TableHead>
              <TableHead>Teléfono</TableHead><TableHead>Especialidades</TableHead><TableHead>Calif.</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {(data ?? []).length === 0 && <TableRow><TableCell colSpan={6} className="py-10 text-center text-sm text-slate-500">Sin talleres registrados.</TableCell></TableRow>}
              {data?.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-mono text-xs">{t.codigo}</TableCell>
                  <TableCell className="font-medium">{t.nombre}</TableCell>
                  <TableCell className="max-w-xs truncate text-sm text-slate-600">{t.direccion}</TableCell>
                  <TableCell className="text-sm">{t.telefono ?? '—'}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(t.especialidades ?? []).map((e: string) => <Badge key={e} variant="outline" className="text-[10px]">{e}</Badge>)}
                    </div>
                  </TableCell>
                  <TableCell><Badge variant="secondary">⭐ {t.calificacion?.toFixed(1) ?? '5.0'}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </PageShell>
  );
}
