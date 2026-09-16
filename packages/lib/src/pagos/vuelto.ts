/**
 * Descuenta el vuelto de los pagos antes de guardarlos.
 *
 * Cuando alguien paga S/ 100 una compra de S/ 90, al cajón entran S/ 90: los
 * otros S/ 10 se devuelven. Si se guardan los S/ 100, el cierre de caja espera
 * diez soles más de los que hay, y al cuadrar aparece un faltante que nadie
 * puede explicar.
 *
 * El POS ya limita el efectivo al cobrarlo, pero el carrito puede cambiar
 * DESPUÉS de registrar el pago —se quita un artículo, se corrige un precio— y
 * el monto queda como estaba. Pasó el 15/09/2026 con VEN-000014: venta de
 * S/ 90 con un pago de S/ 100.
 *
 * El vuelto solo sale del efectivo. Nadie devuelve cambio de una
 * transferencia, así que un excedente que no es en efectivo no es vuelto: es
 * un monto mal escrito, y descontarlo a la callada taparía el error.
 */

export type PagoACobrar = { metodo: string; monto: number };

export type AjusteDeVuelto<T extends PagoACobrar> =
  | { ok: true; pagos: T[]; vuelto: number }
  | { ok: false; sobra: number };

/** Redondeo a céntimos, que es como se guarda y como se cuenta la plata. */
const centimos = (n: number) => +Number(n ?? 0).toFixed(2);

export function descontarVuelto<T extends PagoACobrar>(
  pagos: T[],
  total: number,
): AjusteDeVuelto<T> {
  const cobrado = centimos(pagos.reduce((a, p) => a + Number(p.monto ?? 0), 0));
  let excedente = centimos(cobrado - centimos(total));
  if (excedente <= 0.001) return { ok: true, pagos, vuelto: 0 };

  const vuelto = excedente;
  const ajustados = pagos.map((p) => ({ ...p }));
  for (const p of ajustados) {
    if (excedente <= 0.001) break;
    if (p.metodo !== 'EFECTIVO') continue;
    const quita = Math.min(Number(p.monto ?? 0), excedente);
    p.monto = centimos(Number(p.monto ?? 0) - quita);
    excedente = centimos(excedente - quita);
  }

  if (excedente > 0.001) return { ok: false, sobra: excedente };

  // Un pago que quedó en cero era vuelto entero; no tiene por qué figurar.
  return { ok: true, pagos: ajustados.filter((p) => p.monto > 0.001), vuelto };
}
