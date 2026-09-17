import { PageShell } from '@/components/page-shell';
import { requireRol } from '@/server/session';
import { createClient } from '@happy/db/server';
import { CostosGeneralesClient } from './client';
import type { CostoGeneral } from '@/server/actions/costos-generales';

export const metadata = { title: 'Costos generales' };
export const dynamic = 'force-dynamic';

/** Los últimos seis meses, del más nuevo al más viejo. */
function ultimosPeriodos(n = 6): string[] {
  const out: string[] = [];
  const d = new Date();
  for (let i = 0; i < n; i++) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    d.setMonth(d.getMonth() - 1);
  }
  return out;
}

export default async function CostosGeneralesPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  await requireRol('gerente');
  const sp = await searchParams;
  const periodos = ultimosPeriodos();
  const periodo = sp.periodo && /^\d{4}-\d{2}$/.test(sp.periodo) ? sp.periodo : periodos[0]!;

  const sb = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sbAny = sb as unknown as { from: (t: string) => any };

  const [{ data: costosRaw }, { data: areasRaw }] = await Promise.all([
    sbAny
      .from('costos_generales_mensuales')
      .select('id, periodo, categoria, concepto, monto, observacion')
      .eq('periodo', periodo)
      .order('categoria')
      .order('concepto'),
    sbAny
      .from('areas_produccion')
      .select('id, codigo, nombre, prorrateo_pct')
      .eq('activa', true)
      .order('codigo'),
  ]);

  const costos = ((costosRaw ?? []) as CostoGeneral[]).map((c) => ({ ...c, monto: Number(c.monto) }));
  const areas = ((areasRaw ?? []) as Array<{ id: string; codigo: string; nombre: string; prorrateo_pct: number | string }>)
    .map((a) => ({ ...a, prorrateo_pct: Number(a.prorrateo_pct ?? 0) }));

  return (
    <PageShell
      title="Costos generales de la empresa"
      description="La luz, el agua y el alquiler llegan en un recibo por todo el local. Se cargan una vez y se reparten entre las áreas."
    >
      <CostosGeneralesClient
        periodo={periodo}
        periodos={periodos}
        costos={costos}
        areas={areas}
      />
    </PageShell>
  );
}
