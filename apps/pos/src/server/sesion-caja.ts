/**
 * El turno de caja abierto en el que trabaja un usuario.
 *
 * Se busca igual que lo hace la pantalla del POS: por la caja del usuario
 * (perfiles.caja_default), sin importar quién la abrió. Si no tiene caja fija,
 * el turno que abrió él mismo.
 *
 * Antes caja chica, adelantos y devoluciones buscaban solo "el turno que abrió
 * este usuario": si la caja la abría la cajera y la jefa de tienda registraba
 * un gasto, salía "No hay sesión de caja abierta" con la caja abierta en
 * pantalla (02/10/2026).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function sesionAbiertaDelUsuario(sb: any, userId: string): Promise<{ id: string; caja_id: string } | null> {
  const { data: perfil } = await sb.from('perfiles').select('caja_default').eq('id', userId).maybeSingle();
  if (perfil?.caja_default) {
    const { data } = await sb.from('cajas_sesiones').select('id, caja_id')
      .eq('caja_id', perfil.caja_default).is('cerrada_en', null)
      .order('abierta_en', { ascending: false }).limit(1).maybeSingle();
    if (data) return data;
  }
  const { data } = await sb.from('cajas_sesiones').select('id, caja_id')
    .eq('abierta_por', userId).is('cerrada_en', null)
    .order('abierta_en', { ascending: false }).limit(1).maybeSingle();
  return data ?? null;
}
