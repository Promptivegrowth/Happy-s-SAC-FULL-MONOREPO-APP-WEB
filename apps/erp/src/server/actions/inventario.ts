'use server';

import { z } from 'zod';
import { runAction, requireUser, bumpPaths, type ActionResult } from './_helpers';

/**
 * Ajustar el stock de una variante en un almacén específico al valor exacto
 * que indica el usuario (conteo físico). Calcula el delta vs el actual y
 * inserta un kardex_movimiento ENTRADA_AJUSTE / SALIDA_AJUSTE; el trigger
 * tg_actualizar_stock mantiene stock_actual en sincronía y la vista global
 * v_stock_variante_total se refleja en el ERP, la web y el POS.
 */
const ajustarSchema = z.object({
  almacen_id: z.string().uuid('Almacén inválido'),
  variante_id: z.string().uuid('Variante inválida'),
  cantidad_nueva: z.coerce.number().min(0, 'La cantidad no puede ser negativa'),
  motivo: z.enum(['CONTEO', 'INGRESO', 'MERMA', 'OTRO']).default('CONTEO'),
  observacion: z.string().max(500).optional().or(z.literal('')),
});

export async function ajustarStock(
  input: z.input<typeof ajustarSchema>,
): Promise<ActionResult<{ delta: number; cantidad_final: number }>> {
  const r = await runAction(async () => {
    const data = ajustarSchema.parse(input);
    const { sb, userId } = await requireUser();

    // Stock actual (puede no existir todavía → trato como 0)
    const { data: actualRow } = await sb
      .from('stock_actual')
      .select('cantidad')
      .eq('almacen_id', data.almacen_id)
      .eq('variante_id', data.variante_id)
      .is('material_lote_id', null)
      .maybeSingle();
    const cantidadActual = Number(actualRow?.cantidad ?? 0);

    const delta = data.cantidad_nueva - cantidadActual;
    if (delta === 0) {
      return { delta: 0, cantidad_final: cantidadActual };
    }

    const tipo = delta > 0 ? 'ENTRADA_AJUSTE' : 'SALIDA_AJUSTE';
    const cantidad = Math.abs(delta);

    const obs = [
      `Ajuste ${data.motivo.toLowerCase()} de stock (${cantidadActual} → ${data.cantidad_nueva})`,
      data.observacion?.trim() || null,
    ]
      .filter(Boolean)
      .join(' · ');

    const { error } = await sb.from('kardex_movimientos').insert({
      tipo,
      almacen_id: data.almacen_id,
      variante_id: data.variante_id,
      cantidad,
      referencia_tipo: 'AJUSTE',
      usuario_id: userId,
      observacion: obs,
    });
    if (error) throw new Error(error.message);

    return { delta, cantidad_final: data.cantidad_nueva };
  });
  if (r.ok) await bumpPaths('/inventario', '/productos', '/inventario/alertas');
  return r;
}

/**
 * Sumar/restar stock con un movimiento explícito (no setea valor exacto).
 * Útil cuando se quiere registrar un ingreso de compra puntual sin pisar
 * el conteo. Insertamos directo en kardex con el signo correcto.
 */
const movimientoSchema = z.object({
  almacen_id: z.string().uuid(),
  variante_id: z.string().uuid(),
  tipo: z.enum([
    'ENTRADA_COMPRA',
    'ENTRADA_DEVOLUCION_CLIENTE',
    'ENTRADA_DEVOLUCION_TALLER',
    'ENTRADA_AJUSTE',
    'SALIDA_AJUSTE',
    'SALIDA_MERMA',
  ]),
  cantidad: z.coerce.number().positive('La cantidad debe ser > 0'),
  observacion: z.string().max(500).optional().or(z.literal('')),
});

export async function registrarMovimientoStock(
  input: z.input<typeof movimientoSchema>,
): Promise<ActionResult<{ tipo: string; cantidad: number }>> {
  const r = await runAction(async () => {
    const data = movimientoSchema.parse(input);
    const { sb, userId } = await requireUser();

    const { error } = await sb.from('kardex_movimientos').insert({
      tipo: data.tipo,
      almacen_id: data.almacen_id,
      variante_id: data.variante_id,
      cantidad: data.cantidad,
      referencia_tipo: 'AJUSTE',
      usuario_id: userId,
      observacion: data.observacion?.trim() || null,
    });
    if (error) throw new Error(error.message);

    return { tipo: data.tipo, cantidad: data.cantidad };
  });
  if (r.ok) await bumpPaths('/inventario', '/productos', '/inventario/alertas');
  return r;
}
