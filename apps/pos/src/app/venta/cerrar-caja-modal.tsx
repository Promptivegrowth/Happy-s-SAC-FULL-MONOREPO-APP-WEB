'use client';

/**
 * Modal de CIERRE DE CAJA in-place.
 *
 * Reemplaza la página /cierre: se monta sobre el terminal y permite:
 * - Revisar el balance en vivo
 * - Ingresar el efectivo contado
 * - Descargar Excel del cierre (sin cerrar)
 * - Confirmar el cierre (queda al usuario decidir cuándo abrir la próxima)
 */

import { useEffect, useState, useTransition } from 'react';
import { Card } from '@happy/ui/card';
import { Input } from '@happy/ui/input';
import { Label } from '@happy/ui/label';
import { Button } from '@happy/ui/button';
import {
  AlertTriangle, Banknote, CheckCircle2, CreditCard, Building2, Loader2, LogOut,
  Smartphone, X, FileSpreadsheet, RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatPEN, formatDateTime } from '@happy/lib';
import { balanceCajaActiva, cerrarSesion, generarExcelCierre } from '@/server/actions/caja';
import type { BalanceCajaDTO, SesionCajaDTO } from '@/server/actions/caja-helpers';

export function CerrarCajaModal({
  sesion,
  balanceInicial,
  onClose,
  onCerrada,
}: {
  sesion: SesionCajaDTO;
  balanceInicial: BalanceCajaDTO;
  onClose: () => void;
  onCerrada: () => void;
}) {
  const [balance, setBalance] = useState<BalanceCajaDTO>(balanceInicial);
  const [contado, setContado] = useState<string>(balanceInicial.esperado_efectivo.toFixed(2));
  const [obs, setObs] = useState('');
  const [pending, start] = useTransition();
  const [refreshing, setRefreshing] = useState(false);
  const [generandoExcel, setGenerandoExcel] = useState(false);

  const contadoNum = Number(contado);
  const diferencia = Number.isFinite(contadoNum) ? contadoNum - balance.esperado_efectivo : 0;
  const tone: 'ok' | 'sobrante' | 'faltante' = Math.abs(diferencia) < 0.01 ? 'ok' : diferencia > 0 ? 'sobrante' : 'faltante';

  // Refresco automático al montar — por si llegaron ventas mientras tenía el modal cerrado
  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refresh() {
    setRefreshing(true);
    try {
      const b = await balanceCajaActiva();
      if (b) {
        setBalance(b);
        // si el usuario no había tocado el monto contado, ajustar al nuevo esperado
        if (Number(contado) === Number(balance.esperado_efectivo.toFixed(2))) {
          setContado(b.esperado_efectivo.toFixed(2));
        }
      }
    } finally {
      setRefreshing(false);
    }
  }

  function downloadBase64(base64: string, filename: string, mime: string) {
    const bin = atob(base64);
    const len = bin.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
    const blob = new Blob([bytes], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  async function descargarExcel() {
    setGenerandoExcel(true);
    try {
      const r = await generarExcelCierre(sesion.id);
      downloadBase64(r.base64, r.filename, r.mime);
      toast.success('Excel descargado');
    } catch (e) {
      toast.error((e as Error).message ?? 'Error generando Excel');
    } finally {
      setGenerandoExcel(false);
    }
  }

  function confirmarCierre() {
    if (!Number.isFinite(contadoNum) || contadoNum < 0) {
      toast.error('Ingresa un monto válido');
      return;
    }
    if (Math.abs(diferencia) > 5 && !confirm(`Diferencia de ${formatPEN(diferencia)}. ¿Confirmar cierre?`)) return;

    start(async () => {
      try {
        await cerrarSesion({ monto_contado_efectivo: contadoNum, observacion: obs || null });
        toast.success('Caja cerrada correctamente');
        onCerrada();
      } catch (e) {
        toast.error((e as Error).message ?? 'Error al cerrar');
      }
    });
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-corp-900/60 backdrop-blur-sm p-4">
      <Card className="w-full max-w-2xl max-h-[92vh] overflow-y-auto p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-xl font-semibold text-corp-900">Cierre de caja</h2>
            <p className="text-xs text-slate-500">
              {sesion.caja_nombre} · {sesion.cajero_nombre} · Abierta {formatDateTime(sesion.abierta_en)}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={pending}
            className="rounded p-1 text-slate-400 hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Stats apertura/ventas/esperado */}
        <div className="mt-5 grid gap-2 sm:grid-cols-3">
          <Stat label="Apertura" value={formatPEN(balance.monto_apertura)} />
          <Stat label="Ventas" value={`${balance.cantidad_ventas}`} sub={formatPEN(balance.total_ventas)} />
          <Stat label="Esperado en caja" value={formatPEN(balance.esperado_efectivo)} highlight />
        </div>

        {/* Totales por método */}
        <div className="mt-4 rounded-lg border bg-slate-50/60 p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Totales por método</h3>
            <button
              onClick={refresh}
              disabled={refreshing}
              className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-corp-700"
              title="Refrescar balance"
            >
              <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} />
              Refrescar
            </button>
          </div>
          <div className="space-y-1.5">
            <Row icon={<Banknote className="h-3.5 w-3.5 text-emerald-600" />} label="Efectivo" value={balance.total_efectivo} />
            <Row icon={<Smartphone className="h-3.5 w-3.5 text-purple-600" />} label="Yape" value={balance.total_yape} />
            <Row icon={<Smartphone className="h-3.5 w-3.5 text-blue-600" />} label="Plin" value={balance.total_plin} />
            <Row icon={<CreditCard className="h-3.5 w-3.5 text-slate-600" />} label="Tarjeta" value={balance.total_tarjeta} />
            <Row icon={<Building2 className="h-3.5 w-3.5 text-slate-600" />} label="Transferencia" value={balance.total_transferencia} />
            {balance.total_otros > 0 && <Row icon={<Banknote className="h-3.5 w-3.5 text-slate-400" />} label="Otros" value={balance.total_otros} />}
          </div>
        </div>

        {/* Cuadre de efectivo */}
        <div className="mt-4 rounded-lg border bg-white p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Cuadre de efectivo</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs">Monto real en caja (S/)</Label>
              <Input
                type="number"
                step="0.01"
                min={0}
                value={contado}
                onChange={(e) => setContado(e.target.value)}
                className="mt-1 h-12 text-xl font-display"
              />
              <p className="mt-1 text-[11px] text-slate-500">
                Cuenta el efectivo físico e ingrésalo aquí.
              </p>
            </div>
            <div>
              <Label className="text-xs">Diferencia</Label>
              <div className={`mt-1 flex h-12 items-center rounded-md border px-3 font-display text-xl font-semibold ${
                tone === 'ok' ? 'border-slate-200 bg-slate-50 text-slate-700' :
                tone === 'sobrante' ? 'border-emerald-300 bg-emerald-50 text-emerald-700' :
                'border-red-300 bg-red-50 text-red-700'
              }`}>
                {tone === 'ok' && <CheckCircle2 className="mr-1.5 h-4 w-4" />}
                {tone === 'faltante' && <AlertTriangle className="mr-1.5 h-4 w-4 text-amber-500" />}
                {diferencia > 0 ? '+' : ''}{formatPEN(diferencia)}
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                {tone === 'ok' && 'Cuadre perfecto'}
                {tone === 'sobrante' && 'Hay más efectivo del esperado'}
                {tone === 'faltante' && 'Hay menos efectivo del esperado'}
              </p>
            </div>
          </div>

          <div className="mt-3">
            <Label className="text-xs">Observación (opcional)</Label>
            <Input
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              placeholder="Ej. retiro a banco, motivo del faltante…"
              className="mt-1"
            />
          </div>
        </div>

        {/* Acciones */}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button
            variant="outline"
            onClick={descargarExcel}
            disabled={generandoExcel || pending}
            className="border-emerald-300 text-emerald-700 hover:bg-emerald-50"
          >
            {generandoExcel ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
            Generar Excel
          </Button>
          <Button variant="premium" size="lg" onClick={confirmarCierre} disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
            Cerrar caja
          </Button>
        </div>
      </Card>
    </div>
  );
}

function Stat({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${highlight ? 'border-happy-400 bg-happy-50/50' : 'bg-white'}`}>
      <p className="text-[11px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className="font-display text-lg font-semibold text-corp-900">{value}</p>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-slate-400">{icon}</span>
      <span className="flex-1 text-slate-700">{label}</span>
      <span className="font-mono font-semibold text-corp-900">{formatPEN(value)}</span>
    </div>
  );
}
