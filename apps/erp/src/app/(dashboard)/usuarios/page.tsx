import { createClient } from '@happy/db/server';
import { Badge } from '@happy/ui/badge';
import { Card, CardContent } from '@happy/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { PageShell } from '@/components/page-shell';
import { requireRol } from '@/server/session';

export const metadata = { title: 'Usuarios & Roles' };
export const dynamic = 'force-dynamic';

export default async function UsuariosPage() {
  await requireRol('gerente');
  const sb = await createClient();
  const { data: perfiles } = await sb.from('perfiles').select('id, nombre_completo, dni, cargo, activo, ultimo_login').limit(200);
  const { data: rolesRows } = await sb.from('usuarios_roles').select('usuario_id, rol');
  const rolesPorUsuario = new Map<string, string[]>();
  rolesRows?.forEach((r) => {
    const arr = rolesPorUsuario.get(r.usuario_id) ?? [];
    arr.push(r.rol);
    rolesPorUsuario.set(r.usuario_id, arr);
  });

  return (
    <PageShell title="Usuarios & Roles" description="Administra accesos al sistema. Solo gerente.">
      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Nombre</TableHead><TableHead>DNI</TableHead><TableHead>Cargo</TableHead>
            <TableHead>Roles</TableHead><TableHead>Estado</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {(perfiles ?? []).length === 0 && <TableRow><TableCell colSpan={5} className="py-10 text-center text-sm text-slate-500">Sin usuarios.</TableCell></TableRow>}
            {perfiles?.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.nombre_completo}</TableCell>
                <TableCell className="font-mono text-xs">{u.dni ?? '—'}</TableCell>
                <TableCell className="text-sm">{u.cargo ?? '—'}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {(rolesPorUsuario.get(u.id) ?? []).map((r) => <Badge key={r} variant="outline" className="text-[10px]">{r}</Badge>)}
                  </div>
                </TableCell>
                <TableCell>{u.activo ? <Badge variant="success">Activo</Badge> : <Badge variant="secondary">Inactivo</Badge>}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>
    </PageShell>
  );
}
