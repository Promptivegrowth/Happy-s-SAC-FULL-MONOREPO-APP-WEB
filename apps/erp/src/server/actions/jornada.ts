'use server';

/**
 * La jornada de planta: qué días se trabaja, en qué horario y cuándo se come.
 *
 * Hasta ahora esto vivía como valores por defecto en el código —lunes a
 * viernes 08:00 a 18:00 con una hora de refrigerio, sábados 08:00 a 13:00— y
 * no había dónde cambiarlos. Dejó de alcanzar cuando el registro de avance de
 * producción empezó a descontar el refrigerio: la hora del almuerzo decide
 * cuántos minutos se le cobran a cada operación, y ese número no puede quedar
 * escrito a mano en el código.
 *
 * De paso, la misma jornada es la que calcula los minutos disponibles del mes
 * para el costo por minuto de cada área, así que un cambio de horario ahora se
 * refleja solo en los dos lados.
 */

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@happy/db/server';
import { requireRol } from '@/server/session';

const HORA = /^([01]?\d|2[0-3]):[0-5]\d$/;

const diaSchema = z.object({
  dia: z.enum(['LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB', 'DOM']),
  /** Un día que no se trabaja simplemente no está en `dias`. */
  laborable: z.boolean(),
  inicio: z.string().regex(HORA, 'Hora inválida (HH:MM)'),
  fin: z.string().regex(HORA, 'Hora inválida (HH:MM)'),
  refrigerio_inicio: z.string().regex(HORA, 'Hora inválida (HH:MM)'),
  refrigerio_min: z.coerce.number().int().min(0).max(480),
});

const schema = z.object({ dias: z.array(diaSchema).min(1) });

export type DiaJornada = z.infer<typeof diaSchema>;

export async function guardarJornada(
  input: z.infer<typeof schema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireRol('gerente');
    const { dias } = schema.parse(input);

    for (const d of dias) {
      if (!d.laborable) continue;

      const min = (h: string) => {
        const [hh, mm] = h.split(':').map(Number);
        return hh! * 60 + mm!;
      };
      if (min(d.fin) <= min(d.inicio)) {
        return { ok: false, error: `${d.dia}: la hora de salida tiene que ser posterior a la de entrada` };
      }
      /*
       * El refrigerio tiene que caer DENTRO del horario.
       *
       * Si quedara fuera, el descuento nunca se aplicaría y nadie entendería
       * por qué: el registro de avance seguiría cobrando el intervalo entero
       * sin dar ninguna señal.
       */
      if (d.refrigerio_min > 0) {
        const ri = min(d.refrigerio_inicio);
        if (ri < min(d.inicio) || ri + d.refrigerio_min > min(d.fin)) {
          return {
            ok: false,
            error: `${d.dia}: el refrigerio (${d.refrigerio_inicio}, ${d.refrigerio_min} min) cae fuera del horario ${d.inicio}-${d.fin}`,
          };
        }
      }
    }

    const laborables = dias.filter((d) => d.laborable).map((d) => d.dia);
    if (laborables.length === 0) return { ok: false, error: 'Marca al menos un día laborable' };

    const horarios: Record<string, { inicio: string; fin: string; refrigerio_min: number; refrigerio_inicio: string }> = {};
    for (const d of dias) {
      if (!d.laborable) continue;
      horarios[d.dia] = {
        inicio: d.inicio,
        fin: d.fin,
        refrigerio_min: d.refrigerio_min,
        refrigerio_inicio: d.refrigerio_inicio,
      };
    }

    const sb = await createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sbAny = sb as unknown as { from: (t: string) => any };

    /*
     * Se guardan también las claves antiguas de inicio y fin.
     *
     * Hay pantallas que todavía leen esas dos sueltas; si solo se guardara el
     * detalle por día, seguirían mostrando el horario viejo sin avisar.
     */
    const primero = horarios[laborables[0]!]!;
    const filas = [
      { clave: 'jornada_estandar_dias', valor: laborables },
      { clave: 'jornada_estandar_horarios', valor: horarios },
      { clave: 'jornada_estandar_inicio', valor: primero.inicio },
      { clave: 'jornada_estandar_fin', valor: primero.fin },
    ];

    for (const f of filas) {
      const { error } = await sbAny
        .from('configuracion')
        .upsert({ clave: f.clave, valor: f.valor }, { onConflict: 'clave' });
      if (error) return { ok: false, error: error.message };
    }

    revalidatePath('/configuracion/jornada');
    // El costo por minuto de cada área sale de estos minutos.
    revalidatePath('/configuracion/areas');
    return { ok: true };
  } catch (e) {
    const msg = e instanceof z.ZodError
      ? (e.errors[0]?.message ?? 'Datos inválidos')
      : (e as Error).message || 'No se pudo guardar la jornada';
    return { ok: false, error: msg };
  }
}
