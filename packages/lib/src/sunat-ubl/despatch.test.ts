import { describe, expect, it } from 'vitest';
import { generarUBLDespatch, validarGuia, type GuiaRemisionInput } from './despatch';

/*
 * Las reglas de acá se comprobaron enviando guías al ambiente de pruebas de la
 * API GRE (28/09/2026): cada caso que SUNAT rechazaba tiene su prueba, para que
 * no vuelva a pasar por un cambio en el generador.
 */

const hoy = '2026-09-28';
const base: GuiaRemisionInput = {
  serie: 'T001', numero: 1, fechaEmision: hoy, horaEmision: '10:30:00',
  emisor: { ruc: '20603133545', razonSocial: "HAPPY'S S.A.C." },
  destinatario: { tipoDoc: '1', numDoc: '46027897', nombre: 'GISELA PRUEBA' },
  motivo: '01', modalidad: '01', fechaTraslado: hoy, pesoBrutoKg: 12.5, numBultos: 2,
  transportista: { ruc: '20601234567', razonSocial: 'AGENCIA PRUEBA S.A.C.' },
  partida: { ubigeo: '150101', direccion: 'Jr. Huallaga 726 Int. 150, Lima' },
  llegada: { ubigeo: '200104', direccion: 'Agencia Shalom Castilla' },
  items: [{ codigo: 'X1', descripcion: 'DISFRAZ PISTOLA TALLA M', cantidad: 3 }],
};

describe('generarUBLDespatch', () => {
  it('nombra el archivo y el número como los pide SUNAT', () => {
    const r = generarUBLDespatch(base);
    expect(r.numeroCompleto).toBe('T001-00000001');
    expect(r.nombreArchivo).toBe('20603133545-09-T001-00000001');
    expect(r.xml).toContain('<cbc:DespatchAdviceTypeCode');
    expect(r.xml).toContain('>09</cbc:DespatchAdviceTypeCode>');
  });

  it('con agencia lleva la fecha de entrega a la agencia (error 3617 sin ella)', () => {
    const xml = generarUBLDespatch({ ...base, fechaEntregaTransportista: '2026-09-29' }).xml;
    expect(xml).toMatch(/<cac:LoadingTransportEvent>\s*<cbc:OccurrenceDate>2026-09-29<\/cbc:OccurrenceDate>/);
    // Sin fecha explícita usa la de inicio del traslado.
    expect(generarUBLDespatch(base).xml).toContain(`<cbc:OccurrenceDate>${hoy}</cbc:OccurrenceDate>`);
  });

  it('con vehículo propio no lleva transportista, sí placa y conductor', () => {
    const xml = generarUBLDespatch({
      ...base, modalidad: '02', transportista: undefined, vehiculoPlaca: 'abc-123',
      conductor: { tipoDoc: '1', numDoc: '12345678', nombres: 'JUAN', apellidos: 'PEREZ', licencia: 'q123' },
    }).xml;
    expect(xml).not.toContain('CarrierParty');
    expect(xml).not.toContain('LoadingTransportEvent');
    expect(xml).toContain('<cbc:ID>ABC123</cbc:ID>');
    expect(xml).toContain('<cbc:ID>Q123</cbc:ID>');
  });

  it('protege los textos con caracteres especiales', () => {
    const xml = generarUBLDespatch({ ...base, items: [{ descripcion: 'MÁSCARA "X" & <Y> ]]> fin', cantidad: 1 }] }).xml;
    expect(xml).toContain('<![CDATA[MÁSCARA "X" & <Y> ]]]]><![CDATA[> fin]]>');
  });

  it('relaciona la boleta o factura de la venta', () => {
    const xml = generarUBLDespatch({ ...base, documentoRelacionado: { tipo: '03', serieNumero: 'B005-0004020' } }).xml;
    expect(xml).toContain('<cbc:ID>B005-0004020</cbc:ID>');
    expect(xml).toContain('Boleta de Venta');
  });
});

describe('validarGuia', () => {
  it('una venta con agencia completa pasa', () => {
    expect(validarGuia(base, hoy)).toEqual([]);
  });

  it('pide RUC y razón social de la agencia', () => {
    expect(validarGuia({ ...base, transportista: undefined }, hoy).join(' ')).toMatch(/RUC de la empresa de transporte/);
  });

  it('no deja la entrega a la agencia antes de hoy (error 3618)', () => {
    expect(validarGuia({ ...base, fechaEntregaTransportista: '2026-09-27' }, hoy).join(' ')).toMatch(/entrega a la agencia/);
  });

  it('traslado propio exige los dos códigos de establecimiento (errores 3365 / 3369)', () => {
    const t04: GuiaRemisionInput = {
      ...base, motivo: '04', modalidad: '02', transportista: undefined, vehiculoM1L: true,
      destinatario: { tipoDoc: '6', numDoc: '20603133545', nombre: "HAPPY'S S.A.C." },
    };
    expect(validarGuia(t04, hoy).join(' ')).toMatch(/códigos de establecimiento/);
    expect(validarGuia({
      ...t04,
      partida: { ...t04.partida, codigoEstablecimiento: '0000' },
      llegada: { ...t04.llegada, codigoEstablecimiento: '0001' },
    }, hoy)).toEqual([]);
  });

  it('una venta no puede ir a nombre de la misma empresa', () => {
    const r = validarGuia({ ...base, destinatario: { tipoDoc: '6', numDoc: '20603133545', nombre: 'X' } }, hoy);
    expect(r.join(' ')).toMatch(/misma empresa/);
  });

  it('pide peso y documento válido', () => {
    const r = validarGuia({ ...base, pesoBrutoKg: 0, destinatario: { tipoDoc: '1', numDoc: '123', nombre: 'X' } }, hoy);
    expect(r.join(' ')).toMatch(/peso bruto/);
    expect(r.join(' ')).toMatch(/DNI del destinatario/);
  });
});
