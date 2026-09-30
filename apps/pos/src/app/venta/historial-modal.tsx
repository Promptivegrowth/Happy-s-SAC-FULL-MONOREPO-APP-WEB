'use client';

/**
 * Modal de HISTORIAL de transacciones de la sesión activa.
 *
 * Útil para que el cajero:
 *  - Verifique sus ventas al cuadrar caja
 *  - Vuelva a imprimir un ticket que no salió
 *  - Reenvíe boleta por WhatsApp a un cliente que la pidió después
 *  - Vea de un vistazo qué método de pago se usó en cada venta
 *
 * La reimpresión se agregó después del 18/09/2026. Ese día la ticketera quedó
 * mal conectada, los tickets no salían, y como no había forma de volver a
 * imprimir un comprobante ya emitido, en la tienda dejaron de usar el sistema y
 * vendieron en papel dos horas y media. La venta nunca fue el problema: quedaba
 * registrada igual. Lo que faltaba era poder sacar el papel más tarde.
 */

import { useEffect, useState } from 'react';
import { Card } from '@happy/ui/card';
import { Button } from '@happy/ui/button';
import { Badge } from '@happy/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { X, Loader2, History, Send, Clock, User, Users, Banknote, Receipt as ReceiptIcon, FileText, Search, Printer, Ban } from 'lucide-react';
import { formatPEN, formatDateTime } from '@happy/lib';
import { toast } from 'sonner';
import {
  obtenerHistorialSesion,
  obtenerSesionActiva,
  listarCierresParcialesSesion,
  firmarUrlComprobantePos,
  obtenerPdfDataVenta,
  guardarPdfComprobante,
} from '@/server/actions/caja';
import type { TransaccionRow, SesionCajaDTO, BalanceCajaDTO } from '@/server/actions/caja-helpers';
import { construirMensajeWhatsApp, abrirWhatsApp } from './whatsapp-helper';
import { generarTicket, abrirPDF } from './comprobante-pdf';
import { reimprimirComprobante, type EmpresaTicket } from './imprimir-ticket';
import { anularVentaPos } from '@/server/actions/anulacion';

/** Qué pasa al anular, según el documento, dicho antes de confirmar. */
function queVaAPasar(tipo: string | undefined): string {
  if (tipo === 'FACTURA') return 'La factura ya está en SUNAT: se emite una nota de crédito que la anula y se envía sola en unos minutos.';
  if (tipo === 'BOLETA') return 'La boleta queda anulada y SUNAT se entera en el resumen diario de las 23:00.';
  return 'La nota de venta queda anulada.';
}

type CierreParcial = {
  id: string;
  fecha: string;
  cajero_saliente_nombre: string | null;
  total_ventas: number;
  total_efectivo: number;
  diferencia: number;
  observaciones: string | null;
};

export function HistorialModal({
  onClose, empresaNombre, empresaTicket, almacenId, establecimiento, caja,
}: {
  onClose: () => void;
  empresaNombre: string;
  /** Datos de la empresa para armar el ticket ESC/POS; sin esto no se reimprime. */
  empresaTicket?: EmpresaTicket;
  almacenId?: string | null;
  establecimiento?: { nombre: string | null; direccion: string | null } | null;
  caja?: string | null;
}) {
  const hoyISO = new Date().toISOString().slice(0, 10);
  const [rows, setRows] = useState<TransaccionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [alcance, setAlcance] = useState<'SESION' | 'DIA' | 'RANGO'>('SESION');
  const [desde, setDesde] = useState(hoyISO);
  const [hasta, setHasta] = useState(hoyISO);
  const [buscarTick, setBuscarTick] = useState(0);
  const [pdfLoadingId, setPdfLoadingId] = useState<string | null>(null);
  const [reimprimiendoId, setReimprimiendoId] = useState<string | null>(null);
  const [sesion, setSesion] = useState<SesionCajaDTO | null>(null);
  const [balance, setBalance] = useState<BalanceCajaDTO | null>(null);
  const [cierresParciales, setCierresParciales] = useState<CierreParcial[]>([]);
  const [anulando, setAnulando] = useState<TransaccionRow | null>(null);
  const [motivo, setMotivo] = useState('');
  const [enviandoAnulacion, setEnviandoAnulacion] = useState(false);

  // Cargar metadata de sesión + balance + cierres parciales (no depende del alcance)
  useEffect(() => {
    obtenerSesionActiva().then((r) => {
      setSesion(r?.sesion ?? null);
      setBalance(r?.balance ?? null);
    });
    listarCierresParcialesSesion().then(setCierresParciales).catch(() => setCierresParciales([]));
  }, []);

  useEffect(() => {
    setLoading(true);
    (async () => {
      try {
        setRows(
          await obtenerHistorialSesion(
            alcance,
            alcance === 'RANGO' ? { desde, hasta } : undefined,
          ),
        );
      } finally {
        setLoading(false);
      }
    })();
    // El fetch por RANGO se dispara con el botón "Buscar" (buscarTick), no al
    // teclear las fechas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alcance, buscarTick]);

  // Las anuladas no suman: esa plata se devolvió.
  const total = rows.filter((r) => r.estado !== 'ANULADA').reduce((s, r) => s + r.total, 0);

  /**
   * Anula la venta completa con su motivo (pedido de Javier, 29/09/2026).
   *
   * El motivo es obligatorio y queda guardado con quién y cuándo. La mercadería
   * vuelve al stock y la venta sale del cuadre de caja, así que la plata se
   * devuelve de este cajón.
   */
  async function confirmarAnulacion() {
    if (!anulando) return;
    if (motivo.trim().length < 5) {
      toast.error('Escribe el motivo de la anulación');
      return;
    }
    setEnviandoAnulacion(true);
    try {
      const res = await anularVentaPos({ venta_id: anulando.venta_id, motivo });
      if (!res.ok) {
        toast.error(res.error, { duration: 10000 });
        return;
      }
      const d = res.data;
      setRows((prev) => prev.map((x) => (x.venta_id === anulando.venta_id ? { ...x, estado: 'ANULADA' } : x)));
      toast.success(
        `${d.documento} anulada. ${d.unidades} prenda${d.unidades === 1 ? '' : 's'} de vuelta al stock.` +
          (d.notaCredito ? ` Nota de crédito ${d.notaCredito}.` : ''),
        { duration: 8000 },
      );
      if (d.devolver.length > 0) {
        toast.info(`Si el cliente ya te pagó, devuélvele: ${d.devolver.join(' · ')}. Si no llegó a pagar, no devuelvas nada.`, { duration: 15000 });
      }
      if (d.saldoDevuelto > 0) {
        toast.info(`S/ ${d.saldoDevuelto.toFixed(2)} pagados con su adelanto volvieron a su saldo a favor.`, { duration: 12000 });
      }
      obtenerSesionActiva().then((r) => setBalance(r?.balance ?? null));
      setAnulando(null);
      setMotivo('');
    } finally {
      setEnviandoAnulacion(false);
    }
  }

  async function abrirPdf(r: TransaccionRow) {
    setPdfLoadingId(r.venta_id);
    try {
      // 1) Si ya está guardado en el sistema → URL firmada directa.
      if (r.comprobante_pdf_path) {
        const res = await firmarUrlComprobantePos(r.comprobante_pdf_path);
        if (res.ok) window.open(res.url, '_blank', 'noopener,noreferrer');
        else toast.error(res.error);
        return;
      }

      // 2) Retroactivo: reconstruir el PDF desde la BD, abrirlo y cachearlo
      //    para que también quede accesible desde el ERP a futuro.
      const data = await obtenerPdfDataVenta(r.venta_id);
      if (!data.ok) {
        toast.error(data.error);
        return;
      }
      const blob = await generarTicket(data.pdf_data);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);

      // Cachear (best-effort): subir el PDF y marcar la fila como guardada.
      try {
        const base64 = await new Promise<string>((resolve, reject) => {
          const fr = new FileReader();
          fr.onload = () => resolve((fr.result as string).split(',')[1] ?? '');
          fr.onerror = () => reject(new Error('No se pudo leer el PDF'));
          fr.readAsDataURL(blob);
        });
        const filename = `${data.tipo.toLowerCase()}_${data.numero.replace(/[^A-Za-z0-9_-]/g, '_')}.pdf`;
        const guardado = await guardarPdfComprobante({
          venta_id: r.venta_id,
          comprobante_id: null,
          filename,
          base64,
        });
        if (guardado.ok) {
          setRows((prev) =>
            prev.map((x) => (x.venta_id === r.venta_id ? { ...x, comprobante_pdf_path: guardado.path } : x)),
          );
        }
      } catch {
        /* si el cacheo falla, el PDF igual se abrió */
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPdfLoadingId(null);
    }
  }

  /**
   * Vuelve a sacar el ticket por la ticketera.
   *
   * No toca la venta ni el comprobante: son los mismos datos y el mismo número,
   * solo sale otra vez el papel. Si la ticketera no está disponible cae al PDF,
   * igual que al cobrar, así que el cajero siempre termina con algo en la mano.
   */
  async function reimprimir(r: TransaccionRow) {
    if (!empresaTicket) {
      toast.error('Falta la configuración de la empresa para armar el ticket');
      return;
    }
    setReimprimiendoId(r.venta_id);
    try {
      const data = await obtenerPdfDataVenta(r.venta_id);
      if (!data.ok) {
        toast.error(data.error);
        return;
      }

      const res = await reimprimirComprobante(
        data.pdf_data,
        { empresa: empresaTicket, establecimiento: establecimiento ?? null, caja: caja ?? null },
        almacenId ?? null,
      );

      if (res.via === 'agente' && res.estado === 'impreso') {
        toast.success(`Ticket reimpreso en ${res.equipo}`);
        return;
      }
      if (res.via === 'agente' && res.estado === 'esperando') {
        toast.warning(
          `El ticket está en cola en ${res.equipo} y todavía no sale. Revisa que la ticketera tenga papel y esté encendida.`,
          { duration: 9000 },
        );
        return;
      }

      // Cualquier otro caso: la ticketera no está disponible → papel por PDF.
      if (res.via === 'pdf' && res.motivo === 'sin-conexion') {
        toast.error(`La computadora "${res.detalle}" está apagada o sin internet. Se abre el PDF para imprimirlo a mano.`);
      } else if (res.via === 'pdf' && res.motivo === 'sin-equipo') {
        toast.warning('No hay ninguna ticketera configurada en esta tienda. Se abre el PDF.');
      } else {
        toast.error('La ticketera no pudo imprimir. Se abre el PDF para imprimirlo a mano.');
      }

      const blob = await generarTicket(data.pdf_data);
      abrirPDF(blob, `${data.tipo.toLowerCase()}_${data.numero.replace(/[^A-Za-z0-9_-]/g, '_')}.pdf`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setReimprimiendoId(null);
    }
  }

  function enviarWA(r: TransaccionRow) {
    if (!r.cliente_telefono) return;
    const msg = construirMensajeWhatsApp({
      nombre_cliente: r.cliente_nombre,
      numero_comprobante: r.comprobante?.numero_completo ?? r.numero_venta,
      tipo_comprobante: r.comprobante?.tipo ?? 'NOTA_VENTA',
      total: r.total,
      fecha: r.fecha,
      empresa_nombre: empresaNombre,
    });
    abrirWhatsApp(r.cliente_telefono, msg);
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-corp-900/60 backdrop-blur-sm p-4" onClick={onClose}>
      <Card className="flex w-full max-w-4xl flex-col p-0 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-happy-600" />
            <h2 className="font-display text-lg font-semibold text-corp-900">
              {alcance === 'SESION' ? 'Historial de la sesión' : alcance === 'RANGO' ? 'Búsqueda por fecha' : 'Ventas del día'}
            </h2>
            <Badge variant="outline" className="ml-2 text-[10px]">
              {rows.length} transacc{rows.length === 1 ? 'ión' : 'iones'}
            </Badge>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-display text-base font-semibold text-corp-900">
              Total: {formatPEN(total)}
            </span>
            <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Toggle de alcance */}
        <div className="flex border-b border-slate-200 bg-slate-50/50 px-5 py-2 gap-2">
          <button
            type="button"
            onClick={() => setAlcance('SESION')}
            className={`rounded-md px-3 py-1 text-xs font-medium transition ${
              alcance === 'SESION'
                ? 'bg-white text-happy-700 shadow-sm ring-1 ring-slate-200'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Esta sesión (turno actual)
          </button>
          <button
            type="button"
            onClick={() => setAlcance('DIA')}
            className={`rounded-md px-3 py-1 text-xs font-medium transition ${
              alcance === 'DIA'
                ? 'bg-white text-happy-700 shadow-sm ring-1 ring-slate-200'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Hoy completo (todas las sesiones de la caja)
          </button>
          <button
            type="button"
            onClick={() => setAlcance('RANGO')}
            className={`rounded-md px-3 py-1 text-xs font-medium transition ${
              alcance === 'RANGO'
                ? 'bg-white text-happy-700 shadow-sm ring-1 ring-slate-200'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Buscar por fecha
          </button>
        </div>

        {/* Búsqueda por rango de fechas */}
        {alcance === 'RANGO' && (
          <div className="flex flex-wrap items-end gap-2 border-b border-slate-200 bg-slate-50/50 px-5 py-2.5">
            <label className="flex flex-col text-[10px] font-medium text-slate-500">
              Desde
              <input
                type="date"
                value={desde}
                max={hasta}
                onChange={(e) => setDesde(e.target.value)}
                className="mt-0.5 rounded-md border border-slate-300 px-2 py-1 text-xs text-corp-900"
              />
            </label>
            <label className="flex flex-col text-[10px] font-medium text-slate-500">
              Hasta
              <input
                type="date"
                value={hasta}
                min={desde}
                max={hoyISO}
                onChange={(e) => setHasta(e.target.value)}
                className="mt-0.5 rounded-md border border-slate-300 px-2 py-1 text-xs text-corp-900"
              />
            </label>
            <Button size="sm" onClick={() => setBuscarTick((n) => n + 1)} disabled={loading}>
              <Search className="h-3.5 w-3.5" /> Buscar
            </Button>
          </div>
        )}

        {/* Info de la sesión activa (apertura + cajero + caja + monto) */}
        {sesion && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-slate-200 bg-happy-50/30 px-5 py-2 text-xs">
            <div className="flex items-center gap-1.5 text-slate-600">
              <Clock className="h-3.5 w-3.5 text-happy-600" />
              <span className="font-medium text-slate-500">Caja abierta desde:</span>
              <span className="font-mono font-semibold text-corp-900">{formatDateTime(sesion.abierta_en)}</span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-600">
              <User className="h-3.5 w-3.5 text-happy-600" />
              <span className="font-medium text-slate-500">Cajero:</span>
              <span className="font-semibold text-corp-900">{sesion.cajero_nombre}</span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-600">
              <span className="font-medium text-slate-500">Caja:</span>
              <span className="font-mono font-semibold text-corp-900">{sesion.caja_codigo}</span>
              <span className="text-slate-400">·</span>
              <span className="text-slate-600">{sesion.caja_nombre}</span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-600">
              <span className="font-medium text-slate-500">Apertura:</span>
              <span className="font-mono font-semibold text-corp-900">{formatPEN(sesion.monto_apertura)}</span>
            </div>
          </div>
        )}

        {/* Stats acumulados de la sesión (ventas + efectivo cobrado + métodos) */}
        {balance && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-slate-200 bg-emerald-50/30 px-5 py-2 text-xs">
            <div className="flex items-center gap-1.5">
              <ReceiptIcon className="h-3.5 w-3.5 text-emerald-600" />
              <span className="font-medium text-slate-500">Ventas en sesión:</span>
              <span className="font-mono font-bold text-corp-900">{balance.cantidad_ventas}</span>
              <span className="text-slate-400">·</span>
              <span className="font-mono font-semibold text-emerald-700">{formatPEN(balance.total_ventas)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Banknote className="h-3.5 w-3.5 text-emerald-600" />
              <span className="font-medium text-slate-500">Efectivo cobrado:</span>
              <span className="font-mono font-semibold text-emerald-700">{formatPEN(balance.total_efectivo)}</span>
            </div>
            {balance.total_yape > 0 && (
              <span className="text-slate-600">Yape <span className="font-mono font-medium text-corp-900">{formatPEN(balance.total_yape)}</span></span>
            )}
            {balance.total_plin > 0 && (
              <span className="text-slate-600">Plin <span className="font-mono font-medium text-corp-900">{formatPEN(balance.total_plin)}</span></span>
            )}
            {balance.total_tarjeta > 0 && (
              <span className="text-slate-600">Tarjeta <span className="font-mono font-medium text-corp-900">{formatPEN(balance.total_tarjeta)}</span></span>
            )}
            {balance.total_transferencia > 0 && (
              <span className="text-slate-600">Transf. <span className="font-mono font-medium text-corp-900">{formatPEN(balance.total_transferencia)}</span></span>
            )}
            {balance.total_gastos > 0 && (
              <span className="text-rose-600">Gastos <span className="font-mono font-semibold">−{formatPEN(balance.total_gastos)}</span></span>
            )}
          </div>
        )}

        {/* Cierres parciales previos (cambios de turno) */}
        {cierresParciales.length > 0 && (
          <div className="border-b border-slate-200 bg-amber-50/30 px-5 py-2 text-xs">
            <div className="flex items-center gap-1.5 mb-1">
              <Users className="h-3.5 w-3.5 text-amber-600" />
              <span className="font-medium text-amber-800">
                Cambios de turno en esta sesión ({cierresParciales.length})
              </span>
            </div>
            <div className="space-y-0.5 pl-5">
              {cierresParciales.slice(0, 5).map((c) => {
                const hora = new Date(c.fecha).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
                return (
                  <div key={c.id} className="flex flex-wrap items-center gap-x-2 text-slate-600">
                    <span className="font-mono font-semibold text-amber-700">{hora}</span>
                    <span className="text-slate-400">·</span>
                    <span className="font-medium text-corp-900">{c.cajero_saliente_nombre ?? '—'}</span>
                    <span className="text-slate-500">cerró turno</span>
                    <span className="text-slate-400">·</span>
                    <span>{c.total_ventas} venta{c.total_ventas === 1 ? '' : 's'}</span>
                    <span className="text-slate-400">·</span>
                    <span className="font-mono">Efectivo {formatPEN(c.total_efectivo)}</span>
                    {Math.abs(c.diferencia) > 0.01 && (
                      <span className={`font-mono font-medium ${c.diferencia > 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                        ({c.diferencia > 0 ? '+' : ''}{formatPEN(c.diferencia)})
                      </span>
                    )}
                    {c.observaciones && (
                      <span className="text-[10px] italic text-slate-500">— {c.observaciones}</span>
                    )}
                  </div>
                );
              })}
              {cierresParciales.length > 5 && (
                <div className="text-[10px] text-slate-500">…{cierresParciales.length - 5} más</div>
              )}
            </div>
          </div>
        )}

        {/* Body */}
        <div className="max-h-[70vh] overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-10 text-sm text-slate-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cargando…
            </div>
          )}
          {!loading && rows.length === 0 && (
            <div className="py-10 text-center text-sm text-slate-500">
              {alcance === 'RANGO'
                ? 'No hay ventas en el rango de fechas seleccionado.'
                : alcance === 'DIA'
                  ? 'No hay ventas registradas hoy en esta caja.'
                  : 'Todavía no hay transacciones en esta sesión.'}
            </div>
          )}
          {!loading && rows.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{alcance === 'SESION' ? 'Hora' : 'Fecha'}</TableHead>
                  <TableHead>Comprobante</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Métodos</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="w-24 text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.venta_id} className={r.estado === 'ANULADA' ? 'opacity-50' : ''}>
                    <TableCell className="font-mono text-xs">
                      {alcance === 'SESION'
                        ? new Date(r.fecha).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })
                        : formatDateTime(r.fecha)}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm font-medium text-corp-900">
                        {r.comprobante?.numero_completo ?? r.numero_venta}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {r.comprobante?.tipo ?? 'venta'}
                        {r.estado === 'ANULADA' && <span className="ml-1 text-rose-600">· ANULADA</span>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{r.cliente_nombre}</div>
                      {r.cliente_doc && <div className="text-[10px] text-slate-500">{r.cliente_doc}</div>}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {r.metodos.length === 0 && <span className="text-[10px] text-slate-400">—</span>}
                        {r.metodos.map((m, i) => (
                          <Badge key={i} variant="secondary" className="text-[10px]">{m}</Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm font-semibold text-corp-900">
                      {formatPEN(r.total)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        {r.estado !== 'ANULADA' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => reimprimir(r)}
                            disabled={reimprimiendoId === r.venta_id}
                            title="Reimprimir el ticket por la ticketera (no vuelve a cobrar)"
                          >
                            {reimprimiendoId === r.venta_id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin text-corp-600" />
                            ) : (
                              <Printer className="h-3.5 w-3.5 text-corp-600" />
                            )}
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => abrirPdf(r)}
                          disabled={pdfLoadingId === r.venta_id}
                          title={r.comprobante_pdf_path ? 'Ver / imprimir / descargar PDF' : 'Generar PDF (imprimir / descargar)'}
                        >
                          {pdfLoadingId === r.venta_id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-happy-600" />
                          ) : (
                            <FileText className="h-3.5 w-3.5 text-happy-600" />
                          )}
                        </Button>
                        {r.estado !== 'ANULADA' && sesion && r.caja_sesion_id === sesion.id && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => { setAnulando(r); setMotivo(''); }}
                            title="Anular la venta completa (pide el motivo)"
                          >
                            <Ban className="h-3.5 w-3.5 text-rose-600" />
                          </Button>
                        )}
                        {r.cliente_telefono && r.estado !== 'ANULADA' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => enviarWA(r)}
                            title={`Enviar a ${r.cliente_telefono}`}
                          >
                            <Send className="h-3.5 w-3.5 text-emerald-600" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </Card>

      {anulando && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-corp-900/50 p-4"
          onClick={(e) => { e.stopPropagation(); if (!enviandoAnulacion) setAnulando(null); }}
        >
          <Card className="w-full max-w-md space-y-4 p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3">
              <Ban className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
              <div>
                <h3 className="font-display text-base font-semibold text-corp-900">
                  Anular {anulando.comprobante?.numero_completo ?? anulando.numero_venta}
                </h3>
                <p className="text-sm text-slate-600">
                  {anulando.cliente_nombre} · <span className="font-mono font-semibold">{formatPEN(anulando.total)}</span>
                </p>
              </div>
            </div>

            <ul className="space-y-1 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
              <li>• Se anula la venta completa y las prendas vuelven al stock.</li>
              <li>• {queVaAPasar(anulando.comprobante?.tipo)}</li>
              <li>• Sale del cuadre de caja. Si el cliente ya pagó, devuélvele la plata{anulando.metodos.length ? ` (${anulando.metodos.join(', ')})` : ''}; si no llegó a pagar, no hay nada que devolver y el cuadre igual queda bien.</li>
              <li>• Queda registrado quién la anuló, cuándo y por qué. No se puede deshacer.</li>
            </ul>

            <label className="block text-sm font-medium text-corp-900">
              Motivo <span className="text-rose-600">*</span>
              <textarea
                autoFocus
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                maxLength={300}
                rows={3}
                placeholder="Ej: se cobró dos veces / el cliente pidió factura / talla equivocada"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-normal"
              />
            </label>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setAnulando(null)} disabled={enviandoAnulacion}>Cancelar</Button>
              <Button
                onClick={confirmarAnulacion}
                disabled={enviandoAnulacion || motivo.trim().length < 5}
                className="bg-rose-600 text-white hover:bg-rose-700"
              >
                {enviandoAnulacion ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
                Anular venta
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
