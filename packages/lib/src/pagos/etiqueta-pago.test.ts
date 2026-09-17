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
  arqueoPorCuenta,
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
    expect(etiquetaPago('YAPE', 'YAPE (BCP HAPPYS)')).toBe('YAPE (BCP HAPPYS)');
    // Y el nombre del botón queda entero, sin que nadie le recorte nada.
    expect(cuentaDePago('YAPE', 'YAPE (BCP HAPPYS)')).toBe('YAPE (BCP HAPPYS)');
  });

  it('solo quita el método si está al principio del nombre', () => {
    // Acá "PLIN" es parte del nombre de la cuenta, no un prefijo suelto.
    expect(etiquetaPago('PLIN', 'CONTINENTAL - PLIN HAPPYS'))
      .toBe('Plin · CONTINENTAL - PLIN HAPPYS');
  });

  it('un nombre que es solo el método no lo dice dos veces', () => {
    expect(etiquetaPago('YAPE', 'YAPE')).toBe('Yape');
  });

  it('el método aporta cuando el nombre de la cuenta no lo dice', () => {
    // "BCP JAVIER" por sí solo no cuenta que fue una transferencia.
    expect(etiquetaPago('TRANSFERENCIA', 'BCP JAVIER')).toBe('Transferencia · BCP JAVIER');
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

describe('el arqueo con los botones de la ventana de venta', () => {
  /** Los botones tal como están hoy en el POS, en su orden. */
  const BOTONES = [
    { nombre_corto: 'EFECTIVO', metodo_default: 'EFECTIVO' },
    { nombre_corto: 'CONTINENTAL - PLIN HAPPYS', metodo_default: 'PLIN' },
    { nombre_corto: 'BCP HAPPYS', metodo_default: 'TRANSFERENCIA' },
    { nombre_corto: 'YAPE (BCP HAPPYS)', metodo_default: 'YAPE' },
    { nombre_corto: 'BCP JAVIER', metodo_default: 'TRANSFERENCIA' },
    { nombre_corto: 'INTERBANK JAVIER', metodo_default: 'TRANSFERENCIA' },
  ];

  it('los renglones son los botones, en el mismo orden y con el mismo texto', () => {
    // El cierre mostraba Efectivo/Yape/Plin/Tarjeta/Transferencia, que no es
    // lo que la cajera toca. Ahora el papel y la pantalla dicen lo mismo.
    const filas = arqueoPorCuenta(BOTONES, []);
    expect(filas.map((f) => f.etiqueta)).toEqual([
      'EFECTIVO',
      'CONTINENTAL - PLIN HAPPYS',
      'BCP HAPPYS',
      'YAPE (BCP HAPPYS)',
      'BCP JAVIER',
      'INTERBANK JAVIER',
    ]);
  });

  it('un botón sin movimiento sale en cero, no desaparece', () => {
    // "Por acá no entró nada" es información, y deja dos turnos comparables.
    const filas = arqueoPorCuenta(BOTONES, [
      { metodo: 'PLIN', referencia: 'CONTINENTAL - PLIN HAPPYS', monto: 365 },
    ]);
    expect(filas.length).toBe(6);
    expect(filas.find((f) => f.etiqueta === 'BCP JAVIER')).toMatchObject({ monto: 0, cantidad: 0 });
  });

  it('separa las dos cuentas de transferencia, que era el punto', () => {
    // El ticket decía "Transferencia S/ 810" con dos bancos posibles.
    const filas = arqueoPorCuenta(BOTONES, [
      { metodo: 'TRANSFERENCIA', referencia: 'BCP JAVIER', monto: 500 },
      { metodo: 'TRANSFERENCIA', referencia: 'INTERBANK JAVIER', monto: 310 },
    ]);
    expect(filas.find((f) => f.etiqueta === 'BCP JAVIER')!.monto).toBe(500);
    expect(filas.find((f) => f.etiqueta === 'INTERBANK JAVIER')!.monto).toBe(310);
    expect(filas.find((f) => f.etiqueta === 'BCP HAPPYS')!.monto).toBe(0);
  });

  it('el efectivo entra con referencia o sin ella', () => {
    // En la base conviven las dos formas: "EFECTIVO" y nulo.
    const filas = arqueoPorCuenta(BOTONES, [
      { metodo: 'EFECTIVO', referencia: 'EFECTIVO', monto: 600 },
      { metodo: 'EFECTIVO', referencia: null, monto: 203 },
    ]);
    expect(filas[0]).toMatchObject({ etiqueta: 'EFECTIVO', monto: 803, cantidad: 2 });
  });

  it('nada se pierde: un cobro de una cuenta ya oculta igual aparece', () => {
    const filas = arqueoPorCuenta(BOTONES, [
      { metodo: 'TRANSFERENCIA', referencia: 'CUENTA VIEJA', monto: 40 },
      { metodo: 'CREDITO', referencia: 'ADELANTO', monto: 25 },
    ]);
    expect(filas.map((f) => f.etiqueta)).toContain('CUENTA VIEJA');
    expect(filas.map((f) => f.etiqueta)).toContain('ADELANTO');
    expect(filas.reduce((s, f) => s + f.monto, 0)).toBe(65);
  });

  it('el total del arqueo es el total cobrado, sin contar dos veces', () => {
    // Un cobro no puede caer en dos renglones: si cuadrara de más, el arqueo
    // mostraría plata que no existe.
    const pagos = [
      { metodo: 'EFECTIVO', referencia: 'EFECTIVO', monto: 803 },
      { metodo: 'PLIN', referencia: 'CONTINENTAL - PLIN HAPPYS', monto: 365 },
      { metodo: 'TRANSFERENCIA', referencia: 'BCP JAVIER', monto: 810 },
    ];
    const filas = arqueoPorCuenta(BOTONES, pagos);
    expect(filas.reduce((s, f) => s + f.monto, 0)).toBe(1978);
    expect(filas.reduce((s, f) => s + f.cantidad, 0)).toBe(3);
  });

  it('no distingue mayúsculas al cruzar con el botón', () => {
    const filas = arqueoPorCuenta(BOTONES, [
      { metodo: 'TRANSFERENCIA', referencia: 'bcp javier', monto: 10 },
    ]);
    expect(filas.find((f) => f.etiqueta === 'BCP JAVIER')!.monto).toBe(10);
  });
});
