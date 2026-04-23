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
      return { ok: false, error: 'Datos inválidos', fields };
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
