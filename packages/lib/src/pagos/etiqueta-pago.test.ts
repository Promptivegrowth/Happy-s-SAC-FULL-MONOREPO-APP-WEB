/**
 * Pruebas del nombre de un pago.
 *
 * Lo que motivó el módulo: la vendedora cobra un Plin al Continental y otro
 * Yape al BCP, y el voucher decía "Transferencia" en los dos. Los casos de acá
 * son los datos reales que hay hoy en ventas_pagos.
 */

import { describe, it, expect } from 'vitest';
import {
  nombreMetodo,
  cuentaDePago,
  etiquetaPago,
  agruparPorCuenta,
} from './etiqueta-pago';

describe('el nombre del pago', () => {
  it('dice el método y la cuenta, que es lo que faltaba', () => {
    expect(etiquetaPago('PLIN', 'CONTINENTAL - PLIN HAPPYS'))
      .toBe('Plin · CONTINENTAL - PLIN HAPPYS');
    expect(etiquetaPago('TRANSFERENCIA', 'BCP JAVIER'))
      .toBe('Transferencia · BCP JAVIER');
  });

  it('el efectivo no repite "EFECTIVO" dos veces', () => {
    // Así está guardado en la base: el método y la referencia dicen lo mismo.
    expect(etiquetaPago('EFECTIVO', 'EFECTIVO')).toBe('Efectivo');
    expect(cuentaDePago('EFECTIVO', 'EFECTIVO')).toBeNull();
  });

  it('un pago sin cuenta sale solo con su método', () => {
    expect(etiquetaPago('EFECTIVO', null)).toBe('Efectivo');
    expect(etiquetaPago('YAPE', '')).toBe('Yape');
    expect(etiquetaPago('YAPE', '   ')).toBe('Yape');
  });

  it('el saldo a favor aplicado se distingue de una cuenta de banco', () => {
    // "ADELANTO" no es un banco, pero sí explica de dónde salió la plata.
    expect(etiquetaPago('CREDITO', 'ADELANTO')).toBe('Crédito · ADELANTO');
  });

  it('no repite el método cuando el nombre de la cuenta ya lo dice', () => {
    /*
     * La cuenta de Yape se llama "YAPE (BCP HAPPYS)" porque el botón del POS
     * tiene que decir Yape para que la cajera lo encuentre. Pegado al método
     * daría "Yape · YAPE (BCP HAPPYS)".
     */
    expect(etiquetaPago('YAPE', 'YAPE (BCP HAPPYS)')).toBe('Yape · BCP HAPPYS');
    expect(cuentaDePago('YAPE', 'YAPE (BCP HAPPYS)')).toBe('BCP HAPPYS');
  });

  it('solo quita el método si está al principio del nombre', () => {
    // Acá "PLIN" es parte del nombre de la cuenta, no un prefijo suelto.
    expect(etiquetaPago('PLIN', 'CONTINENTAL - PLIN HAPPYS'))
      .toBe('Plin · CONTINENTAL - PLIN HAPPYS');
  });

  it('un nombre que es solo el método no deja la cuenta vacía', () => {
    expect(etiquetaPago('YAPE', 'YAPE')).toBe('Yape');
    expect(etiquetaPago('YAPE', 'YAPE ()')).toBe('Yape');
  });

  it('traduce los métodos a algo legible', () => {
    expect(nombreMetodo('TARJETA_CREDITO')).toBe('Tarjeta crédito');
    expect(nombreMetodo('DEPOSITO')).toBe('Depósito');
    expect(nombreMetodo('WHATSAPP_PENDIENTE')).toBe('WhatsApp pendiente');
  });

  it('un método desconocido no rompe nada ni sale vacío', () => {
    expect(nombreMetodo('CRIPTO')).toBe('CRIPTO');
    expect(nombreMetodo('')).toBe('Otro');
  });
});

describe('los totales por cuenta', () => {
  it('separa dos cuentas aunque el método sea el mismo', () => {
    // Este es el punto del pedido: el cierre sumaba todas las transferencias
    // juntas y no se sabía cuál banco había que cuadrar.
    const filas = agruparPorCuenta([
      { metodo: 'TRANSFERENCIA', referencia: 'BCP JAVIER', monto: 100 },
      { metodo: 'TRANSFERENCIA', referencia: 'CONTINENTAL HAPPYS', monto: 50 },
      { metodo: 'TRANSFERENCIA', referencia: 'BCP JAVIER', monto: 25 },
    ]);
    expect(filas.length).toBe(2);
    expect(filas[0]).toMatchObject({ cuenta: 'BCP JAVIER', monto: 125, cantidad: 2 });
    expect(filas[1]).toMatchObject({ cuenta: 'CONTINENTAL HAPPYS', monto: 50, cantidad: 1 });
  });

  it('separa Yape de Plin aunque caigan en la misma cuenta', () => {
    const filas = agruparPorCuenta([
      { metodo: 'YAPE', referencia: 'BCP HAPPYS', monto: 30 },
      { metodo: 'PLIN', referencia: 'BCP HAPPYS', monto: 20 },
    ]);
    expect(filas.length).toBe(2);
    expect(filas.map((f) => f.etiqueta))
      .toEqual(['Yape · BCP HAPPYS', 'Plin · BCP HAPPYS']);
  });

  it('el efectivo queda en un solo renglón, con o sin referencia', () => {
    const filas = agruparPorCuenta([
      { metodo: 'EFECTIVO', referencia: 'EFECTIVO', monto: 10 },
      { metodo: 'EFECTIVO', referencia: null, monto: 5 },
    ]);
    expect(filas.length).toBe(1);
    expect(filas[0]).toMatchObject({ etiqueta: 'Efectivo', monto: 15, cantidad: 2 });
  });

  it('suma montos que llegan como texto desde la base', () => {
    // Supabase devuelve numeric como string; sumarlos sin convertir concatena.
    const filas = agruparPorCuenta([
      { metodo: 'YAPE', referencia: 'BCP HAPPYS', monto: '10.50' },
      { metodo: 'YAPE', referencia: 'BCP HAPPYS', monto: '4.50' },
    ]);
    expect(filas[0]!.monto).toBe(15);
  });

  it('el total por cuenta coincide con el total general', () => {
    const pagos = [
      { metodo: 'EFECTIVO', referencia: 'EFECTIVO', monto: 1264 },
      { metodo: 'PLIN', referencia: 'CONTINENTAL - PLIN HAPPYS', monto: 715 },
      { metodo: 'TRANSFERENCIA', referencia: 'BCP JAVIER', monto: 1165 },
    ];
    const filas = agruparPorCuenta(pagos);
    const suma = filas.reduce((s, f) => s + f.monto, 0);
    expect(suma).toBe(3144);
  });

  it('sin pagos no inventa renglones', () => {
    expect(agruparPorCuenta([])).toEqual([]);
  });
});
