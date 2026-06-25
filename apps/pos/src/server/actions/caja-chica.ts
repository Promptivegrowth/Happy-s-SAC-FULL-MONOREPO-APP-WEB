'use server';

/**
 * Módulo de Caja Chica para el POS.
 *
 * Permite al cajero registrar EGRESOS (gastos) e INGRESOS (devoluciones,
 * adelantos no asociados a venta) durante el turno. Estos movimientos:
 *   - Afectan el cuadre de efectivo al cierre (los egresos restan)
 *   - Salen como sección separada en el reporte de cierre
 *   - Quedan registrados con categoría + concepto libre opcional
 */

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@happy/db/server';

async function requireUser(sb: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error('No autenticado');
  return user;
}

export type CategoriaGasto = {
  id: string;
  codigo: string;
  nombre: string;
  icono: string | null;
};

export type MovimientoCajaChica = {
  id: string;
  fecha: string;
  tipo: 'INGRESO' | 'EGRESO';
  concepto: string;
  categoria_nombre: string | null;
  categoria_codigo: string | null;
  monto: number;
  metodo: string;
  comprobante_ref: string | null;
  registrado_por_nombre: string | null;
};

// ---------- Listar categorías ----------

export async function listarCategoriasGasto(): Promise<CategoriaGasto[]> {
  const sb = await createClient();
  const { data } = await (sb as unknown as {
    from: (t: string) => {
      select: (s: string) => {
        eq: (k: string, v: unknown) => {
          order: (k: string, o: { ascending: boolean }) => Promise<{ data: CategoriaGasto[] | null }>;
        };
      };
    };
  })
    .from('caja_chica_categorias')
    .select('id, codigo, nombre, icono')
    .eq('activo', true)
    .order('orden', { ascending: true });
  return (data ?? []) as CategoriaGasto[];
}

// ---------- Registrar gasto/ingreso ----------

const registrarSchema = z.object({
  tipo: z.enum(['INGRESO', 'EGRESO']),
  concepto: z.string().min(2, 'Describí el motivo').max(200),
  categoria_id: z.string().uuid().nullable().optional(),
  monto: z.number().positive('Monto debe ser mayor a 0'),
  metodo: z.enum(['EFECTIVO', 'YAPE', 'PLIN', 'TARJETA_DEBITO', 'TARJETA_CREDITO', 'TRANSFERENCIA']).default('EFECTIVO'),
  comprobante_ref: z.string().max(80).nullable().optional(),
});

export async function registrarMovimientoCajaChica(input: z.input<typeof registrarSchema>): Promise<{
  ok: boolean;
  id?: string;
  error?: string;
}> {
  try {
    const parsed = registrarSchema.parse(input);
    const sb = await createClient();
    const user = await requireUser(sb);

    // Buscar sesión activa
    const { data: sesion } = await sb
      .from('cajas_sesiones')
      .select('id, caja_id')
      .is('cerrada_en', null)
      .eq('abierta_por', user.id)
      .maybeSingle();
    if (!sesion) return { ok: false, error: 'No hay sesión de caja abierta' };

    const { data: row, error } = await (sb as unknown as {
      from: (t: string) => {
        insert: (r: Record<string, unknown>) => {
          select: (s: string) => { single: () => Promise<{ data: { id: string } | null; error: { message: string } | null }> };
        };
      };
    })
      .from('caja_chica_movimientos')
      .insert({
        sesion_id: sesion.id,
        caja_id: sesion.caja_id,
        tipo: parsed.tipo,
        concepto: parsed.concepto,
        categoria_id: parsed.categoria_id ?? null,
        monto: parsed.monto,
        metodo: parsed.metodo,
        comprobante_ref: parsed.comprobante_ref ?? null,
        registrado_por: user.id,
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

// ---------- Listar movimientos de la sesión actual ----------

export async function listarMovimientosCajaChicaSesion(): Promise<MovimientoCajaChica[]> {
  const sb = await createClient();
  const user = await requireUser(sb);

  const { data: sesion } = await sb
    .from('cajas_sesiones')
    .select('id')
    .is('cerrada_en', null)
    .eq('abierta_por', user.id)
    .maybeSingle();
  if (!sesion) return [];

  const { data: movs } = await (sb as unknown as {
    from: (t: string) => {
      select: (s: string) => {
        eq: (k: string, v: unknown) => {
          order: (k: string, o: { ascending: boolean }) => Promise<{
            data: Array<{
              id: string;
              created_at: string;
              tipo: 'INGRESO' | 'EGRESO';
              concepto: string;
              monto: number | string;
              metodo: string;
              comprobante_ref: string | null;
              registrado_por: string;
              categoria: { nombre: string; codigo: string } | null;
            }> | null;
          }>;
        };
      };
    };
  })
    .from('caja_chica_movimientos')
    .select('id, created_at, tipo, concepto, monto, metodo, comprobante_ref, registrado_por, categoria:categoria_id(nombre, codigo)')
    .eq('sesion_id', sesion.id)
    .order('created_at', { ascending: false });

  const rows = movs ?? [];
  const userIds = Array.from(new Set(rows.map((r) => r.registrado_por)));
  const nombresById = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: perfiles } = await sb
      .from('perfiles')
      .select('id, nombre_completo')
      .in('id', userIds);
    for (const p of perfiles ?? []) nombresById.set(p.id, p.nombre_completo ?? '');
  }

  return rows.map((r) => ({
    id: r.id,
    fecha: r.created_at,
    tipo: r.tipo,
    concepto: r.concepto,
    categoria_nombre: r.categoria?.nombre ?? null,
    categoria_codigo: r.categoria?.codigo ?? null,
    monto: Number(r.monto),
    metodo: r.metodo,
    comprobante_ref: r.comprobante_ref,
    registrado_por_nombre: nombresById.get(r.registrado_por) ?? null,
  }));
}

// ---------- Eliminar movimiento (solo si fue creado en esta sesión por el mismo usuario) ----------

export async function eliminarMovimientoCajaChica(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const sb = await createClient();
    const user = await requireUser(sb);

    // Solo el mismo usuario que lo creó puede borrarlo
    const { data: mov } = await sb
      .from('caja_chica_movimientos')
      .select('registrado_por')
      .eq('id', id)
      .maybeSingle();
    if (!mov) return { ok: false, error: 'Movimiento no encontrado' };
    const r = mov as { registrado_por: string };
    if (r.registrado_por !== user.id) {
      return { ok: false, error: 'Solo el cajero que registró el movimiento puede eliminarlo' };
    }

    const { error } = await sb.from('caja_chica_movimientos').delete().eq('id', id);
    if (error) return { ok: false, error: error.message };

    revalidatePath('/venta');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
