'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@happy/ui/button';
import { Input } from '@happy/ui/input';
import { Textarea } from '@happy/ui/textarea';
import { Badge } from '@happy/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { Loader2, ArrowRight, Save, Pencil, X, Printer, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { cambiarEstadoOS, registrarRecepcionOS, editarOS, registrarAviosDevueltos, retornarFallasAlServicio } from '@/server/actions/corte';
import { generarOSPdf, type OSPdfData } from './os-pdf';
import type { EmpresaPDFData } from '@/server/empresa-pdf-helper';
import { formatTallaChip } from '@happy/lib';

const FLOW: Record<string, string[]> = {
  EMITIDA: ['DESPACHADA','ANULADA'],
  DESPACHADA: ['EN_PROCESO'],
  EN_PROCESO: ['RECEPCIONADA'],
  // La recepción parcial se completa desde el editor de recepción; acá solo
  // ofrecemos cerrar (si ya volvió todo) o anular.
  RECEPCION_PARCIAL: ['CERRADA','ANULADA'],
  RECEPCIONADA: ['CERRADA'],
};

export function OsTransitions({ osId, estado }: { osId: string; estado: string }) {
  const [pending, start] = useTransition();
  const next = FLOW[estado] ?? [];
  if (next.length === 0) return null;

  function go(nuevo: string) {
    if (!confirm(`¿Cambiar estado a ${nuevo.replace('_', ' ')}?`)) return;
    start(async () => {
      const r = await cambiarEstadoOS(osId, nuevo);
      if (r.ok) toast.success('Estado actualizado');
      else toast.error(r.error ?? 'Error');
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      {next.map((n) => (
        <Button
          key={n}
          variant={n === 'ANULADA' ? 'destructive' : n === 'CERRADA' || n === 'RECEPCIONADA' ? 'premium' : 'corp'}
          size="sm"
          onClick={() => go(n)}
          disabled={pending}
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
          {n.replace('_', ' ')}
        </Button>
      ))}
    </div>
  );
}

/**
 * Botón de impresión de la OS: genera UN PDF con 3 copias (2 con tarifas —
 * gerencia y taller — y 1 de control sin tarifas). Pedido del cliente 21/07/2026.
 */
export function ImprimirOSButton({ os, empresa }: { os: OSPdfData; empresa: EmpresaPDFData | null }) {
  const [loading, setLoading] = useState(false);
  async function imprimir() {
    setLoading(true);
    try {
      await generarOSPdf(os, empresa);
      toast.success('PDF generado — 3 copias (gerencia, taller, control)');
    } catch (e) {
      toast.error(`No se pudo generar el PDF: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }
  return (
    <Button variant="corp" size="sm" onClick={imprimir} disabled={loading}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
      Imprimir (3 copias)
    </Button>
  );
}

/**
 * Editor de la OS ANTES del despacho (pedido del cliente 21/07/2026): permite
 * cambiar el taller, la fecha de envío / entrega y las cantidades por línea
 * mientras la OS está EMITIDA. Al guardar, el server regenera avíos y totales.
 */
type LineaEdit = { id: string; producto_nombre: string; talla: string; cantidad: number };
export function EditarOSEditor({
  osId,
  tallerActual,
  fechaEnvioInicial,
  fechaEntregaInicial,
  montoBaseInicial,
  talleres,
  lineas,
}: {
  osId: string;
  tallerActual: string;
  fechaEnvioInicial: string;
  fechaEntregaInicial: string;
  montoBaseInicial: number;
  talleres: { id: string; nombre: string }[];
  lineas: LineaEdit[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [abierto, setAbierto] = useState(false);
  const [tallerId, setTallerId] = useState(tallerActual);
  const [fechaEnvio, setFechaEnvio] = useState(fechaEnvioInicial);
  const [fechaEntrega, setFechaEntrega] = useState(fechaEntregaInicial);
  const [montoBase, setMontoBase] = useState(String(montoBaseInicial));
  const [rows, setRows] = useState<LineaEdit[]>(lineas);

  function setCant(i: number, v: string) {
    const n = v === '' ? 0 : Math.max(0, Math.floor(Number(v)));
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, cantidad: Number.isFinite(n) ? n : 0 } : r)));
  }
  function cancelar() {
    setTallerId(tallerActual);
    setFechaEnvio(fechaEnvioInicial);
    setFechaEntrega(fechaEntregaInicial);
    setMontoBase(String(montoBaseInicial));
    setRows(lineas);
    setAbierto(false);
  }
  function guardar() {
    if (!tallerId) return toast.error('Elegí un taller.');
    start(async () => {
      const r = await editarOS(osId, {
        tallerId,
        fechaEnvio,
        fechaEntrega,
        montoBase: Number(montoBase || 0),
        lineas: rows.map((x) => ({ id: x.id, cantidad: x.cantidad })),
      });
      if (r.ok) {
        toast.success('Orden actualizada — avíos y totales recalculados');
        setAbierto(false);
        router.refresh();
      } else toast.error(r.error ?? 'Error');
    });
  }

  if (!abierto) {
    return (
      <Button variant="outline" size="sm" onClick={() => setAbierto(true)}>
        <Pencil className="h-4 w-4" /> Modificar orden
      </Button>
    );
  }

  return (
    <div className="space-y-4 rounded-lg border-2 border-happy-200 bg-happy-50/40 p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-sm font-semibold text-corp-900">Modificar orden (antes del despacho)</h3>
        <Button variant="ghost" size="sm" onClick={cancelar} disabled={pending}>
          <X className="h-4 w-4" /> Cancelar
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Taller</label>
          <select
            value={tallerId}
            onChange={(e) => setTallerId(e.target.value)}
            disabled={pending}
            className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {talleres.map((t) => (
              <option key={t.id} value={t.id}>{t.nombre}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Monto base (S/)</label>
          <Input type="number" step="0.01" min={0} value={montoBase} onChange={(e) => setMontoBase(e.target.value)} disabled={pending} className="mt-1 h-9 text-sm" />
        </div>
        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Fecha de envío al taller</label>
          <Input type="date" value={fechaEnvio} onChange={(e) => setFechaEnvio(e.target.value)} disabled={pending} className="mt-1 h-9 text-sm" />
        </div>
        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Fecha entrega esperada</label>
          <Input type="date" value={fechaEntrega} onChange={(e) => setFechaEntrega(e.target.value)} disabled={pending} className="mt-1 h-9 text-sm" />
        </div>
      </div>
      <div>
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Cantidades por línea</p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Producto</TableHead>
              <TableHead>Talla</TableHead>
              <TableHead className="text-right">Cantidad a enviar</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((l, i) => (
              <TableRow key={l.id}>
                <TableCell className="font-medium">{l.producto_nombre}</TableCell>
                <TableCell><Badge variant="outline">{formatTallaChip(l.talla)}</Badge></TableCell>
                <TableCell className="text-right">
                  <Input
                    type="number"
                    min={0}
                    value={l.cantidad || ''}
                    onChange={(e) => setCant(i, e.target.value)}
                    disabled={pending}
                    className="ml-auto h-8 w-24 text-right text-xs"
                    placeholder="0"
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="mt-2 text-[11px] text-slate-500">
          Al guardar se recalculan los avíos del BOM y los totales (movilidad/campaña) según las nuevas cantidades. Si cambiaste de taller, revisá el monto base.
        </p>
      </div>
      <div className="flex justify-end">
        <Button variant="premium" size="sm" onClick={guardar} disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Guardar cambios
        </Button>
      </div>
    </div>
  );
}

/**
 * Editor de RECEPCIÓN de la OS (pedido del cliente 21/07/2026): fecha de
 * retorno + unidades aprobadas (recepcionadas) y falladas por línea. La OS
 * la trabaja un tercero (taller), así que acá solo se registra lo que vuelve.
 */
type LineaRecep = {
  id: string;
  producto_nombre: string;
  producto_codigo: string;
  talla: string;
  enviado: number;
  recepcionada: number;
  fallada: number;
};
export function RecepcionOSEditor({
  osId,
  fechaRetornoInicial,
  motivoFallaInicial = '',
  lineas,
  disabled,
}: {
  osId: string;
  fechaRetornoInicial: string;
  motivoFallaInicial?: string;
  lineas: LineaRecep[];
  disabled: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [fechaRetorno, setFechaRetorno] = useState(
    fechaRetornoInicial || new Date().toISOString().slice(0, 10),
  );
  const [rows, setRows] = useState<LineaRecep[]>(lineas);
  const [motivoFalla, setMotivoFalla] = useState(motivoFallaInicial);

  function setVal(i: number, campo: 'recepcionada' | 'fallada', v: string) {
    const n = v === '' ? 0 : Math.max(0, Math.floor(Number(v)));
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [campo]: Number.isFinite(n) ? n : 0 } : r)));
  }
  function completarTodo() {
    // Marca todo lo enviado como recepcionado (aprobado), fallas en 0.
    setRows((prev) => prev.map((r) => ({ ...r, recepcionada: r.enviado, fallada: 0 })));
  }

  const totalRecep = rows.reduce((s, r) => s + r.recepcionada, 0);
  const totalFall = rows.reduce((s, r) => s + r.fallada, 0);
  const totalEnv = rows.reduce((s, r) => s + r.enviado, 0);
  const excede = rows.some((r) => r.recepcionada + r.fallada > r.enviado);
  // Entrega parcial: se procesó algo pero no todo lo enviado (en campaña el
  // taller devuelve por partes). Se puede guardar igual y volver más adelante.
  const totalProcesado = totalRecep + totalFall;
  const esParcial = totalProcesado > 0 && totalProcesado < totalEnv;
  const hayFallas = totalFall > 0;

  function guardar() {
    if (excede) return toast.error('Recepcionadas + falladas no puede superar lo enviado.');
    if (totalProcesado === 0) return toast.error('Ingrese al menos una unidad recepcionada o fallada.');
    if (hayFallas && !motivoFalla.trim()) return toast.error('Indique el motivo de las fallas.');
    start(async () => {
      const r = await registrarRecepcionOS(
        osId,
        fechaRetorno,
        rows.map((x) => ({ id: x.id, recepcionada: x.recepcionada, fallada: x.fallada })),
        motivoFalla,
      );
      if (r.ok) {
        toast.success(
          esParcial
            ? `Recepción parcial registrada (${totalProcesado} de ${totalEnv}). Puede registrar el resto al siguiente retorno.`
            : 'Recepción completa registrada — OS marcada como RECEPCIONADA',
        );
        router.refresh();
      } else toast.error(r.error ?? 'Error');
    });
  }

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3 border-b p-4">
        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Fecha de retorno</label>
          <Input
            type="date"
            value={fechaRetorno}
            onChange={(e) => setFechaRetorno(e.target.value)}
            disabled={disabled || pending}
            className="mt-1 h-9 w-40 text-sm"
          />
        </div>
        {!disabled && (
          <Button variant="outline" size="sm" onClick={completarTodo} disabled={pending} className="text-xs">
            Todo recepcionado OK
          </Button>
        )}
        <div className="ml-auto text-right text-xs text-slate-500">
          Enviado {totalEnv} · <span className="text-emerald-600">Recep. {totalRecep}</span> · <span className="text-amber-600">Fallas {totalFall}</span>
          {esParcial && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">Entrega parcial</span>}
        </div>
      </div>
      {esParcial && !disabled && (
        <p className="px-4 pt-2 text-[11px] text-amber-700">
          Aún no volvió todo lo enviado ({totalProcesado} de {totalEnv}). Puede guardar esta entrega parcial y registrar el resto cuando el taller devuelva más.
        </p>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Producto</TableHead>
            <TableHead>Talla</TableHead>
            <TableHead className="text-right">Enviado</TableHead>
            <TableHead className="text-right">Aprobadas (recep.)</TableHead>
            <TableHead className="text-right">Falladas</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((l, i) => {
            const filaExcede = l.recepcionada + l.fallada > l.enviado;
            return (
              <TableRow key={l.id}>
                <TableCell className="font-medium">
                  {l.producto_nombre}
                  {l.producto_codigo && <span className="ml-2 font-mono text-[10px] text-slate-400">{l.producto_codigo}</span>}
                </TableCell>
                <TableCell><Badge variant="outline">{formatTallaChip(l.talla)}</Badge></TableCell>
                <TableCell className="text-right font-mono text-sm">{l.enviado}</TableCell>
                <TableCell className="text-right">
                  <Input
                    type="number"
                    min={0}
                    max={l.enviado}
                    value={l.recepcionada || ''}
                    onChange={(e) => setVal(i, 'recepcionada', e.target.value)}
                    disabled={disabled || pending}
                    className={`ml-auto h-8 w-20 text-right text-xs ${filaExcede ? 'border-danger bg-red-50' : ''}`}
                    placeholder="0"
                  />
                </TableCell>
                <TableCell className="text-right">
                  <Input
                    type="number"
                    min={0}
                    max={l.enviado}
                    value={l.fallada || ''}
                    onChange={(e) => setVal(i, 'fallada', e.target.value)}
                    disabled={disabled || pending}
                    className={`ml-auto h-8 w-20 text-right text-xs ${filaExcede ? 'border-danger bg-red-50' : ''}`}
                    placeholder="0"
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {hayFallas && (
        <div className="px-4 pt-3">
          <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Motivo de la(s) falla(s) <span className="text-danger">*</span>
          </label>
          <Textarea
            value={motivoFalla}
            onChange={(e) => setMotivoFalla(e.target.value)}
            disabled={disabled || pending}
            rows={2}
            maxLength={500}
            placeholder="Ej. costura abierta, mancha de aceite, talla mal cortada…"
            className="mt-1 text-sm"
          />
        </div>
      )}
      {!disabled && (
        <div className="flex justify-end p-4">
          <Button variant="premium" size="sm" onClick={guardar} disabled={pending || excede}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {esParcial ? 'Registrar entrega parcial' : 'Registrar recepción'}
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * Botón para RETORNAR al servicio las prendas falladas: crea una nueva OS de
 * re-trabajo con las cantidades falladas (pedido del cliente 22/07/2026).
 */
export function RetornarFallasButton({ osId, totalFallas, disabled }: { osId: string; totalFallas: number; disabled: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (totalFallas <= 0 || disabled) return null;
  function retornar() {
    if (!confirm(`¿Crear una orden de servicio de re-trabajo para las ${totalFallas} prenda(s) fallada(s)? Se enviarán de nuevo al taller.`)) return;
    start(async () => {
      const r = await retornarFallasAlServicio(osId);
      if (r.ok && r.data) {
        toast.success(`Re-trabajo creado: ${r.data.numero} (${r.data.unidades} unid.)`);
        router.push(`/servicios/${r.data.id}`);
      } else toast.error(r.error ?? 'Error');
    });
  }
  return (
    <Button variant="outline" size="sm" onClick={retornar} disabled={pending} className="border-amber-300 text-amber-700 hover:bg-amber-50">
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
      Retornar {totalFallas} falla{totalFallas === 1 ? '' : 's'} al taller
    </Button>
  );
}

/**
 * Editor de AVÍOS DEVUELTOS por el taller (pedido del cliente 22/07/2026):
 * cantidad devuelta + observación por cada avío enviado.
 */
type AvioRow = {
  id: string;
  material: string;
  codigo: string;
  categoria: string;
  enviado: number;
  devuelto: number;
  observacion: string;
};
export function AviosDevueltosEditor({ osId, avios, disabled }: { osId: string; avios: AvioRow[]; disabled: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [rows, setRows] = useState<AvioRow[]>(avios);

  function setDev(i: number, v: string) {
    if (v !== '' && !/^\d*[.,]?\d*$/.test(v)) return;
    const n = v === '' ? 0 : Number(v.replace(',', '.'));
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, devuelto: Number.isFinite(n) ? n : 0 } : r)));
  }
  function setObs(i: number, v: string) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, observacion: v } : r)));
  }
  const excede = rows.some((r) => r.devuelto > r.enviado + 0.0001);

  function guardar() {
    if (excede) return toast.error('La cantidad devuelta no puede superar lo enviado.');
    start(async () => {
      const r = await registrarAviosDevueltos(osId, rows.map((x) => ({ id: x.id, devuelto: x.devuelto, observacion: x.observacion })));
      if (r.ok) { toast.success('Avíos devueltos registrados'); router.refresh(); }
      else toast.error(r.error ?? 'Error');
    });
  }

  return (
    <div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Material</TableHead>
            <TableHead>Categoría</TableHead>
            <TableHead className="text-right">Enviado</TableHead>
            <TableHead className="text-right">Devuelto</TableHead>
            <TableHead>Obs.</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((a, i) => {
            const filaExcede = a.devuelto > a.enviado + 0.0001;
            return (
              <TableRow key={a.id}>
                <TableCell className="font-medium">
                  {a.material}
                  {a.codigo && <span className="ml-2 font-mono text-[10px] text-slate-400">{a.codigo}</span>}
                </TableCell>
                <TableCell>{a.categoria && <Badge variant="secondary" className="text-[10px]">{a.categoria}</Badge>}</TableCell>
                <TableCell className="text-right font-mono text-sm">{a.enviado.toFixed(4)}</TableCell>
                <TableCell className="text-right">
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={a.devuelto || ''}
                    onChange={(e) => setDev(i, e.target.value)}
                    disabled={disabled || pending}
                    placeholder="0"
                    className={`ml-auto h-8 w-24 text-right text-xs ${filaExcede ? 'border-danger bg-red-50' : ''}`}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={a.observacion}
                    onChange={(e) => setObs(i, e.target.value)}
                    disabled={disabled || pending}
                    placeholder="—"
                    className="h-8 text-xs"
                    maxLength={200}
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {!disabled && (
        <div className="flex justify-end p-4">
          <Button variant="premium" size="sm" onClick={guardar} disabled={pending || excede}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Guardar devueltos
          </Button>
        </div>
      )}
    </div>
  );
}
