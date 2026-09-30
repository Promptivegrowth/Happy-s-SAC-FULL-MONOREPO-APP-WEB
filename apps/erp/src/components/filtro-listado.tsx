import Link from 'next/link';
import { Button } from '@happy/ui/button';
import { Input } from '@happy/ui/input';
import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react';

/*
 * Buscador y paginado de las listas largas (ventas, comprobantes).
 *
 * Esas listas traían solo los últimos 200 registros y nada más: el 30/09/2026
 * una usuaria revisando ventas "solo encontraba desde el 24", aunque había
 * ventas desde el 15. No faltaba nada; la pantalla no dejaba llegar. Esto es un
 * formulario GET común: filtra en el servidor, se puede compartir el enlace y
 * funciona sin JavaScript.
 */

export const POR_PAGINA = 100;

export type FiltroListado = { desde: string; hasta: string; q: string; pag: number };

const esFecha = (s: string | undefined) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '');

export function leerFiltro(sp: Record<string, string | string[] | undefined>): FiltroListado {
  const uno = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k]) as string | undefined;
  return {
    desde: esFecha(uno('desde')),
    hasta: esFecha(uno('hasta')),
    q: (uno('q') ?? '').trim().slice(0, 60),
    pag: Math.max(1, Number(uno('pag')) || 1),
  };
}

/**
 * Un día de Perú en UTC. La base guarda en UTC y Lima es UTC-5: el día local
 * va de las 05:00Z de ese día a las 05:00Z del siguiente. Filtrar por el día
 * UTC dejaba fuera las ventas de la noche.
 */
export function rangoLima(f: FiltroListado): { desde: string | null; hasta: string | null } {
  const desde = f.desde ? new Date(`${f.desde}T05:00:00.000Z`).toISOString() : null;
  const hasta = f.hasta ? new Date(new Date(`${f.hasta}T05:00:00.000Z`).getTime() + 86_400_000).toISOString() : null;
  return { desde, hasta };
}

/** Texto seguro para un filtro `ilike` de PostgREST (sin comas ni paréntesis que rompan el `or`). */
export function textoBusqueda(q: string): string {
  return q.replace(/[%_,()*]/g, ' ').trim();
}

function enlace(base: string, f: FiltroListado, pag: number): string {
  const p = new URLSearchParams();
  if (f.desde) p.set('desde', f.desde);
  if (f.hasta) p.set('hasta', f.hasta);
  if (f.q) p.set('q', f.q);
  if (pag > 1) p.set('pag', String(pag));
  const s = p.toString();
  return s ? `${base}?${s}` : base;
}

export function BarraFiltro({ base, f, placeholder }: { base: string; f: FiltroListado; placeholder: string }) {
  const hayFiltro = Boolean(f.desde || f.hasta || f.q);
  return (
    <form method="get" action={base} className="flex flex-wrap items-end gap-2 rounded-xl border bg-white p-3">
      <label className="flex flex-col text-[11px] font-medium uppercase tracking-wide text-slate-500">
        Desde
        <Input type="date" name="desde" defaultValue={f.desde} className="mt-1 h-9 w-40" />
      </label>
      <label className="flex flex-col text-[11px] font-medium uppercase tracking-wide text-slate-500">
        Hasta
        <Input type="date" name="hasta" defaultValue={f.hasta} className="mt-1 h-9 w-40" />
      </label>
      <label className="flex min-w-[220px] flex-1 flex-col text-[11px] font-medium uppercase tracking-wide text-slate-500">
        Buscar
        <Input name="q" defaultValue={f.q} placeholder={placeholder} className="mt-1 h-9" />
      </label>
      <Button type="submit" size="sm" className="h-9"><Search className="h-4 w-4" /> Buscar</Button>
      {hayFiltro && (
        <Button asChild variant="ghost" size="sm" className="h-9">
          <Link href={base}><X className="h-4 w-4" /> Limpiar</Link>
        </Button>
      )}
    </form>
  );
}

export function Paginado({ base, f, total }: { base: string; f: FiltroListado; total: number }) {
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const desde = total === 0 ? 0 : (f.pag - 1) * POR_PAGINA + 1;
  const hasta = Math.min(total, f.pag * POR_PAGINA);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-sm text-slate-600">
      <span>
        {total === 0 ? 'Sin resultados' : <>Mostrando <strong>{desde}–{hasta}</strong> de <strong>{total}</strong></>}
      </span>
      {paginas > 1 && (
        <div className="flex items-center gap-2">
          {f.pag > 1 ? (
            <Button asChild variant="outline" size="sm"><Link href={enlace(base, f, f.pag - 1)}><ChevronLeft className="h-4 w-4" /> Más recientes</Link></Button>
          ) : (
            <Button variant="outline" size="sm" disabled><ChevronLeft className="h-4 w-4" /> Más recientes</Button>
          )}
          <span className="text-xs">Página {f.pag} de {paginas}</span>
          {f.pag < paginas ? (
            <Button asChild variant="outline" size="sm"><Link href={enlace(base, f, f.pag + 1)}>Más antiguas <ChevronRight className="h-4 w-4" /></Link></Button>
          ) : (
            <Button variant="outline" size="sm" disabled>Más antiguas <ChevronRight className="h-4 w-4" /></Button>
          )}
        </div>
      )}
    </div>
  );
}
