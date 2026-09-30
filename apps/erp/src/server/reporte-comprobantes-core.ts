/**
 * Reporte mensual de comprobantes: lo enviado a SUNAT (boletas, facturas y sus
 * notas de crédito/débito), las notas de venta, y la suma de ambos.
 *
 * Pedido de Javier (30/09/2026): verlo por mes, detallado, y exportarlo a PDF y
 * Excel brandeados.
 *
 * Se arma sobre `comprobantes` (el documento que tiene el cliente en la mano) y
 * no sobre `ventas`, porque lo que interesa es lo declarado: una factura anulada
 * sigue existiendo ante SUNAT y se compensa con su nota de crédito, que va con
 * signo negativo.
 *
 * Dos cuidados que el reporte de ventas no tenía:
 *   - El mes es el de Perú. La base guarda en UTC; filtrar por día UTC dejaba
 *     fuera las ventas de la noche del último día (y metía las del mes que
 *     viene).
 *   - La base devuelve como máximo 1.000 filas por consulta. Se lee por
 *     páginas para que un mes con más comprobantes no quede cortado sin aviso.
 */

import { fechaLima } from '@happy/lib/format';
import { etiquetaPago } from '@happy/lib/pagos/etiqueta';

export type TipoDoc = 'BOLETA' | 'FACTURA' | 'NOTA_CREDITO' | 'NOTA_DEBITO' | 'NOTA_VENTA';

export type FilaComprobante = {
  id: string;
  fecha: string;          // ISO
  dia: string;            // YYYY-MM-DD de Perú
  tipo: TipoDoc;
  numero: string;
  referencia: string;     // para notas de crédito/débito: el comprobante que corrigen
  doc_cliente: string;
  cliente: string;
  tienda: string;
  metodos: string;
  base: number;           // con signo (negativo en nota de crédito)
  igv: number;
  total: number;
  estado: string;         // en castellano
  /** Si suma en los totales. No suman: anulados, rechazados por SUNAT. */
  cuenta: boolean;
};

export type ResumenTipo = { cantidad: number; base: number; igv: number; total: number };

export type ReporteComprobantes = {
  desde: string;
  hasta: string;
  filas: FilaComprobante[];
  porTipo: Record<TipoDoc, ResumenTipo>;
  noCuentan: number;
};

const TIPOS: TipoDoc[] = ['BOLETA', 'FACTURA', 'NOTA_CREDITO', 'NOTA_DEBITO', 'NOTA_VENTA'];

function estadoLegible(tipo: TipoDoc, estado: string): string {
  if (tipo === 'NOTA_VENTA') return estado === 'ANULADO' ? 'Anulada' : 'Emitida';
  switch (estado) {
    case 'ACEPTADO': return 'Aceptado SUNAT';
    case 'OBSERVADO': return 'Aceptado con obs.';
    case 'RECHAZADO': return 'Rechazado SUNAT';
    case 'ANULADO': return 'Anulado';
    default: return tipo === 'BOLETA' ? 'Por informar (resumen)' : 'Por enviar';
  }
}

/** Mes 'YYYY-MM' de Perú → ventana UTC [desde, hasta). */
function ventanaMes(mes: string): { desdeUtc: string; hastaUtc: string; desde: string; hasta: string } {
  const [a, m] = mes.split('-').map(Number) as [number, number];
  const desde = `${a}-${String(m).padStart(2, '0')}-01`;
  const sig = m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, '0')}-01`;
  const ultimo = new Date(new Date(`${sig}T12:00:00Z`).getTime() - 86_400_000).toISOString().slice(0, 10);
  return {
    desdeUtc: new Date(`${desde}T05:00:00.000Z`).toISOString(),
    hastaUtc: new Date(`${sig}T05:00:00.000Z`).toISOString(),
    desde,
    hasta: ultimo,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Sb = { from: (t: string) => any };

/** Lee todas las filas de una consulta, de a 1.000 (el tope de la base). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function todas<T>(armar: () => any): Promise<T[]> {
  const out: T[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await armar().range(desde, desde + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) return out;
  }
}

/**
 * `.in()` en tandas: con cientos de ids la URL se vuelve demasiado larga. Las
 * tandas van en paralelo (de a 6): una detrás de otra, un mes tardaba 4 s.
 */
async function enTandas<T>(ids: string[], leer: (tanda: string[]) => Promise<T[]>): Promise<T[]> {
  const tandas: string[][] = [];
  for (let i = 0; i < ids.length; i += 150) tandas.push(ids.slice(i, i + 150));
  const out: T[] = [];
  for (let i = 0; i < tandas.length; i += 6) {
    for (const r of await Promise.all(tandas.slice(i, i + 6).map(leer))) out.push(...r);
  }
  return out;
}

export async function armarReporteComprobantes(sb: Sb, mes: string): Promise<ReporteComprobantes> {
  if (!/^\d{4}-\d{2}$/.test(mes)) throw new Error('Mes inválido');

  const v = ventanaMes(mes);

  type Raw = {
    id: string; tipo: TipoDoc; numero_completo: string; fecha_emision: string; estado: string;
    sub_total: number | null; igv: number | null; total: number | null;
    tipo_documento_cliente: string | null; numero_documento_cliente: string | null; razon_social_cliente: string | null;
    venta_id: string | null; documento_referencia_id: string | null;
  };
  const comps = await todas<Raw>(() => sb.from('comprobantes')
    .select('id, tipo, numero_completo, fecha_emision, estado, sub_total, igv, total, tipo_documento_cliente, numero_documento_cliente, razon_social_cliente, venta_id, documento_referencia_id')
    .in('tipo', TIPOS)
    .gte('fecha_emision', v.desdeUtc)
    .lt('fecha_emision', v.hastaUtc)
    .order('fecha_emision', { ascending: true })
    .order('id', { ascending: true }));

  // Tienda y medios de pago, desde la venta de cada comprobante.
  const ventaIds = [...new Set(comps.map((c) => c.venta_id).filter(Boolean))] as string[];
  const refIds = [...new Set(comps.map((c) => c.documento_referencia_id).filter(Boolean))] as string[];
  const [ventas, pagos, refs] = await Promise.all([
    enTandas(ventaIds, async (t) => {
      const { data } = await sb.from('ventas').select('id, almacen:almacen_id(nombre)').in('id', t);
      return (data ?? []) as Array<{ id: string; almacen: { nombre: string } | null }>;
    }),
    enTandas(ventaIds, async (t) => {
      const { data } = await sb.from('ventas_pagos').select('venta_id, metodo, referencia').in('venta_id', t);
      return (data ?? []) as Array<{ venta_id: string; metodo: string; referencia: string | null }>;
    }),
    // Número del comprobante que corrige cada nota de crédito/débito.
    enTandas(refIds, async (t) => {
      const { data } = await sb.from('comprobantes').select('id, numero_completo, venta_id').in('id', t);
      return (data ?? []) as Array<{ id: string; numero_completo: string; venta_id: string | null }>;
    }),
  ]);
  const tiendaDe = new Map(ventas.map((x) => [x.id, x.almacen?.nombre ?? '']));
  const pagosDe = new Map<string, Set<string>>();
  for (const p of pagos) {
    const s = pagosDe.get(p.venta_id) ?? new Set<string>();
    s.add(etiquetaPago(p.metodo, p.referencia));
    pagosDe.set(p.venta_id, s);
  }

  const refDe = new Map(refs.map((r) => [r.id, r]));

  const porTipo = Object.fromEntries(TIPOS.map((t) => [t, { cantidad: 0, base: 0, igv: 0, total: 0 }])) as Record<TipoDoc, ResumenTipo>;
  let noCuentan = 0;

  const filas: FilaComprobante[] = comps.map((c) => {
    const signo = c.tipo === 'NOTA_CREDITO' ? -1 : 1;
    const cuenta = c.estado !== 'ANULADO' && c.estado !== 'RECHAZADO';
    const ref = c.documento_referencia_id ? refDe.get(c.documento_referencia_id) : undefined;
    const ventaId = c.venta_id ?? ref?.venta_id ?? null;
    const fila: FilaComprobante = {
      id: c.id,
      fecha: c.fecha_emision,
      dia: fechaLima(c.fecha_emision),
      tipo: c.tipo,
      numero: c.numero_completo,
      referencia: ref?.numero_completo ?? '',
      doc_cliente: [c.tipo_documento_cliente, c.numero_documento_cliente].filter(Boolean).join(' '),
      cliente: c.razon_social_cliente || 'CLIENTE VARIOS',
      tienda: ventaId ? (tiendaDe.get(ventaId) ?? '') : '',
      metodos: ventaId ? [...(pagosDe.get(ventaId) ?? [])].join(', ') : '',
      base: signo * Number(c.sub_total ?? 0),
      igv: signo * Number(c.igv ?? 0),
      total: signo * Number(c.total ?? 0),
      estado: estadoLegible(c.tipo, c.estado),
      cuenta,
    };
    if (cuenta) {
      const r = porTipo[c.tipo];
      r.cantidad++; r.base += fila.base; r.igv += fila.igv; r.total += fila.total;
    } else {
      noCuentan++;
    }
    return fila;
  });

  for (const r of Object.values(porTipo)) {
    r.base = +r.base.toFixed(2); r.igv = +r.igv.toFixed(2); r.total = +r.total.toFixed(2);
  }
  return { desde: v.desde, hasta: v.hasta, filas, porTipo, noCuentan };
}
