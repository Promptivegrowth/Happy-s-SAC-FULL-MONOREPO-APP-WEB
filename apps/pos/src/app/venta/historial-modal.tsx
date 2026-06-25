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
import { X, Loader2, History, Send } from 'lucide-react';
import { formatPEN } from '@happy/lib';
import { obtenerHistorialSesion } from '@/server/actions/caja';
import type { TransaccionRow } from '@/server/actions/caja-helpers';
import { construirMensajeWhatsApp, abrirWhatsApp } from './whatsapp-helper';

export function HistorialModal({ onClose, empresaNombre }: { onClose: () => void; empresaNombre: string }) {
  const [rows, setRows] = useState<TransaccionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [alcance, setAlcance] = useState<'SESION' | 'DIA'>('SESION');

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
