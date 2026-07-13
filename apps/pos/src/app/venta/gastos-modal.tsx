'use client';

/**
 * Modal de Gastos/Movimientos de Caja Chica.
 *
 * Permite al cajero registrar EGRESOS (gastos) e INGRESOS no asociados a venta
 * (ej. devoluciones manuales). Lista los movimientos de la sesión actual con
 * opción de eliminar los propios.
 */

import { useEffect, useState, useTransition } from 'react';
import { Card } from '@happy/ui/card';
import { Input } from '@happy/ui/input';
import { Label } from '@happy/ui/label';
import { Button } from '@happy/ui/button';
import { Badge } from '@happy/ui/badge';
import {
  ArrowDown, ArrowUp, Coins, Loader2, Plus, Trash2, X, Receipt, Printer,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatPEN } from '@happy/lib';
import {
  listarCategoriasGasto,
  listarMovimientosCajaChicaSesion,
  registrarMovimientoCajaChica,
  eliminarMovimientoCajaChica,
  type CategoriaGasto,
  type MovimientoCajaChica,
} from '@/server/actions/caja-chica';

type Tipo = 'INGRESO' | 'EGRESO';

export function GastosModal({ onClose }: { onClose: () => void }) {
  const [pending, start] = useTransition();
  const [categorias, setCategorias] = useState<CategoriaGasto[]>([]);
  const [movs, setMovs] = useState<MovimientoCajaChica[]>([]);

  // Form
  const [tipo, setTipo] = useState<Tipo>('EGRESO');
  const [categoriaId, setCategoriaId] = useState<string>('');
  const [concepto, setConcepto] = useState('');
  const [monto, setMonto] = useState('');
  const [comprobante, setComprobante] = useState('');

  // Cargar inicial
  useEffect(() => {
    void Promise.all([
      listarCategoriasGasto(),
      listarMovimientosCajaChicaSesion(),
    ]).then(([c, m]) => {
      setCategorias(c);
      setMovs(m);
    });
  }, []);

  async function refresh() {
    const m = await listarMovimientosCajaChicaSesion();
    setMovs(m);
  }

  function registrar() {
    const m = Number(monto);
    if (!Number.isFinite(m) || m <= 0) {
      return toast.error('El monto debe ser mayor a 0');
    }
    if (!concepto.trim()) return toast.error('Describí el motivo');

    start(async () => {
      const r = await registrarMovimientoCajaChica({
        tipo,
        concepto: concepto.trim(),
        categoria_id: categoriaId || null,
        monto: m,
        metodo: 'EFECTIVO',
        comprobante_ref: comprobante.trim() || null,
      });
      if (!r.ok) {
        toast.error(r.error ?? 'No se pudo registrar');
        return;
      }
      toast.success(`${tipo === 'EGRESO' ? 'Gasto' : 'Ingreso'} registrado · ${formatPEN(m)}`);
      // Limpiar form
      setConcepto('');
      setMonto('');
      setComprobante('');
      setCategoriaId('');
      await refresh();
    });
  }

  function eliminar(id: string, concepto: string) {
    if (!confirm(`¿Eliminar "${concepto}"?`)) return;
    start(async () => {
      const r = await eliminarMovimientoCajaChica(id);
      if (!r.ok) {
        toast.error(r.error ?? 'No se pudo eliminar');
        return;
      }
      toast.success('Eliminado');
      await refresh();
    });
  }

  const totalEgresos = movs.filter((m) => m.tipo === 'EGRESO').reduce((s, m) => s + m.monto, 0);
  const totalIngresos = movs.filter((m) => m.tipo === 'INGRESO').reduce((s, m) => s + m.monto, 0);
  const totalNeto = totalIngresos - totalEgresos;

  // Imprime el listado en una ventana nueva con estilo tipo ticket 80mm.
  // Cliente pidió (post-2026-07-08) tener boton imprimir para dejar copia
  // fisica del cuadre de caja chica del turno.
  function imprimir() {
    const empresa = 'HAPPY SAC';
    const fecha = new Date().toLocaleString('es-PE');
    const filas = movs
      .map((m) => {
        const hora = new Date(m.fecha).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
        const signo = m.tipo === 'EGRESO' ? '-' : '+';
        const cat = m.categoria_nombre ? ` [${m.categoria_nombre}]` : '';
        const comp = m.comprobante_ref ? `<div style="font-size:9px;color:#777;margin-left:4px">Ref: ${m.comprobante_ref}</div>` : '';
        return `<tr>
          <td style="padding:2px 4px;font-family:monospace">${hora}</td>
          <td style="padding:2px 4px">${m.concepto}${cat}${comp}</td>
          <td style="padding:2px 4px;text-align:right;font-weight:bold;color:${m.tipo === 'EGRESO' ? '#c026d3' : '#059669'};font-family:monospace">${signo}S/ ${m.monto.toFixed(2)}</td>
        </tr>`;
      })
      .join('');
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Caja chica ${fecha}</title>
      <style>
        body{font-family:Arial,sans-serif;padding:12px;max-width:80mm;margin:0 auto;color:#0f172a}
        h1{font-size:14px;text-align:center;margin:0 0 4px}
        .sub{text-align:center;font-size:10px;color:#666;margin-bottom:8px}
        .box{border:1px solid #ddd;padding:6px;margin:6px 0;border-radius:4px}
        .row{display:flex;justify-content:space-between;font-size:11px;margin:2px 0}
        .row .lbl{color:#666}
        .row .val{font-weight:bold;font-family:monospace}
        table{width:100%;border-collapse:collapse;font-size:10px;margin-top:8px}
        thead th{background:#1e3a5f;color:#fff;padding:3px 4px;text-align:left;font-size:10px}
        .total{border-top:2px solid #1e3a5f;padding-top:6px;margin-top:8px;font-size:13px;font-weight:bold}
        .neto{color:${totalNeto >= 0 ? '#059669' : '#c026d3'}}
        .foot{margin-top:16px;font-size:9px;color:#999;text-align:center}
      </style>
    </head><body>
      <h1>${empresa}</h1>
      <div class="sub">CAJA CHICA — Movimientos del turno<br/>${fecha}</div>
      <div class="box">
        <div class="row"><span class="lbl">Ingresos</span><span class="val" style="color:#059669">+S/ ${totalIngresos.toFixed(2)}</span></div>
        <div class="row"><span class="lbl">Egresos</span><span class="val" style="color:#c026d3">-S/ ${totalEgresos.toFixed(2)}</span></div>
        <div class="row"><span class="lbl">N° movimientos</span><span class="val">${movs.length}</span></div>
      </div>
      <table>
        <thead><tr><th>Hora</th><th>Concepto</th><th style="text-align:right">Monto</th></tr></thead>
        <tbody>${filas || '<tr><td colspan="3" style="text-align:center;padding:10px;color:#999">Sin movimientos</td></tr>'}</tbody>
      </table>
      <div class="total row"><span>TOTAL NETO</span><span class="neto">${totalNeto >= 0 ? '+' : ''}S/ ${totalNeto.toFixed(2)}</span></div>
      <div class="foot">Impreso desde HAPPY SAC POS</div>
    </body></html>`;

    const w = window.open('', '_blank');
    if (!w) { toast.error('El navegador bloqueó la ventana. Permitá popups y probá de nuevo.'); return; }
    w.document.write(html);
    w.document.close();
    // Auto-print + focus (comportamiento igual al comprobante-pdf del POS)
    const tryPrint = () => { try { w.focus(); w.print(); } catch { /* ignore */ } };
    w.addEventListener('load', tryPrint);
    setTimeout(tryPrint, 700);
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-corp-900/60 backdrop-blur-sm p-4">
      <Card className="w-full max-w-3xl max-h-[92vh] overflow-y-auto p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 font-display text-xl font-semibold text-corp-900">
              <Coins className="h-5 w-5 text-amber-600" />
              Gastos de caja chica
            </h2>
            <p className="text-xs text-slate-500">
              Registrá los egresos del turno (en efectivo). Se descuentan del cuadre al cerrar la caja.
            </p>
          </div>
          {/* Cliente reporto (2026-07-12) que despues de imprimir cuadre los
              botones de cerrar quedaban disabled (pending stuck) y no habia
              como salir. Cerrar debe funcionar SIEMPRE — solo los botones
              de operacion (Registrar/Eliminar) chequean pending. */}
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Totales rápidos */}
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-rose-200 bg-rose-50/50 p-3">
            <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-rose-700">
              <ArrowDown className="h-3 w-3" />
              Egresos del turno
            </div>
            <p className="font-display text-xl font-semibold text-rose-700">{formatPEN(totalEgresos)}</p>
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
            <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-emerald-700">
              <ArrowUp className="h-3 w-3" />
              Ingresos del turno
            </div>
            <p className="font-display text-xl font-semibold text-emerald-700">{formatPEN(totalIngresos)}</p>
          </div>
          <div
            className={`rounded-lg border p-3 ${
              totalNeto >= 0 ? 'border-corp-200 bg-corp-50/50' : 'border-amber-200 bg-amber-50/50'
            }`}
          >
            <div className={`text-[10px] uppercase tracking-wider ${totalNeto >= 0 ? 'text-corp-700' : 'text-amber-700'}`}>
              Total neto (ing − egr)
            </div>
            <p className={`font-display text-xl font-semibold ${totalNeto >= 0 ? 'text-corp-900' : 'text-amber-800'}`}>
              {totalNeto >= 0 ? '' : '−'}{formatPEN(Math.abs(totalNeto))}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">Movimientos</div>
            <p className="font-display text-xl font-semibold text-corp-900">{movs.length}</p>
          </div>
        </div>

        {/* Formulario de registro */}
        <div className="mt-5 rounded-lg border bg-white p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Registrar nuevo movimiento
          </h3>

          {/* Selector tipo */}
          <div className="mb-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setTipo('EGRESO')}
              className={`flex items-center justify-center gap-2 rounded-lg border-2 px-4 py-2 text-sm font-medium transition ${
                tipo === 'EGRESO'
                  ? 'border-rose-400 bg-rose-50 text-rose-700'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
              }`}
            >
              <ArrowDown className="h-4 w-4" />
              Egreso (gasto)
            </button>
            <button
              type="button"
              onClick={() => setTipo('INGRESO')}
              className={`flex items-center justify-center gap-2 rounded-lg border-2 px-4 py-2 text-sm font-medium transition ${
                tipo === 'INGRESO'
                  ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
              }`}
            >
              <ArrowUp className="h-4 w-4" />
              Ingreso (entrada no de venta)
            </button>
          </div>

          {/* Categoría (solo egresos por defecto, pero la dejamos disponible siempre) */}
          <div className="mb-3">
            <Label className="text-xs">Categoría</Label>
            <select
              value={categoriaId}
              onChange={(e) => setCategoriaId(e.target.value)}
              className="mt-1 h-10 w-full rounded-md border border-input bg-white px-3 text-sm"
            >
              <option value="">— Sin categoría (texto libre) —</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs">Concepto / Motivo *</Label>
              <Input
                value={concepto}
                onChange={(e) => setConcepto(e.target.value)}
                placeholder="Ej: gasolina moto, almuerzo, taxi al banco…"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Monto (S/) *</Label>
              <Input
                type="number"
                step="0.01"
                min={0.01}
                inputMode="decimal"
                value={monto}
                onChange={(e) => {
                  // Bloquear caracteres inválidos y valores negativos —
                  // cliente reportó (2026-07-12) que dejaba entrar negativos.
                  const raw = e.target.value.replace(/[^\d.]/g, '');
                  setMonto(raw);
                }}
                placeholder="0.00"
                className="mt-1"
              />
            </div>
          </div>

          <div className="mt-3">
            <Label className="text-xs">N° de comprobante (opcional)</Label>
            <Input
              value={comprobante}
              onChange={(e) => setComprobante(e.target.value)}
              placeholder="Ej: F001-12345 / Recibo manual…"
              className="mt-1"
            />
          </div>

          <Button onClick={registrar} disabled={pending} className="mt-4 w-full" variant="premium">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Registrar {tipo === 'EGRESO' ? 'gasto' : 'ingreso'}
          </Button>
        </div>

        {/* Listado de movimientos del turno */}
        <div className="mt-5">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Movimientos del turno ({movs.length})
          </h3>
          {movs.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-300 py-6 text-center text-xs text-slate-500">
              Sin movimientos registrados todavía.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-xs">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-2 py-1.5 text-left">Hora</th>
                    <th className="px-2 py-1.5 text-left">Tipo</th>
                    <th className="px-2 py-1.5 text-left">Concepto</th>
                    <th className="px-2 py-1.5 text-left">Categoría</th>
                    <th className="px-2 py-1.5 text-right">Monto</th>
                    <th className="px-2 py-1.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {movs.map((m) => {
                    const hora = new Date(m.fecha).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
                    return (
                      <tr key={m.id} className="border-t border-slate-100">
                        <td className="px-2 py-1.5 font-mono text-[11px] text-slate-500">{hora}</td>
                        <td className="px-2 py-1.5">
                          {m.tipo === 'EGRESO' ? (
                            <Badge className="bg-rose-100 text-rose-700 text-[10px]"><ArrowDown className="mr-0.5 inline h-3 w-3" />Egreso</Badge>
                          ) : (
                            <Badge className="bg-emerald-100 text-emerald-700 text-[10px]"><ArrowUp className="mr-0.5 inline h-3 w-3" />Ingreso</Badge>
                          )}
                        </td>
                        <td className="px-2 py-1.5">
                          <div className="font-medium text-slate-800">{m.concepto}</div>
                          {m.comprobante_ref && (
                            <div className="flex items-center gap-1 text-[10px] text-slate-400">
                              <Receipt className="h-2.5 w-2.5" /> {m.comprobante_ref}
                            </div>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-slate-600">{m.categoria_nombre ?? '—'}</td>
                        <td className={`px-2 py-1.5 text-right font-mono font-semibold ${m.tipo === 'EGRESO' ? 'text-rose-700' : 'text-emerald-700'}`}>
                          {m.tipo === 'EGRESO' ? '-' : '+'}{formatPEN(m.monto)}
                        </td>
                        <td className="px-2 py-1.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-rose-600 hover:bg-rose-50"
                            onClick={() => eliminar(m.id, m.concepto)}
                            disabled={pending}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          {movs.length > 0 && (
            <Button
              variant="outline"
              onClick={imprimir}
              className="border-corp-300 text-corp-700 hover:bg-corp-50"
            >
              <Printer className="h-4 w-4" /> Imprimir cuadre
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </Card>
    </div>
  );
}
