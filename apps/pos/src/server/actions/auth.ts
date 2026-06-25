'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@happy/db/server';

/**
 * Cierra la sesión del usuario actual en el POS (Supabase Auth signOut) y
 * lo redirige a /login. Útil para que el cajero saliente libere el equipo
 * antes de que entre el siguiente (cambio de turno con cuenta distinta).
 */
export async function cerrarSesionUsuario() {
  const sb = await createClient();
  await sb.auth.signOut();
  redirect('/login');
}
