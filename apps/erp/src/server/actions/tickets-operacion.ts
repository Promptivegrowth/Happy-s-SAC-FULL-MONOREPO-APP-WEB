'use server';

import { z } from 'zod';
import { runAction, requireUser, bumpPaths, type ActionResult } from './_helpers';

const PROCESOS = [
  'TRAZADO','TENDIDO','CORTE','HABILITADO','COSTURA','BORDADO','ESTAMPADO',
  'SUBLIMADO','PLISADO','ACABADO','PLANCHADO','OJAL_BOTON','CONTROL_CALIDAD',
  'EMBALAJE','DECORADO',
] as const;

const iniciarSchema = z.object({
  os_id: z.string().uuid().optional().or(z.literal('')),
  ot_id: z.string().uuid().optional().or(z.literal('')),
  corte_id: z.string().uuid().optional().or(z.literal('')),
  proceso: z.enum(PROCESOS),
  area_id: z.string().uuid().optional().or(z.literal('')),
  operario_id: z.string().uuid().optional().or(z.literal('')),
  cantidad: z.coerce.number().int().min(0).default(0),
  observacion: z.string().max(500).optional().or(z.literal('')),
});

/**
 * Crea un ticket abierto (inicio = now, fin = null) para registrar el comienzo
 * de una etapa de producción. Cuando finalice se setea fin y la duración se
 * calcula sola (columna generada).
 */
export async function iniciarTicket(input: z.input<typeof iniciarSchema>): Promise<ActionResult<{ id: string }>> {
  const r = await runAction(async () => {
    const data = iniciarSchema.parse(input);
    const { sb } = await requireUser();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sbAny = sb as unknown as { from: (t: string) => any };
    const { data: row, error } = await sbAny.from('tickets_operacion').insert({
      os_id: data.os_id || null,
      ot_id: data.ot_id || null,
      corte_id: data.corte_id || null,
      proceso: data.proceso,
      area_id: data.area_id || null,
      operario_id: data.operario_id || null,
      cantidad: data.cantidad || 0,
      observacion: data.observacion || null,
      inicio: new Date().toISOString(),
    }).select('id').single();
    if (error) throw new Error(error.message);
    return { id: row.id as string };
  });
  if (r.ok && input.os_id) await bumpPaths(`/servicios/${input.os_id}`);
  if (r.ok && input.ot_id) await bumpPaths(`/ot/${input.ot_id}`);
  return r;
}

/** Cierra un ticket: setea fin = now si seguía abierto. */
export async function finalizarTicket(ticketId: string, observacion?: string): Promise<ActionResult> {
  const r = await runAction(async () => {
    const { sb } = await requireUser();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sbAny = sb as unknown as { from: (t: string) => any };
    const update: { fin: string; observacion?: string } = { fin: new Date().toISOString() };
    if (observacion) update.observacion = observacion;
    const { data, error } = await sbAny.from('tickets_operacion')
      .update(update)
      .eq('id', ticketId)
      .is('fin', null)
      .select('os_id, ot_id')
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error('El ticket ya estaba cerrado o no existe.');
    if (data.os_id) await bumpPaths(`/servicios/${data.os_id}`);
    if (data.ot_id) await bumpPaths(`/ot/${data.ot_id}`);
    return null;
  });
  return r;
}

export async function eliminarTicket(ticketId: string): Promise<ActionResult> {
  const r = await runAction(async () => {
    const { sb } = await requireUser();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sbAny = sb as unknown as { from: (t: string) => any };
    const { data, error } = await sbAny.from('tickets_operacion')
      .delete()
      .eq('id', ticketId)
      .select('os_id, ot_id')
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data?.os_id) await bumpPaths(`/servicios/${data.os_id}`);
    if (data?.ot_id) await bumpPaths(`/ot/${data.ot_id}`);
    return null;
  });
  return r;
}
