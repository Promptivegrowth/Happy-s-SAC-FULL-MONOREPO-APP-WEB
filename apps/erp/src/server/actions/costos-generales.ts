'use server';

/**
 * Los costos de toda la empresa y cómo se reparten entre las áreas.
 *
 * El alquiler de una bordadora es de bordado y de nadie más, y por eso se carga
 * en el área. La luz no: llega un recibo por todo el local. Antes había que
 * partirlo a mano y tipearlo una vez por área, todos los meses; ahora se carga
 * una sola vez y cada área toma la porción que le toca.
 *
 * El porcentaje de cada área ya no se tipea: sale de sus personas (operarios
 * activos del área ÷ los de todas las áreas), ver server/reparto-por-personas.ts.
 */

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@happy/db/server';
import { requireRol } from '@/server/session';

const CATEGORIAS = [
  'SERVICIOS', 'ALQUILER', 'MANO_OBRA', 'DEPRECIACION',
  'MANTENIMIENTO', 'INSUMOS', 'OTROS',
] as const;

const periodoSchema = z.string().regex(/^\d{4}-\d{2}$/, 'Periodo inválido (YYYY-MM)');

const costoSchema = z.object({
  periodo: periodoSchema,
  categoria: z.enum(CATEGORIAS),
  concepto: z.string().trim().min(1, 'Escribe a qué corresponde el costo').max(200),
  monto: z.coerce.number().min(0, 'El monto no puede ser negativo'),
  observacion: z.string().trim().max(500).optional().nullable(),
});

export type CostoGeneral = {
  id: string;
  periodo: string;
  categoria: string;
  concepto: string;
  monto: number;
  observacion: string | null;
};

export async function agregarCostoGeneral(
  input: z.infer<typeof costoSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireRol('gerente');
    const d = costoSchema.parse(input);
    const sb = await createClient();
    const { data: { user } } = await sb.auth.getUser();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sbAny = sb as unknown as { from: (t: string) => any };

    const { error } = await sbAny.from('costos_generales_mensuales').insert({
      periodo: d.periodo,
      categoria: d.categoria,
      concepto: d.concepto,
      monto: d.monto,
      observacion: d.observacion || null,
      registrado_por: user?.id ?? null,
    });
    if (error) return { ok: false, error: error.message };

    revalidatePath('/configuracion/costos-generales');
    revalidatePath('/configuracion/areas');
    return { ok: true };
  } catch (e) {
    const msg = e instanceof z.ZodError
      ? (e.errors[0]?.message ?? 'Datos inválidos')
      : (e as Error).message || 'No se pudo guardar el costo';
    return { ok: false, error: msg };
  }
}

export async function eliminarCostoGeneral(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireRol('gerente');
    const sb = await createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sbAny = sb as unknown as { from: (t: string) => any };
    const { error } = await sbAny.from('costos_generales_mensuales').delete().eq('id', id);
    if (error) return { ok: false, error: error.message };
    revalidatePath('/configuracion/costos-generales');
    revalidatePath('/configuracion/areas');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message || 'No se pudo eliminar' };
  }
}
