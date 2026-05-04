'use server';

import { z } from 'zod';
import { runAction, requireUser, bumpPaths, type ActionResult } from './_helpers';

const PROCESOS = [
  'TRAZADO', 'TENDIDO', 'CORTE', 'HABILITADO', 'COSTURA', 'BORDADO', 'ESTAMPADO',
  'SUBLIMADO', 'PLISADO', 'ACABADO', 'PLANCHADO', 'OJAL_BOTON', 'CONTROL_CALIDAD',
  'EMBALAJE', 'DECORADO',
] as const;

const TALLAS = ['T0','T2','T4','T6','T8','T10','T12','T14','T16','TS','TAD'] as const;

/**
 * Busca la tarifa más específica que aplica a (taller, producto, proceso, talla).
 * Orden de preferencia (más específica primero):
 *   1. taller + producto + proceso + talla
 *   2. taller + producto + proceso (sin talla)
 *   3. taller + proceso (sin producto, sin talla)
 *   4. taller (tarifa genérica)
 * Devuelve null si no encuentra ninguna.
 */
export async function consultarTarifa(
  tallerId: string,
  productoId: string | null,
  proceso: string | null,
  talla: string | null = null,
): Promise<{ tarifa: number; observacion: string | null; fuente: string } | null> {
  const { sb } = await requireUser();
  const today = new Date().toISOString().slice(0, 10);

  type Row = {
    precio_unitario: number;
    producto_id: string | null;
    proceso: string | null;
    talla: string | null;
    observacion: string | null;
    vigente_hasta: string | null;
  };

  let q = sb
    .from('talleres_tarifas')
    .select('precio_unitario, producto_id, proceso, talla, observacion, vigente_hasta')
    .eq('taller_id', tallerId)
    .lte('vigente_desde', today);
  const { data } = await q;
  const rows = ((data ?? []) as Row[]).filter(
    (r) => !r.vigente_hasta || r.vigente_hasta >= today,
  );

  // Score: cuántos campos matchean (más específico = mejor)
  const candidatos = rows
    .map((r) => {
      let score = 0;
      let valid = true;
      if (r.producto_id !== null) {
        if (r.producto_id === productoId) score += 4;
        else valid = false;
      }
      if (r.proceso !== null) {
        if (r.proceso === proceso) score += 2;
        else valid = false;
      }
      if (r.talla !== null) {
        if (r.talla === talla) score += 1;
        else valid = false;
      }
      return valid ? { row: r, score } : null;
    })
    .filter((x): x is { row: Row; score: number } => x !== null)
    .sort((a, b) => b.score - a.score);

  const winner = candidatos[0];
  if (!winner) return null;
  const { row, score } = winner;
  const fuente: string[] = [];
  if (row.producto_id !== null) fuente.push('producto');
  if (row.proceso !== null) fuente.push('proceso');
  if (row.talla !== null) fuente.push('talla');
  return {
    tarifa: Number(row.precio_unitario),
    observacion: row.observacion,
    fuente: fuente.length === 0 ? 'tarifa genérica del taller' : `match por ${fuente.join('+')} (score ${score})`,
  };
}

/**
 * Calcula el monto sugerido para una OS a partir del corte: por cada talla
 * con cantidad_real > 0, busca la tarifa más específica y multiplica.
 * Devuelve breakdown por talla y total.
 */
export async function calcularMontoSugeridoOS(
  tallerId: string,
  productoId: string,
  proceso: string,
  cantidadesPorTalla: Record<string, number>,
): Promise<ActionResult<{
  total: number;
  detalle: { talla: string; cantidad: number; tarifa: number; subtotal: number; fuente: string }[];
  faltantes: string[];
}>> {
  const r = await runAction(async () => {
    const detalle: { talla: string; cantidad: number; tarifa: number; subtotal: number; fuente: string }[] = [];
    const faltantes: string[] = [];
    let total = 0;

    for (const [talla, cantidad] of Object.entries(cantidadesPorTalla)) {
      if (cantidad <= 0) continue;
      const t = await consultarTarifa(tallerId, productoId, proceso, talla);
      if (!t) {
        faltantes.push(talla);
        continue;
      }
      const subtotal = Math.round(t.tarifa * cantidad * 100) / 100;
      total += subtotal;
      detalle.push({ talla, cantidad, tarifa: t.tarifa, subtotal, fuente: t.fuente });
    }

    return { total: Math.round(total * 100) / 100, detalle, faltantes };
  });
  return r;
}

// ============================================================================
// CRUD de tarifas (UI en /talleres/[id]/tarifas)
// ============================================================================

const tarifaSchema = z.object({
  taller_id: z.string().uuid(),
  producto_id: z.string().uuid().optional().or(z.literal('')),
  proceso: z.enum(PROCESOS).optional().or(z.literal('')),
  talla: z.enum(TALLAS).optional().or(z.literal('')),
  precio_unitario: z.coerce.number().positive('Tarifa debe ser > 0'),
  vigente_desde: z.string().min(8).optional().or(z.literal('')),
  vigente_hasta: z.string().min(8).optional().or(z.literal('')),
  observacion: z.string().max(300).optional().or(z.literal('')),
});

export async function crearTarifa(input: z.input<typeof tarifaSchema>): Promise<ActionResult<{ id: string }>> {
  const r = await runAction(async () => {
    const data = tarifaSchema.parse(input);
    const { sb } = await requireUser();
    const { data: row, error } = await sb
      .from('talleres_tarifas')
      .insert({
        taller_id: data.taller_id,
        producto_id: data.producto_id || null,
        proceso: (data.proceso || null) as (typeof PROCESOS)[number] | null,
        talla: (data.talla || null) as (typeof TALLAS)[number] | null,
        precio_unitario: data.precio_unitario,
        vigente_desde: data.vigente_desde || null,
        vigente_hasta: data.vigente_hasta || null,
        observacion: data.observacion || null,
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string };
  });
  if (r.ok) await bumpPaths(`/talleres/${input.taller_id}/tarifas`);
  return r;
}

export async function eliminarTarifa(id: string, tallerId: string): Promise<ActionResult> {
  const r = await runAction(async () => {
    const { sb } = await requireUser();
    const { error } = await sb.from('talleres_tarifas').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return null;
  });
  if (r.ok) await bumpPaths(`/talleres/${tallerId}/tarifas`);
  return r;
}
