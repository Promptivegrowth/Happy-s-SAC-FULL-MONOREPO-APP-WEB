'use server';

import { z } from 'zod';
import { runAction, requireUser, bumpPaths, type ActionResult } from './_helpers';

/**
 * CRUD de cuentas bancarias / medios de pago.
 *
 * Ver comentario en migración 62: esta tabla es la LISTA EDITABLE de cuentas
 * destino que aparecen en el POS (BCP HAPPYS, BCP JAVIER, INTERBANK…) y en
 * la web pública (YAPE/PLIN). El enum tipo_metodo_pago no cambió — se sigue
 * guardando en ventas_pagos.metodo.
 */

// El enum tipo_metodo_pago tiene 9 valores. Los aceptamos textuales — la BD
// valida el tipo real de la columna ventas_pagos.metodo cuando se usa la
// cuenta al cobrar. Acá lo dejamos como texto libre porque no vale la pena
// duplicar el enum en el frontend.
const METODOS_DEFAULT = [
  'EFECTIVO', 'YAPE', 'PLIN', 'TARJETA_DEBITO', 'TARJETA_CREDITO',
  'TRANSFERENCIA', 'DEPOSITO', 'CREDITO', 'WHATSAPP_PENDIENTE',
] as const;

const schema = z.object({
  nombre_corto: z.string().min(2, 'Mínimo 2 caracteres').max(60),
  banco: z.string().max(40).optional().or(z.literal('')),
  titular: z.string().max(80).optional().or(z.literal('')),
  numero_cuenta: z.string().max(40).optional().or(z.literal('')),
  numero_cci: z.string().max(40).optional().or(z.literal('')),
  numero_telefono: z.string().max(20).optional().or(z.literal('')),
  metodo_default: z.enum(METODOS_DEFAULT).default('TRANSFERENCIA'),
  visible_pos: z.boolean().default(true),
  visible_web: z.boolean().default(false),
  orden: z.coerce.number().int().min(0).default(0),
  activo: z.boolean().default(true),
  notas: z.string().max(500).optional().or(z.literal('')),
});

function nullify(v: string | undefined) {
  const s = (v ?? '').trim();
  return s === '' ? null : s;
}

export async function crearCuentaBancaria(
  input: z.input<typeof schema>,
): Promise<ActionResult<{ id: string }>> {
  const r = await runAction(async () => {
    const data = schema.parse(input);
    const { sb } = await requireUser();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sbAny = sb as unknown as { from: (t: string) => any };
    const { data: row, error } = await sbAny
      .from('cuentas_bancarias')
      .insert({
        nombre_corto: data.nombre_corto.trim(),
        banco: nullify(data.banco),
        titular: nullify(data.titular),
        numero_cuenta: nullify(data.numero_cuenta),
        numero_cci: nullify(data.numero_cci),
        numero_telefono: nullify(data.numero_telefono),
        metodo_default: data.metodo_default,
        visible_pos: data.visible_pos,
        visible_web: data.visible_web,
        orden: data.orden,
        activo: data.activo,
        notas: nullify(data.notas),
      })
      .select('id')
      .single();
    if (error) {
      if (error.code === '23505') throw new Error('Ya existe una cuenta con ese nombre corto');
      throw new Error(error.message);
    }
    return { id: row.id as string };
  });
  if (r.ok) await bumpPaths('/configuracion/cuentas-bancarias');
  return r;
}

export async function actualizarCuentaBancaria(
  id: string,
  input: z.input<typeof schema>,
): Promise<ActionResult> {
  const r = await runAction(async () => {
    const data = schema.parse(input);
    const { sb } = await requireUser();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sbAny = sb as unknown as { from: (t: string) => any };
    const { error } = await sbAny
      .from('cuentas_bancarias')
      .update({
        nombre_corto: data.nombre_corto.trim(),
        banco: nullify(data.banco),
        titular: nullify(data.titular),
        numero_cuenta: nullify(data.numero_cuenta),
        numero_cci: nullify(data.numero_cci),
        numero_telefono: nullify(data.numero_telefono),
        metodo_default: data.metodo_default,
        visible_pos: data.visible_pos,
        visible_web: data.visible_web,
        orden: data.orden,
        activo: data.activo,
        notas: nullify(data.notas),
      })
      .eq('id', id);
    if (error) {
      if (error.code === '23505') throw new Error('Ya existe otra cuenta con ese nombre corto');
      throw new Error(error.message);
    }
    return null;
  });
  if (r.ok) await bumpPaths('/configuracion/cuentas-bancarias');
  return r;
}

export async function eliminarCuentaBancaria(id: string): Promise<ActionResult> {
  const r = await runAction(async () => {
    const { sb } = await requireUser();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sbAny = sb as unknown as { from: (t: string) => any };
    const { error } = await sbAny.from('cuentas_bancarias').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return null;
  });
  if (r.ok) await bumpPaths('/configuracion/cuentas-bancarias');
  return r;
}

export async function toggleCuentaActiva(id: string, activo: boolean): Promise<ActionResult> {
  const r = await runAction(async () => {
    const { sb } = await requireUser();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sbAny = sb as unknown as { from: (t: string) => any };
    const { error } = await sbAny.from('cuentas_bancarias').update({ activo }).eq('id', id);
    if (error) throw new Error(error.message);
    return null;
  });
  if (r.ok) await bumpPaths('/configuracion/cuentas-bancarias');
  return r;
}
