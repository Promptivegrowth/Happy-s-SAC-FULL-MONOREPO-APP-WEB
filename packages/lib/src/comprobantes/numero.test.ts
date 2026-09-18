/**
 * Pruebas de las formas en que se puede escribir el número de un comprobante.
 *
 * El caso real: un cliente volvió a cambiar una talla con un ticket que decía
 * 005-0011476, y el sistema lo tenía guardado como 005-00011476. Un cero de
 * diferencia y el documento aparecía como inexistente.
 */

import { describe, it, expect } from 'vitest';
import { variantesDeNumero } from './numero';

describe('encontrar un comprobante escrito de otra manera', () => {
  it('el ticket viejo de 7 dígitos encuentra al guardado con 8', () => {
    // Este es exactamente el papel que trajo el cliente el 17/09/2026.
    expect(variantesDeNumero('005-0011476')).toContain('005-00011476');
  });

  it('y al revés: lo guardado encuentra a lo impreso', () => {
    expect(variantesDeNumero('005-00011476')).toContain('005-0011476');
  });

  it('siempre incluye lo que la persona escribió, tal cual', () => {
    expect(variantesDeNumero('B005-00004032')).toContain('B005-00004032');
  });

  it('sirve para boletas y facturas, no solo para notas', () => {
    expect(variantesDeNumero('B005-0004032')).toContain('B005-00004032');
    expect(variantesDeNumero('F005-0000190')).toContain('F005-00000190');
  });

  it('acepta que alguien escriba el número sin ceros adelante', () => {
    // Es lo que hace cualquiera que lo tipea de memoria.
    const v = variantesDeNumero('B005-4032');
    expect(v).toContain('B005-00004032');
  });

  it('no confunde dos comprobantes distintos', () => {
    // 4032 y 40320 son documentos diferentes: ninguna variante puede cruzarlos.
    expect(variantesDeNumero('B005-4032')).not.toContain('B005-00040320');
  });

  it('lo que se escribió va siempre primero y tal cual', () => {
    /*
     * Un número de venta como VEN-000033 también tiene forma de "serie-número",
     * así que genera variantes. No molesta —ninguna coincide con un comprobante
     * y la búsqueda por número de venta va aparte— pero lo escrito tiene que
     * estar, y estar primero.
     */
    expect(variantesDeNumero('VEN-000033')[0]).toBe('VEN-000033');
  });

  it('un texto sin forma de número no genera nada de más', () => {
    expect(variantesDeNumero('HOLA')).toEqual(['HOLA']);
    expect(variantesDeNumero('')).toEqual(['']);
  });

  it('no devuelve duplicados cuando las formas coinciden', () => {
    const v = variantesDeNumero('B005-00004032');
    expect(new Set(v).size).toBe(v.length);
  });
});
