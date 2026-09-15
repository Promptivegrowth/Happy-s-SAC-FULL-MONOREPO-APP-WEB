import { createClient } from '@supabase/supabase-js';

/**
 * Cliente con llave de servicio, para las rutas que atiende el AGENTE DE
 * IMPRESIÓN.
 *
 * El agente no es un usuario del sistema: es un programa que corre en la
 * computadora de la caja y se identifica con el token de su equipo. No tiene
 * sesión de Supabase, así que estas rutas leen y escriben con la llave de
 * servicio y hacen la autorización a mano contra `equipos_impresion.token`.
 *
 * Ese token no abre nada más que la cola de su propio equipo: si una
 * computadora de la tienda queda comprometida, no da acceso al resto.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
