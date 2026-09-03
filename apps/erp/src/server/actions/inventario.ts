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
    await requireGerenteAjuste(sb, userId);

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
  })).min(1, 'Agrega al menos una línea'),
});

// ---------------------------------------------------------------------------
// Conteo físico MASIVO (fijar stock final exacto de varias variantes a la vez)
// ---------------------------------------------------------------------------
// A diferencia del batch anterior (que SUMA/RESTA), aquí el usuario indica la
// cantidad FINAL de cada ítem y el sistema calcula el delta e inserta el ajuste
// correspondiente (ENTRADA_AJUSTE / SALIDA_AJUSTE). Es lo que se necesita para
// una toma física / carga inicial (ej. "este SKU debe quedar en 20", sin
// importar cuánto había). Pedido cliente 2026-08-31.

const ajustarBatchSchema = z.object({
  almacen_id: z.string().uuid('Almacén requerido'),
  observacion: z.string().max(500).optional().or(z.literal('')),
  lineas: z.array(z.object({
    variante_id: z.string().uuid(),
    cantidad_nueva: z.coerce.number().min(0, 'La cantidad no puede ser negativa'),
  })).min(1, 'Agrega al menos una línea'),
});

/** Stock actual de un conjunto de variantes en un almacén (para mostrar en UI). */
export async function obtenerStockVariantes(
  almacen_id: string,
  variante_ids: string[],
): Promise<Record<string, number>> {
  if (!almacen_id || variante_ids.length === 0) return {};
  const { sb } = await requireUser();
  const { data } = await sb
    .from('stock_actual')
    .select('variante_id, cantidad')
    .eq('almacen_id', almacen_id)
    .in('variante_id', variante_ids)
    .is('material_lote_id', null);
  const out: Record<string, number> = {};
  for (const s of (data ?? []) as { variante_id: string; cantidad: number }[]) {
    out[s.variante_id] = Number(s.cantidad ?? 0);
  }
  return out;
}

export async function ajustarStockBatch(
  input: z.input<typeof ajustarBatchSchema>,
): Promise<ActionResult<{ aplicados: number; sin_cambio: number; entradas: number; salidas: number }>> {
  const r = await runAction(async () => {
    const data = ajustarBatchSchema.parse(input);
    const { sb, userId } = await requireUser();
    await requireGerenteAjuste(sb, userId); // conteo = ajuste → solo gerencia

    // Guardarraíl: bloquear productos terminados en almacén de materia prima.
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

    const ids = data.lineas.map((l) => l.variante_id);
    const { data: stockRows } = await sb
      .from('stock_actual')
      .select('variante_id, cantidad')
      .eq('almacen_id', data.almacen_id)
      .in('variante_id', ids)
      .is('material_lote_id', null);
    const mapa = new Map<string, number>();
    for (const s of (stockRows ?? []) as { variante_id: string; cantidad: number }[]) {
      mapa.set(s.variante_id, Number(s.cantidad ?? 0));
    }

    const candidatos = data.lineas.map((l) => {
      const actual = mapa.get(l.variante_id) ?? 0;
      return { variante_id: l.variante_id, actual, cantidad_nueva: l.cantidad_nueva, delta: l.cantidad_nueva - actual };
    });
    const conCambio = candidatos.filter((c) => c.delta !== 0);
    const sinCambio = candidatos.length - conCambio.length;
    const entradas = conCambio.filter((c) => c.delta > 0).length;
    const salidas = conCambio.filter((c) => c.delta < 0).length;

    const rows = conCambio.map((c) => ({
      tipo: (c.delta > 0 ? 'ENTRADA_AJUSTE' : 'SALIDA_AJUSTE') as 'ENTRADA_AJUSTE' | 'SALIDA_AJUSTE',
      almacen_id: data.almacen_id,
      variante_id: c.variante_id,
      cantidad: Math.abs(c.delta),
      referencia_tipo: 'AJUSTE',
      usuario_id: userId,
      observacion: [
        `Conteo físico (${c.actual} → ${c.cantidad_nueva})`,
        data.observacion?.trim() || null,
      ].filter(Boolean).join(' · '),
    }));

    if (rows.length > 0) {
      const { error } = await sb.from('kardex_movimientos').insert(rows);
      if (error) throw new Error(error.message);
    }
    return { aplicados: rows.length, sin_cambio: sinCambio, entradas, salidas };
  });
  if (r.ok) await bumpPaths('/inventario', '/productos', '/inventario/alertas');
  return r;
}

// ============================================================================
// MATERIALES (telas, avíos, insumos) — stock en almacén de materia prima
// ============================================================================
//
// El stock de material vive en stock_actual.material_id (mismo esquema que las
// variantes) y el trigger tg_actualizar_stock lo mantiene. Faltaba la capa de
// aplicación para moverlo. Pedido del cliente 2026-08-16: hacer funcionar el
// Almacén de Materia Prima con ingresos, compras, devoluciones y salidas.

const movimientoMaterialSchema = z.object({
  almacen_id: z.string().uuid('Almacén inválido'),
  material_id: z.string().uuid('Material inválido'),
  tipo: z.enum([
    'ENTRADA_COMPRA',            // compra recibida (normalmente vía recepción de OC)
    'ENTRADA_DEVOLUCION_TALLER', // material/avío que regresa de producción o servicio
    'ENTRADA_AJUSTE',            // ingreso por conteo/corrección
    'SALIDA_PRODUCCION',         // consumo en producción interna
    'SALIDA_TALLER_SERVICIO',    // avíos/insumos enviados a un taller/servicio
    'SALIDA_AJUSTE',             // salida por conteo/corrección
    'SALIDA_MERMA',              // material dado de baja
  ]),
  cantidad: z.coerce.number().positive('La cantidad debe ser > 0'),
  observacion: z.string().max(500).optional().or(z.literal('')),
});

// Registrar/ajustar stock de MATERIAL es una operación de ALMACÉN: la hacen el
// almacenero (compras recibidas, ingresos), el jefe de producción o el gerente.
// (Antes estaba restringido solo a gerente y el almacenero no podía registrar
// compras ni ingresos — reporte del cliente 2026-08-18.)
const ROLES_ALMACEN_MATERIAL = ['gerente', 'jefe_produccion', 'almacenero'];
async function requireAlmacenMaterial(sb: Awaited<ReturnType<typeof requireUser>>['sb'], userId: string) {
  const { data: roles } = await sb.from('usuarios_roles').select('rol').eq('usuario_id', userId);
  const permitido = (roles ?? []).some((r) => ROLES_ALMACEN_MATERIAL.includes((r as { rol: string }).rol));
  if (!permitido) {
    throw new Error('Necesitas rol de almacenero, jefe de producción o gerente para registrar movimientos de material.');
  }
}

// AJUSTE de inventario = corrección manual de stock. Es sensible (cambia el
// inventario sin una transacción real de compra/venta/producción), así que solo
// gerencia puede hacerlo (pedido cliente 2026-08-24). Los movimientos reales de
// logística/producción (traslado, ingreso por producción, compra recibida,
// devolución, salida a servicio) siguen su propio flujo/rol.
async function requireGerenteAjuste(sb: Awaited<ReturnType<typeof requireUser>>['sb'], userId: string) {
  const { data: roles } = await sb.from('usuarios_roles').select('rol').eq('usuario_id', userId);
  const esGte = (roles ?? []).some((r) => (r as { rol: string }).rol === 'gerente');
  if (!esGte) {
    throw new Error('El ajuste de inventario solo lo puede hacer gerencia (o con permiso de gerencia).');
  }
}

/**
 * Registra un movimiento manual de stock de MATERIAL (entrada o salida). El
 * signo lo define el prefijo del tipo (ENTRADA_/SALIDA_). Restringido a gerente.
 * Cubre los flujos que el cliente pidió operar a mano: ingresos, devoluciones de
 * producción/servicio y salidas por producción/servicio. Las compras normales
 * siguen entrando por Recepciones de OC (que ya generan ENTRADA_COMPRA).
 */
export async function registrarMovimientoMaterial(
  input: z.input<typeof movimientoMaterialSchema>,
): Promise<ActionResult<{ tipo: string; cantidad: number }>> {
  const r = await runAction(async () => {
    const data = movimientoMaterialSchema.parse(input);
    const { sb, userId } = await requireUser();
    // Los AJUSTE (entrada/salida de ajuste) son corrección de inventario → solo
    // gerencia. Los movimientos reales (compra, devolución, salida a producción/
    // servicio, merma) los puede hacer el almacén.
    const esAjuste = data.tipo === 'ENTRADA_AJUSTE' || data.tipo === 'SALIDA_AJUSTE';
    if (esAjuste) await requireGerenteAjuste(sb, userId);
    else await requireAlmacenMaterial(sb, userId);

    // Para salidas, no permitir dejar el stock negativo.
    if (data.tipo.startsWith('SALIDA')) {
      const { data: actualRow } = await sb
        .from('stock_actual')
        .select('cantidad')
        .eq('almacen_id', data.almacen_id)
        .eq('material_id', data.material_id)
        .is('material_lote_id', null)
        .maybeSingle();
      const disponible = Number(actualRow?.cantidad ?? 0);
      if (data.cantidad > disponible) {
        throw new Error(`No hay stock suficiente: disponible ${disponible}, se intentó sacar ${data.cantidad}.`);
      }
    }

    const { error } = await sb.from('kardex_movimientos').insert({
      tipo: data.tipo,
      almacen_id: data.almacen_id,
      material_id: data.material_id,
      cantidad: data.cantidad,
      referencia_tipo: 'AJUSTE',
      usuario_id: userId,
      observacion: data.observacion?.trim() || null,
    });
    if (error) throw new Error(error.message);
    return { tipo: data.tipo, cantidad: data.cantidad };
  });
  if (r.ok) await bumpPaths('/inventario', '/materiales');
  return r;
}

/**
 * Ajusta el stock de un MATERIAL en un almacén al valor exacto indicado
 * (conteo físico). Calcula el delta y genera ENTRADA/SALIDA_AJUSTE. Gerente.
 */
const ajustarMaterialSchema = z.object({
  almacen_id: z.string().uuid('Almacén inválido'),
  material_id: z.string().uuid('Material inválido'),
  cantidad_nueva: z.coerce.number().min(0, 'La cantidad no puede ser negativa'),
  observacion: z.string().max(500).optional().or(z.literal('')),
});

export async function ajustarStockMaterial(
  input: z.input<typeof ajustarMaterialSchema>,
): Promise<ActionResult<{ delta: number; cantidad_final: number }>> {
  const r = await runAction(async () => {
    const data = ajustarMaterialSchema.parse(input);
    const { sb, userId } = await requireUser();
    await requireGerenteAjuste(sb, userId); // corregir cantidad = ajuste → solo gerencia

    const { data: actualRow } = await sb
      .from('stock_actual')
      .select('cantidad')
      .eq('almacen_id', data.almacen_id)
      .eq('material_id', data.material_id)
      .is('material_lote_id', null)
      .maybeSingle();
    const cantidadActual = Number(actualRow?.cantidad ?? 0);
    const delta = data.cantidad_nueva - cantidadActual;
    if (delta === 0) return { delta: 0, cantidad_final: cantidadActual };

    const tipo = delta > 0 ? 'ENTRADA_AJUSTE' : 'SALIDA_AJUSTE';
    const obs = [
      `Ajuste de stock de material (${cantidadActual} → ${data.cantidad_nueva})`,
      data.observacion?.trim() || null,
    ].filter(Boolean).join(' · ');

    const { error } = await sb.from('kardex_movimientos').insert({
      tipo,
      almacen_id: data.almacen_id,
      material_id: data.material_id,
      cantidad: Math.abs(delta),
      referencia_tipo: 'AJUSTE',
      usuario_id: userId,
      observacion: obs,
    });
    if (error) throw new Error(error.message);
    return { delta, cantidad_final: data.cantidad_nueva };
  });
  if (r.ok) await bumpPaths('/inventario', '/materiales');
  return r;
}

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

// ===========================================================================
// MASIVO DE MATERIALES (mismo concepto que variantes, pero por material_id)
// ===========================================================================
// Pedido cliente 2026-09-02: replicar el masivo (conteo físico + sumar/restar)
// para materiales/materia prima. Todo es AJUSTE → solo gerencia. Admite decimales.

/** Stock actual de un conjunto de materiales en un almacén (para mostrar en UI). */
export async function obtenerStockMateriales(
  almacen_id: string,
  material_ids: string[],
): Promise<Record<string, number>> {
  if (!almacen_id || material_ids.length === 0) return {};
  const { sb } = await requireUser();
  const { data } = await sb
    .from('stock_actual')
    .select('material_id, cantidad')
    .eq('almacen_id', almacen_id)
    .in('material_id', material_ids)
    .is('material_lote_id', null);
  const out: Record<string, number> = {};
  for (const s of (data ?? []) as { material_id: string; cantidad: number }[]) {
    out[s.material_id] = Number(s.cantidad ?? 0);
  }
  return out;
}

const ajustarMaterialBatchSchema = z.object({
  almacen_id: z.string().uuid('Almacén requerido'),
  observacion: z.string().max(500).optional().or(z.literal('')),
  lineas: z.array(z.object({
    material_id: z.string().uuid(),
    cantidad_nueva: z.coerce.number().min(0, 'La cantidad no puede ser negativa'),
  })).min(1, 'Agrega al menos una línea'),
});

/** Conteo físico masivo de materiales: fija el stock final e inserta el delta. */
export async function ajustarStockMaterialBatch(
  input: z.input<typeof ajustarMaterialBatchSchema>,
): Promise<ActionResult<{ aplicados: number; sin_cambio: number; entradas: number; salidas: number }>> {
  const r = await runAction(async () => {
    const data = ajustarMaterialBatchSchema.parse(input);
    const { sb, userId } = await requireUser();
    await requireGerenteAjuste(sb, userId); // conteo = ajuste → solo gerencia

    const ids = data.lineas.map((l) => l.material_id);
    const { data: stockRows } = await sb
      .from('stock_actual')
      .select('material_id, cantidad')
      .eq('almacen_id', data.almacen_id)
      .in('material_id', ids)
      .is('material_lote_id', null);
    const mapa = new Map<string, number>();
    for (const s of (stockRows ?? []) as { material_id: string; cantidad: number }[]) {
      mapa.set(s.material_id, Number(s.cantidad ?? 0));
    }

    const candidatos = data.lineas.map((l) => {
      const actual = mapa.get(l.material_id) ?? 0;
      return { material_id: l.material_id, actual, cantidad_nueva: l.cantidad_nueva, delta: l.cantidad_nueva - actual };
    });
    const conCambio = candidatos.filter((c) => c.delta !== 0);
    const sinCambio = candidatos.length - conCambio.length;
    const entradas = conCambio.filter((c) => c.delta > 0).length;
    const salidas = conCambio.filter((c) => c.delta < 0).length;

    const rows = conCambio.map((c) => ({
      tipo: (c.delta > 0 ? 'ENTRADA_AJUSTE' : 'SALIDA_AJUSTE') as 'ENTRADA_AJUSTE' | 'SALIDA_AJUSTE',
      almacen_id: data.almacen_id,
      material_id: c.material_id,
      cantidad: Math.abs(c.delta),
      referencia_tipo: 'AJUSTE',
      usuario_id: userId,
      observacion: [
        `Conteo físico material (${c.actual} → ${c.cantidad_nueva})`,
        data.observacion?.trim() || null,
      ].filter(Boolean).join(' · '),
    }));

    if (rows.length > 0) {
      const { error } = await sb.from('kardex_movimientos').insert(rows);
      if (error) throw new Error(error.message);
    }
    return { aplicados: rows.length, sin_cambio: sinCambio, entradas, salidas };
  });
  if (r.ok) await bumpPaths('/inventario', '/materiales');
  return r;
}

const movimientoMaterialBatchSchema = z.object({
  almacen_id: z.string().uuid('Almacén requerido'),
  tipo: z.enum(['ENTRADA_AJUSTE', 'SALIDA_AJUSTE']),
  observacion: z.string().max(500).optional().or(z.literal('')),
  lineas: z.array(z.object({
    material_id: z.string().uuid(),
    cantidad: z.coerce.number().positive(),
  })).min(1, 'Agrega al menos una línea'),
});

/** Sumar/restar el mismo ajuste a varios materiales a la vez. */
export async function registrarMovimientoMaterialBatch(
  input: z.input<typeof movimientoMaterialBatchSchema>,
): Promise<ActionResult<{ insertados: number }>> {
  const r = await runAction(async () => {
    const data = movimientoMaterialBatchSchema.parse(input);
    const { sb, userId } = await requireUser();
    await requireGerenteAjuste(sb, userId); // ajuste masivo → solo gerencia

    const rows = data.lineas.map((l) => ({
      tipo: data.tipo,
      almacen_id: data.almacen_id,
      material_id: l.material_id,
      cantidad: l.cantidad,
      referencia_tipo: 'AJUSTE',
      usuario_id: userId,
      observacion: data.observacion?.trim() || null,
    }));

    const { data: inserted, error } = await sb
      .from('kardex_movimientos')
      .insert(rows)
      .select('id');
    if (error) throw new Error(error.message);
    return { insertados: (inserted ?? []).length };
  });
  if (r.ok) await bumpPaths('/inventario', '/materiales');
  return r;
}
