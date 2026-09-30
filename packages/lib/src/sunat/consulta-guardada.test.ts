import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { consultarDocumento } from './consulta-guardada';

/*
 * Lo que importa acá es cuántas veces se llama a Decolecta: cada llamada gasta
 * una de las 1.000 consultas del mes. Se simula la base con dos tablas en
 * memoria y se cuenta cada fetch.
 */

type Fila = Record<string, unknown>;

function baseFalsa(inicial: { documentos?: Fila[]; clientes?: Fila[] } = {}) {
  const tablas: Record<string, Fila[]> = {
    documentos_consultados: [...(inicial.documentos ?? [])],
    clientes: [...(inicial.clientes ?? [])],
  };
  const consulta = (tabla: string) => {
    const filtros: Array<[string, unknown]> = [];
    const q = {
      select: () => q,
      eq: (c: string, v: unknown) => { filtros.push([c, v]); return q; },
      limit: () => q,
      maybeSingle: async () => ({ data: tablas[tabla]!.find((f) => filtros.every(([c, v]) => f[c] === v)) ?? null }),
      upsert: async (fila: Fila) => {
        const i = tablas[tabla]!.findIndex((f) => f.tipo === fila.tipo && f.numero === fila.numero);
        if (i >= 0) tablas[tabla]![i] = fila; else tablas[tabla]!.push(fila);
        return { error: null };
      },
    };
    return q;
  };
  return { sb: { from: consulta }, tablas };
}

const diasAtras = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
let llamadas = 0;

function decolectaResponde(status: number, cuerpo: unknown) {
  llamadas = 0;
  vi.stubGlobal('fetch', vi.fn(async () => {
    llamadas++;
    await new Promise((r) => setTimeout(r, 5));
    return new Response(typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo), { status });
  }));
}

const RUC_OK = { numero_documento: '20100070970', razon_social: 'SUPERMERCADOS PERUANOS S.A.', direccion: 'AV. X 123' };
const DNI_OK = { document_number: '46027897', first_name: 'GISELA', first_last_name: 'PRUEBA', second_last_name: 'X', full_name: 'GISELA PRUEBA X' };

beforeEach(() => { process.env.DECOLECTA_TOKEN = 'token-de-prueba'; });
afterEach(() => { vi.unstubAllGlobals(); });

describe('consultarDocumento: no gastar cupo en clientes repetidos', () => {
  it('un RUC de un cliente registrado no consulta a SUNAT', async () => {
    decolectaResponde(200, RUC_OK);
    const { sb } = baseFalsa({ clientes: [{ numero_documento: '20100070970', razon_social: 'CLIENTE REGISTRADO SAC', direccion: 'JR. Y 45' }] });
    const r = await consultarDocumento(sb, 'ruc', '20100070970');
    expect(r.fuente).toBe('clientes');
    expect(llamadas).toBe(0);
  });

  it('un RUC consultado hace 200 días sale de lo guardado', async () => {
    decolectaResponde(200, RUC_OK);
    const { sb } = baseFalsa({ documentos: [{ tipo: 'ruc', numero: '20100070970', datos: { numero: '20100070970', razonSocial: 'GUARDADA' }, consultado_en: diasAtras(200) }] });
    const r = await consultarDocumento(sb, 'ruc', '20100070970');
    expect(r.fuente).toBe('guardado');
    expect(llamadas).toBe(0);
  });

  it('un DNI que no existe se consulta una sola vez', async () => {
    decolectaResponde(404, 'not found');
    const { sb, tablas } = baseFalsa();
    await expect(consultarDocumento(sb, 'dni', '11111111')).rejects.toThrow(/no encontrado/);
    await expect(consultarDocumento(sb, 'dni', '11111111')).rejects.toThrow(/no encontrado/);
    expect(llamadas).toBe(1);
    expect(tablas.documentos_consultados).toHaveLength(1);
  });

  it('dos pedidos del mismo número a la vez hacen una sola consulta', async () => {
    decolectaResponde(200, DNI_OK);
    const { sb } = baseFalsa();
    const [a, b] = await Promise.all([consultarDocumento(sb, 'dni', '46027897'), consultarDocumento(sb, 'dni', '46027897')]);
    expect(a.datos).toEqual(b.datos);
    expect(llamadas).toBe(1);
  });

  it('lo consultado por una caja le sirve a la web sin volver a gastar', async () => {
    decolectaResponde(200, DNI_OK);
    const { sb } = baseFalsa();
    await consultarDocumento(sb, 'dni', '46027897');
    const web = await consultarDocumento(sb, 'dni', '46027897', { usarClientes: false });
    expect(web.fuente).toBe('guardado');
    expect(llamadas).toBe(1);
  });

  it('la web nunca recibe datos de la tabla de clientes', async () => {
    decolectaResponde(200, DNI_OK);
    const { sb, tablas } = baseFalsa({ clientes: [{ numero_documento: '46027897', nombres: 'DATO', apellido_paterno: 'PRIVADO' }] });
    const r = await consultarDocumento(sb, 'dni', '46027897', { usarClientes: false });
    expect(r.fuente).toBe('reniec-sunat');
    expect((r.datos as { nombreCompleto: string }).nombreCompleto).toBe('GISELA PRUEBA X');
    // Y lo del cliente registrado tampoco se copia a la tabla compartida.
    await consultarDocumento(sb, 'dni', '46027897');
    expect(JSON.stringify(tablas.documentos_consultados)).not.toContain('PRIVADO');
  });

  it('con el cupo agotado usa lo guardado aunque sea viejo', async () => {
    decolectaResponde(401, 'Apikey Required / Limit Exceeded');
    const { sb } = baseFalsa({ documentos: [{ tipo: 'dni', numero: '46027897', datos: { numero: '46027897', nombreCompleto: 'VIEJO' }, consultado_en: diasAtras(500) }] });
    const r = await consultarDocumento(sb, 'dni', '46027897');
    expect(r.fuente).toBe('guardado-viejo');
  });

  it('el cupo agotado no se guarda como "no existe"', async () => {
    decolectaResponde(401, 'Limit Exceeded');
    const { sb, tablas } = baseFalsa();
    await expect(consultarDocumento(sb, 'dni', '46027897')).rejects.toThrow(/agotaron/);
    expect(tablas.documentos_consultados).toHaveLength(0);
  });
});
