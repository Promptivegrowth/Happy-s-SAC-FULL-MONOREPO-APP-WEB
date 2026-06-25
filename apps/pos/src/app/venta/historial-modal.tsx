'use client';

/**
 * Modal de HISTORIAL de transacciones de la sesión activa.
 *
 * Útil para que el cajero:
 *  - Verifique sus ventas al cuadrar caja
 *  - Reenvíe boleta por WhatsApp a un cliente que la pidió después
 *  - Vea de un vistazo qué método de pago se usó en cada venta
 */

import { useEffect, useState } from 'react';
import { Card } from '@happy/ui/card';
import { Button } from '@happy/ui/button';
import { Badge } from '@happy/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { X, Loader2, History, Send, Clock, User, Users, Banknote, Receipt as ReceiptIcon } from 'lucide-react';
import { formatPEN, formatDateTime } from '@happy/lib';
import {
  obtenerHistorialSesion,
  obtenerSesionActiva,
  listarCierresParcialesSesion,
} from '@/server/actions/caja';
import type { TransaccionRow, SesionCajaDTO, BalanceCajaDTO } from '@/server/actions/caja-helpers';
import { construirMensajeWhatsApp, abrirWhatsApp } from './whatsapp-helper';

type CierreParcial = {
  id: string;
  fecha: string;
  cajero_saliente_nombre: string | null;
  total_ventas: number;
  total_efectivo: number;
  diferencia: number;
  observaciones: string | null;
};

export function HistorialModal({ onClose, empresaNombre }: { onClose: () => void; empresaNombre: string }) {
  const [rows, setRows] = useState<TransaccionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [alcance, setAlcance] = useState<'SESION' | 'DIA'>('SESION');
  const [sesion, setSesion] = useState<SesionCajaDTO | null>(null);
  const [balance, setBalance] = useState<BalanceCajaDTO | null>(null);
  const [cierresParciales, setCierresParciales] = useState<CierreParcial[]>([]);

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
        setRows(await obtenerHistorialSesion(alcance));
      } finally {
        setLoading(false);
      }
    })();
  }, [alcance]);

  const total = rows.reduce((s, r) => s + r.total, 0);

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
              {alcance === 'SESION' ? 'Historial de la sesión' : 'Ventas del día'}
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
        </div>

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
              Todavía no hay transacciones en esta sesión.
            </div>
          )}
          {!loading && rows.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Hora</TableHead>
                  <TableHead>Comprobante</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Métodos</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.venta_id} className={r.estado === 'ANULADA' ? 'opacity-50' : ''}>
                    <TableCell className="font-mono text-xs">
                      {new Date(r.fecha).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}
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
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </Card>
    </div>
  );
}
