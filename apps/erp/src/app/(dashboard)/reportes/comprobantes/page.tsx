import { PageShell } from '@/components/page-shell';
import { fechaLima } from '@happy/lib/format';
import { reporteComprobantesMes } from '@/server/actions/reporte-comprobantes';
import { ReporteComprobantes } from './reporte-cliente';

export const metadata = { title: 'Comprobantes del mes' };
export const dynamic = 'force-dynamic';

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/**
 * Reporte mensual de comprobantes: lo enviado a SUNAT, las notas de venta y el
 * consolidado. El servidor solo trae el mes; vistas, días y descargas se
 * resuelven en el navegador (ver reporte-cliente.tsx).
 */
export default async function ReporteComprobantesPage({ searchParams }: { searchParams: Promise<{ mes?: string; vista?: string }> }) {
  const sp = await searchParams;
  const mes = /^\d{4}-\d{2}$/.test(sp.mes ?? '') ? sp.mes! : fechaLima().slice(0, 7);
  const vista = sp.vista === 'notas' || sp.vista === 'todo' ? sp.vista : 'sunat';
  const rep = await reporteComprobantesMes(mes);
  const [a, m] = mes.split('-');
  const nombreMes = `${MESES[Number(m) - 1]} ${a}`;

  return (
    <PageShell
      title="Comprobantes del mes"
      description={`${nombreMes} · lo enviado a SUNAT, las notas de venta y el consolidado`}
    >
      <form method="get" className="flex flex-wrap items-end gap-2 rounded-xl border bg-white p-3">
        <label className="flex flex-col text-[11px] font-medium uppercase tracking-wide text-slate-500">
          Mes
          <input type="month" name="mes" defaultValue={mes} className="mt-1 h-9 rounded-md border px-2 text-sm" />
        </label>
        <input type="hidden" name="vista" value={vista} />
        <button type="submit" className="h-9 rounded-md bg-happy-500 px-4 text-sm font-medium text-white hover:bg-happy-600">Ver mes</button>
      </form>

      {/* key: al cambiar de mes el reporte arranca limpio (sin el filtro de días del mes anterior). */}
      <ReporteComprobantes
        key={mes}
        mes={mes}
        nombreMes={nombreMes}
        desde={rep.desde}
        hasta={rep.hasta}
        filas={rep.filas}
        vistaInicial={vista}
      />
    </PageShell>
  );
}
