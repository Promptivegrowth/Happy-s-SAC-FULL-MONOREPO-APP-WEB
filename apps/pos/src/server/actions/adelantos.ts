'use server';

/**
 * Módulo de Adelantos de cliente.
 *
 * Un adelanto es plata que el cliente deja sin especificar qué productos
 * comprará. Queda como SALDO A FAVOR del cliente. Al volver para una venta:
 *   - Sistema sugiere automáticamente aplicar el saldo
 *   - El monto a pagar baja en esa cantidad
 *   - Queda un registro APLICACION vinculado a la venta
 *
 * Estados (tipo):
 *   ENTRADA     → cliente deja plata (caja recibe)
 *   APLICACION  → se descuenta del saldo al pagar venta
 *   DEVOLUCION  → cliente se arrepiente, se le devuelve
 *
 * Saldo disponible = sum(ENTRADA) - sum(APLICACION) - sum(DEVOLUCION).
 */

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@happy/db/server';

async function requireUser(sb: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error('No autenticado');
  return user;
}

async function nextAdelantoNumero(sb: Awaited<ReturnType<typeof createClient>>): Promise<string> {
  const { data: nro, error } = await sb.rpc('next_correlativo', { p_clave: 'ADL_CLIENTE', p_padding: 6 });
  if (error) throw new Error(`Generando correlativo: ${error.message}`);
  return `ADL-${nro as unknown as string}`;
}

// ---------- Tipos ----------

export type AdelantoMovimiento = {
  id: string;
  numero: string;
  fecha: string;
  tipo: 'ENTRADA' | 'APLICACION' | 'DEVOLUCION';
  monto: number;
  metodo_pago: string | null;
  venta_id: string | null;
  observacion: string | null;
};

// ---------- Saldo del cliente ----------

export async function obtenerSaldoCliente(clienteId: string): Promise<number> {
  if (!clienteId) return 0;
  const sb = await createClient();
  await requireUser(sb);

  const { data } = await (sb as unknown as {
    from: (t: string) => {
      select: (s: string) => {
        eq: (k: string, v: unknown) => Promise<{ data: Array<{ tipo: string; monto: number | string }> | null }>;
      };
    };
  })
    .from('clientes_adelantos')
    .select('tipo, monto')
    .eq('cliente_id', clienteId);

  let entrada = 0, aplicacion = 0, devolucion = 0;
  for (const m of data ?? []) {
    const monto = Number(m.monto ?? 0);
    if (m.tipo === 'ENTRADA') entrada += monto;
    else if (m.tipo === 'APLICACION') aplicacion += monto;
    else if (m.tipo === 'DEVOLUCION') devolucion += monto;
  }
  return Math.max(0, entrada - aplicacion - devolucion);
}

export async function listarMovimientosCliente(clienteId: string): Promise<AdelantoMovimiento[]> {
  if (!clienteId) return [];
  const sb = await createClient();
  await requireUser(sb);

  const { data } = await (sb as unknown as {
    from: (t: string) => {
      select: (s: string) => {
        eq: (k: string, v: unknown) => {
          order: (k: string, o: { ascending: boolean }) => Promise<{ data: AdelantoMovimiento[] | null }>;
        };
      };
    };
  })
    .from('clientes_adelantos')
    .select('id, numero, fecha, tipo, monto, metodo_pago, venta_id, observacion')
    .eq('cliente_id', clienteId)
    .order('fecha', { ascending: false });

  return ((data ?? []) as AdelantoMovimiento[]).map((m) => ({
    ...m,
    monto: Number(m.monto),
  }));
}

// ---------- Registrar ENTRADA (cliente deja adelanto) ----------

const entradaSchema = z.object({
  cliente_id: z.string().uuid('Cliente requerido'),
  monto: z.number().positive('Monto debe ser mayor a 0'),
  metodo_pago: z.enum(['EFECTIVO', 'YAPE', 'PLIN', 'TARJETA_DEBITO', 'TARJETA_CREDITO', 'TRANSFERENCIA', 'DEPOSITO']),
  /** Cuenta bancaria destino (nombre corto del catálogo) — mig 64. */
  referencia: z.string().max(120).nullable().optional(),
  observacion: z.string().max(300).nullable().optional(),
});

export async function registrarEntradaAdelanto(input: z.input<typeof entradaSchema>): Promise<{
  ok: boolean;
  id?: string;
  numero?: string;
  error?: string;
}> {
  try {
    const parsed = entradaSchema.parse(input);
    const sb = await createClient();
    const user = await requireUser(sb);

    // Buscar sesión activa para vincular
    const { data: sesion } = await sb
      .from('cajas_sesiones')
      .select('id')
      .is('cerrada_en', null)
      .eq('abierta_por', user.id)
      .maybeSingle();

    const numero = await nextAdelantoNumero(sb);

    const { data: row, error } = await (sb as unknown as {
      from: (t: string) => {
        insert: (r: Record<string, unknown>) => {
          select: (s: string) => { single: () => Promise<{ data: { id: string; numero: string } | null; error: { message: string } | null }> };
        };
      };
    })
      .from('clientes_adelantos')
      .insert({
        numero,
        cliente_id: parsed.cliente_id,
        tipo: 'ENTRADA',
        monto: parsed.monto,
        metodo_pago: parsed.metodo_pago,
        referencia: parsed.referencia ?? null,
        caja_sesion_id: sesion?.id ?? null,
        registrado_por: user.id,
        observacion: parsed.observacion ?? null,
      })
      .select('id, numero')
      .single();
    if (error || !row) return { ok: false, error: error?.message ?? '?' };

    revalidatePath('/venta');
    return { ok: true, id: row.id, numero: row.numero };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ---------- Registrar DEVOLUCION (cliente recupera saldo) ----------

const devolucionSchema = z.object({
  cliente_id: z.string().uuid(),
  monto: z.number().positive(),
  metodo_pago: z.enum(['EFECTIVO', 'YAPE', 'PLIN', 'TARJETA_DEBITO', 'TARJETA_CREDITO', 'TRANSFERENCIA', 'DEPOSITO']),
  referencia: z.string().max(120).nullable().optional(),
  observacion: z.string().max(300).nullable().optional(),
});

export async function registrarDevolucionAdelanto(input: z.input<typeof devolucionSchema>): Promise<{
  ok: boolean;
  id?: string;
  error?: string;
}> {
  try {
    const parsed = devolucionSchema.parse(input);
    const sb = await createClient();
    const user = await requireUser(sb);

    // Validar saldo
    const saldo = await obtenerSaldoCliente(parsed.cliente_id);
    if (parsed.monto > saldo + 0.01) {
      return { ok: false, error: `Saldo insuficiente (disponible: S/ ${saldo.toFixed(2)})` };
    }

    const { data: sesion } = await sb
      .from('cajas_sesiones')
      .select('id')
      .is('cerrada_en', null)
      .eq('abierta_por', user.id)
      .maybeSingle();

    const numero = await nextAdelantoNumero(sb);

    const { data: row, error } = await (sb as unknown as {
      from: (t: string) => {
        insert: (r: Record<string, unknown>) => {
          select: (s: string) => { single: () => Promise<{ data: { id: string } | null; error: { message: string } | null }> };
        };
      };
    })
      .from('clientes_adelantos')
      .insert({
        numero,
        cliente_id: parsed.cliente_id,
        tipo: 'DEVOLUCION',
        monto: parsed.monto,
        metodo_pago: parsed.metodo_pago,
        referencia: parsed.referencia ?? null,
        caja_sesion_id: sesion?.id ?? null,
        registrado_por: user.id,
        observacion: parsed.observacion ?? null,
      })
      .select('id')
      .single();
    if (error || !row) return { ok: false, error: error?.message ?? '?' };

    revalidatePath('/venta');
    return { ok: true, id: row.id };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ---------- Aplicar saldo a una venta (lo llama venta.ts cuando el cliente usa adelanto) ----------

export async function aplicarAdelantoAVenta(input: {
  cliente_id: string;
  venta_id: string;
  monto: number;
}): Promise<{ ok: boolean; numero?: string; error?: string }> {
  try {
    const sb = await createClient();
    const user = await requireUser(sb);

    const saldo = await obtenerSaldoCliente(input.cliente_id);
    if (input.monto > saldo + 0.01) {
      return { ok: false, error: `Saldo insuficiente (disponible: S/ ${saldo.toFixed(2)})` };
    }

    const numero = await nextAdelantoNumero(sb);

    const { data: row, error } = await (sb as unknown as {
      from: (t: string) => {
        insert: (r: Record<string, unknown>) => {
          select: (s: string) => { single: () => Promise<{ data: { numero: string } | null; error: { message: string } | null }> };
        };
      };
    })
      .from('clientes_adelantos')
      .insert({
        numero,
        cliente_id: input.cliente_id,
        tipo: 'APLICACION',
        monto: input.monto,
        venta_id: input.venta_id,
        registrado_por: user.id,
      })
      .select('numero')
      .single();
    if (error || !row) return { ok: false, error: error?.message ?? '?' };
    return { ok: true, numero: row.numero };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
