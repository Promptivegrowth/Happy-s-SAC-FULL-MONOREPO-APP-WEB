'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@happy/db/server';
import { z } from 'zod';

/**
 * Resultado uniforme de server actions. Estructura plana (sin discriminación)
 * para facilitar acceso a `state.fields` desde formularios sin narrowing.
 */
export type ActionResult<T = unknown> = {
  ok: boolean;
  data?: T;
  error?: string;
  message?: string;
  fields?: Record<string, string>;
};

/** Wrapper estándar — captura errores de zod/Supabase y devuelve ActionResult. */
export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data };
  } catch (e) {
    if (e instanceof z.ZodError) {
      const fields: Record<string, string> = {};
      for (const issue of e.errors) {
        const key = issue.path.join('.') || '_form';
        fields[key] = issue.message;
      }
      // Mostrar el primer detalle en el mensaje principal para que el usuario
      // sepa qué corregir sin tener que cazar el campo con error en pantalla.
      const primero = e.errors[0];
      const campo = primero?.path.join('.') || 'datos';
      const error = primero ? `Datos inválidos · ${campo}: ${primero.message}` : 'Datos inválidos';
      return { ok: false, error, fields };
    }
    const msg = (e as Error).message ?? 'Error desconocido';
    return { ok: false, error: msg };
  }
}

export async function requireUser() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');
  return { sb, userId: user.id };
}

export async function bumpPaths(...paths: string[]) {
  for (const p of paths) revalidatePath(p);
}

/**
 * ¿El usuario actual tiene rol 'gerente'? Se usa para operaciones que
 * requieren autorización de gerencia (ej. liquidar corte con cantidades
 * distintas al plan — pedido del cliente 21/07/2026).
 */
export async function esGerente(): Promise<boolean> {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return false;
  const { data } = await sb.from('usuarios_roles').select('rol').eq('usuario_id', user.id);
  return (data ?? []).some((r) => (r as { rol: string }).rol === 'gerente');
}
