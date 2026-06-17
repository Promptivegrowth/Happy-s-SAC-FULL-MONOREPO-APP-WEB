import Link from 'next/link';
import { Card } from '@happy/ui/card';
import { Badge } from '@happy/ui/badge';
import {
  Factory,
  Truck,
  Receipt,
  PackageCheck,
  PackageX,
  Scale,
  ClipboardCheck,
  RotateCcw,
  Scissors,
  Workflow,
  Package,
  ArrowDownCircle,
  ArrowUpCircle,
  ArrowRightLeft,
  AlertTriangle,
  Building2,
} from 'lucide-react';
import type { TrazaEvento } from '@/server/actions/trazabilidad';

/**
 * Timeline cronológico visual usado por las tres páginas de detalle
 * (lote / variante / OT). Cada evento se pinta con su icono y color
 * según subtipo; el componente NO ordena (se asume orden upstream).
 */

type IconCfg = { Icon: typeof Factory; color: string; bg: string };

function iconoEvento(ev: TrazaEvento): IconCfg {
  const s = ev.subtipo ?? '';
  if (ev.fuente === 'CALIDAD') {
    if (s === 'CON_FALLAS') return { Icon: AlertTriangle, color: 'text-amber-700', bg: 'bg-amber-100' };
    return { Icon: ClipboardCheck, color: 'text-emerald-700', bg: 'bg-emerald-100' };
  }
  if (ev.fuente === 'CORTE') return { Icon: Scissors, color: 'text-indigo-700', bg: 'bg-indigo-100' };
  if (ev.fuente === 'OS') return { Icon: Workflow, color: 'text-sky-700', bg: 'bg-sky-100' };
  if (ev.fuente === 'INGRESO_PT') return { Icon: PackageCheck, color: 'text-emerald-700', bg: 'bg-emerald-100' };
  if (ev.fuente === 'OT_EVENTO') return { Icon: Workflow, color: 'text-slate-700', bg: 'bg-slate-100' };

  // KARDEX y TRAZA: depende de subtipo / tipo
  if (s.startsWith('ENTRADA_TRASLADO') || s.startsWith('SALIDA_TRASLADO') || s === 'TRASLADO')
    return { Icon: Truck, color: 'text-blue-700', bg: 'bg-blue-100' };
  if (s.includes('PRODUCCION')) return { Icon: Factory, color: 'text-violet-700', bg: 'bg-violet-100' };
  if (s.includes('VENTA') || s.includes('SALIDA_VENTA'))
    return { Icon: Receipt, color: 'text-emerald-700', bg: 'bg-emerald-100' };
  if (s.includes('MERMA')) return { Icon: PackageX, color: 'text-rose-700', bg: 'bg-rose-100' };
  if (s.includes('DEVOLUCION')) return { Icon: RotateCcw, color: 'text-amber-700', bg: 'bg-amber-100' };
  if (s.includes('AJUSTE')) return { Icon: Scale, color: 'text-slate-700', bg: 'bg-slate-100' };
  if (s.startsWith('ENTRADA_')) return { Icon: ArrowDownCircle, color: 'text-emerald-700', bg: 'bg-emerald-100' };
  if (s.startsWith('SALIDA_')) return { Icon: ArrowUpCircle, color: 'text-rose-700', bg: 'bg-rose-100' };
  return { Icon: Package, color: 'text-slate-700', bg: 'bg-slate-100' };
}

function formatearFecha(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function TrazabilidadTimeline({ eventos }: { eventos: TrazaEvento[] }) {
  if (eventos.length === 0) {
    return (
      <Card className="p-6 text-center text-sm text-slate-500">
        Sin eventos registrados todavía.
      </Card>
    );
  }
  return (
    <ol className="relative space-y-3 border-l-2 border-slate-200 pl-6">
      {eventos.map((ev) => {
        const { Icon, color, bg } = iconoEvento(ev);
        return (
          <li key={ev.id} className="relative">
            <span
              className={`absolute -left-[34px] flex h-7 w-7 items-center justify-center rounded-full ring-4 ring-white ${bg}`}
            >
              <Icon className={`h-3.5 w-3.5 ${color}`} />
            </span>
            <Card className="p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="flex items-baseline gap-2">
                  <span className={`font-display text-sm font-semibold ${color}`}>{ev.titulo}</span>
                  <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                    {ev.fuente}
                  </Badge>
                  {ev.cantidad != null && (
                    <span className="font-mono text-xs text-slate-500">{ev.cantidad} u.</span>
                  )}
                </div>
                <time className="font-mono text-[11px] text-slate-500">{formatearFecha(ev.fecha)}</time>
              </div>

              {ev.detalle && <p className="mt-1 text-xs text-slate-600">{ev.detalle}</p>}

              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                {(ev.almacen_origen || ev.almacen_destino) && (
                  <span className="inline-flex items-center gap-1">
                    <Building2 className="h-3 w-3" />
                    {ev.almacen_origen?.codigo ?? '—'}
                    {ev.almacen_destino && (
                      <>
                        <ArrowRightLeft className="h-3 w-3" />
                        {ev.almacen_destino.codigo}
                      </>
                    )}
                  </span>
                )}
                {ev.ot && (
                  <Link
                    href={`/trazabilidad/ot/${ev.ot.id}`}
                    className="inline-flex items-center gap-1 hover:text-happy-600 hover:underline"
                  >
                    OT {ev.ot.numero}
                  </Link>
                )}
                {ev.taller && <span>Taller: {ev.taller.nombre}</span>}
                {ev.operario && (
                  <span>
                    Operario: {ev.operario.nombres}
                    {ev.operario.apellido_paterno ? ` ${ev.operario.apellido_paterno}` : ''}
                  </span>
                )}
                {ev.cliente && (
                  <span>
                    Cliente: {ev.cliente.razon_social ?? ev.cliente.nombres ?? '—'}
                  </span>
                )}
                {ev.referencia_tipo && (
                  <span className="font-mono">
                    Ref: {ev.referencia_tipo}
                  </span>
                )}
              </div>
            </Card>
          </li>
        );
      })}
    </ol>
  );
}
