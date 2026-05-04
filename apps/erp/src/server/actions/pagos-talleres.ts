'use server';

import { z } from 'zod';
import { runAction, requireUser, bumpPaths, type ActionResult } from './_helpers';

const MEDIOS = [
  'TRANSFERENCIA',
  'YAPE',
  'PLIN',
  'EFECTIVO',
  'CHEQUE',
  'DEPOSITO',
  'OTRO',
] as const;

const schema = z.object({
  taller_id: z.string().uuid('Taller inválido'),
  fecha: z.string().min(8, 'Fecha requerida'),
  monto: z.coerce.number().positive('Monto debe ser > 0'),
  medio_pago: z.enum(MEDIOS).default('TRANSFERENCIA'),
  banco_destino: z.string().max(100).optional().or(z.literal('')),
  numero_operacion: z.string().max(100).optional().or(z.literal('')),
  comprobante_url: z.string().url('URL inválida').optional().or(z.literal('')),
  os_id: z.string().uuid().optional().or(z.literal('')),
  concepto: z.string().max(300).optional().or(z.literal('')),
  observacion: z.string().max(500).optional().or(z.literal('')),
});

export async function crearPagoTaller(_prev: unknown, fd: FormData): Promise<ActionResult<{ id: string }>> {
  const r = await runAction(async () => {
    const data = schema.parse({
      taller_id: fd.get('taller_id'),
      fecha: fd.get('fecha'),
      monto: fd.get('monto'),
      medio_pago: fd.get('medio_pago') || 'TRANSFERENCIA',
      banco_destino: fd.get('banco_destino') || '',
      numero_operacion: fd.get('numero_operacion') || '',
      comprobante_url: fd.get('comprobante_url') || '',
      os_id: fd.get('os_id') || '',
      concepto: fd.get('concepto') || '',
      observacion: fd.get('observacion') || '',
    });
    const { sb, userId } = await requireUser();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sbAny = sb as unknown as { from: (t: string) => any };
    const { data: row, error } = await sbAny
      .from('pagos_talleres')
      .insert({
        taller_id: data.taller_id,
        fecha: data.fecha,
        monto: data.monto,
        medio_pago: data.medio_pago,
        banco_destino: data.banco_destino || null,
        numero_operacion: data.numero_operacion || null,
        comprobante_url: data.comprobante_url || null,
        os_id: data.os_id || null,
        concepto: data.concepto || null,
        observacion: data.observacion || null,
        registrado_por: userId,
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string };
  });
  if (r.ok) await bumpPaths(`/talleres/${fd.get('taller_id')}/pagos`, '/reportes/pagos-talleres');
  return r;
}

export async function eliminarPagoTaller(id: string, tallerId: string): Promise<ActionResult> {
  const r = await runAction(async () => {
    const { sb } = await requireUser();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sbAny = sb as unknown as { from: (t: string) => any };
    const { error } = await sbAny.from('pagos_talleres').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return null;
  });
  if (r.ok) await bumpPaths(`/talleres/${tallerId}/pagos`, '/reportes/pagos-talleres');
  return r;
}
