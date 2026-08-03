import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@happy/db/server';
import { Card, CardHeader, CardTitle, CardContent } from '@happy/ui/card';
import { Badge } from '@happy/ui/badge';
import { Button } from '@happy/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { PageShell } from '@/components/page-shell';
import { esGerente } from '@/server/actions/_helpers';
import { LineasCorteEditor, TiemposCorteEditor, AccionCerrarCorte, GenerarOSDesdeCorte } from './client';
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
  const usuarioEsGerente = await esGerente();

  // Telas de la receta activa del modelo + tiempos ya guardados (mig 69).
  // Las 3 operaciones (tendido/corte/habilitado) se registran POR tela.
  type TelaTiempo = { material_id: string; tela_nombre: string; codigo: string; tiempo_tendido_min: number; tiempo_corte_min: number; tiempo_habilitado_min: number; fecha_tendido: string; fecha_corte: string; fecha_habilitado: string };
  const telasCorte: TelaTiempo[] = [];
  if (corte.producto_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sbAny = sb as unknown as { from: (t: string) => any };
    const [{ data: receta }, { data: tiemposGuardados }] = await Promise.all([
      sb.from('recetas').select('id').eq('producto_id', corte.producto_id).eq('activa', true).maybeSingle(),
      sbAny.from('ot_corte_tiempos').select('material_id, tiempo_tendido_min, tiempo_corte_min, tiempo_habilitado_min, fecha_tendido, fecha_corte, fecha_habilitado').eq('corte_id', id),
    ]);
    const guardadosMap = new Map<string, { t: number; c: number; h: number; ft: string; fc: string; fh: string }>(
      ((tiemposGuardados ?? []) as { material_id: string; tiempo_tendido_min: number | string; tiempo_corte_min: number | string; tiempo_habilitado_min: number | string; fecha_tendido: string | null; fecha_corte: string | null; fecha_habilitado: string | null }[]).map((g) => [
        g.material_id,
        { t: Number(g.tiempo_tendido_min ?? 0), c: Number(g.tiempo_corte_min ?? 0), h: Number(g.tiempo_habilitado_min ?? 0), ft: g.fecha_tendido ?? '', fc: g.fecha_corte ?? '', fh: g.fecha_habilitado ?? '' },
      ]),
    );
    if (receta?.id) {
      const { data: lineasRec } = await sb
        .from('recetas_lineas')
        .select('material:material_id(id, codigo, nombre, categoria)')
        .eq('receta_id', receta.id);
      type LR = { material: { id: string; codigo: string; nombre: string; categoria: string } | null };
      const vistos = new Set<string>();
      for (const l of (lineasRec ?? []) as unknown as LR[]) {
        if (!l.material || String(l.material.categoria) !== 'TELA' || vistos.has(l.material.id)) continue;
        vistos.add(l.material.id);
        const g = guardadosMap.get(l.material.id);
        telasCorte.push({
          material_id: l.material.id,
          tela_nombre: l.material.nombre,
          codigo: l.material.codigo,
          tiempo_tendido_min: g?.t ?? 0,
          tiempo_corte_min: g?.c ?? 0,
          tiempo_habilitado_min: g?.h ?? 0,
          fecha_tendido: g?.ft ?? '',
          fecha_corte: g?.fc ?? '',
          fecha_habilitado: g?.fh ?? '',
        });
      }
      telasCorte.sort((a, b) => a.tela_nombre.localeCompare(b.tela_nombre, 'es'));
    }
  }

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
            usuarioEsGerente={usuarioEsGerente}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tiempos por tela</CardTitle>
          <p className="text-xs text-slate-500">
            Tendido, corte y habilitado (en minutos) de cada tela de la receta del modelo. Las tres operaciones se hacen por tela.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <TiemposCorteEditor corteId={id} telas={telasCorte} editable={editable} />
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
