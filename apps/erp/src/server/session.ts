import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@happy/db/server';
import type { Rol } from '@happy/db/enums';

export type SesionStaff = {
  id: string;
  email: string;
  nombre: string;
  roles: Rol[];
  almacen_default: string | null;
  caja_default: string | null;
};

/**
 * Obtiene la sesión autenticada + roles + perfil.
 * Redirige a /login si no está autenticado.
 * Memoizada por request vía React cache().
 */
export const getSession = cache(async (): Promise<SesionStaff> => {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');

  const [{ data: perfil }, { data: roles }] = await Promise.all([
    sb.from('perfiles').select('nombre_completo, almacen_default, caja_default').eq('id', user.id).single(),
    sb.from('usuarios_roles').select('rol').eq('usuario_id', user.id),
  ]);

  return {
    id: user.id,
    email: user.email ?? '',
    nombre: perfil?.nombre_completo ?? user.email?.split('@')[0] ?? 'Usuario',
    roles: (roles?.map((r) => r.rol) ?? ['cliente']) as Rol[],
    almacen_default: perfil?.almacen_default ?? null,
    caja_default: perfil?.caja_default ?? null,
  };
});

export async function requireRol(rol: Rol | Rol[]) {
  const sesion = await getSession();
  const tiene = Array.isArray(rol)
    ? rol.some((r) => sesion.roles.includes(r))
    : sesion.roles.includes(rol);
  const esGerente = sesion.roles.includes('gerente');
  if (!tiene && !esGerente) redirect('/dashboard?denegado=1');
  return sesion;
}
