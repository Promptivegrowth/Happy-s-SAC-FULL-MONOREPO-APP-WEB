/**
 * Cuánto se trabajó realmente entre dos horas.
 *
 * Producción carga el avance como "empecé tal día a tal hora, terminé tal
 * otra", y el sistema hacía la resta pelada. Eso se equivocaba de dos maneras,
 * las dos reportadas por el cliente el 16/09/2026:
 *
 *   · Un turno de 12:32 a 16:32 daba 240 minutos, aunque una hora se fue en
 *     almorzar.
 *   · Un registro del 13/09 16:36 al 14/09 09:36 daba 1 020 minutos —17 horas
 *     seguidas— porque contaba la noche entera: la planta cerrada, todo el
 *     mundo en su casa, y el reloj corriendo.
 *
 * Que importe no es un detalle de nómina: ese tiempo se divide entre las
 * unidades para sacar el minuto por prenda, y ese número alimenta el costo de
 * mano de obra y la comparación contra el tiempo estándar. Inflarlo hace que
 * la prenda parezca más lenta y más cara de lo que es.
 *
 * La regla es una sola y se explica en una frase: se cuenta el tiempo que cae
 * DENTRO del horario de trabajo, y de ahí se descuenta el refrigerio. Todo lo
 * que quede fuera —la noche, un domingo, las horas antes de abrir— no se
 * cobra a la operación. Para el trabajo que realmente ocurrió fuera de horario
 * está el modo "tiempo directo", donde se escriben los minutos a mano.
 */

export type HorarioDia = {
  /** Hora de entrada, "HH:MM". */
  inicio: string;
  /** Hora de salida, "HH:MM". */
  fin: string;
  /** Hora en que se para a comer, "HH:MM". */
  refrigerioInicio: string;
  /** Cuánto dura el refrigerio. 0 = ese día no se para. */
  refrigerioMin: number;
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
  /** Lo que se le cobra a la operación. */
  minutos: number;
  /** La resta pelada entre las dos fechas, sin descontar nada. */
  minutosBrutos: number;
  /** Cuánto se descontó por caer en el refrigerio. */
  refrigerioDescontado: number;
  /** Cuánto se descontó por caer fuera del horario: la noche, un domingo. */
  fueraDeJornadaDescontado: number;
};

const MS_MIN = 60000;
/**
 * Tope de días que se recorren.
 *
 * Es para no quedarse dando vueltas si llega un intervalo absurdo —alguien
 * tecleó el año que no era—. Con 31 sobra: un registro de avance de más de un
 * mes es un error de carga, no un turno.
 */
const MAX_DIAS = 31;

/**
 * Los minutos trabajados entre dos momentos, acotados al horario de planta.
 *
 * Se recorre día por día porque cada uno tiene su propio horario: el sábado es
 * corto y no tiene refrigerio, el domingo no existe, y un registro que cruza la
 * medianoche toca dos jornadas distintas.
 *
 * `horarioDe` recibe la fecha de cada día y devuelve su horario, o null si ese
 * día no se trabaja.
 */
export function minutosTrabajados(
  inicio: Date,
  fin: Date,
  horarioDe: (dia: Date) => HorarioDia | null,
): TiempoTrabajado {
  const ti = inicio.getTime();
  const tf = fin.getTime();
  const vacio = { minutos: 0, minutosBrutos: 0, refrigerioDescontado: 0, fueraDeJornadaDescontado: 0 };
  if (!Number.isFinite(ti) || !Number.isFinite(tf) || tf <= ti) return vacio;

  const minutosBrutos = (tf - ti) / MS_MIN;

  let dentroDeJornada = 0;
  let refrigerio = 0;

  const dia = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate());
  for (let i = 0; i < MAX_DIAS && dia.getTime() <= tf; i++) {
    const h = horarioDe(dia);
    const base = dia.getTime();
    const desde = h ? minutosDelDia(h.inicio) : null;
    const hasta = h ? minutosDelDia(h.fin) : null;

    if (h && desde !== null && hasta !== null && hasta > desde) {
      const jorIni = base + desde * MS_MIN;
      const jorFin = base + hasta * MS_MIN;
      const enJornada = solape(ti, tf, jorIni, jorFin);
      dentroDeJornada += enJornada / MS_MIN;

      /*
       * El refrigerio se descuenta solo de lo que ya quedó dentro del horario.
       *
       * Si se restara del bruto, un turno que se pasó de la hora de salida
       * pagaría el almuerzo dos veces: una al recortarlo a la jornada y otra
       * al restar el refrigerio.
       */
      if (enJornada > 0 && h.refrigerioMin > 0) {
        const refDesde = minutosDelDia(h.refrigerioInicio);
        if (refDesde !== null) {
          const refIni = Math.max(base + refDesde * MS_MIN, jorIni);
          const refFin = Math.min(refIni + h.refrigerioMin * MS_MIN, jorFin);
          refrigerio += solape(ti, tf, refIni, refFin) / MS_MIN;
        }
      }
    }

    dia.setDate(dia.getDate() + 1);
  }

  const redondear = (n: number) => Math.round(n * 100) / 100;
  return {
    minutos: redondear(Math.max(0, dentroDeJornada - refrigerio)),
    minutosBrutos: redondear(minutosBrutos),
    refrigerioDescontado: redondear(refrigerio),
    fueraDeJornadaDescontado: redondear(Math.max(0, minutosBrutos - dentroDeJornada)),
  };
}

/** Las tres letras con que la jornada nombra cada día. */
export const DIAS_SEMANA = ['DOM', 'LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB'] as const;

/** La clave del día de una fecha: "LUN", "MAR"… */
export function claveDia(d: Date): string {
  return DIAS_SEMANA[d.getDay()] ?? 'LUN';
}

/**
 * El buscador de horario a partir de la jornada configurada.
 *
 * Un día que no está en la tabla —el domingo, mientras no haya campaña— no se
 * trabaja, y por lo tanto no aporta minutos.
 */
export function horarioSegunJornada(
  horarios: Record<string, HorarioDia | null | undefined>,
): (dia: Date) => HorarioDia | null {
  return (dia: Date) => horarios[claveDia(dia)] ?? null;
}
