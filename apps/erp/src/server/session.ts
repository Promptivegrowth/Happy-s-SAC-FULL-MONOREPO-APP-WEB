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

  const [{ data: perfil }, { data: roles, error: errorRoles }] = await Promise.all([
    sb.from('perfiles').select('nombre_completo, almacen_default, caja_default').eq('id', user.id).single(),
    sb.from('usuarios_roles').select('rol').eq('usuario_id', user.id),
  ]);

  /*
   * Si la consulta de roles FALLA, no se puede asumir que la persona no tiene
   * ninguno.
   *
   * Antes se caía a ['cliente'] tanto si el usuario no tenía roles como si la
   * consulta había fallado, y las dos cosas no son lo mismo: con la sesión a
   * medio renovar o un tropiezo de red, al gerente lo echaba de Configuración,
   * de Usuarios y de todo lo restringido, mandándolo al dashboard sin decir por
   * qué. Un fallo momentáneo no puede degradar a alguien de gerente a cliente.
   *
   * Se manda a iniciar sesión de nuevo, que es lo que de verdad resuelve el
   * caso habitual: la sesión ya no sirve.
   */
  if (errorRoles) redirect('/login?sesion=vencida');

  return {
    id: user.id,
    email: user.email ?? '',
    nombre: perfil?.nombre_completo ?? user.email?.split('@')[0] ?? 'Usuario',
    roles: (roles ?? []).map((r) => r.rol) as Rol[],
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
  // Se nombra el rol que falta: "no tienes permiso" sin decir de qué no ayuda
  // a nadie, y si el motivo real fue una sesión vencida se ve en el otro aviso.
  if (!tiene && !esGerente) {
    const pedido = Array.isArray(rol) ? rol.join(',') : rol;
    redirect(`/dashboard?denegado=${encodeURIComponent(pedido)}`);
  }
  return sesion;
}
