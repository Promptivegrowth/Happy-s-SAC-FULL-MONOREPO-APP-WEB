'use server';

/**
 * Anular una venta desde la caja: nota de venta, boleta o factura.
 *
 * Pedido de Javier (29/09/2026): que el cajero pueda anular la venta completa
 * desde la caja, que es lo que más se usa, siempre anotando el motivo, y que
 * todo quede registrado.
 *
 * Todo el trabajo lo hace la función `anular_venta` de la base (mig 108) en una
 * sola transacción: la venta, el stock de vuelta al almacén, el comprobante y
 * el registro de auditoría. Acá se controla quién y cuándo:
 *
 *   - Solo cajeros y gerencia.
 *   - Solo ventas del TURNO ABIERTO. La plata de esa venta está en ese cajón:
 *     al anularla sale del cuadre y el cajero la devuelve de ahí. Una venta de
 *     un turno ya cerrado ya se cuadró con esa plata adentro; para esas está
 *     "Devolución".
 */

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@happy/db/server';
import { createServiceClient } from '@happy/db/service';
import { etiquetaPago } from '@happy/lib/pagos/etiqueta';

const schema = z.object({
  venta_id: z.string().uuid(),
  motivo: z.string().trim().min(5, 'Escribe el motivo de la anulación (al menos 5 letras).').max(300),
});

export type AnulacionVenta = {
  documento: string;
  tipo: 'NOTA_VENTA' | 'BOLETA' | 'FACTURA' | null;
  unidades: number;
  total: number;
  /** Número de la nota de crédito, cuando se anuló una factura. */
  notaCredito: string | null;
  /** Lo que hay que devolver en plata: "Efectivo S/ 30.00", "Yape S/ 20.00"… */
  devolver: string[];
  /** Lo pagado con el adelanto del cliente, que volvió a su saldo a favor. */
  saldoDevuelto: number;
};

/*
 * Qué pagos NO se devuelven en plata al anular.
 *
 *  - CREDITO es el adelanto (saldo a favor) del cliente: vuelve a su saldo, lo
 *    hace la función de la base.
 *  - WHATSAPP_PENDIENTE es un pago que todavía no llegó: no hay nada que
 *    devolver.
 */
const NO_SE_DEVUELVE = new Set(['CREDITO', 'WHATSAPP_PENDIENTE']);

export async function anularVentaPos(
  input: z.input<typeof schema>,
): Promise<{ ok: true; data: AnulacionVenta } | { ok: false; error: string }> {
  try {
    const { venta_id, motivo } = schema.parse(input);

    const sb = await createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) throw new Error('Tu sesión venció. Vuelve a iniciar sesión.');

    const { data: roles } = await sb.from('usuarios_roles').select('rol').eq('usuario_id', user.id);
    const misRoles = ((roles ?? []) as { rol: string }[]).map((r) => r.rol);
    if (!misRoles.some((r) => r === 'cajero' || r === 'gerente')) {
      throw new Error('Solo un cajero o gerencia puede anular ventas.');
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = createServiceClient() as any;
    const { data: venta } = await svc
      .from('ventas')
      .select('id, numero, estado, caja_sesion_id')
      .eq('id', venta_id)
      .maybeSingle();
    if (!venta) throw new Error('La venta no existe.');
    if (venta.estado === 'ANULADA') throw new Error('Esta venta ya estaba anulada.');
    if (!venta.caja_sesion_id) throw new Error('Esta venta no se hizo en una caja: no se anula desde aquí.');

    const { data: sesion } = await svc
      .from('cajas_sesiones')
      .select('cerrada_en')
      .eq('id', venta.caja_sesion_id)
      .maybeSingle();
    if (!sesion || sesion.cerrada_en) {
      throw new Error(
        'Solo se anulan ventas del turno abierto: esta caja ya se cerró y esa venta ya se cuadró. ' +
          'Para devolverle la plata al cliente usa "Devolución".',
      );
    }

    const { data: pagos } = await svc.from('ventas_pagos').select('metodo, monto, referencia').eq('venta_id', venta_id);

    const { data: r, error } = await svc.rpc('anular_venta', { p_venta_id: venta_id, p_motivo: motivo, p_usuario: user.id });
    if (error) throw new Error(error.message);
    const res = r as { documento: string; tipo: AnulacionVenta['tipo']; unidades: number; total: number; nota_credito: string | null; saldo_devuelto: number | null };

    revalidatePath('/venta');
    return {
      ok: true,
      data: {
        documento: res.documento,
        tipo: res.tipo,
        unidades: Number(res.unidades ?? 0),
        total: Number(res.total ?? 0),
        notaCredito: res.nota_credito,
        devolver: ((pagos ?? []) as Array<{ metodo: string; monto: number | string; referencia: string | null }>)
          .filter((p) => !NO_SE_DEVUELVE.has(p.metodo))
          .map((p) => `${etiquetaPago(p.metodo, p.referencia)} S/ ${Number(p.monto ?? 0).toFixed(2)}`),
        saldoDevuelto: Number(res.saldo_devuelto ?? 0),
      },
    };
  } catch (e) {
    if (e instanceof z.ZodError) return { ok: false, error: e.errors[0]?.message ?? 'Datos inválidos' };
    return { ok: false, error: (e as Error).message };
  }
}
