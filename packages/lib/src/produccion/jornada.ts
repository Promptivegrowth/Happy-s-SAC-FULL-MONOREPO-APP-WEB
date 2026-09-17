/**
 * Cuánto se trabajó realmente entre dos horas.
 *
 * Producción carga el avance como "empecé 12:32, terminé 16:32" y el sistema
 * calculaba la resta pelada: 240 minutos. Pero en el medio hubo una hora de
 * refrigerio, así que la operación no costó 240 sino 180. Lo reportó el
 * cliente el 16/09/2026.
 *
 * Que importe no es un detalle de nómina: ese tiempo se divide entre las
 * unidades para sacar el minuto por prenda, y ese número es el que alimenta el
 * costo de mano de obra y la comparación contra el tiempo estándar. Inflarlo
 * un 33% hace que toda prenda parezca más cara y más lenta de lo que es.
 *
 * Se descuenta por SOLAPE, no de golpe: si alguien trabajó de 08:00 a 12:00 no
 * se le resta nada, porque no pasó por la hora de almuerzo. Restar una hora
 * fija sería cambiar un error por otro.
 */

export type Refrigerio = {
  /** Hora de inicio, "HH:MM" en la zona horaria de la planta. */
  inicio: string;
  /** Cuánto dura. 0 = ese día no hay refrigerio (los sábados, por ejemplo). */
  minutos: number;
};

/** Minutos desde la medianoche de un "HH:MM". null si no se entiende. */
function minutosDelDia(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec((hhmm ?? '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/** Los minutos en común entre dos intervalos. 0 si no se tocan. */
function solape(aIni: number, aFin: number, bIni: number, bFin: number): number {
  return Math.max(0, Math.min(aFin, bFin) - Math.max(aIni, bIni));
}

export type TiempoTrabajado = {
  /** Lo que se va a cobrar a la operación. */
  minutos: number;
  /** La resta pelada, sin descontar nada. */
  minutosBrutos: number;
  /** Cuánto se descontó por refrigerio. 0 si el turno no lo cruzó. */
  refrigerioDescontado: number;
};

/**
 * Los minutos trabajados entre dos momentos, descontando el refrigerio.
 *
 * El refrigerio se busca en CADA día que toca el intervalo: un registro que
 * cruza la medianoche —turno largo, o alguien que se equivocó de fecha— tiene
 * dos almuerzos posibles y hay que mirar los dos. Es raro, pero si pasa, la
 * alternativa es descontar de menos sin que nadie lo note.
 *
 * `refrigerioDe` recibe la fecha de cada día y devuelve el horario de ese día,
 * o null si ese día no se come (domingo, feriado, sábado corto).
 */
export function minutosTrabajados(
  inicio: Date,
  fin: Date,
  refrigerioDe: (dia: Date) => Refrigerio | null,
): TiempoTrabajado {
  const ti = inicio.getTime();
  const tf = fin.getTime();
  if (!Number.isFinite(ti) || !Number.isFinite(tf) || tf <= ti) {
    return { minutos: 0, minutosBrutos: 0, refrigerioDescontado: 0 };
  }

  const minutosBrutos = (tf - ti) / 60000;

  let descontado = 0;
  const dia = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate());
  /*
   * Un tope de días por si llega un intervalo absurdo —alguien tecleó 2026 en
   * vez de 2025— para no quedarse dando vueltas. Con 31 sobra: un registro de
   * avance de más de un mes es un error de carga, no un turno.
   */
  for (let i = 0; i < 31 && dia.getTime() <= tf; i++) {
    const r = refrigerioDe(dia);
    const desde = r ? minutosDelDia(r.inicio) : null;
    if (r && r.minutos > 0 && desde !== null) {
      const base = dia.getTime();
      const refIni = base + desde * 60000;
      const refFin = refIni + r.minutos * 60000;
      descontado += solape(ti, tf, refIni, refFin) / 60000;
    }
    dia.setDate(dia.getDate() + 1);
  }

  const redondear = (n: number) => Math.round(n * 100) / 100;
  return {
    minutos: redondear(Math.max(0, minutosBrutos - descontado)),
    minutosBrutos: redondear(minutosBrutos),
    refrigerioDescontado: redondear(descontado),
  };
}

/** Las tres letras con que la jornada nombra cada día. */
export const DIAS_SEMANA = ['DOM', 'LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB'] as const;

/** La clave del día de una fecha: "LUN", "MAR"… */
export function claveDia(d: Date): string {
  return DIAS_SEMANA[d.getDay()] ?? 'LUN';
}

/**
 * El buscador de refrigerio a partir de la jornada configurada.
 *
 * La jornada guarda el horario de cada día; de ahí salen la hora de almuerzo y
 * su duración. Un día que no está en la tabla —domingo— no tiene refrigerio
 * que descontar, y tampoco hace falta: si alguien cargó trabajo un domingo, lo
 * que hizo fue trabajar sin parar a comer.
 */
export function refrigerioSegunJornada(
  horarios: Record<string, Refrigerio | null | undefined>,
): (dia: Date) => Refrigerio | null {
  return (dia: Date) => horarios[claveDia(dia)] ?? null;
}
