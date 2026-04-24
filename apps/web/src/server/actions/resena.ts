'use server';

import { z } from 'zod';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { createServiceClient } from '@happy/db/service';

const schema = z.object({
  productoId: z.string().uuid(),
  autorNombre: z.string().min(2).max(60),
  autorEmail: z.string().email().optional(),
  rating: z.number().int().min(1).max(5),
  titulo: z.string().max(120).optional(),
  comentario: z.string().min(10).max(1000),
});

export type ResenaInput = z.infer<typeof schema>;

export async function crearResena(input: ResenaInput): Promise<{ ok: true } | { ok: false; error: string }> {
  let parsed: ResenaInput;
  try {
    parsed = schema.parse(input);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const sb = createServiceClient();
  const h = await headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;

  const { error } = await sb.from('productos_resenas').insert({
    producto_id: parsed.productoId,
    autor_nombre: parsed.autorNombre,
    autor_email: parsed.autorEmail ?? null,
    puntuacion: parsed.rating,
    titulo: parsed.titulo ?? null,
    comentario: parsed.comentario,
    aprobada: false,
    verificado: false,
    ip,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/productos/[slug]`, 'page');
  return { ok: true };
}
