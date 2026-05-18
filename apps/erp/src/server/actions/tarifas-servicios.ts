'use server';

import { z } from 'zod';
import { runAction, requireUser, bumpPaths, type ActionResult } from './_helpers';

const PROCESOS = [
  'TRAZADO', 'TENDIDO', 'CORTE', 'HABILITADO', 'COSTURA', 'BORDADO', 'ESTAMPADO',
  'SUBLIMADO', 'PLISADO', 'ACABADO', 'PLANCHADO', 'OJAL_BOTON', 'CONTROL_CALIDAD',
  'EMBALAJE', 'DECORADO',
] as const;
const TALLAS = ['T0','T2','T4','T6','T8','T10','T12','T14','T16','TS','TAD'] as const;

const schema = z.object({
  proceso: z.enum(PROCESOS).optional().or(z.literal('')),
  producto_id: z.string().uuid().optional().or(z.literal('')),
  talla: z.enum(TALLAS).optional().or(z.literal('')),
  precio_unitario: z.coerce.number().positive('Tarifa debe ser > 0'),
  vigente_desde: z.string().min(8).optional().or(z.literal('')),
  vigente_hasta: z.string().min(8).optional().or(z.literal('')),
  observacion: z.string().max(300).optional().or(z.literal('')),
});

export async function crearTarifaServicio(input: z.input<typeof schema>): Promise<ActionResult<{ id: string }>> {
  const r = await runAction(async () => {
    const data = schema.parse(input);
    const { sb } = await requireUser();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sbAny = sb as unknown as { from: (t: string) => any };
    const { data: row, error } = await sbAny
      .from('tarifas_servicios')
      .insert({
        proceso: (data.proceso || null) as (typeof PROCESOS)[number] | null,
        producto_id: data.producto_id || null,
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
  if (r.ok) await bumpPaths('/configuracion/tarifas-servicios');
  return r;
}

/**
 * Actualiza una tarifa existente. Permite editar todos los campos (proceso,
 * producto, talla, precio, vigencia, observación). Si el cliente quiere
 * cambiar el scope (p.ej. de "solo proceso" a "proceso+talla"), simplemente
 * setea/limpia los campos que correspondan.
 */
export async function actualizarTarifaServicio(
  id: string,
  input: z.input<typeof schema>,
): Promise<ActionResult> {
  const r = await runAction(async () => {
    const data = schema.parse(input);
    const { sb } = await requireUser();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sbAny = sb as unknown as { from: (t: string) => any };
    const { error } = await sbAny
      .from('tarifas_servicios')
      .update({
        proceso: (data.proceso || null) as (typeof PROCESOS)[number] | null,
        producto_id: data.producto_id || null,
        talla: (data.talla || null) as (typeof TALLAS)[number] | null,
        precio_unitario: data.precio_unitario,
        vigente_desde: data.vigente_desde || null,
        vigente_hasta: data.vigente_hasta || null,
        observacion: data.observacion || null,
      })
      .eq('id', id);
    if (error) throw new Error(error.message);
    return null;
  });
  if (r.ok) await bumpPaths('/configuracion/tarifas-servicios');
  return r;
}

export async function eliminarTarifaServicio(id: string): Promise<ActionResult> {
  const r = await runAction(async () => {
    const { sb } = await requireUser();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sbAny = sb as unknown as { from: (t: string) => any };
    const { error } = await sbAny.from('tarifas_servicios').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return null;
  });
  if (r.ok) await bumpPaths('/configuracion/tarifas-servicios');
  return r;
}

/**
 * Busca la tarifa más específica que aplica a (proceso, producto, talla).
 * Orden de preferencia (más específica primero):
 *   1. proceso + producto + talla
 *   2. proceso + producto
 *   3. proceso + talla
 *   4. producto + talla
 *   5. solo proceso
 *   6. solo producto
 *   7. solo talla
 *   8. genérica (todos los campos null)
 *
 * Devuelve null si no hay ninguna tarifa que aplique.
 */
export async function consultarTarifaServicio(
  proceso: string,
  productoId: string,
  talla: string,
): Promise<{ tarifa: number; observacion: string | null; especificidad: string } | null> {
  const { sb } = await requireUser();
  const today = new Date().toISOString().slice(0, 10);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sbAny = sb as unknown as { from: (t: string) => any };
  type Row = {
    precio_unitario: number;
    proceso: string | null;
    producto_id: string | null;
    talla: string | null;
    observacion: string | null;
    vigente_hasta: string | null;
  };
  const { data } = await sbAny
    .from('tarifas_servicios')
    .select('precio_unitario, proceso, producto_id, talla, observacion, vigente_hasta')
    .lte('vigente_desde', today);
  const rows = ((data ?? []) as Row[]).filter(
    (r) => !r.vigente_hasta || r.vigente_hasta >= today,
  );

  // Score: cuántos campos matchean. Más alto = más específico.
  const candidatos = rows
    .map((r) => {
      let score = 0;
      let valid = true;
      if (r.proceso !== null) {
        if (r.proceso === proceso) score += 4;
        else valid = false;
      }
      if (r.producto_id !== null) {
        if (r.producto_id === productoId) score += 2;
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
  const f: string[] = [];
  if (winner.row.proceso) f.push('proceso');
  if (winner.row.producto_id) f.push('producto');
  if (winner.row.talla) f.push('talla');
  return {
    tarifa: Number(winner.row.precio_unitario),
    observacion: winner.row.observacion,
    especificidad: f.length === 0 ? 'tarifa genérica' : `match por ${f.join('+')} (score ${winner.score})`,
  };
}
