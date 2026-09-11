import { createClient } from '@happy/db/server';

/**
 * JORNADA ESTÁNDAR DE PLANTA.
 *
 * Pedido cliente 2026-09-10: lunes a viernes de 08:00 a 18:00 con 1 hora de
 * refrigerio, y sábados de 08:00 a 13:00 sin refrigerio.
 *
 * Antes la jornada era UNIFORME (un solo inicio/fin para todos los días) y no
 * contemplaba el almuerzo, por lo que no se podía representar este horario.
 * Ahora es POR DÍA e incluye los minutos de refrigerio, que se descuentan al
 * calcular las horas efectivas.
 */

export type HorarioDia = { inicio: string; fin: string; refrigerio_min: number };

export type JornadaEstandar = {
  /** Días laborables. */
  dias: string[];
  /** Horario por día (clave: LUN, MAR, …). */
  horarios: Record<string, HorarioDia>;
  /** Compatibilidad con vistas antiguas: horario del primer día laborable. */
  inicio: string;
  fin: string;
};

const LV: HorarioDia = { inicio: '08:00', fin: '18:00', refrigerio_min: 60 };
const SABADO: HorarioDia = { inicio: '08:00', fin: '13:00', refrigerio_min: 0 };

const DEFAULT: JornadaEstandar = {
  dias: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB'],
  horarios: { LUN: LV, MAR: LV, MIE: LV, JUE: LV, VIE: LV, SAB: SABADO },
  inicio: LV.inicio,
  fin: LV.fin,
};

/** Minutos efectivos de un día (duración menos refrigerio). 0 si el rango es inválido. */
export function minutosEfectivos(h: HorarioDia): number {
  const [hi, mi] = h.inicio.split(':').map(Number);
  const [hf, mf] = h.fin.split(':').map(Number);
  if ([hi, mi, hf, mf].some((n) => !Number.isFinite(n))) return 0;
  const total = (hf! * 60 + mf!) - (hi! * 60 + mi!);
  return Math.max(0, total - (h.refrigerio_min ?? 0));
}

/** "9 h" / "8 h 30 min" a partir de minutos. */
export function formatoHoras(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** Resumen legible de la jornada estándar, agrupando días con el mismo horario. */
export function resumenJornada(j: JornadaEstandar): string {
  const grupos: Array<{ dias: string[]; h: HorarioDia }> = [];
  for (const d of j.dias) {
    const h = j.horarios[d];
    if (!h) continue;
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.h.inicio === h.inicio && ultimo.h.fin === h.fin && ultimo.h.refrigerio_min === h.refrigerio_min) {
      ultimo.dias.push(d);
    } else {
      grupos.push({ dias: [d], h });
    }
  }
  return grupos
    .map((g) => {
      const rango = g.dias.length > 1 ? `${g.dias[0]}-${g.dias[g.dias.length - 1]}` : g.dias[0];
      const ref = g.h.refrigerio_min > 0 ? ` (${g.h.refrigerio_min} min de refrigerio)` : ' (sin refrigerio)';
      return `${rango} ${g.h.inicio}-${g.h.fin}${ref}`;
    })
    .join(' · ');
}

/** Lee la jornada estándar de la tabla configuracion. Cae en defaults si no está. */
export async function getJornadaEstandar(): Promise<JornadaEstandar> {
  const sb = await createClient();
  const { data } = await sb
    .from('configuracion')
    .select('clave, valor')
    .in('clave', [
      'jornada_estandar_inicio',
      'jornada_estandar_fin',
      'jornada_estandar_dias',
      'jornada_estandar_horarios',
    ]);
  const map = new Map((data ?? []).map((r) => [r.clave as string, r.valor as unknown]));

  const dias = (map.get('jornada_estandar_dias') as string[]) ?? DEFAULT.dias;
  const guardados = map.get('jornada_estandar_horarios') as Record<string, Partial<HorarioDia>> | undefined;

  // Si no hay horarios por día guardados, derivamos uno uniforme de las claves
  // legacy para no romper instalaciones antiguas.
  const inicioLegacy = (map.get('jornada_estandar_inicio') as string) || DEFAULT.inicio;
  const finLegacy = (map.get('jornada_estandar_fin') as string) || DEFAULT.fin;

  const horarios: Record<string, HorarioDia> = {};
  for (const d of dias) {
    const g = guardados?.[d];
    horarios[d] = g?.inicio && g?.fin
      ? { inicio: g.inicio, fin: g.fin, refrigerio_min: Number(g.refrigerio_min ?? 0) }
      : (DEFAULT.horarios[d] ?? { inicio: inicioLegacy, fin: finLegacy, refrigerio_min: 0 });
  }

  const primero = horarios[dias[0] ?? 'LUN'] ?? DEFAULT.horarios.LUN!;
  return { dias, horarios, inicio: primero.inicio, fin: primero.fin };
}
