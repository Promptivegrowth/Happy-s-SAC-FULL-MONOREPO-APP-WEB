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

/**
 * RESTRINGIDO A GERENTE. Por decisión del cliente (reunión 27/06/2026):
 * los ajustes manuales de stock solo pueden hacerse desde el rol gerente
 * para evitar que cualquier usuario altere el inventario sin trazabilidad
 * de autorización. Los movimientos normales (ventas, recepciones, traslados,
 * producción) siguen siendo libres porque vienen de sus flujos respectivos.
 */
export async function registrarMovimientoStock(
  input: z.input<typeof movimientoSchema>,
): Promise<ActionResult<{ tipo: string; cantidad: number }>> {
  const r = await runAction(async () => {
    const data = movimientoSchema.parse(input);
    const { sb, userId } = await requireUser();

    // Validar rol gerente
    const { data: roles } = await sb
      .from('usuarios_roles')
      .select('rol')
      .eq('usuario_id', userId);
    const esGerente = (roles ?? []).some((r) => (r as { rol: string }).rol === 'gerente');
    if (!esGerente) {
      throw new Error('Solo el gerente puede registrar ajustes manuales de stock. Pedile a alguien con ese rol que lo haga.');
    }

    // Restricción adicional: solo permitir tipos de AJUSTE manual.
    // Los otros tipos (ENTRADA_COMPRA, DEVOLUCION_*, SALIDA_MERMA) deben
    // generarse desde sus flujos automáticos (recepciones, devoluciones POS,
    // control de calidad). Si llegan acá es porque alguien intentó bypassear
    // la UI nueva — rechazar.
    if (data.tipo !== 'ENTRADA_AJUSTE' && data.tipo !== 'SALIDA_AJUSTE') {
      throw new Error(
        `Este modal solo registra ajustes de inventario (ENTRADA/SALIDA_AJUSTE). ` +
        `Para ${data.tipo} usá el módulo correspondiente (recepciones, devoluciones POS, control de calidad).`,
      );
    }

    // Guardarraíl: NO permitir cargar productos terminados (variante_id) en un
    // almacén tipo MATERIA_PRIMA. Ahí van telas/avíos/insumos, no prendas.
    // Cliente encontró 149 unidades de Abejita mal ubicadas por este motivo.
    const { data: almRow } = await sb
      .from('almacenes')
      .select('tipo, nombre')
      .eq('id', data.almacen_id)
      .single();
    const almTipo = (almRow as { tipo?: string; nombre?: string } | null)?.tipo;
    if (almTipo === 'MATERIA_PRIMA') {
      throw new Error(
        `No se puede cargar productos terminados en "${(almRow as { nombre: string }).nombre}" — es un almacén de materia prima. ` +
        `Elegí un almacén de tienda o de producto terminado.`,
      );
    }

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

/**
 * Variante BATCH: registra varios movimientos a la vez (mismo tipo + mismo
 * almacén, distintos variantes y cantidades). Útil cuando hay que mover
 * decenas de SKUs sin abrir el modal una por una.
 *
 * Si alguno falla, se intenta el resto y se reporta el listado de errores
 * (no aborta todo el lote para no perder los que sí entraron).
 */
const movimientoBatchSchema = z.object({
  almacen_id: z.string().uuid('Almacén requerido'),
  tipo: z.enum(['ENTRADA_AJUSTE', 'SALIDA_AJUSTE']),
  observacion: z.string().max(500).optional().or(z.literal('')),
  lineas: z.array(z.object({
    variante_id: z.string().uuid(),
    cantidad: z.coerce.number().positive(),
  })).min(1, 'Agregá al menos una línea'),
});

export async function registrarMovimientoStockBatch(
  input: z.input<typeof movimientoBatchSchema>,
): Promise<ActionResult<{ insertados: number; errores: Array<{ variante_id: string; error: string }> }>> {
  const r = await runAction(async () => {
    const data = movimientoBatchSchema.parse(input);
    const { sb, userId } = await requireUser();

    // Restringido a gerente (igual que registrarMovimientoStock)
    const { data: roles } = await sb
      .from('usuarios_roles')
      .select('rol')
      .eq('usuario_id', userId);
    const esGerente = (roles ?? []).some((r) => (r as { rol: string }).rol === 'gerente');
    if (!esGerente) {
      throw new Error('Solo el gerente puede registrar ajustes masivos de stock.');
    }

    // Guardarraíl: bloquear si el almacén destino es MATERIA_PRIMA (ahí van
    // telas/insumos, no prendas). Ver registrarMovimientoStock para el motivo.
    const { data: almRow } = await sb
      .from('almacenes')
      .select('tipo, nombre')
      .eq('id', data.almacen_id)
      .single();
    if ((almRow as { tipo?: string } | null)?.tipo === 'MATERIA_PRIMA') {
      throw new Error(
        `No se puede cargar productos terminados en "${(almRow as { nombre: string }).nombre}" — es un almacén de materia prima.`,
      );
    }

    const rows = data.lineas.map((l) => ({
      tipo: data.tipo,
      almacen_id: data.almacen_id,
      variante_id: l.variante_id,
      cantidad: l.cantidad,
      referencia_tipo: 'AJUSTE',
      usuario_id: userId,
      observacion: data.observacion?.trim() || null,
    }));

    // Insertamos todo en una sola query (más rápido y atómico para validación)
    const { data: inserted, error } = await sb
      .from('kardex_movimientos')
      .insert(rows)
      .select('id');

    if (error) {
      // Falló todo el batch — devolver error
      return { insertados: 0, errores: data.lineas.map((l) => ({ variante_id: l.variante_id, error: error.message })) };
    }
    return { insertados: (inserted ?? []).length, errores: [] };
  });
  if (r.ok) await bumpPaths('/inventario', '/productos', '/inventario/alertas');
  return r;
}
