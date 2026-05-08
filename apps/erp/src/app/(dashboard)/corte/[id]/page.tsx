import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@happy/db/server';
import { Card, CardHeader, CardTitle, CardContent } from '@happy/ui/card';
import { Badge } from '@happy/ui/badge';
import { Button } from '@happy/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { PageShell } from '@/components/page-shell';
import { LineasCorteEditor, AccionCerrarCorte, GenerarOSDesdeCorte } from './client';
import { formatDateTime } from '@happy/lib';

export const dynamic = 'force-dynamic';

const COLOR: Record<string, 'success' | 'warning' | 'secondary'> = {
  ABIERTO: 'warning',
  EN_PROCESO: 'warning',
  COMPLETADO: 'success',
  ANULADO: 'secondary',
};

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await createClient();
  const [{ data: corte }, { data: lineas }, { data: talleres }] = await Promise.all([
    sb.from('ot_corte').select('*, ot(numero, id), productos(codigo, nombre)').eq('id', id).single(),
    sb.from('ot_corte_lineas').select('*').eq('corte_id', id).order('talla'),
    sb.from('talleres').select('id, codigo, nombre').eq('activo', true).order('nombre'),
  ]);
  if (!corte) notFound();

  const ot = (corte as unknown as { ot?: { numero: string; id: string } | null }).ot;
  const prod = (corte as unknown as { productos?: { codigo: string; nombre: string } | null }).productos;
  const editable = corte.estado !== 'COMPLETADO' && corte.estado !== 'ANULADO';

  // Plan de la OT para este modelo (cantidad planificada por talla) y lo que
  // ya se cortó en OTROS cortes del mismo OT/producto, para calcular el saldo
  // que sirve de cantidad teórica por defecto.
  const planPorTalla: Record<string, number> = {};
  const cortadoOtrosPorTalla: Record<string, number> = {};
  if (ot?.id && corte.producto_id) {
    const [{ data: otLineas }, { data: otrosCortes }] = await Promise.all([
      sb.from('ot_lineas')
        .select('talla, cantidad_planificada')
        .eq('ot_id', ot.id)
        .eq('producto_id', corte.producto_id),
      sb.from('ot_corte')
        .select('id, ot_corte_lineas(talla, cantidad_real, cantidad_teorica)')
        .eq('ot_id', ot.id)
        .eq('producto_id', corte.producto_id)
        .neq('id', id),
    ]);
    for (const l of otLineas ?? []) {
      planPorTalla[l.talla as string] = Number(l.cantidad_planificada ?? 0);
    }
    type OtroCorte = { ot_corte_lineas: Array<{ talla: string; cantidad_real: number | null; cantidad_teorica: number }> };
    for (const c of (otrosCortes ?? []) as unknown as OtroCorte[]) {
      for (const lc of c.ot_corte_lineas ?? []) {
        const usada = Number(lc.cantidad_real ?? lc.cantidad_teorica ?? 0);
        cortadoOtrosPorTalla[lc.talla] = (cortadoOtrosPorTalla[lc.talla] ?? 0) + usada;
      }
    }
  }

  return (
    <PageShell
      title={`Corte ${corte.numero}`}
      description={
        <>
          Modelo {prod?.nombre} · OT <Link href={`/ot/${ot?.id}`} className="text-happy-600 hover:underline">{ot?.numero}</Link>
          {corte.fecha_inicio && <> · Iniciado {formatDateTime(corte.fecha_inicio)}</>}
        </>
      }
      actions={
        editable
          ? <AccionCerrarCorte corteId={id} />
          : corte.estado === 'COMPLETADO'
            ? <GenerarOSDesdeCorte corteId={id} otId={ot?.id ?? ''} talleres={(talleres ?? []).map((t) => ({ ...t, codigo: t.codigo ?? '' }))} />
            : null
      }
    >
      <div className="grid gap-3 sm:grid-cols-5">
        <Stat label="Estado" value={<Badge variant={COLOR[corte.estado ?? 'ABIERTO'] ?? 'secondary'}>{(corte.estado ?? 'ABIERTO').replace('_', ' ')}</Badge>} />
        <Stat label="Capas" value={`${corte.capas_tendidas ?? 0}`} />
        <Stat label="Metros" value={Number(corte.metros_consumidos ?? 0).toFixed(2)} />
        <Stat label="Merma (m)" value={Number(corte.merma_metros ?? 0).toFixed(2)} />
        <Stat label="Líneas" value={`${(lineas ?? []).length}`} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Líneas por talla</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <LineasCorteEditor
            corteId={id}
            lineas={(lineas ?? []) as Parameters<typeof LineasCorteEditor>[0]['lineas']}
            editable={editable}
            planPorTalla={planPorTalla}
            cortadoOtrosPorTalla={cortadoOtrosPorTalla}
          />
        </CardContent>
      </Card>
    </PageShell>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <div className="mt-1 font-display text-2xl font-semibold text-corp-900">{value}</div>
    </Card>
  );
}
