import { PageShell } from '@/components/page-shell';
import { requireRol } from '@/server/session';
import { listarUsuariosAdmin } from '@/server/actions/usuarios';
import { UsuariosClient } from './usuarios-client';

export const metadata = { title: 'Usuarios & Roles' };
export const dynamic = 'force-dynamic';

export default async function UsuariosPage() {
  await requireRol('gerente');
  const res = await listarUsuariosAdmin();
  const usuarios = res.ok ? (res.data ?? []) : [];

  return (
    <PageShell
      title="Usuarios & Roles"
      description="Administra accesos al sistema. Crear, asignar roles, cambiar contraseñas y desactivar."
    >
      {!res.ok && (
        <div className="rounded-md border border-danger/30 bg-danger/5 p-3 text-sm text-danger">
          Error: {res.error}
        </div>
      )}
      <UsuariosClient initialUsuarios={usuarios} />
    </PageShell>
  );
}
