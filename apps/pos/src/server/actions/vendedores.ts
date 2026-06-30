'use server';

/**
 * Lista los usuarios habilitados para ser "vendedor" en una venta POS.
 *
 * Caso de uso: el cajero (Yulissa) tiene una sola sesión abierta pero hay 4
 * vendedoras de piso (Renzo, José, Luis, ella misma) que atienden y cobran
 * indistintamente desde la misma máquina. Cada venta debe quedar atribuida
 * a la vendedora que la realizó para cálculo de comisiones.
 *
 * Estrategia: NO crear una tabla nueva — reusar `perfiles` filtrando por
 * usuarios con rol que pueda atender ventas (gerente, cajero, vendedor_b2b).
 */

import { createClient } from '@happy/db/server';

export type VendedorOpcion = {
  id: string;
  nombre: string;
};

export async function listarVendedoresPOS(): Promise<VendedorOpcion[]> {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return [];

  // Roles que pueden actuar como vendedor en una venta POS
  const rolesValidos = ['gerente', 'cajero', 'vendedor_b2b'] as const;

  // 1) IDs de usuarios con alguno de esos roles
  const { data: rolesRows } = await sb
    .from('usuarios_roles')
    .select('usuario_id, rol')
    .in('rol', rolesValidos);
  const idsConRol = Array.from(new Set((rolesRows ?? []).map((r) => (r as { usuario_id: string }).usuario_id)));
  if (idsConRol.length === 0) return [];

  // 2) Perfiles activos (solo nombre)
  const { data: perfiles } = await sb
    .from('perfiles')
    .select('id, nombre_completo')
    .in('id', idsConRol)
    .order('nombre_completo');

  type R = { id: string; nombre_completo: string | null };
  return ((perfiles ?? []) as R[])
    .filter((p) => p.nombre_completo)
    .map((p) => ({ id: p.id, nombre: p.nombre_completo! }));
}
