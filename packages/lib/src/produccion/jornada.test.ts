/**
 * Pruebas del tiempo trabajado.
 *
 * Los dos casos que las motivaron son los que reportó el cliente: un registro
 * de 12:32 a 16:32 que se cobraba entero sin descontar el almuerzo, y uno del
 * 13/09 16:36 al 14/09 09:36 que cobraba las 17 horas de corrido, con la
 * planta cerrada toda la noche.
 */

import { describe, it, expect } from 'vitest';
import {
  minutosTrabajados,
  horarioSegunJornada,
  claveDia,
  type HorarioDia,
} from './jornada';

/** La jornada de planta: L-V 08:00-18:00 con 1 h, sábado corto sin refrigerio. */
const LV: HorarioDia = { inicio: '08:00', fin: '18:00', refrigerioInicio: '13:00', refrigerioMin: 60 };
const SAB: HorarioDia = { inicio: '08:00', fin: '13:00', refrigerioInicio: '13:00', refrigerioMin: 0 };
const JORNADA = horarioSegunJornada({ LUN: LV, MAR: LV, MIE: LV, JUE: LV, VIE: LV, SAB });

/** Fechas de la semana del 12/09/2026: sábado 12, domingo 13, lunes 14. */
const f = (dia: number, hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(2026, 8, dia, h!, m!, 0, 0);
};
const lunes = (hhmm: string) => f(14, hhmm);

describe('la semana está bien identificada', () => {
  it('12 sábado, 13 domingo, 14 lunes', () => {
    expect(claveDia(f(12, '10:00'))).toBe('SAB');
    expect(claveDia(f(13, '10:00'))).toBe('DOM');
    expect(claveDia(f(14, '10:00'))).toBe('LUN');
  });
});

describe('el turno que cruza el almuerzo', () => {
  it('descuenta la hora de refrigerio: el primer caso reportado', () => {
    const r = minutosTrabajados(lunes('12:32'), lunes('16:32'), JORNADA);
    expect(r.minutosBrutos).toBe(240);
    expect(r.refrigerioDescontado).toBe(60);
    expect(r.minutos).toBe(180);
  });

  it('un turno completo deja 9 horas efectivas', () => {
    expect(minutosTrabajados(lunes('08:00'), lunes('18:00'), JORNADA).minutos).toBe(540);
  });

  it('la mañana sola se cobra entera', () => {
    const r = minutosTrabajados(lunes('08:00'), lunes('12:00'), JORNADA);
    expect(r.minutos).toBe(240);
    expect(r.refrigerioDescontado).toBe(0);
  });

  it('solo se descuenta la parte del almuerzo que se solapa', () => {
    const r = minutosTrabajados(lunes('12:30'), lunes('13:30'), JORNADA);
    expect(r.refrigerioDescontado).toBe(30);
    expect(r.minutos).toBe(30);
  });
});

describe('el registro que cruza la noche', () => {
  it('no cobra la noche: el segundo caso reportado', () => {
    /*
     * 13/09 16:36 → 14/09 09:36 daba 1 020 minutos. El 13 es domingo, así que
     * de todo eso lo único dentro de la jornada es el lunes de 08:00 a 09:36.
     */
    const r = minutosTrabajados(f(13, '16:36'), f(14, '09:36'), JORNADA);
    expect(r.minutosBrutos).toBe(1020);
    expect(r.minutos).toBe(96);
    expect(r.fueraDeJornadaDescontado).toBe(924);
  });

  it('de viernes a lunes cuenta los dos días hábiles, no el fin de semana', () => {
    // Viernes 11 a las 16:00 → lunes 14 a las 10:00.
    const r = minutosTrabajados(f(11, '16:00'), f(14, '10:00'), JORNADA);
    //  viernes 16:00-18:00 = 120  ·  sábado 08:00-13:00 = 300  ·  lunes 08:00-10:00 = 120
    expect(r.minutos).toBe(540);
  });

  it('dos días seguidos completos son dos jornadas, no 48 horas', () => {
    // Lunes 08:00 → martes 18:00: 34 h de reloj, 18 h efectivas.
    const r = minutosTrabajados(f(14, '08:00'), f(15, '18:00'), JORNADA);
    expect(r.minutosBrutos).toBe(2040);
    expect(r.minutos).toBe(1080);
    expect(r.refrigerioDescontado).toBe(120);
  });
});

describe('lo que queda fuera del horario', () => {
  it('empezar antes de abrir no suma tiempo de más', () => {
    // Llegó 07:00 pero la planta abre 08:00.
    const r = minutosTrabajados(lunes('07:00'), lunes('12:00'), JORNADA);
    expect(r.minutos).toBe(240);
    expect(r.fueraDeJornadaDescontado).toBe(60);
  });

  it('quedarse después de cerrar tampoco', () => {
    const r = minutosTrabajados(lunes('16:00'), lunes('20:00'), JORNADA);
    expect(r.minutos).toBe(120);
    expect(r.fueraDeJornadaDescontado).toBe(120);
  });

  it('un turno que se pasa de hora no paga el almuerzo dos veces', () => {
    // 12:00 a 20:00: dentro de jornada 12:00-18:00 = 360, menos 60 de almuerzo.
    const r = minutosTrabajados(lunes('12:00'), lunes('20:00'), JORNADA);
    expect(r.minutos).toBe(300);
    expect(r.refrigerioDescontado).toBe(60);
  });

  it('un domingo entero no aporta minutos', () => {
    const r = minutosTrabajados(f(13, '09:00'), f(13, '18:00'), JORNADA);
    expect(r.minutos).toBe(0);
    expect(r.minutosBrutos).toBe(540);
    expect(r.fueraDeJornadaDescontado).toBe(540);
  });

  it('el sábado corto se cobra completo y sin refrigerio', () => {
    expect(minutosTrabajados(f(12, '08:00'), f(12, '13:00'), JORNADA).minutos).toBe(300);
  });

  it('el sábado por la tarde no cuenta: la planta ya cerró', () => {
    expect(minutosTrabajados(f(12, '14:00'), f(12, '18:00'), JORNADA).minutos).toBe(0);
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
    expect(minutosTrabajados(new Date('nada'), lunes('12:00'), JORNADA).minutos).toBe(0);
  });

  it('una hora mal escrita en la configuración no rompe: ese día no cuenta', () => {
    const rota = horarioSegunJornada({ LUN: { inicio: '25:99', fin: '18:00', refrigerioInicio: '13:00', refrigerioMin: 60 } });
    expect(minutosTrabajados(lunes('12:00'), lunes('16:00'), rota).minutos).toBe(0);
  });

  it('un horario invertido en la configuración tampoco', () => {
    const rota = horarioSegunJornada({ LUN: { inicio: '18:00', fin: '08:00', refrigerioInicio: '13:00', refrigerioMin: 60 } });
    expect(minutosTrabajados(lunes('12:00'), lunes('16:00'), rota).minutos).toBe(0);
  });

  it('sin jornada configurada no inventa horas', () => {
    expect(minutosTrabajados(lunes('12:32'), lunes('16:32'), horarioSegunJornada({})).minutos).toBe(0);
  });

  it('un intervalo absurdo de años no se cuelga', () => {
    // Alguien tecleó 2027 en vez de 2026: se corta a 31 días y devuelve algo.
    const r = minutosTrabajados(lunes('08:00'), new Date(2027, 8, 14, 18, 0), JORNADA);
    expect(Number.isFinite(r.minutos)).toBe(true);
    expect(r.minutos).toBeGreaterThan(0);
  });
});
