'use client';

/*
 * El reporte del mes, del lado del navegador.
 *
 * El mes se trae UNA vez del servidor. Cambiar de vista (SUNAT / notas de venta
 * / consolidado) o de días es instantáneo: se filtra acá. Antes cada clic
 * volvía a pedir el mes entero (4 s) y la página mandaba las ~700 filas tres
 * veces (pantalla, Excel y PDF), así que se quedaba "trabada" y no dejaba
 * hacer clic en Consolidado (30/09/2026). Los archivos se arman recién al
 * pedirlos.
 */

import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@happy/ui/card';
import { Badge } from '@happy/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { formatPEN, formatDateTime } from '@happy/lib';
import { FileSpreadsheet, FileType2, Loader2, X } from 'lucide-react';
import { generarExcelMultiHoja, generarPDFBrandeado } from '@/server/actions/exportar';
import type { ColExport } from '@/server/actions/reportes-helpers';
import type { FilaComprobante, TipoDoc } from '@/server/reporte-comprobantes-core';

type Vista = 'sunat' | 'notas' | 'todo';
type Hoja = {
  nombre: string; titulo: string; subtitulo?: string; filtros?: string[]; etiquetaFiltros?: string;
  cols: ColExport[]; rows: Record<string, unknown>[]; totales?: Record<string, number>;
};

const VISTAS: Array<{ id: Vista; titulo: string; detalle: string }> = [
  { id: 'sunat', titulo: 'Enviado a SUNAT', detalle: 'Boletas, facturas y notas de crédito' },
  { id: 'notas', titulo: 'Notas de venta', detalle: 'No se declaran a SUNAT' },
  { id: 'todo', titulo: 'Consolidado', detalle: 'La suma de ambos' },
];
const ES_SUNAT: TipoDoc[] = ['BOLETA', 'FACTURA', 'NOTA_CREDITO', 'NOTA_DEBITO'];
const NOMBRE: Record<TipoDoc, string> = {
  BOLETA: 'Boleta', FACTURA: 'Factura', NOTA_CREDITO: 'Nota de crédito', NOTA_DEBITO: 'Nota de débito', NOTA_VENTA: 'Nota de venta',
};
const POR_PAGINA = 100;
const r2 = (n: number) => +n.toFixed(2);
const dma = (iso: string) => iso.split('-').reverse().join('/');
const enVista = (v: Vista, t: TipoDoc) => (v === 'sunat' ? ES_SUNAT.includes(t) : v === 'notas' ? t === 'NOTA_VENTA' : true);

function descargar(base64: string, filename: string, mime: string) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/** Orden en que se muestran las tiendas; las que no estén acá van después. */
const ORDEN_TIENDAS = ['Tienda Huallaga', 'Tienda La Quinta', 'Web'];
const tiendaDeFila = (f: FilaComprobante) => f.tienda || 'Sin tienda';

export function ReporteComprobantes({ mes, nombreMes, desde, hasta, filas: todas, vistaInicial, tiendaInicial = '' }: {
  mes: string; nombreMes: string; desde: string; hasta: string; filas: FilaComprobante[]; vistaInicial: Vista; tiendaInicial?: string;
}) {
  const [vista, setVista] = useState<Vista>(vistaInicial);
  /*
   * Reporte por tienda (pedido de Javier, 13/10/2026): Huallaga, La Quinta y
   * Web, una por una, o todas juntas. Filtra todo: totales, días, detalle,
   * registro de ventas y descargas.
   */
  const [tienda, setTienda] = useState<string>(tiendaInicial);
  const tiendas = useMemo(() => {
    const set = [...new Set(todas.map(tiendaDeFila))];
    const pos = (t: string) => { const i = ORDEN_TIENDAS.indexOf(t); return i < 0 ? 99 : i; };
    return set.sort((a, b) => pos(a) - pos(b) || a.localeCompare(b));
  }, [todas]);
  const filas = useMemo(() => (tienda ? todas.filter((f) => tiendaDeFila(f) === tienda) : todas), [todas, tienda]);
  const totalTienda = (t: string) => r2(todas.filter((f) => f.cuenta && (!t || tiendaDeFila(f) === t) && enVista(vista, f.tipo)).reduce((s, f) => s + f.total, 0));
  const etiquetaTienda = tienda || 'Todas las tiendas';
  const [diaDesde, setDiaDesde] = useState('');
  const [diaHasta, setDiaHasta] = useState('');
  const [pagina, setPagina] = useState(1);
  const [exportando, start] = useTransition();
  const [cual, setCual] = useState<'xlsx' | 'pdf' | null>(null);

  // La vista queda en la dirección para poder compartir el enlace, sin recargar.
  useEffect(() => {
    const u = new URL(window.location.href);
    u.searchParams.set('vista', vista);
    if (tienda) u.searchParams.set('tienda', tienda); else u.searchParams.delete('tienda');
    window.history.replaceState(null, '', u.toString());
  }, [vista, tienda]);
  useEffect(() => { setPagina(1); }, [vista, diaDesde, diaHasta, tienda]);

  // ── Totales del mes (no dependen de la vista ni de los días) ────────────
  const porTipo = useMemo(() => {
    const t = Object.fromEntries((['BOLETA', 'FACTURA', 'NOTA_CREDITO', 'NOTA_DEBITO', 'NOTA_VENTA'] as TipoDoc[])
      .map((k) => [k, { cantidad: 0, base: 0, igv: 0, total: 0 }])) as Record<TipoDoc, { cantidad: number; base: number; igv: number; total: number }>;
    for (const f of filas) {
      if (!f.cuenta) continue;
      const x = t[f.tipo]; x.cantidad++; x.base += f.base; x.igv += f.igv; x.total += f.total;
    }
    for (const x of Object.values(t)) { x.base = r2(x.base); x.igv = r2(x.igv); x.total = r2(x.total); }
    return t;
  }, [filas]);
  const totalSunat = r2(ES_SUNAT.reduce((s, k) => s + porTipo[k].total, 0));
  const totalNotas = porTipo.NOTA_VENTA.total;
  const noCuentan = filas.filter((f) => !f.cuenta).length;

  const porDia = useMemo(() => {
    const m = new Map<string, { boletas: number; facturas: number; notasCD: number; sunat: number; notas: number }>();
    for (const f of filas) {
      if (!f.cuenta) continue;
      const d = m.get(f.dia) ?? { boletas: 0, facturas: 0, notasCD: 0, sunat: 0, notas: 0 };
      if (f.tipo === 'BOLETA') d.boletas += f.total;
      else if (f.tipo === 'FACTURA') d.facturas += f.total;
      else if (f.tipo === 'NOTA_VENTA') d.notas += f.total;
      else d.notasCD += f.total;
      if (f.tipo !== 'NOTA_VENTA') d.sunat += f.total;
      m.set(f.dia, d);
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([dia, d]) => ({
      dia, boletas: r2(d.boletas), facturas: r2(d.facturas), notasCD: r2(d.notasCD), sunat: r2(d.sunat), notas: r2(d.notas), total: r2(d.sunat + d.notas),
    }));
  }, [filas]);

  // ── Detalle: vista + rango de días ──────────────────────────────────────
  const detalle = useMemo(() => filas.filter((f) =>
    enVista(vista, f.tipo) && (!diaDesde || f.dia >= diaDesde) && (!diaHasta || f.dia <= diaHasta)), [filas, vista, diaDesde, diaHasta]);
  const suman = detalle.filter((f) => f.cuenta);
  const totDet = { base: r2(suman.reduce((s, f) => s + f.base, 0)), igv: r2(suman.reduce((s, f) => s + f.igv, 0)), total: r2(suman.reduce((s, f) => s + f.total, 0)) };
  const conImpuestos = vista !== 'notas';
  const paginas = Math.max(1, Math.ceil(detalle.length / POR_PAGINA));
  const visibles = detalle.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);
  const hayRango = Boolean(diaDesde || diaHasta);
  const textoRango = hayRango
    ? (diaDesde && diaDesde === diaHasta ? `del ${dma(diaDesde)}` : `del ${dma(diaDesde || desde)} al ${dma(diaHasta || hasta)}`)
    : `de todo ${nombreMes}`;

  const elegirDia = (dia: string) => { setDiaDesde(dia); setDiaHasta(dia); document.getElementById('detalle')?.scrollIntoView({ behavior: 'smooth' }); };

  // ── Exportar: se arma recién al hacer clic ──────────────────────────────
  function exportar(fmt: 'xlsx' | 'pdf') {
    setCual(fmt);
    start(async () => {
      try {
        const tituloVista = VISTAS.find((v) => v.id === vista)!.titulo;
        const subtitulo = `${nombreMes} · ${etiquetaTienda} · detalle ${textoRango}`;
        const resumen = [
          `Boletas: ${porTipo.BOLETA.cantidad} · ${formatPEN(porTipo.BOLETA.total)}`,
          `Facturas: ${porTipo.FACTURA.cantidad} · ${formatPEN(porTipo.FACTURA.total)}`,
          `Notas de crédito: ${porTipo.NOTA_CREDITO.cantidad} · ${formatPEN(porTipo.NOTA_CREDITO.total)}`,
          `Total SUNAT: ${formatPEN(totalSunat)}`,
          `Notas de venta: ${porTipo.NOTA_VENTA.cantidad} · ${formatPEN(totalNotas)}`,
          `Total general del mes: ${formatPEN(r2(totalSunat + totalNotas))}`,
        ];
        const fila = (f: FilaComprobante) => ({
          fecha: formatDateTime(f.fecha), tipo: NOMBRE[f.tipo], numero: f.numero, referencia: f.referencia,
          doc_cliente: f.doc_cliente, cliente: f.cliente, tienda: f.tienda, metodos: f.metodos,
          comprobante: `${NOMBRE[f.tipo]} ${f.numero}${f.referencia ? ` (corrige ${f.referencia})` : ''}`,
          cliente_doc: f.doc_cliente ? `${f.cliente} · ${f.doc_cliente}` : f.cliente,
          // Lo que no suma va en 0 para que el total de la columna cuadre.
          base: f.cuenta ? f.base : 0, igv: f.cuenta ? f.igv : 0, total: f.cuenta ? f.total : 0,
          estado: f.cuenta ? f.estado : `${f.estado} (no suma: ${f.total.toFixed(2)})`,
        });
        const impuestos: ColExport[] = conImpuestos
          ? [{ header: 'Base imponible', key: 'base', formato: 'moneda' }, { header: 'IGV', key: 'igv', formato: 'moneda' }]
          : [];
        const totales = conImpuestos ? totDet : { total: totDet.total };

        if (fmt === 'pdf') {
          const r = await generarPDFBrandeado({
            titulo: `Comprobantes — ${tituloVista}`, subtitulo, etiquetaFiltros: 'Resumen del mes', filtros: resumen,
            cols: [
              { header: 'Fecha', key: 'fecha' }, { header: 'Comprobante', key: 'comprobante' }, { header: 'Cliente', key: 'cliente_doc' },
              { header: 'Tienda', key: 'tienda' }, { header: 'Pago', key: 'metodos' }, ...impuestos,
              { header: 'Total', key: 'total', formato: 'moneda' }, { header: 'Estado', key: 'estado' },
            ],
            rows: detalle.map(fila), totales,
          });
          descargar(r.base64, r.filename, r.mime);
          return;
        }

        /*
         * Registro de ventas, en el orden y con los códigos que usa la
         * contadora (pedido de Javier, 13/10/2026): fecha como fecha, código de
         * comprobante y de documento SUNAT, serie y número aparte. Solo lo que
         * va a SUNAT; lo anulado va en cero con su estado.
         */
        const COD_CP: Record<TipoDoc, string> = { FACTURA: '01', BOLETA: '03', NOTA_CREDITO: '07', NOTA_DEBITO: '08', NOTA_VENTA: '' };
        const COD_DOC: Record<string, string> = { RUC: '6', DNI: '1', CE: '4', PASAPORTE: '7' };
        const registro = filas
          .filter((f) => ES_SUNAT.includes(f.tipo) && (!diaDesde || f.dia >= diaDesde) && (!diaHasta || f.dia <= diaHasta))
          .map((f) => {
            const [serie, numero] = f.numero.split('-');
            const [tdoc, ...ndoc] = (f.doc_cliente || '').split(' ');
            return {
              fecha: f.dia, cod: COD_CP[f.tipo], tipo: NOMBRE[f.tipo], serie, numero,
              tdoc: COD_DOC[tdoc ?? ''] ?? '0', ndoc: ndoc.join(' ') || '-', cliente: f.cliente,
              base: f.cuenta ? f.base : 0, igv: f.cuenta ? f.igv : 0, total: f.cuenta ? f.total : 0,
              estado: f.cuenta ? f.estado : `${f.estado} (no suma: ${f.total.toFixed(2)})`, referencia: f.referencia,
            };
          });
        const sumReg = registro.reduce((a, r) => ({ base: a.base + r.base, igv: a.igv + r.igv, total: a.total + r.total }), { base: 0, igv: 0, total: 0 });
        const hojaRegistro: Hoja = {
          nombre: 'Registro de ventas', titulo: 'Registro de ventas', subtitulo: `${nombreMes} · ${etiquetaTienda} · comprobantes enviados a SUNAT ${textoRango}`,
          cols: [
            { header: 'Fecha emisión', key: 'fecha', formato: 'fecha', width: 13 },
            { header: 'Tipo CP', key: 'cod', width: 8 }, { header: 'Comprobante', key: 'tipo', width: 15 },
            { header: 'Serie', key: 'serie', width: 8 }, { header: 'Número', key: 'numero', width: 11 },
            { header: 'Tipo doc.', key: 'tdoc', width: 9 }, { header: 'N° documento', key: 'ndoc', width: 13 },
            { header: 'Cliente / Razón social', key: 'cliente', width: 34 },
            { header: 'Base imponible', key: 'base', formato: 'moneda', width: 14 }, { header: 'IGV', key: 'igv', formato: 'moneda', width: 12 },
            { header: 'Importe total', key: 'total', formato: 'moneda', width: 14 },
            { header: 'Estado', key: 'estado', width: 22 }, { header: 'Doc. que modifica', key: 'referencia', width: 16 },
          ],
          rows: registro,
          totales: { base: r2(sumReg.base), igv: r2(sumReg.igv), total: r2(sumReg.total) },
        };

        const hojas: Hoja[] = [
          {
            nombre: 'Resumen', titulo: 'Resumen del mes', subtitulo: `${nombreMes} · ${etiquetaTienda}`,
            cols: [
              { header: 'Documento', key: 'tipo', width: 22 }, { header: 'Cantidad', key: 'cantidad', formato: 'numero', width: 11 },
              { header: 'Base imponible', key: 'base', formato: 'moneda', width: 16 }, { header: 'IGV', key: 'igv', formato: 'moneda', width: 13 },
              { header: 'Total', key: 'total', formato: 'moneda', width: 15 },
            ],
            rows: [
              ...ES_SUNAT.map((k) => ({ tipo: NOMBRE[k], ...porTipo[k] })),
              { tipo: 'TOTAL SUNAT', cantidad: null, base: r2(ES_SUNAT.reduce((s, k) => s + porTipo[k].base, 0)), igv: r2(ES_SUNAT.reduce((s, k) => s + porTipo[k].igv, 0)), total: totalSunat },
              { tipo: 'Notas de venta', cantidad: porTipo.NOTA_VENTA.cantidad, base: null, igv: null, total: totalNotas },
              { tipo: 'TOTAL GENERAL', cantidad: null, base: null, igv: null, total: r2(totalSunat + totalNotas) },
            ],
          },
          // Para la contadora, apenas después del resumen (vistas con comprobantes SUNAT).
          ...(vista !== 'notas' ? [hojaRegistro] : []),
          {
            nombre: 'Por día', titulo: 'Ventas por día', subtitulo: `${nombreMes} · ${etiquetaTienda}`,
            cols: [
              { header: 'Día', key: 'dia', width: 12 }, { header: 'Boletas', key: 'boletas', formato: 'moneda', width: 13 },
              { header: 'Facturas', key: 'facturas', formato: 'moneda', width: 13 }, { header: 'Notas créd./déb.', key: 'notasCD', formato: 'moneda', width: 15 },
              { header: 'Total SUNAT', key: 'sunat', formato: 'moneda', width: 14 }, { header: 'Notas de venta', key: 'notas', formato: 'moneda', width: 14 },
              { header: 'Total del día', key: 'total', formato: 'moneda', width: 14 },
            ],
            rows: porDia.map((d) => ({ ...d, dia: dma(d.dia) })),
            totales: {
              boletas: porTipo.BOLETA.total, facturas: porTipo.FACTURA.total, notasCD: r2(porTipo.NOTA_CREDITO.total + porTipo.NOTA_DEBITO.total),
              sunat: totalSunat, notas: totalNotas, total: r2(totalSunat + totalNotas),
            },
          },
          {
            nombre: 'Detalle', titulo: `Detalle — ${tituloVista}`, subtitulo, etiquetaFiltros: 'Resumen del mes', filtros: resumen,
            cols: [
              { header: 'Fecha', key: 'fecha', width: 17 }, { header: 'Tipo', key: 'tipo', width: 15 }, { header: 'Número', key: 'numero', width: 16 },
              ...(conImpuestos ? [{ header: 'Corrige a', key: 'referencia', width: 15 }] : []),
              { header: 'Documento', key: 'doc_cliente', width: 16 }, { header: 'Cliente', key: 'cliente', width: 30 },
              { header: 'Tienda', key: 'tienda', width: 16 }, { header: 'Pago', key: 'metodos', width: 22 },
              ...impuestos.map((c) => ({ ...c, width: 14 })), { header: 'Total', key: 'total', formato: 'moneda', width: 13 },
              { header: 'Estado', key: 'estado', width: 18 },
            ],
            rows: detalle.map(fila), totales,
          },
        ];
        const r = await generarExcelMultiHoja({ titulo: `Comprobantes ${tituloVista}${tienda ? ` ${tienda}` : ''} ${mes}`, hojas });
        descargar(r.base64, r.filename, r.mime);
      } catch (e) {
        alert((e as Error).message ?? 'No se pudo generar el archivo');
      }
    });
  }

  const tarjetas: TipoDoc[] = vista === 'notas' ? ['NOTA_VENTA'] : vista === 'sunat' ? ['BOLETA', 'FACTURA', 'NOTA_CREDITO'] : ['BOLETA', 'FACTURA', 'NOTA_CREDITO', 'NOTA_VENTA'];

  return (
    <div className="space-y-6">
      {/* Tienda: todas, o una por una */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Tienda</span>
        {['', ...tiendas].map((t) => (
          <button key={t || 'todas'} type="button" onClick={() => setTienda(t)}
            className={`rounded-full border px-3 py-1.5 text-sm transition ${tienda === t ? 'border-happy-500 bg-happy-50 font-semibold text-corp-900 ring-1 ring-happy-500' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
            {t || 'Todas'} <span className="ml-1 text-xs text-slate-500">{formatPEN(totalTienda(t))}</span>
          </button>
        ))}
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        {VISTAS.map((x) => (
          <button key={x.id} type="button" onClick={() => setVista(x.id)}
            className={`rounded-xl border p-3 text-left transition ${vista === x.id ? 'border-happy-500 bg-happy-50 ring-1 ring-happy-500' : 'bg-white hover:bg-slate-50'}`}>
            <p className="text-sm font-semibold text-corp-900">{x.titulo}</p>
            <p className="text-xs text-slate-500">{x.detalle}</p>
            <p className="mt-1 font-display text-xl font-semibold text-corp-900">
              {formatPEN(x.id === 'sunat' ? totalSunat : x.id === 'notas' ? totalNotas : r2(totalSunat + totalNotas))}
            </p>
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {tarjetas.map((t) => (
          <Card key={t} className="p-4">
            <p className="text-xs text-slate-500">{NOMBRE[t]}s · {porTipo[t].cantidad}</p>
            <p className={`mt-1 font-display text-lg font-semibold ${porTipo[t].total < 0 ? 'text-rose-600' : 'text-corp-900'}`}>{formatPEN(porTipo[t].total)}</p>
          </Card>
        ))}
        {conImpuestos && (
          <Card className="p-4">
            <p className="text-xs text-slate-500">Base imponible / IGV del mes</p>
            <p className="mt-1 text-sm font-semibold text-corp-900">{formatPEN(r2(ES_SUNAT.reduce((s, k) => s + porTipo[k].base, 0)))}</p>
            <p className="text-sm text-slate-600">IGV {formatPEN(r2(ES_SUNAT.reduce((s, k) => s + porTipo[k].igv, 0)))}</p>
          </Card>
        )}
      </div>
      {noCuentan > 0 && (
        <p className="text-xs text-slate-500">
          {noCuentan} comprobante(s) anulados o rechazados se listan pero no suman. Una factura anulada sí suma, y la resta su nota de crédito.
        </p>
      )}

      <Card>
        <CardContent className="p-0">
          <p className="border-b px-4 py-2 text-sm font-semibold text-corp-900">
            Por día <span className="font-normal text-slate-500">· toca un día para ver su detalle</span>
          </p>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Día</TableHead>
              {vista !== 'notas' && <><TableHead className="text-right">Boletas</TableHead><TableHead className="text-right">Facturas</TableHead><TableHead className="text-right">Notas créd.</TableHead><TableHead className="text-right">Total SUNAT</TableHead></>}
              {vista !== 'sunat' && <TableHead className="text-right">Notas de venta</TableHead>}
              {vista === 'todo' && <TableHead className="text-right">Total del día</TableHead>}
            </TableRow></TableHeader>
            <TableBody>
              {porDia.length === 0 && <TableRow><TableCell colSpan={7} className="py-8 text-center text-sm text-slate-500">Sin comprobantes en {nombreMes}.</TableCell></TableRow>}
              {porDia.map((d) => (
                <TableRow key={d.dia} onClick={() => elegirDia(d.dia)}
                  className={`cursor-pointer hover:bg-happy-50 ${diaDesde === d.dia && diaHasta === d.dia ? 'bg-happy-50' : ''}`}>
                  <TableCell className="font-mono text-xs underline decoration-dotted">{dma(d.dia)}</TableCell>
                  {vista !== 'notas' && <>
                    <TableCell className="text-right text-sm">{formatPEN(d.boletas)}</TableCell>
                    <TableCell className="text-right text-sm">{formatPEN(d.facturas)}</TableCell>
                    <TableCell className="text-right text-sm text-rose-600">{d.notasCD ? formatPEN(d.notasCD) : '—'}</TableCell>
                    <TableCell className="text-right text-sm font-semibold">{formatPEN(d.sunat)}</TableCell>
                  </>}
                  {vista !== 'sunat' && <TableCell className="text-right text-sm font-semibold">{formatPEN(d.notas)}</TableCell>}
                  {vista === 'todo' && <TableCell className="text-right text-sm font-bold text-corp-900">{formatPEN(d.total)}</TableCell>}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card id="detalle">
        <CardContent className="p-0">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-corp-900">Detalle {textoRango}</p>
              <p className="text-xs text-slate-500">
                {detalle.length} comprobantes · {formatPEN(totDet.total)}
                {conImpuestos && ` · base ${formatPEN(totDet.base)} · IGV ${formatPEN(totDet.igv)}`}
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col text-[11px] font-medium uppercase tracking-wide text-slate-500">
                Desde el día
                <input type="date" min={desde} max={hasta} value={diaDesde}
                  onChange={(e) => { setDiaDesde(e.target.value); if (diaHasta && e.target.value > diaHasta) setDiaHasta(e.target.value); }}
                  className="mt-1 h-9 rounded-md border px-2 text-sm" />
              </label>
              <label className="flex flex-col text-[11px] font-medium uppercase tracking-wide text-slate-500">
                Hasta el día
                <input type="date" min={diaDesde || desde} max={hasta} value={diaHasta}
                  onChange={(e) => setDiaHasta(e.target.value)} className="mt-1 h-9 rounded-md border px-2 text-sm" />
              </label>
              {hayRango && (
                <button type="button" onClick={() => { setDiaDesde(''); setDiaHasta(''); }}
                  className="inline-flex h-9 items-center gap-1 rounded-md border px-3 text-xs hover:bg-slate-50">
                  <X className="h-3.5 w-3.5" /> Todo el mes
                </button>
              )}
              <button type="button" disabled={exportando} onClick={() => exportar('xlsx')}
                className="inline-flex h-9 items-center gap-1.5 rounded-md bg-emerald-600 px-3 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
                {exportando && cual === 'xlsx' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5" />} Excel
              </button>
              <button type="button" disabled={exportando} onClick={() => exportar('pdf')}
                className="inline-flex h-9 items-center gap-1.5 rounded-md bg-red-600 px-3 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50">
                {exportando && cual === 'pdf' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileType2 className="h-3.5 w-3.5" />} PDF
              </button>
            </div>
          </div>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Fecha</TableHead><TableHead>Documento</TableHead><TableHead>Cliente</TableHead><TableHead>Tienda / pago</TableHead>
              {conImpuestos && <><TableHead className="text-right">Base</TableHead><TableHead className="text-right">IGV</TableHead></>}
              <TableHead className="text-right">Total</TableHead><TableHead>Estado</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {visibles.length === 0 && <TableRow><TableCell colSpan={8} className="py-8 text-center text-sm text-slate-500">No hay comprobantes en esos días.</TableCell></TableRow>}
              {visibles.map((f) => (
                <TableRow key={f.id} className={f.cuenta ? '' : 'opacity-50'}>
                  <TableCell className="whitespace-nowrap font-mono text-xs">{formatDateTime(f.fecha)}</TableCell>
                  <TableCell>
                    <Link href={`/comprobantes/${f.id}`} className="font-mono text-xs font-semibold text-corp-900 hover:text-happy-600">{f.numero}</Link>
                    <div className="text-[10px] text-slate-500">{NOMBRE[f.tipo]}{f.referencia ? ` · corrige ${f.referencia}` : ''}</div>
                  </TableCell>
                  <TableCell className="text-xs"><div>{f.cliente}</div><div className="font-mono text-[10px] text-slate-500">{f.doc_cliente}</div></TableCell>
                  <TableCell className="text-xs"><div>{f.tienda}</div><div className="text-[10px] text-slate-500">{f.metodos}</div></TableCell>
                  {conImpuestos && <>
                    <TableCell className="text-right text-xs">{formatPEN(f.base)}</TableCell>
                    <TableCell className="text-right text-xs">{formatPEN(f.igv)}</TableCell>
                  </>}
                  <TableCell className={`text-right text-sm font-semibold ${f.total < 0 ? 'text-rose-600' : ''}`}>{formatPEN(f.total)}</TableCell>
                  <TableCell><Badge variant={f.cuenta ? 'secondary' : 'destructive'} className="text-[10px]">{f.estado}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {paginas > 1 && (
            <div className="flex items-center justify-between border-t px-4 py-2 text-sm text-slate-600">
              <span>Mostrando {(pagina - 1) * POR_PAGINA + 1}–{Math.min(detalle.length, pagina * POR_PAGINA)} de {detalle.length} · la descarga incluye todos</span>
              <div className="flex items-center gap-2">
                <button type="button" disabled={pagina === 1} onClick={() => setPagina((p) => p - 1)} className="h-8 rounded-md border px-3 text-xs disabled:opacity-40">Anterior</button>
                <span className="text-xs">Página {pagina} de {paginas}</span>
                <button type="button" disabled={pagina === paginas} onClick={() => setPagina((p) => p + 1)} className="h-8 rounded-md border px-3 text-xs disabled:opacity-40">Siguiente</button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
