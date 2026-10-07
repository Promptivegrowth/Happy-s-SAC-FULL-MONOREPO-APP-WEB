'use client';

/**
 * Los últimos cierres de la caja, para volver a imprimirlos.
 *
 * Pedido del cliente (07/10/2026): la ticketera falló al cerrar y el voucher
 * del cierre no salió. Esos vouchers son el reporte del día que se le manda a
 * Javier, así que tiene que poder sacarse otra vez, el mismo papel, al día
 * siguiente. Funciona con la caja abierta o cerrada.
 */

import { useEffect, useState } from 'react';
import { Card } from '@happy/ui/card';
import { Button } from '@happy/ui/button';
import { FileSpreadsheet, Loader2, Printer, X } from 'lucide-react';
import { toast } from 'sonner';
import { formatDateTime, formatPEN } from '@happy/lib';
import { construirTicketCierre, type EncabezadoCaja } from '@happy/lib/escpos/caja';
import {
  listarCierresRecientes, datosParaReimprimirCierre, generarExcelCierre, type CierreRecienteDTO,
} from '@/server/actions/caja';
import { imprimirDocumentoDeCaja } from './imprimir-ticket';

export function CierresAnterioresModal({
  cabeceraPara,
  onClose,
}: {
  /** Arma el encabezado del ticket para esa caja y esa tienda. */
  cabeceraPara: (caja: string, almacenId: string | null, cajero: string) => EncabezadoCaja | null;
  onClose: () => void;
}) {
  const [cierres, setCierres] = useState<CierreRecienteDTO[] | null>(null);
  const [trabajando, setTrabajando] = useState<string | null>(null);

  useEffect(() => {
    listarCierresRecientes()
      .then(setCierres)
      .catch((e) => {
        toast.error((e as Error).message || 'No se pudieron leer los cierres');
        setCierres([]);
      });
  }, []);

  async function reimprimir(c: CierreRecienteDTO) {
    setTrabajando(`t-${c.id}`);
    try {
      const d = await datosParaReimprimirCierre(c.id);
      const cab = cabeceraPara(d.caja_nombre, d.almacen_id, d.cajero_nombre);
      if (!cab) throw new Error('Faltan los datos de la empresa para imprimir');
      const b = d.balance;
      const r = await imprimirDocumentoDeCaja(
        (avance) => construirTicketCierre(
          cab,
          {
            aperturaEn: d.abierta_en,
            montoApertura: b.monto_apertura,
            totalEfectivo: b.total_efectivo,
            totalYape: b.total_yape,
            totalPlin: b.total_plin,
            totalTarjeta: b.total_tarjeta,
            totalTransferencia: b.total_transferencia,
            totalOtros: b.total_otros,
            totalVentas: b.total_ventas,
            cantidadVentas: b.cantidad_ventas,
            totalGastos: b.total_gastos,
            totalIngresosExtra: b.total_ingresos_extra,
            esperadoEfectivo: d.esperado,
            porCuenta: b.por_cuenta,
            totalCobrado: b.total_cobrado,
            saldoAplicado: b.saldo_aplicado,
            devoluciones: b.devoluciones,
            adelantos: b.adelantos,
            contadoEfectivo: d.contado,
            observaciones: d.observaciones,
          },
          { avanceCorteMm: avance },
        ),
        `Cierre de caja ${d.caja_nombre} (reimpresión)`,
        d.almacen_id,
      );
      if (r.via === 'agente' && r.estado === 'impreso') toast.success(`Cierre reimpreso en ${r.equipo}`);
      else if (r.via === 'agente' && r.estado === 'esperando') toast.info(`Enviado a ${r.equipo}. Si no sale, revisa que tenga papel.`);
      else if (r.via === 'agente') toast.error(`${r.equipo} no pudo imprimir. Revisa papel y conexión, o descarga el Excel.`);
      else toast.error('Esta computadora no tiene la ticketera vinculada. Descarga el Excel.');
    } catch (e) {
      toast.error((e as Error).message || 'No se pudo reimprimir el cierre');
    } finally {
      setTrabajando(null);
    }
  }

  async function excel(c: CierreRecienteDTO) {
    setTrabajando(`x-${c.id}`);
    try {
      const r = await generarExcelCierre(c.id);
      const bin = atob(r.base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([bytes], { type: r.mime }));
      const a = document.createElement('a');
      a.href = url;
      a.download = r.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch (e) {
      toast.error((e as Error).message || 'No se pudo generar el Excel');
    } finally {
      setTrabajando(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-corp-900/60 p-4 backdrop-blur-sm">
      <Card className="max-h-[90vh] w-full max-w-2xl overflow-y-auto p-6 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-xl font-semibold text-corp-900">Cierres anteriores</h2>
            <p className="text-xs text-slate-500">Vuelve a imprimir el voucher de un cierre o descárgalo en Excel.</p>
          </div>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100" aria-label="Cerrar">
            <X className="h-4 w-4" />
          </button>
        </div>

        {cierres === null ? (
          <p className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Buscando cierres…
          </p>
        ) : cierres.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-500">Todavía no hay cierres de esta caja.</p>
        ) : (
          <div className="space-y-2">
            {cierres.map((c) => {
              const cuadra = Math.abs(c.diferencia) < 0.01;
              return (
                <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                  <div className="text-sm">
                    <div className="font-medium text-corp-900">{c.caja_nombre} · cerrada {formatDateTime(c.cerrada_en)}</div>
                    <div className="text-[11px] text-slate-500">
                      Abierta {formatDateTime(c.abierta_en)} · cerró {c.cerrado_por} · contado {formatPEN(c.contado)}{' '}
                      <span className={cuadra ? 'text-emerald-700' : 'text-amber-700'}>
                        {cuadra ? '· cuadró' : `· ${c.diferencia < 0 ? 'faltó' : 'sobró'} ${formatPEN(Math.abs(c.diferencia))}`}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="outline" disabled={trabajando !== null} onClick={() => void excel(c)} className="gap-1 text-xs">
                      {trabajando === `x-${c.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5" />}
                      Excel
                    </Button>
                    <Button size="sm" variant="premium" disabled={trabajando !== null} onClick={() => void reimprimir(c)} className="gap-1 text-xs">
                      {trabajando === `t-${c.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />}
                      Reimprimir
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
