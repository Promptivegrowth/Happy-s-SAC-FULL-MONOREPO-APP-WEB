'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@happy/db/server';
import { requireRol } from '@/server/session';

/**
 * Series de comprobantes SUNAT.
 * - BOLETA: serie 'B###' (asignada por SUNAT).
 * - FACTURA: serie 'F###' nacional.
 * - FACTURA + canal=EXPORTACION: serie asignada por SUNAT para exportación
 *   (ej: 'FE01'). Al momento del deploy inicial la fila existe con serie
 *   placeholder 'FEXP' y `activa=false` hasta que el cliente reciba la serie
 *   real de SUNAT y la actualice acá.
 */

const upsertSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  tipo: z.enum(['BOLETA', 'FACTURA', 'NOTA_VENTA', 'NOTA_CREDITO', 'NOTA_DEBITO', 'GUIA_REMISION']),
  serie: z.string().min(1).max(10).regex(/^[A-Z0-9]+$/i, 'Serie solo letras/números, sin espacios'),
  canal: z.enum(['POS', 'WEB', 'B2B', 'WHATSAPP', 'REDES', 'EXPORTACION']).optional().nullable(),
  ultimo_correlativo: z.number().int().min(0).default(0),
  activa: z.boolean().default(false),
  observacion: z.string().optional().nullable(),
});

export type SerieComprobanteInput = z.infer<typeof upsertSchema>;

export async function guardarSerieComprobante(input: SerieComprobanteInput) {
  await requireRol('gerente');
  const parsed = upsertSchema.parse(input);
  const sb = await createClient();

  // Si es exportación, chequear que el canal esté marcado (norma peruana lo exige
  // para distinguir el registro en el Libro de Ventas — casillero exportaciones).
  // No forzamos serie prefix específico porque SUNAT admite cualquier alfanumérica.

  const payload = {
    tipo: parsed.tipo,
    serie: parsed.serie.toUpperCase(),
    canal: parsed.canal ?? null,
    ultimo_correlativo: parsed.ultimo_correlativo,
    activa: parsed.activa,
    observacion: parsed.observacion ?? null,
  };

  if (parsed.id) {
    const { error } = await sb.from('series_comprobantes').update(payload).eq('id', parsed.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await sb.from('series_comprobantes').insert(payload);
    if (error) throw new Error(error.message);
  }

  revalidatePath('/configuracion/series');
}

export async function toggleSerieActiva(id: string, activa: boolean) {
  await requireRol('gerente');
  const sb = await createClient();
  const { error } = await sb.from('series_comprobantes').update({ activa }).eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/configuracion/series');
}

export async function eliminarSerieComprobante(id: string) {
  await requireRol('gerente');
  const sb = await createClient();

  // No permitir eliminar una serie que YA se usó para emitir comprobantes.
  const { count } = await sb
    .from('comprobantes')
    .select('id', { count: 'exact', head: true })
    .eq(
      'serie',
      (await sb.from('series_comprobantes').select('serie').eq('id', id).single()).data?.serie ?? '',
    );
  if ((count ?? 0) > 0) {
    throw new Error(
      'No se puede eliminar una serie que ya emitió comprobantes. Desactivala en su lugar (así queda el historial intacto).',
    );
  }

  const { error } = await sb.from('series_comprobantes').delete().eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/configuracion/series');
}

export type SerieComprobanteRow = {
  id: string;
  tipo: string;
  serie: string;
  canal: string | null;
  ultimo_correlativo: number;
  activa: boolean;
  observacion: string | null;
  almacen_id: string | null;
  caja_id: string | null;
};

export async function listarSeriesComprobantes(): Promise<SerieComprobanteRow[]> {
  await requireRol('gerente');
  const sb = await createClient();
  const { data } = await sb
    .from('series_comprobantes')
    .select('id, tipo, serie, canal, ultimo_correlativo, activa, observacion, almacen_id, caja_id')
    .order('tipo')
    .order('serie');
  // Normalizar nulos (DB permite null en activa/ultimo_correlativo por default,
  // pero para UI tratamos ausente = false / 0).
  return ((data ?? []) as unknown as SerieComprobanteRow[]).map((r) => ({
    ...r,
    activa: r.activa ?? false,
    ultimo_correlativo: r.ultimo_correlativo ?? 0,
  }));
}
