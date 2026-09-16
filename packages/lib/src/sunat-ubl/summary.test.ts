/**
 * Pruebas del Resumen Diario, con foco en las anulaciones.
 *
 * Las boletas no se dan de baja de a una: la anulación viaja dentro de este
 * mismo resumen, marcada con la condición "3". Si esa marca sale mal, pasa lo
 * peor que puede pasar con SUNAT: el resumen se acepta igual y la boleta
 * anulada queda declarada como válida. Nadie se entera hasta que llega una
 * observación meses después.
 */

import { describe, it, expect } from 'vitest';
import { generarUBLResumenBoletas, type ResumenBoletaLinea } from './summary';

const EMISOR = {
  ruc: '20603133545',
  razonSocial: "HAPPY'S S.A.C.",
  direccionFiscal: 'JR. HUALLAGA 726 INT. 150',
  ubigeo: '150101',
};

const LINEA_BASE: ResumenBoletaLinea = {
  tipoDoc: '03',
  serieNumero: 'B005-00004021',
  clienteTipoDoc: '1',
  clienteNumeroDoc: '12345678',
  condicion: '1',
  total: 65,
  gravado: 55.08,
  igv: 9.92,
};

function armar(lineas: ResumenBoletaLinea[]) {
  return generarUBLResumenBoletas({
    correlativo: 1,
    fechaReferencia: '2026-09-15',
    fechaGeneracion: '2026-09-16',
    emisor: EMISOR,
    lineas,
  });
}

/** El bloque XML de una boleta puntual, para mirarlo aparte. */
function bloqueDe(xml: string, serieNumero: string): string {
  const partes = xml.split('<sac:SummaryDocumentsLine>');
  const bloque = partes.find((p) => p.includes(serieNumero));
  if (!bloque) throw new Error(`No hay bloque para ${serieNumero}`);
  return bloque.split('</sac:SummaryDocumentsLine>')[0] ?? '';
}

describe('la marca de anulación', () => {
  it('una boleta normal viaja como "adicionar"', () => {
    const { xml } = armar([LINEA_BASE]);
    expect(bloqueDe(xml, 'B005-00004021')).toContain('<cbc:ConditionCode>1</cbc:ConditionCode>');
  });

  it('una boleta anulada viaja como "anular"', () => {
    // El 3 es lo único que le dice a SUNAT que esa boleta no vale.
    const { xml } = armar([{ ...LINEA_BASE, condicion: '3' }]);
    expect(bloqueDe(xml, 'B005-00004021')).toContain('<cbc:ConditionCode>3</cbc:ConditionCode>');
  });

  it('en un mismo resumen conviven las nuevas y las anuladas, cada una con lo suyo', () => {
    /*
     * Es el caso real: una boleta se emite y se anula el mismo día, antes de
     * las 23:00. Las dos tienen que ir en el resumen de esa noche, y una sola
     * de ellas marcada como anulada.
     */
    const { xml } = armar([
      { ...LINEA_BASE, serieNumero: 'B005-00004021', condicion: '1' },
      { ...LINEA_BASE, serieNumero: 'B005-00004022', condicion: '3', total: 120 },
      { ...LINEA_BASE, serieNumero: 'B005-00004023', condicion: '1', total: 40 },
    ]);
    expect(bloqueDe(xml, 'B005-00004021')).toContain('<cbc:ConditionCode>1</cbc:ConditionCode>');
    expect(bloqueDe(xml, 'B005-00004022')).toContain('<cbc:ConditionCode>3</cbc:ConditionCode>');
    expect(bloqueDe(xml, 'B005-00004023')).toContain('<cbc:ConditionCode>1</cbc:ConditionCode>');

    // Y las tres están: ninguna se pierde por el camino.
    expect((xml.match(/<sac:SummaryDocumentsLine>/g) ?? []).length).toBe(3);
  });

  it('la boleta anulada conserva su importe', () => {
    // SUNAT compara contra lo que se le declaró antes; mandarla en cero sería
    // decirle que la boleta existió por S/ 0.00, no que se anuló.
    const bloque = bloqueDe(armar([{ ...LINEA_BASE, condicion: '3' }]).xml, 'B005-00004021');
    expect(bloque).toContain('65');
  });
});

describe('los datos que identifican el resumen', () => {
  it('el nombre del archivo es el que SUNAT espera', () => {
    const { id, nombreArchivo } = armar([LINEA_BASE]);
    // RC-{fecha de generación}-{correlativo}; el archivo lleva el RUC delante.
    expect(id).toBe('RC-20260916-1');
    expect(nombreArchivo).toBe('20603133545-RC-20260916-1');
  });

  it('distingue la fecha del día informado de la del envío', () => {
    // Se informa el 15 pero se manda el 16: son dos fechas distintas y el XML
    // tiene que llevar las dos. Confundirlas fue el error que hizo repetir
    // correlativos cuando se informaban varios días en una misma jornada.
    const { xml } = armar([LINEA_BASE]);
    expect(xml).toContain('<cbc:ReferenceDate>2026-09-15</cbc:ReferenceDate>');
    expect(xml).toContain('<cbc:IssueDate>2026-09-16</cbc:IssueDate>');
  });

  it('lleva el RUC del emisor', () => {
    expect(armar([LINEA_BASE]).xml).toContain('20603133545');
  });
});

describe('cosas que no pueden salir mal en el XML', () => {
  it('escapa los caracteres que romperían el documento', () => {
    // Una razón social con "&" convierte el XML en basura y SUNAT lo rechaza
    // sin decir por qué.
    const { xml } = generarUBLResumenBoletas({
      correlativo: 1,
      fechaReferencia: '2026-09-15',
      fechaGeneracion: '2026-09-16',
      emisor: { ...EMISOR, razonSocial: 'PEPE & HIJOS <S.A.C.>' },
      lineas: [LINEA_BASE],
    });
    expect(xml).toContain('PEPE &amp; HIJOS &lt;S.A.C.&gt;');
    expect(xml).not.toContain('PEPE & HIJOS');
  });

  it('el correlativo del día se refleja en el identificador', () => {
    const segundo = generarUBLResumenBoletas({
      correlativo: 2,
      fechaReferencia: '2026-09-14',
      fechaGeneracion: '2026-09-16',
      emisor: EMISOR,
      lineas: [LINEA_BASE],
    });
    // Dos resúmenes el mismo día no pueden llamarse igual: producción los
    // rechaza por duplicado.
    expect(segundo.id).toBe('RC-20260916-2');
  });
});
