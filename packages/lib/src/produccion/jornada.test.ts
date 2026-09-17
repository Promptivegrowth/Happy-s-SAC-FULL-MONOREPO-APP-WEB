/**
 * Pruebas del tiempo trabajado.
 *
 * El caso que las motivó es el que reportó el cliente: un registro de 12:32 a
 * 16:32 que el sistema cobraba como 240 minutos sin descontar el almuerzo.
 */

import { describe, it, expect } from 'vitest';
import {
  minutosTrabajados,
  refrigerioSegunJornada,
  claveDia,
  type Refrigerio,
} from './jornada';

/** La jornada de planta: 1 h de refrigerio de lunes a viernes, sábado sin. */
const ALMUERZO: Refrigerio = { inicio: '13:00', minutos: 60 };
const JORNADA = refrigerioSegunJornada({
  LUN: ALMUERZO, MAR: ALMUERZO, MIE: ALMUERZO, JUE: ALMUERZO, VIE: ALMUERZO,
  SAB: { inicio: '13:00', minutos: 0 },
});

/** Un día de semana (lunes 14/09/2026) a la hora indicada. */
const lunes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(2026, 8, 14, h!, m!, 0, 0);
};

describe('el turno que cruza el almuerzo', () => {
  it('descuenta la hora de refrigerio: el caso reportado', () => {
    // 12:32 → 16:32 son 4 horas de reloj, pero una se fue en almorzar.
    const r = minutosTrabajados(lunes('12:32'), lunes('16:32'), JORNADA);
    expect(r.minutosBrutos).toBe(240);
    expect(r.refrigerioDescontado).toBe(60);
    expect(r.minutos).toBe(180);
  });

  it('un turno completo descuenta una sola hora', () => {
    const r = minutosTrabajados(lunes('08:00'), lunes('18:00'), JORNADA);
    expect(r.minutos).toBe(540);   // 10 h de reloj, 9 efectivas
  });
});

describe('el turno que NO cruza el almuerzo', () => {
  it('la mañana se cobra entera', () => {
    // Restar una hora fija acá sería cambiar un error por otro.
    const r = minutosTrabajados(lunes('08:00'), lunes('12:00'), JORNADA);
    expect(r.minutos).toBe(240);
    expect(r.refrigerioDescontado).toBe(0);
  });

  it('la tarde después de comer se cobra entera', () => {
    const r = minutosTrabajados(lunes('14:00'), lunes('18:00'), JORNADA);
    expect(r.minutos).toBe(240);
  });

  it('terminar justo cuando empieza el almuerzo no descuenta nada', () => {
    const r = minutosTrabajados(lunes('11:00'), lunes('13:00'), JORNADA);
    expect(r.minutos).toBe(120);
  });

  it('empezar justo cuando termina no descuenta nada', () => {
    const r = minutosTrabajados(lunes('14:00'), lunes('15:00'), JORNADA);
    expect(r.minutos).toBe(60);
  });
});

describe('cuando el turno cruza el almuerzo a medias', () => {
  it('solo se descuenta la parte que se solapa', () => {
    // 12:30 → 13:30: media hora de trabajo y media de almuerzo.
    const r = minutosTrabajados(lunes('12:30'), lunes('13:30'), JORNADA);
    expect(r.refrigerioDescontado).toBe(30);
    expect(r.minutos).toBe(30);
  });

  it('un registro entero dentro del almuerzo queda en cero, no en negativo', () => {
    // Pasa cuando alguien se equivoca de hora. Cero es raro y se ve; un
    // número negativo se propaga al costo y nadie lo nota.
    const r = minutosTrabajados(lunes('13:10'), lunes('13:40'), JORNADA);
    expect(r.minutos).toBe(0);
    expect(r.refrigerioDescontado).toBe(30);
  });
});

describe('los días sin refrigerio', () => {
  it('el sábado se cobra completo', () => {
    // Sábado 12/09/2026, 08:00 a 13:00: la jornada corta no tiene almuerzo.
    const sab = (h: number) => new Date(2026, 8, 12, h, 0, 0, 0);
    expect(claveDia(sab(8))).toBe('SAB');
    expect(minutosTrabajados(sab(8), sab(13), JORNADA).minutos).toBe(300);
  });

  it('un domingo, que no está en la jornada, no descuenta nada', () => {
    const dom = (h: number) => new Date(2026, 8, 13, h, 0, 0, 0);
    expect(minutosTrabajados(dom(9), dom(15), JORNADA).minutos).toBe(360);
  });
});

describe('entradas que podrían romper el cálculo', () => {
  it('fin anterior al inicio da cero, no un número negativo', () => {
    expect(minutosTrabajados(lunes('16:00'), lunes('12:00'), JORNADA).minutos).toBe(0);
  });

  it('inicio igual a fin da cero', () => {
    expect(minutosTrabajados(lunes('10:00'), lunes('10:00'), JORNADA).minutos).toBe(0);
  });

  it('una fecha inválida no propaga NaN al costo', () => {
    const r = minutosTrabajados(new Date('nada'), lunes('12:00'), JORNADA);
    expect(r.minutos).toBe(0);
  });

  it('una hora mal escrita en la configuración se ignora, no rompe', () => {
    const rota = refrigerioSegunJornada({ LUN: { inicio: '25:99', minutos: 60 } });
    const r = minutosTrabajados(lunes('12:00'), lunes('16:00'), rota);
    expect(r.minutos).toBe(240);
    expect(r.refrigerioDescontado).toBe(0);
  });

  it('sin refrigerio configurado se comporta como antes del cambio', () => {
    const sinNada = refrigerioSegunJornada({});
    expect(minutosTrabajados(lunes('12:32'), lunes('16:32'), sinNada).minutos).toBe(240);
  });
});

describe('un registro que cruza la medianoche', () => {
  it('mira el almuerzo de los dos días', () => {
    // Raro, pero si pasa, descontar uno solo sería cobrar de más.
    const r = minutosTrabajados(
      new Date(2026, 8, 14, 12, 0), // lunes 12:00
      new Date(2026, 8, 15, 14, 0), // martes 14:00
      JORNADA,
    );
    expect(r.refrigerioDescontado).toBe(120);
  });
});
