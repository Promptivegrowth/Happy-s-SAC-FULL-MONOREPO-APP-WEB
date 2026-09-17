'use server';

/**
 * Reporte financiero: PAGOS POR CUENTA / MÉTODO en un rango de fechas.
 *
 * Pedido del cliente (2026-07-13): "sacamos reportes financieros por mes —
 * cómo asignamos Yape/Plin para tenerlo separado". Su operación real:
 *   YAPE → cuenta BCP · PLIN / TRANSFERENCIA / DEPÓSITO → cuenta INTERBANK.
 *
 * Cada pago del POS guarda en ventas_pagos:
 *   - metodo (enum: EFECTIVO / YAPE / PLIN / TRANSFERENCIA / DEPOSITO / …)
 *   - referencia = nombre corto de la cuenta destino (BCP HAPPYS, YAPE (BCP
 *     HAPPYS), PLIN (INTERBANK HAPPYS), …) cuando el cajero eligió un botón
 *     de cuenta del catálogo.
 *
 * Este reporte muestra UNA FILA POR BOTÓN de la ventana de venta, en el mismo
 * orden de la pantalla y aunque no haya entrado nada, igual que el cierre de
 * caja. Con eso el cliente concilia contra el estado de cuenta de cada banco y
 * ve el volumen de Yape separado del de Plin, sin tener que traducir de
 * "Transferencia" a cuál de los dos bancos (pedido del 16/09/2026).
 */

import { createClient } from '@happy/db/server';
import { arqueoPorCuenta } from '@happy/lib/pagos/etiqueta';

export type FilaPagoCuenta = {
  cuenta: string;          // referencia (nombre corto de la cuenta) o '(sin cuenta)'
  banco: string | null;    // banco de la cuenta si existe en el catálogo
  metodo: string;          // enum del pago
  monto: number;
  cantidad: number;        // nº de pagos
};

export type ReportePagosCuenta = {
  filas: FilaPagoCuenta[];
  totalPeriodo: number;
  totalPorMetodo: { metodo: string; monto: number; cantidad: number }[];
  totalPorBanco: { banco: string; monto: number; cantidad: number }[];
};

export async function reportePagosPorCuenta(
  desde: string,
  hasta: string,
): Promise<ReportePagosCuenta> {
  const sb = await createClient();

  // 1) Ventas válidas del período (excluye anuladas)
  const { data: ventas } = await sb
    .from('ventas')
    .select('id')
    .gte('fecha', `${desde}T00:00:00`)
    .lte('fecha', `${hasta}T23:59:59`)
    .neq('estado', 'ANULADA');
  const ventaIds = (ventas ?? []).map((v) => v.id as string);
  if (ventaIds.length === 0) {
    return { filas: [], totalPeriodo: 0, totalPorMetodo: [], totalPorBanco: [] };
  }

  // 2) Pagos de esas ventas (batch por si el .in() supera el límite de URL)
  type PagoRow = { metodo: string; monto: number; referencia: string | null };
  const pagos: PagoRow[] = [];
  for (let i = 0; i < ventaIds.length; i += 200) {
    const lote = ventaIds.slice(i, i + 200);
    const { data } = await sb
      .from('ventas_pagos')
      .select('metodo, monto, referencia')
      .in('venta_id', lote);
    pagos.push(...((data ?? []) as PagoRow[]));
  }

  // 3) Catálogo de cuentas: el banco de cada una y cuáles son botones del POS
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sbAny = sb as unknown as { from: (t: string) => any };
  const { data: cuentas } = await sbAny
    .from('cuentas_bancarias')
    .select('nombre_corto, banco, metodo_default, visible_pos, activo')
    .order('orden');
  type CuentaRow = {
    nombre_corto: string; banco: string | null; metodo_default: string;
    visible_pos: boolean; activo: boolean;
  };
  const catalogo = (cuentas ?? []) as CuentaRow[];
  const bancoPorCuenta = new Map<string, string | null>(
    catalogo.map((c) => [c.nombre_corto.trim().toUpperCase(), c.banco]),
  );

  /*
   * 4) Una fila por cada botón de la ventana de venta, en el orden de la
   *    pantalla, aunque no haya entrado nada.
   *
   * Es el mismo criterio que el cierre de caja: el reporte tiene que hablar el
   * idioma de la cajera. Una cuenta en cero también dice algo —"este mes no
   * entró nada por acá"— y deja dos meses comparables renglón contra renglón.
   *
   * Lo que se cobró por una cuenta que después se ocultó sigue apareciendo al
   * final: la plata entró y tiene que estar.
   */
  const cuentasPos = catalogo
    .filter((c) => c.activo && c.visible_pos)
    .map((c) => ({ nombre_corto: c.nombre_corto, metodo_default: c.metodo_default }));

  const filas: FilaPagoCuenta[] = arqueoPorCuenta(cuentasPos, pagos).map((t) => ({
    cuenta: t.etiqueta,
    banco: bancoPorCuenta.get((t.referencia ?? '').trim().toUpperCase()) ?? null,
    metodo: t.metodo,
    monto: t.monto,
    cantidad: t.cantidad,
  }));

  // 5) Totales por método y por banco
  const porMetodo = new Map<string, { monto: number; cantidad: number }>();
  const porBanco = new Map<string, { monto: number; cantidad: number }>();
  let totalPeriodo = 0;
  for (const f of filas) {
    totalPeriodo += f.monto;
    const m = porMetodo.get(f.metodo) ?? { monto: 0, cantidad: 0 };
    m.monto += f.monto; m.cantidad += f.cantidad;
    porMetodo.set(f.metodo, m);
    const bancoKey = f.banco ?? (f.metodo === 'EFECTIVO' ? 'EFECTIVO (caja)' : 'Sin cuenta asignada');
    const b = porBanco.get(bancoKey) ?? { monto: 0, cantidad: 0 };
    b.monto += f.monto; b.cantidad += f.cantidad;
    porBanco.set(bancoKey, b);
  }

  return {
    filas,
    totalPeriodo,
    totalPorMetodo: Array.from(porMetodo.entries())
      .map(([metodo, v]) => ({ metodo, ...v }))
      .sort((a, b) => b.monto - a.monto),
    totalPorBanco: Array.from(porBanco.entries())
      .map(([banco, v]) => ({ banco, ...v }))
      .sort((a, b) => b.monto - a.monto),
  };
}
