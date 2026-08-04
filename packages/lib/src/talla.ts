/**
 * Helpers de tallas. La tabla `talla_prenda` enum tiene:
 *   T0, T2, T4, T6, T8, T10, T12, T14, T16, TS, TAD
 * Ordenadas por string (ASCII), T10 viene antes de T2. Estas helpers
 * dan el orden numérico/lógico real (talla más chica → más grande → adultos).
 */

export const TALLAS_EN_ORDEN = [
  'T0', 'T2', 'T4', 'T6', 'T8', 'T10', 'T12', 'T14', 'T16', 'TS', 'TAD', 'TU',
] as const;

export type Talla = (typeof TALLAS_EN_ORDEN)[number];

/**
 * Devuelve un peso numérico para ordenar tallas correctamente.
 *   T0=0, T2=2, ..., T16=16, TS=90, TAD=100, TU=110 (única, al final)
 * Tallas desconocidas devuelven 999 para quedar al final.
 */
export function ordenTalla(t: string): number {
  if (!t) return 999;
  if (t === 'TS') return 90;
  if (t === 'TAD') return 100;
  if (t === 'TU') return 110;
  const n = parseInt(t.replace(/^T/i, ''), 10);
  return Number.isFinite(n) ? n : 999;
}

/** Devuelve un nuevo array con las tallas ordenadas correctamente. */
export function ordenarTallas<T extends { talla: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => ordenTalla(a.talla) - ordenTalla(b.talla));
}

/** Versión human-friendly de la talla: "T10" → "10", "TS" → "S", "TAD" → "AD". */
export function labelTalla(t: string): string {
  return t.replace(/^T/i, '');
}

/**
 * Etiqueta de la talla para usuario final.
 *   - T0..T16 → "0", "2", ..., "16"
 *   - TS      → "S"      (talla real Small — se mantiene)
 *   - TAD     → "AD"     (adulto)
 *   - TU      → "ÚNICA"  (talla ÚNICA para accesorios: pañuelos, pelucas… — mig 75)
 *
 * IMPORTANTE (pedido del cliente 22/07/2026): la talla S debe mantenerse; la
 * talla única es un valor NUEVO y SEPARADO (TU), no un rename de TS.
 */
export function formatTalla(talla: string | null | undefined): string {
  if (!talla) return '—';
  if (talla === 'TU') return 'ÚNICA';
  return talla.replace(/^T/i, '');
}

/** Versión corta para chips/botones pequeños. */
export function formatTallaCorto(talla: string | null | undefined): string {
  if (!talla) return '—';
  if (talla === 'TU') return 'U';   // Única
  return talla.replace(/^T/i, '');
}

/**
 * Etiqueta para CHIPS de selección de talla (recetas, variantes, etc.).
 * Solo la talla ÚNICA (TU, accesorios) se muestra con nombre; el resto queda
 * como estaba: "S", "AD", números. La S NO se renombra (es un tamaño real).
 */
export function formatTallaChip(talla: string | null | undefined): string {
  if (!talla) return '—';
  if (talla === 'TU') return 'Única';
  return talla.replace(/^T/i, '');
}
