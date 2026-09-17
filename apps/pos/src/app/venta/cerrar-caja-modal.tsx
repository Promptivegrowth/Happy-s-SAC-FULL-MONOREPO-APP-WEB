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
  Smartphone, X, FileSpreadsheet, RefreshCw, Users, UserCheck, Printer,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatPEN, formatDateTime } from '@happy/lib';
import {
  balanceCajaActiva, cerrarSesion, generarExcelCierre,
  cerrarParcialSesion, listarCajerosDisponibles,
} from '@/server/actions/caja';
import type { BalanceCajaDTO, SesionCajaDTO } from '@/server/actions/caja-helpers';
import { construirTicketCierre, type EncabezadoCaja } from '@happy/lib/escpos/caja';
import { imprimirDocumentoDeCaja } from './imprimir-ticket';

type Cajero = { id: string; nombre: string };
type ModoCierre = 'DEFINITIVO' | 'PARCIAL';

export function CerrarCajaModal({
  sesion,
  balanceInicial,
  cabecera,
  onClose,
  onCerrada,
}: {
  sesion: SesionCajaDTO;
  balanceInicial: BalanceCajaDTO;
  cabecera: EncabezadoCaja | null;
  onClose: () => void;
  onCerrada: () => void;
}) {
  const [balance, setBalance] = useState<BalanceCajaDTO>(balanceInicial);
  /*
   * El monto contado arranca VACÍO, a propósito.
   *
   * Antes venía puesto con lo que el sistema esperaba, así que confirmar sin
   * contar daba siempre "cuadre perfecto" y el control no controlaba nada: un
   * faltante o un sobrante pasaban sin que nadie los viera. El 15/09/2026 se
   * cerró una caja con diferencia cero teniendo un pago mal registrado.
   *
   * Contar el efectivo y escribir lo que hay es todo el sentido de este paso.
   */
  const [contado, setContado] = useState<string>('');
  const [obs, setObs] = useState('');
  const [pending, start] = useTransition();
  const [refreshing, setRefreshing] = useState(false);
  const [generandoExcel, setGenerandoExcel] = useState(false);
  const [imprimiendo, setImprimiendo] = useState(false);

  // Modo: cierre PARCIAL (cambio de turno) vs DEFINITIVO (fin de día)
  const [modo, setModo] = useState<ModoCierre>('DEFINITIVO');
  const [cajeros, setCajeros] = useState<Cajero[]>([]);
  const [cajeroEntranteId, setCajeroEntranteId] = useState<string>('');

  // Cargar cajeros disponibles cuando elige PARCIAL
  useEffect(() => {
    if (modo === 'PARCIAL' && cajeros.length === 0) {
      void listarCajerosDisponibles().then(setCajeros).catch(() => setCajeros([]));
    }
  }, [modo, cajeros.length]);

  // La caja está pensada para jornadas de hasta 24 h; si lleva más abierta,
  // el cuadre mezcla varios días y conviene cerrarla (aviso, no bloqueo).
  const horasAbierta = (Date.now() - new Date(sesion.abierta_en).getTime()) / 3600000;
  const sesionLarga = Number.isFinite(horasAbierta) && horasAbierta > 24;

  const contadoNum = Number(contado);
  // Sin monto escrito no hay diferencia que mostrar: mostrar 0.00 se lee como
  // "cuadra" cuando en realidad todavía no se contó nada.
  const hayConteo = contado.trim() !== '' && Number.isFinite(contadoNum);
  const diferencia = hayConteo ? contadoNum - balance.esperado_efectivo : 0;
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
        // El monto contado no se toca al refrescar: lo escribió una persona
        // después de contar la plata.
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

  /*
   * Imprime el cuadre en la ticketera.
   *
   * Hasta ahora el cierre solo se podía bajar en Excel, y la cajera esperaba
   * un papel para firmar y dejar en la caja —lo reportaron el 16/09/2026—.
   * Sale por el agente, con su corte; si esa computadora no lo tiene
   * instalado, se avisa en lugar de mandarlo por el navegador: con papel de
   * rollo continuo, imprimir desde el navegador arrastra el papel sin parar.
   */
  async function imprimirCierre(): Promise<void> {
    if (!cabecera) {
      toast.error('Faltan los datos de la caja para imprimir');
      return;
    }
    setImprimiendo(true);
    try {
      const r = await imprimirDocumentoDeCaja(
        (avance) =>
          construirTicketCierre(
            cabecera,
            {
              aperturaEn: sesion.abierta_en,
              montoApertura: balance.monto_apertura,
              totalEfectivo: balance.total_efectivo,
              totalYape: balance.total_yape,
              totalPlin: balance.total_plin,
              totalTarjeta: balance.total_tarjeta,
              totalTransferencia: balance.total_transferencia,
              totalOtros: balance.total_otros,
              totalVentas: balance.total_ventas,
              cantidadVentas: balance.cantidad_ventas,
              totalGastos: balance.total_gastos,
              totalIngresosExtra: balance.total_ingresos_extra,
              esperadoEfectivo: balance.esperado_efectivo,
              porCuenta: balance.por_cuenta,
              contadoEfectivo: Number.isFinite(contadoNum) ? contadoNum : balance.esperado_efectivo,
              observaciones: obs || null,
              parcial: modo === 'PARCIAL',
              cajeroEntrante: cajeros.find((c) => c.id === cajeroEntranteId)?.nombre ?? null,
            },
            { avanceCorteMm: avance },
          ),
        `Cierre de caja ${sesion.caja_nombre}`,
        sesion.almacen_id,
      );
      if (r.via === 'agente' && r.estado === 'impreso') {
        toast.success(`Cierre impreso en ${r.equipo}`);
      } else if (r.via === 'agente' && r.estado === 'esperando') {
        toast.info(`Enviado a ${r.equipo}. Si no sale, revisa que tenga papel.`);
      } else if (r.via === 'agente') {
        toast.error(`${r.equipo} no pudo imprimir. Revisa papel y conexión.`);
      } else if (r.motivo === 'sin-equipo') {
        toast.error('Esta computadora no tiene la ticketera vinculada. Descarga el Excel.');
      } else {
        toast.error('No se pudo imprimir el cierre. Descarga el Excel.');
      }
    } catch (e) {
      toast.error((e as Error).message ?? 'No se pudo imprimir el cierre');
    } finally {
      setImprimiendo(false);
    }
  }

  function confirmarCierre() {
    if (!hayConteo || contadoNum < 0) {
      // Vacío ya no significa "lo esperado": hay que contar y escribirlo.
      toast.error('Cuenta el efectivo de la caja y escribe cuánto hay');
      return;
    }
    if (Math.abs(diferencia) > 5 && !confirm(`Diferencia de ${formatPEN(diferencia)}. ¿Confirmar cierre?`)) return;

    if (modo === 'PARCIAL') {
      // Cambio de turno — la sesión NO se cierra
      start(async () => {
        try {
          const r = await cerrarParcialSesion({
            monto_contado_efectivo: contadoNum,
            cajero_entrante_id: cajeroEntranteId || null,
            observacion: obs || null,
          });
          toast.success(
            `Cierre parcial #${r.cierre_numero} registrado · ${r.total_ventas} venta${r.total_ventas === 1 ? '' : 's'} en el turno`,
          );
          /*
           * El papel sale solo, como con las boletas: nadie tiene que
           * acordarse de pedirlo antes de entregar el turno.
           *
           * Sin esperarlo: el cierre ya quedó registrado y la impresión puede
           * tardar unos segundos. Dejar a la cajera mirando una pantalla
           * trabada después de confirmar es peor que avisarle por un mensaje
           * cuando el ticket sale.
           */
          void imprimirCierre();
          onClose();  // cierra el modal pero la sesión sigue abierta
        } catch (e) {
          toast.error((e as Error).message ?? 'Error en el cierre parcial');
        }
      });
      return;
    }

    // Cierre definitivo
    start(async () => {
      try {
        const r = await cerrarSesion({ monto_contado_efectivo: contadoNum, observacion: obs || null });
        if (!r.ok) { toast.error(r.error); return; }
        toast.success('Caja cerrada correctamente');
        // Sin esperar: ver el comentario del cierre parcial.
        void imprimirCierre();
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

        {sesionLarga && (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-800">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Esta caja lleva <strong>{Math.floor(horasAbierta)} h</strong> abierta. La jornada de caja está pensada
              para <strong>máximo 24 h</strong>: al pasarse, el cuadre acumula ventas de varios días. Cierra la caja
              al terminar el día y ábrela de nuevo al día siguiente.
            </span>
          </div>
        )}

        {/* Selector de tipo de cierre */}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setModo('PARCIAL')}
            disabled={pending}
            className={`flex flex-col items-start gap-1 rounded-lg border-2 p-3 text-left transition ${
              modo === 'PARCIAL'
                ? 'border-amber-400 bg-amber-50 shadow-sm'
                : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <div className="flex items-center gap-2 text-sm font-semibold text-amber-700">
              <Users className="h-4 w-4" />
              Cambio de turno
            </div>
            <p className="text-[11px] text-slate-600">
              Cuadra efectivo y pasa la posta al siguiente cajero.
              <strong className="block text-amber-700">La caja sigue abierta.</strong>
            </p>
          </button>
          <button
            type="button"
            onClick={() => setModo('DEFINITIVO')}
            disabled={pending}
            className={`flex flex-col items-start gap-1 rounded-lg border-2 p-3 text-left transition ${
              modo === 'DEFINITIVO'
                ? 'border-rose-400 bg-rose-50 shadow-sm'
                : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <div className="flex items-center gap-2 text-sm font-semibold text-rose-700">
              <LogOut className="h-4 w-4" />
              Cierre definitivo
            </div>
            <p className="text-[11px] text-slate-600">
              Fin de día: cierra la caja por completo.
              <strong className="block text-rose-700">Hay que abrirla otra vez para vender.</strong>
            </p>
          </button>
        </div>

        {/* Stats apertura/ventas/esperado */}
        <div className="mt-5 grid gap-2 sm:grid-cols-4">
          <Stat label="Apertura" value={formatPEN(balance.monto_apertura)} />
          <Stat label="Ventas" value={`${balance.cantidad_ventas}`} sub={formatPEN(balance.total_ventas)} />
          {(balance.total_gastos > 0 || balance.total_ingresos_extra > 0) && (
            <Stat
              label="Caja chica"
              value={formatPEN(balance.total_ingresos_extra - balance.total_gastos)}
              sub={`+${formatPEN(balance.total_ingresos_extra)} / -${formatPEN(balance.total_gastos)}`}
            />
          )}
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
          {/*
            Los mismos renglones que los botones de cobro, en el mismo orden.
            Antes eran cinco fijos —Efectivo, Yape, Plin, Tarjeta,
            Transferencia— que no son lo que la cajera toca: ella aprieta "BCP
            JAVIER" o "CONTINENTAL - PLIN HAPPYS". Con dos cuentas de
            transferencia, un total de "Transferencia" no se puede cuadrar
            contra ningún banco.
            Los botones sin movimiento se muestran en cero: dicen "por acá no
            entró nada" y dejan dos cierres comparables.
          */}
          <div className="space-y-1.5">
            {balance.por_cuenta.length > 0 ? (
              balance.por_cuenta.map((c) => (
                <Row
                  key={c.etiqueta}
                  icon={
                    c.metodo === 'EFECTIVO'
                      ? <Banknote className="h-3.5 w-3.5 text-emerald-600" />
                      : c.metodo === 'YAPE' || c.metodo === 'PLIN'
                        ? <Smartphone className="h-3.5 w-3.5 text-purple-600" />
                        : c.metodo.startsWith('TARJETA')
                          ? <CreditCard className="h-3.5 w-3.5 text-slate-600" />
                          : <Building2 className="h-3.5 w-3.5 text-slate-600" />
                  }
                  label={c.cantidad > 0 ? `${c.etiqueta} (${c.cantidad})` : c.etiqueta}
                  value={c.monto}
                />
              ))
            ) : (
              <>
                <Row icon={<Banknote className="h-3.5 w-3.5 text-emerald-600" />} label="Efectivo" value={balance.total_efectivo} />
                <Row icon={<Smartphone className="h-3.5 w-3.5 text-purple-600" />} label="Yape" value={balance.total_yape} />
                <Row icon={<Smartphone className="h-3.5 w-3.5 text-blue-600" />} label="Plin" value={balance.total_plin} />
                <Row icon={<CreditCard className="h-3.5 w-3.5 text-slate-600" />} label="Tarjeta" value={balance.total_tarjeta} />
                <Row icon={<Building2 className="h-3.5 w-3.5 text-slate-600" />} label="Transferencia" value={balance.total_transferencia} />
              </>
            )}
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
                placeholder="0.00"
                className="mt-1 h-12 text-xl font-display"
              />
              <p className="mt-1 text-[11px] text-slate-500">
                Cuenta el efectivo físico e ingrésalo aquí. El sistema espera{' '}
                <strong>{formatPEN(balance.esperado_efectivo)}</strong>.
              </p>
            </div>
            <div>
              <Label className="text-xs">Diferencia</Label>
              {/* Mientras no se haya contado, no se muestra S/ 0.00: un cero
                  se lee como "cuadra" y todavía no hay nada que cuadre. */}
              <div className={`mt-1 flex h-12 items-center rounded-md border px-3 font-display text-xl font-semibold ${
                !hayConteo ? 'border-dashed border-slate-200 bg-slate-50 text-slate-400' :
                tone === 'ok' ? 'border-slate-200 bg-slate-50 text-slate-700' :
                tone === 'sobrante' ? 'border-emerald-300 bg-emerald-50 text-emerald-700' :
                'border-red-300 bg-red-50 text-red-700'
              }`}>
                {hayConteo && tone === 'ok' && <CheckCircle2 className="mr-1.5 h-4 w-4" />}
                {hayConteo && tone === 'faltante' && <AlertTriangle className="mr-1.5 h-4 w-4 text-amber-500" />}
                {hayConteo ? `${diferencia > 0 ? '+' : ''}${formatPEN(diferencia)}` : '—'}
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                {!hayConteo && 'Escribe el efectivo contado para ver la diferencia'}
                {hayConteo && tone === 'ok' && 'Cuadre perfecto'}
                {hayConteo && tone === 'sobrante' && 'Hay más efectivo del esperado'}
                {hayConteo && tone === 'faltante' && 'Hay menos efectivo del esperado'}
              </p>
            </div>
          </div>

          {modo === 'PARCIAL' && (
            <div className="mt-3">
              <Label className="text-xs">Cajero entrante (opcional)</Label>
              <select
                value={cajeroEntranteId}
                onChange={(e) => setCajeroEntranteId(e.target.value)}
                className="mt-1 h-10 w-full rounded-md border border-input bg-white px-3 text-sm"
              >
                <option value="">— Sin asignar (se completa al cambiar de usuario) —</option>
                {cajeros.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-slate-500">
                Quién toma la posta. Útil solo para el reporte; el siguiente cajero deberá entrar con su propio usuario.
              </p>
            </div>
          )}

          <div className="mt-3">
            <Label className="text-xs">Observación (opcional)</Label>
            <Input
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              placeholder={modo === 'PARCIAL'
                ? 'Ej. cambio de turno mediodía, retiro a banco, etc.'
                : 'Ej. retiro a banco, motivo del faltante…'}
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
          {/* Para tener el papel antes de confirmar, o para sacar otra copia. */}
          <Button
            variant="outline"
            onClick={() => void imprimirCierre()}
            disabled={imprimiendo || pending}
            className="gap-2"
          >
            {imprimiendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
            Imprimir cuadre
          </Button>
          {modo === 'PARCIAL' ? (
            <Button
              size="lg"
              onClick={confirmarCierre}
              disabled={pending}
              className="bg-amber-600 text-white hover:bg-amber-700"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
              Registrar cambio de turno
            </Button>
          ) : (
            <Button variant="premium" size="lg" onClick={confirmarCierre} disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
              Cerrar caja
            </Button>
          )}
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
