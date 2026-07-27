'use client';

import { useEffect, useState } from 'react';
import { Card } from '@happy/ui/card';
import { Button } from '@happy/ui/button';
import { X, Search, Loader2, FileText, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { formatPEN } from '@happy/lib';
import {
  buscarCotizaciones,
  obtenerCotizacion,
  type CotizacionResumen,
  type CotizacionDetalle,
} from '@/server/actions/cotizaciones';

/**
 * Modal del POS para buscar cotizaciones guardadas y pasarlas a venta.
 * Pedido del cliente (21/07/2026): guardar cotización por 20 días, buscarla
 * y convertirla en venta (boleta/factura) con los precios congelados.
 */
export function CotizacionesModal({
  onConvertir,
  onClose,
}: {
  onConvertir: (detalle: CotizacionDetalle) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const [lista, setLista] = useState<CotizacionResumen[] | null>(null);
  const [cargandoId, setCargandoId] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    const t = setTimeout(() => {
      buscarCotizaciones(q).then((r) => { if (vivo) setLista(r); }).catch(() => { if (vivo) setLista([]); });
    }, q ? 350 : 0);
    return () => { vivo = false; clearTimeout(t); };
  }, [q]);

  async function pasarAVenta(id: string) {
    setCargandoId(id);
    try {
      const det = await obtenerCotizacion(id);
      if (!det) { toast.error('No se encontró la cotización'); return; }
      if (det.estado === 'CONVERTIDA') { toast.error('Esta cotización ya se convirtió en venta.'); return; }
      if (det.estado === 'ANULADA') { toast.error('Esta cotización está anulada.'); return; }
      if (det.vencida && !confirm(`La cotización ${det.numero} está VENCIDA (venció el ${fmtFecha(det.vence_el)}). ¿Pasarla a venta igual con sus precios?`)) {
        return;
      }
      onConvertir(det);
    } catch (e) {
      toast.error((e as Error).message || 'Error al cargar la cotización');
    } finally {
      setCargandoId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose} data-pos-no-focus>
      <Card className="flex max-h-[85vh] w-full max-w-xl flex-col p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-happy-600" />
            <h3 className="font-display text-lg font-semibold text-corp-900">Cotizaciones guardadas</h3>
          </div>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por número (COT-…) o nombre del cliente…"
            className="h-10 w-full rounded-md border border-slate-300 bg-white pl-9 pr-3 text-sm focus:border-happy-400 focus:outline-none focus:ring-2 focus:ring-happy-100"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto rounded-md border">
          {lista === null ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
            </div>
          ) : lista.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">
              {q ? 'Sin coincidencias.' : 'Aún no hay cotizaciones guardadas.'}
            </p>
          ) : (
            lista.map((c) => {
              const convertida = c.estado === 'CONVERTIDA';
              const anulada = c.estado === 'ANULADA';
              return (
                <div key={c.id} className="flex items-center gap-3 border-b px-3 py-2.5 last:border-0">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-corp-900">{c.numero}</span>
                      {convertida && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-bold text-emerald-700">CONVERTIDA</span>}
                      {anulada && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[9px] font-bold text-slate-600">ANULADA</span>}
                      {!convertida && !anulada && c.vencida && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-bold text-amber-700">VENCIDA</span>}
                      {!convertida && !anulada && !c.vencida && <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[9px] font-bold text-sky-700">VIGENTE</span>}
                    </div>
                    <p className="truncate text-xs text-slate-500">
                      {c.cliente_nombre || 'Sin cliente'} · {c.items} ítem(s) · vence {fmtFecha(c.vence_el)}
                    </p>
                  </div>
                  <span className="shrink-0 font-display text-sm font-semibold text-happy-600">{formatPEN(c.total)}</span>
                  <Button
                    size="sm"
                    onClick={() => pasarAVenta(c.id)}
                    disabled={cargandoId !== null || convertida || anulada}
                    className="shrink-0 gap-1 text-xs"
                    title={convertida ? 'Ya convertida' : anulada ? 'Anulada' : 'Cargar al carrito con sus precios'}
                  >
                    {cargandoId === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
                    Pasar a venta
                  </Button>
                </div>
              );
            })
          )}
        </div>
      </Card>
    </div>
  );
}

function fmtFecha(iso: string): string {
  // iso = YYYY-MM-DD (fecha "solo día" — sin zona horaria para no correr días)
  const [y, m, d] = iso.split('-');
  return d && m && y ? `${d}/${m}/${y.slice(2)}` : iso;
}
