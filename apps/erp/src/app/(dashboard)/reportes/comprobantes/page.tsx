import Link from 'next/link';
import { Card, CardContent } from '@happy/ui/card';
import { Badge } from '@happy/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { PageShell } from '@/components/page-shell';
import { formatPEN, formatDateTime } from '@happy/lib';
import { fechaLima } from '@happy/lib/format';
import { reporteComprobantesMes, type FilaComprobante, type TipoDoc } from '@/server/actions/reporte-comprobantes';
import type { ColExport } from '@/server/actions/reportes-helpers';
import { ExportarComprobantes, type HojaPayload } from './exportar';

export const metadata = { title: 'Comprobantes del mes' };
export const dynamic = 'force-dynamic';

type Vista = 'sunat' | 'notas' | 'todo';

const VISTAS: Array<{ id: Vista; titulo: string; detalle: string }> = [
  { id: 'sunat', titulo: 'Enviado a SUNAT', detalle: 'Boletas, facturas y notas de crédito' },
  { id: 'notas', titulo: 'Notas de venta', detalle: 'No se declaran a SUNAT' },
  { id: 'todo', titulo: 'Consolidado', detalle: 'La suma de ambos' },
];

const ES_SUNAT: TipoDoc[] = ['BOLETA', 'FACTURA', 'NOTA_CREDITO', 'NOTA_DEBITO'];

const NOMBRE_TIPO: Record<TipoDoc, string> = {
  BOLETA: 'Boleta', FACTURA: 'Factura', NOTA_CREDITO: 'Nota de crédito', NOTA_DEBITO: 'Nota de débito', NOTA_VENTA: 'Nota de venta',
};

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const nombreMes = (mes: string) => { const [a, m] = mes.split('-'); return `${MESES[Number(m) - 1]} ${a}`; };
const r2 = (n: number) => +n.toFixed(2);

export default async function ReporteComprobantesPage({ searchParams }: { searchParams: Promise<{ mes?: string; vista?: string }> }) {
  const sp = await searchParams;
  const mes = /^\d{4}-\d{2}$/.test(sp.mes ?? '') ? sp.mes! : fechaLima().slice(0, 7);
  const vista: Vista = sp.vista === 'notas' || sp.vista === 'todo' ? sp.vista : 'sunat';
  const rep = await reporteComprobantesMes(mes);

  const filas = rep.filas.filter((f) =>
    vista === 'sunat' ? ES_SUNAT.includes(f.tipo) : vista === 'notas' ? f.tipo === 'NOTA_VENTA' : true);
  const suman = filas.filter((f) => f.cuenta);
  const totalSunat = r2(ES_SUNAT.reduce((s, t) => s + rep.porTipo[t].total, 0));
  const totalNotas = rep.porTipo.NOTA_VENTA.total;
  const totalVista = r2(suman.reduce((s, f) => s + f.total, 0));
  const baseVista = r2(suman.reduce((s, f) => s + f.base, 0));
  const igvVista = r2(suman.reduce((s, f) => s + f.igv, 0));

  // Resumen por día: una fila por día con movimiento.
  const dias = new Map<string, { boletas: number; facturas: number; notasCD: number; sunat: number; notas: number }>();
  for (const f of rep.filas) {
    if (!f.cuenta) continue;
    const d = dias.get(f.dia) ?? { boletas: 0, facturas: 0, notasCD: 0, sunat: 0, notas: 0 };
    if (f.tipo === 'BOLETA') d.boletas += f.total;
    else if (f.tipo === 'FACTURA') d.facturas += f.total;
    else if (f.tipo === 'NOTA_CREDITO' || f.tipo === 'NOTA_DEBITO') d.notasCD += f.total;
    else d.notas += f.total;
    if (f.tipo !== 'NOTA_VENTA') d.sunat += f.total;
    dias.set(f.dia, d);
  }
  const porDia = [...dias.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([dia, d]) => ({
    dia, boletas: r2(d.boletas), facturas: r2(d.facturas), notasCD: r2(d.notasCD), sunat: r2(d.sunat), notas: r2(d.notas), total: r2(d.sunat + d.notas),
  }));

  // ── Lo que se exporta (Excel con 3 hojas; PDF con el detalle) ─────────────
  const tituloVista = VISTAS.find((x) => x.id === vista)!.titulo;
  const subtitulo = `${nombreMes(mes)} · del ${rep.desde.split('-').reverse().join('/')} al ${rep.hasta.split('-').reverse().join('/')}`;
  const resumenLineas = [
    `Boletas: ${rep.porTipo.BOLETA.cantidad} · ${formatPEN(rep.porTipo.BOLETA.total)}`,
    `Facturas: ${rep.porTipo.FACTURA.cantidad} · ${formatPEN(rep.porTipo.FACTURA.total)}`,
    `Notas de crédito: ${rep.porTipo.NOTA_CREDITO.cantidad} · ${formatPEN(rep.porTipo.NOTA_CREDITO.total)}`,
    `Total SUNAT: ${formatPEN(totalSunat)}`,
    `Notas de venta: ${rep.porTipo.NOTA_VENTA.cantidad} · ${formatPEN(totalNotas)}`,
    `Total general: ${formatPEN(r2(totalSunat + totalNotas))}`,
  ];
  const conImpuestos = vista !== 'notas';
  const colsDetalle: ColExport[] = [
    { header: 'Fecha', key: 'fecha', width: 17 },
    { header: 'Tipo', key: 'tipo', width: 15 },
    { header: 'Número', key: 'numero', width: 16 },
    ...(vista !== 'notas' ? [{ header: 'Corrige a', key: 'referencia', width: 15 }] : []),
    { header: 'Documento', key: 'doc_cliente', width: 16 },
    { header: 'Cliente', key: 'cliente', width: 30 },
    { header: 'Tienda', key: 'tienda', width: 16 },
    { header: 'Pago', key: 'metodos', width: 22 },
    ...(conImpuestos ? [
      { header: 'Base imponible', key: 'base', formato: 'moneda' as const, width: 14 },
      { header: 'IGV', key: 'igv', formato: 'moneda' as const, width: 11 },
    ] : []),
    { header: 'Total', key: 'total', formato: 'moneda' as const, width: 13 },
    { header: 'Estado', key: 'estado', width: 18 },
  ];
  const filaExport = (f: FilaComprobante) => ({
    fecha: formatDateTime(f.fecha), tipo: NOMBRE_TIPO[f.tipo], numero: f.numero, referencia: f.referencia,
    doc_cliente: f.doc_cliente, cliente: f.cliente, tienda: f.tienda, metodos: f.metodos,
    // Lo que no suma se exporta en 0 para que el total de la columna cuadre.
    base: f.cuenta ? f.base : 0, igv: f.cuenta ? f.igv : 0, total: f.cuenta ? f.total : 0,
    estado: f.cuenta ? f.estado : `${f.estado} (no suma: ${f.total.toFixed(2)})`,
  });
  const detalle: HojaPayload = {
    nombre: 'Detalle',
    titulo: `Comprobantes — ${tituloVista}`,
    subtitulo,
    filtros: resumenLineas,
    cols: colsDetalle,
    rows: filas.map(filaExport),
    totales: conImpuestos ? { base: baseVista, igv: igvVista, total: totalVista } : { total: totalVista },
  };
  // El PDF va apaisado con menos columnas: el documento junto con lo que corrige,
  // y el cliente con su DNI/RUC, para que los montos entren sin partirse.
  const detallePdf: HojaPayload = {
    ...detalle,
    etiquetaFiltros: 'Resumen',
    cols: [
      { header: 'Fecha', key: 'fecha', width: 15 },
      { header: 'Comprobante', key: 'comprobante', width: 22 },
      { header: 'Cliente', key: 'cliente_doc', width: 30 },
      { header: 'Tienda', key: 'tienda', width: 14 },
      { header: 'Pago', key: 'metodos', width: 22 },
      ...(conImpuestos ? [
        { header: 'Base', key: 'base', formato: 'moneda' as const },
        { header: 'IGV', key: 'igv', formato: 'moneda' as const },
      ] : []),
      { header: 'Total', key: 'total', formato: 'moneda' as const },
      { header: 'Estado', key: 'estado', width: 16 },
    ],
    rows: filas.map((f) => ({
      ...filaExport(f),
      comprobante: `${NOMBRE_TIPO[f.tipo]} ${f.numero}${f.referencia ? ` (corrige ${f.referencia})` : ''}`,
      cliente_doc: f.doc_cliente ? `${f.cliente} · ${f.doc_cliente}` : f.cliente,
    })),
  };
  detalle.etiquetaFiltros = 'Resumen';

  const hojas: HojaPayload[] = [
    {
      nombre: 'Resumen',
      titulo: 'Resumen del mes',
      subtitulo,
      cols: [
        { header: 'Documento', key: 'tipo', width: 22 },
        { header: 'Cantidad', key: 'cantidad', formato: 'numero', width: 11 },
        { header: 'Base imponible', key: 'base', formato: 'moneda', width: 16 },
        { header: 'IGV', key: 'igv', formato: 'moneda', width: 13 },
        { header: 'Total', key: 'total', formato: 'moneda', width: 15 },
      ],
      rows: [
        ...ES_SUNAT.map((t) => ({ tipo: NOMBRE_TIPO[t], ...rep.porTipo[t] })),
        { tipo: 'TOTAL SUNAT', cantidad: null, base: r2(ES_SUNAT.reduce((s, t) => s + rep.porTipo[t].base, 0)), igv: r2(ES_SUNAT.reduce((s, t) => s + rep.porTipo[t].igv, 0)), total: totalSunat },
        { tipo: 'Notas de venta', cantidad: rep.porTipo.NOTA_VENTA.cantidad, base: null, igv: null, total: totalNotas },
        { tipo: 'TOTAL GENERAL', cantidad: null, base: null, igv: null, total: r2(totalSunat + totalNotas) },
      ],
    },
    {
      nombre: 'Por día',
      titulo: 'Ventas por día',
      subtitulo,
      cols: [
        { header: 'Día', key: 'dia', width: 12 },
        { header: 'Boletas', key: 'boletas', formato: 'moneda', width: 13 },
        { header: 'Facturas', key: 'facturas', formato: 'moneda', width: 13 },
        { header: 'Notas créd./déb.', key: 'notasCD', formato: 'moneda', width: 15 },
        { header: 'Total SUNAT', key: 'sunat', formato: 'moneda', width: 14 },
        { header: 'Notas de venta', key: 'notas', formato: 'moneda', width: 14 },
        { header: 'Total del día', key: 'total', formato: 'moneda', width: 14 },
      ],
      rows: porDia.map((d) => ({ ...d, dia: d.dia.split('-').reverse().join('/') })),
      totales: {
        boletas: rep.porTipo.BOLETA.total, facturas: rep.porTipo.FACTURA.total,
        notasCD: r2(rep.porTipo.NOTA_CREDITO.total + rep.porTipo.NOTA_DEBITO.total),
        sunat: totalSunat, notas: totalNotas, total: r2(totalSunat + totalNotas),
      },
    },
    detalle,
  ];

  const enlace = (m: string, vv: Vista) => `/reportes/comprobantes?mes=${m}&vista=${vv}`;

  return (
    <PageShell
      title="Comprobantes del mes"
      description={`${nombreMes(mes)} · lo enviado a SUNAT, las notas de venta y el consolidado`}
      actions={<ExportarComprobantes titulo={`Comprobantes ${tituloVista} ${mes}`} hojas={hojas} detalle={detallePdf} />}
    >
      <form method="get" className="flex flex-wrap items-end gap-2 rounded-xl border bg-white p-3">
        <label className="flex flex-col text-[11px] font-medium uppercase tracking-wide text-slate-500">
          Mes
          <input type="month" name="mes" defaultValue={mes} className="mt-1 h-9 rounded-md border px-2 text-sm" />
        </label>
        <input type="hidden" name="vista" value={vista} />
        <button type="submit" className="h-9 rounded-md bg-happy-500 px-4 text-sm font-medium text-white hover:bg-happy-600">Ver</button>
      </form>

      <div className="grid gap-2 sm:grid-cols-3">
        {VISTAS.map((x) => (
          <Link key={x.id} href={enlace(mes, x.id)}
            className={`rounded-xl border p-3 transition ${vista === x.id ? 'border-happy-500 bg-happy-50 ring-1 ring-happy-500' : 'bg-white hover:bg-slate-50'}`}>
            <p className="text-sm font-semibold text-corp-900">{x.titulo}</p>
            <p className="text-xs text-slate-500">{x.detalle}</p>
            <p className="mt-1 font-display text-xl font-semibold text-corp-900">
              {formatPEN(x.id === 'sunat' ? totalSunat : x.id === 'notas' ? totalNotas : r2(totalSunat + totalNotas))}
            </p>
          </Link>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {(vista === 'notas' ? (['NOTA_VENTA'] as TipoDoc[]) : vista === 'sunat' ? (['BOLETA', 'FACTURA', 'NOTA_CREDITO'] as TipoDoc[]) : (['BOLETA', 'FACTURA', 'NOTA_CREDITO', 'NOTA_VENTA'] as TipoDoc[])).map((t) => (
          <Card key={t} className="p-4">
            <p className="text-xs text-slate-500">{NOMBRE_TIPO[t]}s · {rep.porTipo[t].cantidad}</p>
            <p className={`mt-1 font-display text-lg font-semibold ${rep.porTipo[t].total < 0 ? 'text-rose-600' : 'text-corp-900'}`}>{formatPEN(rep.porTipo[t].total)}</p>
          </Card>
        ))}
        {conImpuestos && (
          <Card className="p-4">
            <p className="text-xs text-slate-500">Base imponible / IGV</p>
            <p className="mt-1 text-sm font-semibold text-corp-900">{formatPEN(baseVista)}</p>
            <p className="text-sm text-slate-600">IGV {formatPEN(igvVista)}</p>
          </Card>
        )}
      </div>
      {rep.noCuentan > 0 && (
        <p className="text-xs text-slate-500">
          {rep.noCuentan} comprobante{rep.noCuentan === 1 ? '' : 's'} anulado{rep.noCuentan === 1 ? '' : 's'} o rechazado{rep.noCuentan === 1 ? '' : 's'} se listan pero no suman.
          Una factura anulada sí suma, y la resta su nota de crédito.
        </p>
      )}

      <Card>
        <CardContent className="p-0">
          <p className="border-b px-4 py-2 text-sm font-semibold text-corp-900">Por día</p>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Día</TableHead>
              {vista !== 'notas' && <><TableHead className="text-right">Boletas</TableHead><TableHead className="text-right">Facturas</TableHead><TableHead className="text-right">Notas créd.</TableHead><TableHead className="text-right">Total SUNAT</TableHead></>}
              {vista !== 'sunat' && <TableHead className="text-right">Notas de venta</TableHead>}
              {vista === 'todo' && <TableHead className="text-right">Total del día</TableHead>}
            </TableRow></TableHeader>
            <TableBody>
              {porDia.length === 0 && <TableRow><TableCell colSpan={7} className="py-8 text-center text-sm text-slate-500">Sin comprobantes en {nombreMes(mes)}.</TableCell></TableRow>}
              {porDia.map((d) => (
                <TableRow key={d.dia}>
                  <TableCell className="font-mono text-xs">{d.dia.split('-').reverse().join('/')}</TableCell>
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

      <Card>
        <CardContent className="p-0">
          <p className="border-b px-4 py-2 text-sm font-semibold text-corp-900">Detalle · {filas.length} comprobantes · {formatPEN(totalVista)}</p>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Fecha</TableHead><TableHead>Documento</TableHead><TableHead>Cliente</TableHead><TableHead>Tienda / pago</TableHead>
              {conImpuestos && <><TableHead className="text-right">Base</TableHead><TableHead className="text-right">IGV</TableHead></>}
              <TableHead className="text-right">Total</TableHead><TableHead>Estado</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {filas.map((f) => (
                <TableRow key={f.id} className={f.cuenta ? '' : 'opacity-50'}>
                  <TableCell className="whitespace-nowrap font-mono text-xs">{formatDateTime(f.fecha)}</TableCell>
                  <TableCell>
                    <Link href={`/comprobantes/${f.id}`} className="font-mono text-xs font-semibold text-corp-900 hover:text-happy-600">{f.numero}</Link>
                    <div className="text-[10px] text-slate-500">{NOMBRE_TIPO[f.tipo]}{f.referencia ? ` · corrige ${f.referencia}` : ''}</div>
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
        </CardContent>
      </Card>
    </PageShell>
  );
}
