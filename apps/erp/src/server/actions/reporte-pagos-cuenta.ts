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
 * Este reporte agrupa por (cuenta destino, método) y suma montos — con eso
 * el cliente concilia contra el estado de cuenta de cada banco y ve el
 * volumen de Yape separado del de Plin.
 */

import { createClient } from '@happy/db/server';

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

  // 3) Catálogo de cuentas para resolver el banco de cada referencia
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sbAny = sb as unknown as { from: (t: string) => any };
  const { data: cuentas } = await sbAny
    .from('cuentas_bancarias')
    .select('nombre_corto, banco');
  const bancoPorCuenta = new Map<string, string | null>(
    ((cuentas ?? []) as { nombre_corto: string; banco: string | null }[]).map((c) => [c.nombre_corto, c.banco]),
  );

  // 4) Agrupar por (cuenta, metodo)
  const grupos = new Map<string, FilaPagoCuenta>();
  for (const p of pagos) {
    const cuenta = p.referencia?.trim() || '(sin cuenta)';
    const key = `${cuenta}::${p.metodo}`;
    const cur = grupos.get(key) ?? {
      cuenta,
      banco: bancoPorCuenta.get(cuenta) ?? null,
      metodo: p.metodo,
      monto: 0,
      cantidad: 0,
    };
    cur.monto += Number(p.monto);
    cur.cantidad += 1;
    grupos.set(key, cur);
  }
  const filas = Array.from(grupos.values()).sort((a, b) =>
    (a.banco ?? 'zzz').localeCompare(b.banco ?? 'zzz') || a.cuenta.localeCompare(b.cuenta) || a.metodo.localeCompare(b.metodo),
  );

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
