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
 *
 * Desde el 06/10/2026 cada cuenta muestra lo cobrado, lo DEVUELTO por ella y el
 * NETO: el cliente lleva su flujo de caja por cuenta y una devolución se resta
 * de la cuenta por la que salió. Lo pagado con saldo (un cambio, un adelanto)
 * no figura: no entró plata a ninguna cuenta.
 */

import { createClient } from '@happy/db/server';
import { arqueoPorCuenta, medioDeDevolucion, nombreMetodo } from '@happy/lib/pagos/etiqueta';

export type FilaPagoCuenta = {
  cuenta: string;          // referencia (nombre corto de la cuenta) o '(sin cuenta)'
  banco: string | null;    // banco de la cuenta si existe en el catálogo
  metodo: string;          // enum del pago
  monto: number;
  cantidad: number;        // nº de pagos
  /** Devuelto a clientes por esta cuenta (devoluciones y vueltos de cambios). */
  devuelto: number;
  devoluciones: number;    // nº de devoluciones
  /** Lo que realmente quedó en la cuenta: monto − devuelto. */
  neto: number;
};

export type ReportePagosCuenta = {
  filas: FilaPagoCuenta[];
  /** Cobrado en el período (sin lo pagado con saldo). */
  totalPeriodo: number;
  totalDevuelto: number;
  totalNeto: number;
  totalPorMetodo: { metodo: string; monto: number; cantidad: number }[];
  totalPorBanco: { banco: string; monto: number; cantidad: number }[];
};

export async function reportePagosPorCuenta(
  desde: string,
  hasta: string,
): Promise<ReportePagosCuenta> {
  const sb = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sbAny0 = sb as unknown as { from: (t: string) => any };

  /*
   * 1) Ventas válidas del período (excluye anuladas), con el día de LIMA.
   *
   * Sin el -05:00 el día se cortaba en UTC: lo vendido después de las 7 p. m.
   * caía en el día siguiente. Y se lee de a 1.000, el tope de la base: un mes
   * ya pasa ese número de ventas.
   */
  const ventaIds: string[] = [];
  for (let d = 0; d < 100000; d += 1000) {
    const { data, error } = await sbAny0
      .from('ventas')
      .select('id')
      .gte('fecha', `${desde}T00:00:00-05:00`)
      .lte('fecha', `${hasta}T23:59:59-05:00`)
      .neq('estado', 'ANULADA')
      .order('id')
      .range(d, d + 999);
    if (error) throw new Error(error.message);
    ventaIds.push(...((data ?? []) as { id: string }[]).map((v) => v.id));
    if (!data || data.length < 1000) break;
  }

  // Devoluciones de dinero del período: se restan de la cuenta por la que salieron.
  const { data: devsRaw } = await sbAny0
    .from('devoluciones')
    .select('monto_devuelto, metodo_devolucion, cuenta_devolucion')
    .gte('fecha', `${desde}T00:00:00-05:00`)
    .lte('fecha', `${hasta}T23:59:59-05:00`)
    .gt('monto_devuelto', 0)
    .limit(5000);
  const devs = ((devsRaw ?? []) as { monto_devuelto: number | string; metodo_devolucion: string | null; cuenta_devolucion: string | null }[])
    // Saldo a favor o pendiente: no salió plata de ninguna cuenta.
    .filter((d) => d.metodo_devolucion && !['CREDITO', 'WHATSAPP_PENDIENTE'].includes(d.metodo_devolucion));

  /*
   * Adelantos: el dinero entra a la cuenta el día que el cliente lo deja (y
   * sale el día que se le devuelve). Cuando se aplica a una venta ya no cuenta:
   * esa venta se paga con saldo.
   */
  const { data: adelRaw } = await sbAny0
    .from('clientes_adelantos')
    .select('tipo, monto, metodo_pago, referencia')
    .in('tipo', ['ENTRADA', 'DEVOLUCION'])
    .gte('fecha', `${desde}T00:00:00-05:00`)
    .lte('fecha', `${hasta}T23:59:59-05:00`)
    .limit(5000);
  const adelantos = (adelRaw ?? []) as { tipo: string; monto: number | string; metodo_pago: string; referencia: string | null }[];
  for (const a of adelantos) {
    if (a.tipo === 'DEVOLUCION') {
      devs.push({ monto_devuelto: a.monto, metodo_devolucion: a.metodo_pago, cuenta_devolucion: a.referencia });
    }
  }

  if (ventaIds.length === 0 && devs.length === 0 && adelantos.length === 0) {
    return { filas: [], totalPeriodo: 0, totalDevuelto: 0, totalNeto: 0, totalPorMetodo: [], totalPorBanco: [] };
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

  // arqueoPorCuenta ya deja fuera lo pagado con saldo (ver la librería).
  const entradas = adelantos
    .filter((a) => a.tipo === 'ENTRADA')
    .map((a) => ({ metodo: a.metodo_pago, monto: Number(a.monto ?? 0), referencia: a.referencia }));
  const filas: FilaPagoCuenta[] = arqueoPorCuenta(cuentasPos, [...pagos, ...entradas]).map((t) => ({
    cuenta: t.etiqueta,
    banco: bancoPorCuenta.get((t.referencia ?? '').trim().toUpperCase()) ?? null,
    metodo: t.metodo,
    monto: t.monto,
    cantidad: t.cantidad,
    devuelto: 0,
    devoluciones: 0,
    neto: t.monto,
  }));

  /*
   * 5) Cada devolución se resta de su cuenta.
   *
   * En efectivo, del renglón de caja. Por cuenta, del botón con ese nombre. Una
   * devolución vieja que no guardó la cuenta (antes del 06/10/2026) va en un
   * renglón aparte con su método, para que no se pierda.
   */
  const clave = (x: string | null | undefined) => (x ?? '').trim().toUpperCase();
  for (const d of devs) {
    const metodo = clave(d.metodo_devolucion);
    const monto = Number(d.monto_devuelto ?? 0);
    let fila = metodo === 'EFECTIVO'
      ? filas.find((f) => f.metodo === 'EFECTIVO')
      : d.cuenta_devolucion
        ? filas.find((f) => clave(f.cuenta) === clave(d.cuenta_devolucion))
        : undefined;
    if (!fila) {
      const nombre = medioDeDevolucion(metodo, d.cuenta_devolucion);
      fila = filas.find((f) => f.cuenta === nombre && f.monto === 0 && f.cantidad === 0 && f.metodo === metodo);
      if (!fila) {
        fila = {
          cuenta: d.cuenta_devolucion ? nombre : `${nombreMetodo(metodo)} (sin cuenta)`,
          banco: bancoPorCuenta.get(clave(d.cuenta_devolucion)) ?? null,
          metodo, monto: 0, cantidad: 0, devuelto: 0, devoluciones: 0, neto: 0,
        };
        filas.push(fila);
      }
    }
    fila.devuelto += monto;
    fila.devoluciones += 1;
    fila.neto = fila.monto - fila.devuelto;
  }

  // 6) Totales por método y por banco (netos: lo que quedó en cada uno)
  const porMetodo = new Map<string, { monto: number; cantidad: number }>();
  const porBanco = new Map<string, { monto: number; cantidad: number }>();
  let totalPeriodo = 0;
  let totalDevuelto = 0;
  for (const f of filas) {
    totalPeriodo += f.monto;
    totalDevuelto += f.devuelto;
    const m = porMetodo.get(f.metodo) ?? { monto: 0, cantidad: 0 };
    m.monto += f.neto; m.cantidad += f.cantidad;
    porMetodo.set(f.metodo, m);
    const bancoKey = f.banco ?? (f.metodo === 'EFECTIVO' ? 'EFECTIVO (caja)' : 'Sin cuenta asignada');
    const b = porBanco.get(bancoKey) ?? { monto: 0, cantidad: 0 };
    b.monto += f.neto; b.cantidad += f.cantidad;
    porBanco.set(bancoKey, b);
  }

  return {
    filas,
    totalPeriodo,
    totalDevuelto,
    totalNeto: totalPeriodo - totalDevuelto,
    totalPorMetodo: Array.from(porMetodo.entries())
      .map(([metodo, v]) => ({ metodo, ...v }))
      .sort((a, b) => b.monto - a.monto),
    totalPorBanco: Array.from(porBanco.entries())
      .map(([banco, v]) => ({ banco, ...v }))
      .sort((a, b) => b.monto - a.monto),
  };
}
