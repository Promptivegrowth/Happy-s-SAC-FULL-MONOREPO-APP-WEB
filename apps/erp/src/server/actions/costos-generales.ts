'use server';

/**
 * Los costos de toda la empresa y cómo se reparten entre las áreas.
 *
 * El alquiler de una bordadora es de bordado y de nadie más, y por eso se carga
 * en el área. La luz no: llega un recibo por todo el local. Antes había que
 * partirlo a mano y tipearlo una vez por área, todos los meses; ahora se carga
 * una sola vez y cada área toma la porción que le toca.
 *
 * El reparto es un porcentaje por área, y la suma debería dar 100. Si da menos,
 * la parte que falta no se le carga a nadie y todos los costos por minuto salen
 * más baratos de lo que realmente son — por eso se avisa, aunque se permita:
 * puede haber un pedazo del local que no sea de producción.
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

const prorrateoSchema = z.object({
  reparto: z.array(z.object({
    area_id: z.string().uuid(),
    porcentaje: z.coerce.number().min(0).max(100),
  })).min(1),
});

export async function guardarProrrateo(
  input: z.infer<typeof prorrateoSchema>,
): Promise<{ ok: true; suma: number } | { ok: false; error: string }> {
  try {
    await requireRol('gerente');
    const { reparto } = prorrateoSchema.parse(input);

    const suma = reparto.reduce((s, r) => s + r.porcentaje, 0);
    /*
     * Pasarse de 100 sí se rechaza.
     *
     * Quedarse corto hace que un pedazo del recibo no se le cargue a nadie —se
     * avisa, pero puede ser a propósito: el local tiene oficinas y depósito que
     * no producen—. Pasarse, en cambio, reparte plata que no existe y encarece
     * todas las prendas sin que nadie sepa por qué.
     */
    if (suma > 100.01) {
      return {
        ok: false,
        error: `Los porcentajes suman ${suma.toFixed(2)}%. No pueden pasar de 100: estarías repartiendo más costo del que hay.`,
      };
    }

    const sb = await createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sbAny = sb as unknown as { from: (t: string) => any };

    for (const r of reparto) {
      const { error } = await sbAny
        .from('areas_produccion')
        .update({ prorrateo_pct: r.porcentaje })
        .eq('id', r.area_id);
      if (error) return { ok: false, error: error.message };
    }

    revalidatePath('/configuracion/costos-generales');
    revalidatePath('/configuracion/areas');
    return { ok: true, suma };
  } catch (e) {
    const msg = e instanceof z.ZodError
      ? (e.errors[0]?.message ?? 'Datos inválidos')
      : (e as Error).message || 'No se pudo guardar el reparto';
    return { ok: false, error: msg };
  }
}

/**
 * Reparte los costos generales del mes en partes iguales entre las áreas activas.
 *
 * Es el punto de partida para no arrancar de cero: después se ajusta a mano
 * según el lugar que ocupa cada una. El resto —lo que sobra del redondeo— se le
 * suma a la primera para que la suma dé 100 exacto y no queden céntimos sin
 * repartir.
 */
export async function repartirEnPartesIguales(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  try {
    await requireRol('gerente');
    const sb = await createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sbAny = sb as unknown as { from: (t: string) => any };

    const { data } = await sbAny
      .from('areas_produccion')
      .select('id')
      .eq('activa', true)
      .order('codigo');
    const areas = (data ?? []) as { id: string }[];
    if (areas.length === 0) return { ok: false, error: 'No hay áreas activas' };

    const base = Math.floor((100 / areas.length) * 100) / 100;
    const resto = Math.round((100 - base * areas.length) * 100) / 100;

    for (let i = 0; i < areas.length; i++) {
      const pct = i === 0 ? base + resto : base;
      const { error } = await sbAny
        .from('areas_produccion')
        .update({ prorrateo_pct: pct })
        .eq('id', areas[i]!.id);
      if (error) return { ok: false, error: error.message };
    }

    revalidatePath('/configuracion/costos-generales');
    revalidatePath('/configuracion/areas');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message || 'No se pudo repartir' };
  }
}
