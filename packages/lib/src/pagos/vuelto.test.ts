/**
 * Pruebas del descuento del vuelto.
 *
 * Esto decide cuánta plata dice el sistema que hay en el cajón. Si se equivoca,
 * la cajera cuadra la caja contra un número inventado y aparece un faltante
 * que no existe (o se tapa uno que sí).
 */

import { describe, it, expect } from 'vitest';
import { descontarVuelto } from './vuelto';

const efectivo = (monto: number) => ({ metodo: 'EFECTIVO', monto });
const plin = (monto: number) => ({ metodo: 'PLIN', monto });

describe('pagos que cubren justo el total', () => {
  it('no toca nada', () => {
    const r = descontarVuelto([efectivo(90)], 90);
    expect(r).toEqual({ ok: true, pagos: [efectivo(90)], vuelto: 0 });
  });

  it('tampoco con varios medios de pago', () => {
    const pagos = [efectivo(50), plin(40)];
    const r = descontarVuelto(pagos, 90);
    expect(r.ok && r.pagos).toEqual(pagos);
    expect(r.ok && r.vuelto).toBe(0);
  });

  it('un pago de menos no es asunto suyo', () => {
    // Que falte plata lo detecta otra validación; acá no se inventa nada.
    const r = descontarVuelto([efectivo(50)], 90);
    expect(r.ok && r.pagos).toEqual([efectivo(50)]);
  });
});

describe('el excedente en efectivo es vuelto', () => {
  it('el caso de VEN-000014: S/ 100 por una venta de S/ 90', () => {
    const r = descontarVuelto([efectivo(100)], 90);
    expect(r.ok && r.pagos).toEqual([efectivo(90)]);
    expect(r.ok && r.vuelto).toBe(10);
  });

  it('descuenta solo del efectivo, no del otro medio', () => {
    // El Plin entró completo al banco; el vuelto salió del cajón.
    const r = descontarVuelto([plin(40), efectivo(60)], 90);
    expect(r.ok && r.pagos).toEqual([plin(40), efectivo(50)]);
    expect(r.ok && r.vuelto).toBe(10);
  });

  it('reparte el descuento entre varios pagos en efectivo', () => {
    const r = descontarVuelto([efectivo(20), efectivo(100)], 90);
    expect(r.ok && r.pagos).toEqual([efectivo(0.0), efectivo(90)].filter((p) => p.monto > 0));
    expect(r.ok && r.vuelto).toBe(30);
  });

  it('saca de la lista un pago que quedó en cero', () => {
    // Era vuelto entero: dejarlo en cero ensucia el detalle de la venta.
    const r = descontarVuelto([efectivo(10), plin(90)], 90);
    expect(r.ok && r.pagos).toEqual([plin(90)]);
  });

  it('trabaja en céntimos sin arrastrar decimales', () => {
    const r = descontarVuelto([efectivo(100)], 89.9);
    expect(r.ok && r.pagos).toEqual([efectivo(89.9)]);
    expect(r.ok && r.vuelto).toBe(10.1);
  });

  it('un céntimo de redondeo no cuenta como vuelto', () => {
    const r = descontarVuelto([efectivo(90.004)], 90);
    expect(r.ok && r.vuelto).toBe(0);
  });
});

describe('un excedente que no es efectivo se rechaza', () => {
  it('nadie devuelve vuelto de una transferencia', () => {
    const r = descontarVuelto([plin(100)], 90);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.sobra).toBe(10);
  });

  it('rechaza lo que sobra después de agotar el efectivo', () => {
    // Cobrado 105 por una venta de 90: sobran 15. Del efectivo solo se pueden
    // devolver 5, así que quedan 10 que nadie puede explicar.
    const r = descontarVuelto([efectivo(5), plin(100)], 90);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.sobra).toBe(10);
  });

  it('cuando rechaza, no devuelve pagos a medio ajustar', () => {
    // Si se aceptara el ajuste parcial, se guardaría una venta cobrada de menos.
    const originales = [efectivo(5), plin(100)];
    const r = descontarVuelto(originales, 90);
    expect(r.ok).toBe(false);
    expect(originales).toEqual([efectivo(5), plin(100)]);
  });
});
