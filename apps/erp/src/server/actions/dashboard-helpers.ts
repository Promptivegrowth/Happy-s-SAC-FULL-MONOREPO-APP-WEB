/**
 * Helpers (sync) para dashboard. Vive separado de `dashboard.ts` porque los
 * archivos con `'use server'` solo pueden exportar funciones async.
 */

export type PeriodoKey = 'hoy' | '7d' | '15d' | '30d' | '90d' | 'custom';

export const PERIODOS: { key: PeriodoKey; label: string; dias: number }[] = [
  { key: 'hoy', label: 'Hoy', dias: 1 },
  { key: '7d', label: '7 días', dias: 7 },
  { key: '15d', label: '15 días', dias: 15 },
  { key: '30d', label: '30 días', dias: 30 },
  { key: '90d', label: '90 días', dias: 90 },
];

/** Default period key — kept here so client/server share it. */
export const DEFAULT_PERIODO: PeriodoKey = '30d';

/** Paleta de marca Happy SAC. */
export const COLORS = {
  HAPPY: '#ff4d0d',
  CORP: '#1E3A5F',
  CORP_DARK: '#152944',
  GREEN: '#10B981',
  AMBER: '#F59E0B',
  ROSE: '#F43F5E',
  SLATE: '#94a3b8',
} as const;

export const PALETTE = [COLORS.HAPPY, COLORS.CORP, COLORS.GREEN, COLORS.AMBER, COLORS.ROSE, '#6366F1'];

/** Normaliza una fecha al inicio del día UTC. */
export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** YYYY-MM-DD desde Date (en zona local). */
export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Recibe searchParams y devuelve `{desde, hasta, key, dias}` listos para query. */
export function resolvePeriodo(searchParams: Record<string, string | string[] | undefined>): {
  key: PeriodoKey;
  desde: Date;
  hasta: Date;
  dias: number;
  desdeIso: string;
  hastaIso: string;
} {
  const raw = (typeof searchParams.p === 'string' ? searchParams.p : DEFAULT_PERIODO) as PeriodoKey;
  const key: PeriodoKey = PERIODOS.some((p) => p.key === raw) || raw === 'custom' ? raw : DEFAULT_PERIODO;

  const hoy = startOfDay(new Date());
  // hasta = fin del día actual
  const hasta = new Date(hoy);
  hasta.setHours(23, 59, 59, 999);

  let desde: Date;
  let dias: number;

  if (key === 'custom') {
    const dStr = typeof searchParams.desde === 'string' ? searchParams.desde : '';
    const hStr = typeof searchParams.hasta === 'string' ? searchParams.hasta : '';
    const dParsed = dStr ? new Date(`${dStr}T00:00:00`) : null;
    const hParsed = hStr ? new Date(`${hStr}T23:59:59`) : null;
    if (dParsed && !isNaN(dParsed.getTime()) && hParsed && !isNaN(hParsed.getTime()) && dParsed <= hParsed) {
      desde = dParsed;
      const finalHasta = hParsed;
      dias = Math.max(1, Math.round((finalHasta.getTime() - desde.getTime()) / 86400000));
      return {
        key,
        desde,
        hasta: finalHasta,
        dias,
        desdeIso: desde.toISOString(),
        hastaIso: finalHasta.toISOString(),
      };
    }
    // Custom mal armado → fallback default
    dias = 30;
    desde = new Date(hoy);
    desde.setDate(desde.getDate() - (dias - 1));
  } else {
    const cfg = PERIODOS.find((p) => p.key === key)!;
    dias = cfg.dias;
    desde = new Date(hoy);
    desde.setDate(desde.getDate() - (dias - 1));
  }

  return {
    key,
    desde,
    hasta,
    dias,
    desdeIso: desde.toISOString(),
    hastaIso: hasta.toISOString(),
  };
}

/** Calcula período anterior del mismo tamaño que `{desde,hasta}`. */
export function periodoAnterior(desde: Date, hasta: Date): { desde: Date; hasta: Date; desdeIso: string; hastaIso: string } {
  const ms = hasta.getTime() - desde.getTime();
  const antHasta = new Date(desde.getTime() - 1);
  const antDesde = new Date(antHasta.getTime() - ms);
  return {
    desde: antDesde,
    hasta: antHasta,
    desdeIso: antDesde.toISOString(),
    hastaIso: antHasta.toISOString(),
  };
}

/** Delta porcentual con guardas: si anterior=0 y actual>0 → +100; si ambos 0 → 0. */
export function deltaPct(actual: number, anterior: number): number {
  if (!isFinite(actual) || !isFinite(anterior)) return 0;
  if (anterior === 0) return actual === 0 ? 0 : 100;
  return ((actual - anterior) / anterior) * 100;
}

/** Construye lista de YYYY-MM-DD del rango [desde, hasta]. */
export function rangoDias(desde: Date, hasta: Date): string[] {
  const out: string[] = [];
  const cur = new Date(desde);
  cur.setHours(0, 0, 0, 0);
  const fin = new Date(hasta);
  fin.setHours(0, 0, 0, 0);
  while (cur <= fin) {
    out.push(toISODate(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}
