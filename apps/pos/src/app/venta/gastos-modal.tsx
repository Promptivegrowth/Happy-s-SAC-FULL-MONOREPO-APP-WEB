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
  ArrowDown, ArrowUp, Coins, Loader2, Plus, Trash2, X, Receipt,
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
    if (!m || m <= 0) return toast.error('Monto inválido');
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
          <button onClick={onClose} disabled={pending} className="rounded p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Totales rápidos */}
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
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
                min={0}
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
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

        <div className="mt-5 flex justify-end">
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cerrar
          </Button>
        </div>
      </Card>
    </div>
  );
}
