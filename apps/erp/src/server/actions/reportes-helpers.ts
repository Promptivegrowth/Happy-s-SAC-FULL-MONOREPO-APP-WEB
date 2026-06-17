/**
 * Tipos, constantes y funciones puras para el módulo de Reportes.
 *
 * Estructura separada de `reportes.ts` ('use server') porque Next.js sólo
 * permite exports async desde server actions. Lo síncrono vive acá.
 */

// ============================================================================
// CONSTANTES DE MARCA — para Excel y PDF brandeados
// ============================================================================
export const BRAND = {
  naranja: 'FFFF4D0D',     // #ff4d0d (ARGB sin #)
  naranjaHex: '#ff4d0d',
  azul: 'FF1E3A5F',         // #1E3A5F
  azulHex: '#1E3A5F',
  verde: 'FF10B981',        // #10B981
  verdeHex: '#10B981',
  textoOscuro: 'FF0F172A',  // #0F172A
  textoOscuroHex: '#0F172A',
  bgSuave: 'FFF8FAFC',      // #F8FAFC
  bgSuaveHex: '#F8FAFC',
  blanco: 'FFFFFFFF',
  blancoHex: '#FFFFFF',
} as const;

// ============================================================================
// CANALES / ESTADOS
// ============================================================================
export const CANALES_VENTA = ['POS', 'WEB', 'B2B', 'WHATSAPP', 'REDES'] as const;
export type CanalVenta = (typeof CANALES_VENTA)[number];

export const ESTADOS_OT = [
  'BORRADOR',
  'PLANIFICADA',
  'EN_CORTE',
  'EN_HABILITADO',
  'EN_SERVICIO',
  'EN_DECORADO',
  'EN_CONTROL_CALIDAD',
  'COMPLETADA',
  'CANCELADA',
] as const;
export type EstadoOT = (typeof ESTADOS_OT)[number];

// ============================================================================
// TIPOS COMUNES DE RESULTADO
// ============================================================================
export type ColExport = {
  header: string;
  key: string;
  width?: number;
  formato?: 'moneda' | 'numero' | 'fecha' | 'porcentaje' | 'texto';
};

export type FiltrosFecha = {
  desde?: string;
  hasta?: string;
};

// ============================================================================
// HELPERS DE FECHA — utilidades puras para construir rangos
// ============================================================================
export function inicioDeMes(d: Date = new Date()): string {
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

export function hoy(): string {
  return new Date().toISOString().slice(0, 10);
}

export function rangoAnterior(desde: string, hasta: string): { desde: string; hasta: string } {
  const d1 = new Date(desde);
  const d2 = new Date(hasta);
  const dias = Math.max(1, Math.round((d2.getTime() - d1.getTime()) / 86400000) + 1);
  const prevHasta = new Date(d1);
  prevHasta.setDate(prevHasta.getDate() - 1);
  const prevDesde = new Date(prevHasta);
  prevDesde.setDate(prevDesde.getDate() - dias + 1);
  return {
    desde: prevDesde.toISOString().slice(0, 10),
    hasta: prevHasta.toISOString().slice(0, 10),
  };
}

export function diffPct(actual: number, anterior: number): number {
  if (anterior === 0) return actual === 0 ? 0 : 100;
  return ((actual - anterior) / anterior) * 100;
}

export function daysBetween(a: string | Date, b: string | Date): number {
  const da = typeof a === 'string' ? new Date(a) : a;
  const db = typeof b === 'string' ? new Date(b) : b;
  return Math.round((db.getTime() - da.getTime()) / 86400000);
}

// ============================================================================
// HELPERS DE AGRUPACIÓN
// ============================================================================
export function groupBy<T, K extends string | number>(
  arr: T[],
  fn: (x: T) => K,
): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const x of arr) {
    const k = fn(x);
    const a = m.get(k);
    if (a) a.push(x);
    else m.set(k, [x]);
  }
  return m;
}
