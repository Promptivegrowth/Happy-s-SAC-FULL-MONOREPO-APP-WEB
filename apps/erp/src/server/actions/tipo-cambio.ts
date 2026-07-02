'use server';

/**
 * Cotización de tipos de cambio para ventas de exportación.
 *
 * Fuente primaria: SUNAT (via API pública apis.net.pe, gratuita, sin auth).
 * Publica el TC oficial diario para valorización aduanera (mismo criterio
 * que exige SUNAT en facturas de exportación).
 *
 * Fallback: si la API falla o está fuera de horario, devolvemos un TC
 * conservador para que el usuario pueda seguir operando ingresándolo a mano.
 *
 * IMPORTANTE: el TC guardado en la venta queda inmutable. Lo que la API
 * devuelve es solo el sugerido al momento de emitir — el usuario puede
 * sobrescribirlo si tiene una cotización distinta (banco/casa de cambio).
 */

export type TipoCambio = {
  compra: number;
  venta: number;
  moneda: 'USD' | 'EUR';
  fecha: string;
  fuente: 'SUNAT' | 'FALLBACK';
};

const TC_FALLBACK_USD = 3.75;
const TC_FALLBACK_EUR = 4.05;

export async function obtenerTipoCambio(moneda: 'USD' | 'EUR' | 'PEN'): Promise<TipoCambio> {
  if (moneda === 'PEN') {
    return { compra: 1, venta: 1, moneda: 'USD', fecha: new Date().toISOString().slice(0, 10), fuente: 'FALLBACK' };
  }
  // apis.net.pe solo publica USD y EUR contra SUNAT. Si el usuario elige otra
  // moneda tendría que ingresar el TC a mano (no llegamos a ese caso hoy).
  try {
    const url = moneda === 'USD'
      ? 'https://api.apis.net.pe/v1/tipo-cambio-sunat'
      : 'https://api.apis.net.pe/v2/tipo-cambio?moneda=EUR';
    const res = await fetch(url, {
      // El endpoint pública TC del día; cachear 12h no rompe nada.
      next: { revalidate: 60 * 60 * 12 },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as { compra?: number; venta?: number; fecha?: string; precioCompra?: number; precioVenta?: number };
    // v1 devuelve {compra, venta, fecha}; v2 devuelve {precioCompra, precioVenta}
    const compra = Number(data.compra ?? data.precioCompra ?? 0);
    const venta = Number(data.venta ?? data.precioVenta ?? 0);
    if (!compra || !venta) throw new Error('respuesta vacía');
    return {
      compra,
      venta,
      moneda,
      fecha: data.fecha ?? new Date().toISOString().slice(0, 10),
      fuente: 'SUNAT',
    };
  } catch {
    return {
      compra: moneda === 'USD' ? TC_FALLBACK_USD : TC_FALLBACK_EUR,
      venta: (moneda === 'USD' ? TC_FALLBACK_USD : TC_FALLBACK_EUR) + 0.02,
      moneda,
      fecha: new Date().toISOString().slice(0, 10),
      fuente: 'FALLBACK',
    };
  }
}

export async function obtenerParametrosExportacion(): Promise<{
  drawback_pct: number;
  igv_pct: number;
  drawback_tope_uit: number;
}> {
  const { createClient } = await import('@happy/db/server');
  const sb = await createClient();
  const { data } = await sb
    .from('exportacion_parametros')
    .select('clave, valor_num')
    .in('clave', ['DRAWBACK_PCT', 'IGV_PCT', 'DRAWBACK_TOPE_UIT']);
  const m = new Map<string, number>();
  for (const r of (data ?? []) as { clave: string; valor_num: number | null }[]) {
    m.set(r.clave, Number(r.valor_num ?? 0));
  }
  return {
    drawback_pct: m.get('DRAWBACK_PCT') ?? 3,
    igv_pct: m.get('IGV_PCT') ?? 18,
    drawback_tope_uit: m.get('DRAWBACK_TOPE_UIT') ?? 20,
  };
}
