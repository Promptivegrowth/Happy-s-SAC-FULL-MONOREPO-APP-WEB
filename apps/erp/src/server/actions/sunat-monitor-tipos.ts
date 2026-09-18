/**
 * Tipos y constantes del monitor de SUNAT.
 *
 * Viven acá y no junto a la consulta porque un archivo 'use server' solo puede
 * exportar funciones asíncronas: una constante o un tipo exportados desde ahí
 * rompen el build. Es la misma razón por la que existe caja-helpers.ts.
 */

/** La hora de Lima en que el día se cierra y sus boletas se informan. */
export const HORA_RESUMEN = 23;

export type EstadoSunat = {
  /** Documentos que SUNAT aceptó. */
  aceptados: number;
  /** Emitidos hoy que esperan el resumen de las 23:00. Es normal. */
  enEspera: number;
  /** Pasaron más de 24 h sin respuesta conforme. Esto sí hay que mirarlo. */
  atrasados: number;
  /** SUNAT los rechazó u observó. */
  conProblema: number;
  /** Anulados e informados. */
  anulados: number;
  /** Última corrida del envío automático, en hora de Lima. */
  ultimaCorrida: string | null;
  /** Cuántas corridas lleva y cuántas fallaron. */
  corridas: number;
  fallosAcumulados: number;
  /** Hora de Lima ahora, para saber si el resumen de hoy ya pasó. */
  horaLima: number;
  /** Vencimiento del certificado digital y días que faltan. */
  certificadoVence: string | null;
  certificadoDias: number | null;
  ambiente: string | null;
  resumenes: ResumenDia[];
};

export type ResumenDia = {
  resumen_id: string;
  fecha_referencia: string;
  estado: string;
  cantidad_boletas: number;
  codigo: string | null;
  descripcion: string | null;
};

