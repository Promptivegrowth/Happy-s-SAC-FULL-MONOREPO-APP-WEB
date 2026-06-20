'use server';

import { z } from 'zod';
import { runAction, requireUser, bumpPaths, type ActionResult } from './_helpers';
import type { EstadoOC } from './oc-helpers';
import { METODOS_PAGO_PROVEEDOR, type MetodoPago } from './pagos-proveedores-helpers';
export type { MetodoPago } from './pagos-proveedores-helpers';

/**
 * Módulo de Pagos a Proveedores (pagos_proveedores).
 *
 * Cada pago aplica a UNA OC o a UNA importación (no a varias). Para repartir
 * un mismo abono en varias OCs hay que registrar N pagos. Esto mantiene la
 * trazabilidad simple y la vista v_cuentas_pagar recalcula saldos al instante.
 *
 * Cuando el saldo de una OC llega a 0, el módulo marca la OC como PAGADA
 * (transición permitida desde RECIBIDA). Si después se elimina/disminuye un
 * pago y vuelve a haber saldo, se revierte a RECIBIDA.
 *
 * Numeración: `next_correlativo('PAG_PROV', 6)` → "PAG-NNNNNN".
 */

export type PagoOCRow = {
  id: string;
  numero: string;
  fecha: string;
  monto: number;
  metodo: string;
  moneda: string;
  referencia_bancaria: string | null;
  comprobante_proveedor: string | null;
  observacion: string | null;
  registrado_por: string | null;
};

const SchemaPago = z.object({
  oc_id: z.string().uuid('OC requerida'),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida'),
  monto: z.number().positive('Monto debe ser mayor a 0'),
  metodo: z.enum(METODOS_PAGO_PROVEEDOR),
  referencia_bancaria: z.string().nullable(),
  comprobante_proveedor: z.string().nullable(),
  observacion: z.string().nullable(),
});

export type RegistrarPagoInput = z.infer<typeof SchemaPago>;

export async function registrarPagoOC(input: RegistrarPagoInput): Promise<ActionResult<{ id: string; numero: string }>> {
  return runAction(async () => {
    const { sb, userId } = await requireUser();
    const parsed = SchemaPago.parse(input);

    // Validar que la OC existe + obtener proveedor + moneda + saldo restante
    type OCRow = { id: string; proveedor_id: string; total: number; moneda: string; tipo_cambio: number | null; estado: string };
    const { data: ocRaw } = await sb
      .from('oc')
      .select('id, proveedor_id, total, moneda, tipo_cambio, estado')
      .eq('id', parsed.oc_id)
      .maybeSingle();
    if (!ocRaw) throw new Error('OC no encontrada');
    const oc = ocRaw as unknown as OCRow;
    if (oc.estado === 'CANCELADA') throw new Error('No se puede pagar una OC cancelada');

    // Suma actual de pagos
    const { data: pagosRaw } = await sb
      .from('pagos_proveedores')
      .select('monto')
      .eq('oc_id', parsed.oc_id);
    const pagadoActual = (pagosRaw ?? []).reduce((s, p) => s + Number((p as { monto: number }).monto), 0);
    const saldoActual = Number(oc.total) - pagadoActual;

    if (saldoActual <= 0) throw new Error('Esta OC ya está totalmente pagada');
    if (parsed.monto > saldoActual + 0.01) {
      throw new Error(`Monto excede el saldo pendiente (S/ ${saldoActual.toFixed(2)})`);
    }

    // Generar correlativo
    const { data: numRpc, error: errNum } = await sb.rpc('next_correlativo', { p_clave: 'PAG_PROV', p_padding: 6 });
    if (errNum) throw new Error(`Generando correlativo: ${errNum.message}`);
    const numero = `PAG-${numRpc as unknown as string}`;

    // Insertar pago
    const { data: pago, error: errPago } = await sb
      .from('pagos_proveedores')
      .insert({
        numero,
        proveedor_id: oc.proveedor_id,
        oc_id: parsed.oc_id,
        fecha: parsed.fecha,
        monto: parsed.monto,
        metodo: parsed.metodo,
        moneda: oc.moneda,
        tipo_cambio: oc.tipo_cambio ?? 1,
        referencia_bancaria: parsed.referencia_bancaria,
        comprobante_proveedor: parsed.comprobante_proveedor,
        registrado_por: userId,
        observacion: parsed.observacion,
      })
      .select('id, numero')
      .single();
    if (errPago) throw new Error(`Registrando pago: ${errPago.message}`);

    // Actualizar saldo en cabecera (la vista lo recalcula pero la columna también
    // es referenciada en algunas pantallas) + estado PAGADA si quedó en 0
    const nuevoPagado = pagadoActual + parsed.monto;
    const nuevoSaldo = Number(oc.total) - nuevoPagado;
    const patch: { saldo: number; estado?: EstadoOC } = { saldo: nuevoSaldo };
    if (nuevoSaldo < 0.01 && oc.estado === 'RECIBIDA') {
      patch.estado = 'PAGADA';
    }
    await sb.from('oc').update(patch).eq('id', parsed.oc_id);

    await bumpPaths('/compras/cxp', `/oc/${parsed.oc_id}`, '/oc');
    return { id: pago.id, numero: pago.numero };
  });
}

export async function listarPagosOC(ocId: string): Promise<PagoOCRow[]> {
  const { sb } = await requireUser();
  const { data } = await sb
    .from('pagos_proveedores')
    .select('id, numero, fecha, monto, metodo, moneda, referencia_bancaria, comprobante_proveedor, observacion, registrado_por')
    .eq('oc_id', ocId)
    .order('fecha', { ascending: false });
  return ((data ?? []) as unknown as PagoOCRow[]).map((p) => ({
    ...p,
    monto: Number(p.monto),
  }));
}

export async function eliminarPagoOC(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const { sb } = await requireUser();
    // Buscar el pago para saber a qué OC pertenece
    const { data: pagoRaw } = await sb
      .from('pagos_proveedores')
      .select('oc_id, monto')
      .eq('id', id)
      .maybeSingle();
    if (!pagoRaw) throw new Error('Pago no encontrado');
    const pago = pagoRaw as { oc_id: string | null; monto: number };
    if (!pago.oc_id) throw new Error('Pago sin OC vinculada');

    const { error } = await sb.from('pagos_proveedores').delete().eq('id', id);
    if (error) throw new Error(error.message);

    // Revertir estado PAGADA → RECIBIDA si volvió a haber saldo
    const { data: ocRaw } = await sb.from('oc').select('total, estado').eq('id', pago.oc_id).maybeSingle();
    if (ocRaw) {
      const oc = ocRaw as { total: number; estado: string };
      const { data: pagosRaw } = await sb.from('pagos_proveedores').select('monto').eq('oc_id', pago.oc_id);
      const pagadoNuevo = (pagosRaw ?? []).reduce((s, p) => s + Number((p as { monto: number }).monto), 0);
      const saldoNuevo = Number(oc.total) - pagadoNuevo;
      const patch: { saldo: number; estado?: EstadoOC } = { saldo: saldoNuevo };
      if (oc.estado === 'PAGADA' && saldoNuevo > 0.01) {
        patch.estado = 'RECIBIDA';
      }
      await sb.from('oc').update(patch).eq('id', pago.oc_id);
    }

    await bumpPaths('/compras/cxp', `/oc/${pago.oc_id}`);
    return null;
  });
}
