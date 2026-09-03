import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@happy/db/server';
import { Card, CardHeader, CardTitle, CardContent } from '@happy/ui/card';
import { Badge } from '@happy/ui/badge';
import { Button } from '@happy/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { AlertTriangle } from 'lucide-react';
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
  // Fecha de hoy en hora de Lima (YYYY-MM-DD) para prellenar los date pickers de
  // la liquidación (pedido cliente 2026-08-16). Se calcula en el server y se pasa
  // como prop para evitar mismatch de hidratación por timezone del navegador.
  const hoyISO = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
  const usuarioEsGerente = await esGerente();

  // Telas de la receta activa del modelo + tiempos ya guardados (mig 69).
  // Las 3 operaciones (tendido/corte/habilitado) se registran POR tela.
  type TelaTiempo = { material_id: string; tela_nombre: string; codigo: string; tiempo_tendido_min: number; tiempo_corte_min: number; tiempo_habilitado_min: number; fecha_tendido: string; fecha_corte: string; fecha_habilitado: string; capas_tendidas: number; largo_pano: number; merma_metros: number; responsable_operario_id: string };
  const telasCorte: TelaTiempo[] = [];
  const teoricoPorMaterial = new Map<string, number>();
  let operariosCorte: { id: string; nombre: string }[] = [];
  if (corte.producto_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sbAny = sb as unknown as { from: (t: string) => any };
    const [{ data: receta }, { data: tiemposGuardados }, { data: opsRaw }] = await Promise.all([
      sb.from('recetas').select('id').eq('producto_id', corte.producto_id).eq('activa', true).maybeSingle(),
      sbAny.from('ot_corte_tiempos').select('material_id, tiempo_tendido_min, tiempo_corte_min, tiempo_habilitado_min, fecha_tendido, fecha_corte, fecha_habilitado, capas_tendidas, largo_pano, merma_metros, responsable_operario_id').eq('corte_id', id),
      sbAny.from('operarios').select('id, nombres, apellido_paterno').eq('activo', true).order('nombres'),
    ]);
    operariosCorte = ((opsRaw ?? []) as { id: string; nombres: string; apellido_paterno: string | null }[]).map((o) => ({
      id: o.id,
      nombre: `${o.nombres ?? ''} ${o.apellido_paterno ?? ''}`.trim(),
    }));
    type G = { t: number; c: number; h: number; ft: string; fc: string; fh: string; capas: number; largo: number; merma: number; resp: string };
    const guardadosMap = new Map<string, G>(
      ((tiemposGuardados ?? []) as { material_id: string; tiempo_tendido_min: number | string; tiempo_corte_min: number | string; tiempo_habilitado_min: number | string; fecha_tendido: string | null; fecha_corte: string | null; fecha_habilitado: string | null; capas_tendidas: number | string | null; largo_pano: number | string | null; merma_metros: number | string | null; responsable_operario_id: string | null }[]).map((g) => [
        g.material_id,
        { t: Number(g.tiempo_tendido_min ?? 0), c: Number(g.tiempo_corte_min ?? 0), h: Number(g.tiempo_habilitado_min ?? 0), ft: g.fecha_tendido ?? '', fc: g.fecha_corte ?? '', fh: g.fecha_habilitado ?? '', capas: Number(g.capas_tendidas ?? 0), largo: Number(g.largo_pano ?? 0), merma: Number(g.merma_metros ?? 0), resp: g.responsable_operario_id ?? '' },
      ]),
    );
    if (receta?.id) {
      const { data: lineasRec } = await sb
        .from('recetas_lineas')
        .select('talla, cantidad, material:material_id(id, codigo, nombre, categoria)')
        .eq('receta_id', receta.id);
      type LR = { talla: string; cantidad: number | string | null; material: { id: string; codigo: string; nombre: string; categoria: string } | null };
      const lineasRecArr = (lineasRec ?? []) as unknown as LR[];

      // Consumo TEÓRICO de cada tela (receta): Σ_talla receta_cantidad × unidades cortadas.
      const unidadesPorTalla = new Map<string, number>();
      for (const l of (lineas ?? []) as { talla: string; cantidad_real: number | null; cantidad_teorica: number | null }[]) {
        unidadesPorTalla.set(l.talla, Number(l.cantidad_real ?? l.cantidad_teorica ?? 0));
      }
      for (const l of lineasRecArr) {
        if (!l.material || String(l.material.categoria) !== 'TELA') continue;
        const u = unidadesPorTalla.get(l.talla) ?? 0;
        if (u <= 0) continue;
        teoricoPorMaterial.set(l.material.id, (teoricoPorMaterial.get(l.material.id) ?? 0) + Number(l.cantidad ?? 0) * u);
      }

      const vistos = new Set<string>();
      for (const l of lineasRecArr) {
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
          capas_tendidas: g?.capas ?? 0,
          largo_pano: g?.largo ?? 0,
          merma_metros: g?.merma ?? 0,
          responsable_operario_id: g?.resp ?? '',
        });
      }
      telasCorte.sort((a, b) => a.tela_nombre.localeCompare(b.tela_nombre, 'es'));
    }
  }

  // Reporte "consumo receta vs real" por tela (pedido del cliente 22/07/2026).
  // Teórico = receta × unidades cortadas. Real = capas × largo de paño + merma.
  const consumoComparacion = telasCorte.map((t) => {
    const teorico = teoricoPorMaterial.get(t.material_id) ?? 0;
    const real = t.capas_tendidas * t.largo_pano + t.merma_metros;
    return {
      material_id: t.material_id,
      nombre: t.tela_nombre,
      codigo: t.codigo,
      teorico: Math.round(teorico * 100) / 100,
      real: Math.round(real * 100) / 100,
      diferencia: Math.round((real - teorico) * 100) / 100,
    };
  });
  const hayConsumo = consumoComparacion.some((c) => c.teorico > 0 || c.real > 0);
  // Tiempos de corte registrados (para habilitar el cierre del corte).
  const totalTiemposCorte = telasCorte.reduce((s, t) => s + t.tiempo_tendido_min + t.tiempo_corte_min + t.tiempo_habilitado_min, 0);
  // ¿La cantidad real difiere de la teórica del plan? Si sí, cerrar requiere
  // autorización de gerencia (pedido cliente 2026-08-24).
  const hayDiferenciaCorte = (lineas ?? []).some(
    (l) => l.cantidad_real != null && Number(l.cantidad_real) !== Number(l.cantidad_teorica ?? 0),
  );
  const autorizacionEstado = (corte as unknown as { autorizacion_estado?: string | null }).autorizacion_estado ?? null;
  const autorizacionMotivo = (corte as unknown as { autorizacion_motivo?: string | null }).autorizacion_motivo ?? null;
  const autorizacionSolicitadaPor = (corte as unknown as { autorizacion_solicitada_por?: string | null }).autorizacion_solicitada_por ?? null;
  // Nombre de quien (producción) solicitó la autorización, para mostrárselo a
  // gerencia junto al motivo de la diferencia (pedido cliente 2026-09-02).
  let solicitanteNombre: string | null = null;
  if (autorizacionMotivo && autorizacionSolicitadaPor) {
    const { data: solic } = await sb
      .from('perfiles')
      .select('nombre_completo')
      .eq('id', autorizacionSolicitadaPor)
      .maybeSingle();
    solicitanteNombre = (solic as { nombre_completo?: string | null } | null)?.nombre_completo ?? null;
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
          ? <AccionCerrarCorte corteId={id} tieneTiempos={totalTiemposCorte > 0} hayDiferencia={hayDiferenciaCorte} esGerente={usuarioEsGerente} autorizacionEstado={autorizacionEstado} />
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

      {usuarioEsGerente && autorizacionMotivo && (
        <div
          className={`rounded-lg border p-3 text-sm ${
            autorizacionEstado === 'AUTORIZADA'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-amber-200 bg-amber-50 text-amber-900'
          }`}
        >
          <p className="mb-0.5 flex items-center gap-2 font-semibold">
            <AlertTriangle className="h-4 w-4" />
            Motivo de la diferencia (cantidad programada vs real)
            <Badge variant={autorizacionEstado === 'AUTORIZADA' ? 'success' : 'warning'} className="ml-1">
              {autorizacionEstado === 'AUTORIZADA' ? 'Autorizado' : 'Pendiente de autorización'}
            </Badge>
          </p>
          <p className="whitespace-pre-wrap">{autorizacionMotivo}</p>
          {solicitanteNombre && (
            <p className="mt-1 text-xs opacity-80">Indicado por producción: {solicitanteNombre}</p>
          )}
        </div>
      )}

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
          <CardTitle className="text-base">Liquidación por tela</CardTitle>
          <p className="text-xs text-slate-500">
            Por cada tela de la receta: capas, metros, merma, responsable y los tiempos (con fecha) de tendido, corte y habilitado. Los totales se suman al resumen del corte.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <TiemposCorteEditor corteId={id} telas={telasCorte} editable={editable} operarios={operariosCorte} hoyISO={hoyISO} />
        </CardContent>
      </Card>

      {/* Reporte: consumo de receta (teórico) vs consumo real declarado, por tela.
          Permite comparar cuánto debía consumir según la receta vs lo realmente
          usado (pedido del cliente 22/07/2026). */}
      {hayConsumo && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Consumo: receta vs real</CardTitle>
            <p className="text-xs text-slate-500">
              Teórico = receta × unidades cortadas · Real = capas × largo de paño + merma. Diferencia positiva = se consumió MÁS que lo previsto.
            </p>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tela</TableHead>
                  <TableHead className="text-right">Consumo receta (m)</TableHead>
                  <TableHead className="text-right">Consumo real (m)</TableHead>
                  <TableHead className="text-right">Diferencia (m)</TableHead>
                  <TableHead className="text-right">%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {consumoComparacion.map((c) => {
                  // Si aún NO se registró el consumo real de esta tela (liquidación
                  // pendiente), no se calcula la diferencia — así no aparece un
                  // negativo enorme desde el inicio (pedido del cliente 22/07/2026).
                  const realRegistrado = c.real > 0;
                  const pct = realRegistrado && c.teorico > 0 ? (c.diferencia / c.teorico) * 100 : null;
                  const exceso = c.diferencia > 0.001;
                  return (
                    <TableRow key={c.material_id}>
                      <TableCell>
                        <div className="text-sm font-medium text-corp-900">{c.nombre}</div>
                        <div className="font-mono text-[10px] text-slate-400">{c.codigo}</div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">{c.teorico.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {realRegistrado ? c.real.toFixed(2) : <span className="text-[10px] uppercase text-amber-600">pendiente</span>}
                      </TableCell>
                      {realRegistrado ? (
                        <>
                          <TableCell className={`text-right font-mono text-sm font-semibold ${exceso ? 'text-danger' : c.diferencia < -0.001 ? 'text-emerald-600' : 'text-slate-500'}`}>
                            {c.diferencia > 0 ? '+' : ''}{c.diferencia.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs text-slate-500">
                            {pct === null ? '—' : `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`}
                          </TableCell>
                        </>
                      ) : (
                        <>
                          <TableCell className="text-right text-slate-300">—</TableCell>
                          <TableCell className="text-right text-slate-300">—</TableCell>
                        </>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
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
