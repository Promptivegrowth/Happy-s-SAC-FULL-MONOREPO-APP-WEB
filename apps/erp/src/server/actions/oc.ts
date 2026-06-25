'use server';

import { z } from 'zod';
import { runAction, requireUser, bumpPaths, type ActionResult } from './_helpers';
import { TRANSICIONES_OC, type EstadoOC, type TipoOC } from './oc-helpers';

/**
 * Módulo de Órdenes de Compra (oc + oc_lineas).
 *
 * Una OC es la solicitud de compra a un proveedor. Vida útil:
 *   BORRADOR (editable) → APROBADA → ENVIADA → (PARCIAL) → RECIBIDA → PAGADA
 *   CANCELADA es destino válido desde casi cualquier estado pre-recepción.
 *
 * Estados PARCIAL / RECIBIDA los gestiona automáticamente el módulo de
 * recepciones (oc_recepciones); este módulo solo administra el ciclo
 * de creación + aprobación + envío.
 *
 * Numeración: RPC `generar_numero_oc()` → "OC-YY-NNNNN" (year-based,
 * resetea cada año vía next_correlativo('OC_YY', 5)).
 */

// ---------- Tipos ----------

export type OCLineaInput = {
  material_id: string | null;
  descripcion_libre: string | null;
  cantidad: number;
  unidad_id: string;
  precio_unitario: number;
  descuento_porcentaje?: number;
  igv_aplicable?: boolean;
};

export type OCInputCabecera = {
  proveedor_id: string;
  tipo: TipoOC;
  fecha: string;
  fecha_entrega_esperada: string | null;
  almacen_destino: string | null;
  moneda: string;
  tipo_cambio: number | null;
  condicion_pago: string | null;
  adelanto: number | null;
  observacion: string | null;
  importacion_id?: string | null;
};

export type ProveedorOpt = { id: string; razon_social: string; ruc: string | null };  // ruc = numero_documento cuando tipo=RUC
export type AlmacenOpt = { id: string; codigo: string; nombre: string };
export type UnidadOpt = { id: string; codigo: string; descripcion: string };  // descripcion = nombre del schema
export type MaterialOpt = {
  id: string;
  codigo: string;
  nombre: string;
  unidad_id: string;          // unidad_compra_id del material
  unidad_codigo: string;
  precio_referencial: number | null;  // precio_unitario del material
};

export type OCDetalle = {
  id: string;
  numero: string;
  tipo: TipoOC;
  estado: EstadoOC;
  proveedor_id: string;
  proveedor_razon_social: string;
  proveedor_ruc: string | null;
  fecha: string;
  fecha_entrega_esperada: string | null;
  almacen_destino: string | null;
  almacen_codigo: string | null;
  almacen_nombre: string | null;
  moneda: string;
  tipo_cambio: number | null;
  sub_total: number;
  igv: number;
  total: number;
  condicion_pago: string | null;
  adelanto: number;
  saldo: number;
  observacion: string | null;
  importacion_id: string | null;
  solicitada_por: string | null;
  aprobada_por: string | null;
  aprobada_en: string | null;
  lineas: Array<{
    id: string;
    material_id: string | null;
    material_codigo: string | null;
    material_nombre: string;
    descripcion_libre: string | null;
    cantidad: number;
    unidad_id: string;
    unidad_codigo: string;
    precio_unitario: number;
    descuento_porcentaje: number;
    igv_aplicable: boolean;
    sub_total: number;
    cantidad_recibida: number;
    cantidad_pendiente: number;
  }>;
};

// ---------- Listados para selectores ----------

export async function listarProveedoresParaOC(): Promise<ProveedorOpt[]> {
  const { sb } = await requireUser();
  const { data } = await sb
    .from('proveedores')
    .select('id, razon_social, tipo_documento, numero_documento')
    .eq('activo', true)
    .order('razon_social')
    .limit(500);
  type Row = { id: string; razon_social: string; tipo_documento: string; numero_documento: string };
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    razon_social: r.razon_social,
    ruc: r.tipo_documento === 'RUC' ? r.numero_documento : null,
  }));
}

export async function listarAlmacenesParaOC(): Promise<AlmacenOpt[]> {
  const { sb } = await requireUser();
  // Excluir almacenes ocultos (ej. ALM-MR que el cliente no usa en operación)
  // Cast porque oculto_en_selectores es de migración 52.
  const { data } = await (sb as unknown as {
    from: (t: string) => {
      select: (s: string) => {
        eq: (k: string, v: unknown) => {
          eq: (k: string, v: unknown) => {
            order: (k: string) => Promise<{ data: AlmacenOpt[] | null }>;
          };
        };
      };
    };
  })
    .from('almacenes')
    .select('id, codigo, nombre')
    .eq('activo', true)
    .eq('oculto_en_selectores', false)
    .order('nombre');
  return (data ?? []) as AlmacenOpt[];
}

export async function listarUnidades(): Promise<UnidadOpt[]> {
  const { sb } = await requireUser();
  const { data } = await sb
    .from('unidades_medida')
    .select('id, codigo, nombre')
    .order('codigo');
  type Row = { id: string; codigo: string; nombre: string };
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    codigo: r.codigo,
    descripcion: r.nombre,
  }));
}

export async function buscarMaterialesParaOC(q: string): Promise<MaterialOpt[]> {
  const { sb } = await requireUser();
  if (!q || q.length < 2) return [];
  // Traemos todos los activos (cap 500) y filtramos client-side por código/nombre.
  // No usamos .or() con campos de tabla relacionada — Supabase los ignora.
  const { data } = await sb
    .from('materiales')
    .select('id, codigo, nombre, unidad_compra_id, precio_unitario, unidades_medida:unidades_medida!unidad_compra_id(codigo)')
    .eq('activo', true)
    .order('nombre')
    .limit(500);
  type Row = {
    id: string;
    codigo: string;
    nombre: string;
    unidad_compra_id: string | null;
    precio_unitario: number;
    unidades_medida: { codigo: string } | null;
  };
  const qq = q.toLowerCase();
  return ((data ?? []) as unknown as Row[])
    .filter((r) => r.codigo.toLowerCase().includes(qq) || r.nombre.toLowerCase().includes(qq))
    .filter((r) => r.unidad_compra_id) // sin unidad no se puede usar en OC
    .slice(0, 20)
    .map((r) => ({
      id: r.id,
      codigo: r.codigo,
      nombre: r.nombre,
      unidad_id: r.unidad_compra_id!,
      unidad_codigo: r.unidades_medida?.codigo ?? '',
      precio_referencial: Number(r.precio_unitario),
    }));
}

// ---------- Crear / Editar / Obtener ----------

const SchemaLinea = z.object({
  material_id: z.string().uuid().nullable(),
  descripcion_libre: z.string().nullable(),
  cantidad: z.number().positive('Cantidad debe ser mayor a 0'),
  unidad_id: z.string().uuid('Unidad requerida'),
  precio_unitario: z.number().nonnegative('Precio no puede ser negativo'),
  descuento_porcentaje: z.number().min(0).max(100).default(0),
  igv_aplicable: z.boolean().default(true),
});

const SchemaCrear = z.object({
  proveedor_id: z.string().uuid('Proveedor requerido'),
  tipo: z.enum(['NACIONAL', 'IMPORTACION', 'SERVICIO_TALLER']),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida'),
  fecha_entrega_esperada: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  almacen_destino: z.string().uuid().nullable(),
  moneda: z.string().default('PEN'),
  tipo_cambio: z.number().positive().nullable(),
  condicion_pago: z.string().nullable(),
  adelanto: z.number().nonnegative().nullable(),
  observacion: z.string().nullable(),
  importacion_id: z.string().uuid().nullable().optional(),
  lineas: z.array(SchemaLinea).min(1, 'Agregue al menos una línea'),
});

export type CrearOCInput = z.infer<typeof SchemaCrear>;

export async function crearOC(input: CrearOCInput): Promise<ActionResult<{ id: string; numero: string }>> {
  return runAction(async () => {
    const { sb, userId } = await requireUser();
    const parsed = SchemaCrear.parse(input);

    // Calcular totales en server (no confiar en client)
    let sub_total = 0;
    let igv = 0;
    for (const ln of parsed.lineas) {
      const bruto = ln.cantidad * ln.precio_unitario;
      const conDescuento = bruto * (1 - (ln.descuento_porcentaje ?? 0) / 100);
      sub_total += conDescuento;
      if (ln.igv_aplicable) igv += conDescuento * 0.18;
    }
    const total = sub_total + igv;

    // Obtener correlativo
    const { data: numRpc, error: errNum } = await sb.rpc('generar_numero_oc');
    if (errNum) throw new Error(`Generando número OC: ${errNum.message}`);
    const numero = numRpc as unknown as string;

    // Insertar cabecera
    const { data: oc, error: errOC } = await sb
      .from('oc')
      .insert({
        numero,
        proveedor_id: parsed.proveedor_id,
        tipo: parsed.tipo,
        fecha: parsed.fecha,
        fecha_entrega_esperada: parsed.fecha_entrega_esperada,
        almacen_destino: parsed.almacen_destino,
        moneda: parsed.moneda,
        tipo_cambio: parsed.tipo_cambio,
        sub_total,
        igv,
        total,
        saldo: total - (parsed.adelanto ?? 0),
        estado: 'BORRADOR',
        condicion_pago: parsed.condicion_pago,
        adelanto: parsed.adelanto ?? 0,
        observacion: parsed.observacion,
        importacion_id: parsed.importacion_id ?? null,
        solicitada_por: userId,
      })
      .select('id, numero')
      .single();
    if (errOC) throw new Error(`Insertando OC: ${errOC.message}`);

    // Insertar líneas
    const lineasInsert = parsed.lineas.map((ln) => ({
      oc_id: oc.id,
      material_id: ln.material_id,
      descripcion_libre: ln.descripcion_libre,
      cantidad: ln.cantidad,
      unidad_id: ln.unidad_id,
      precio_unitario: ln.precio_unitario,
      descuento_porcentaje: ln.descuento_porcentaje ?? 0,
      igv_aplicable: ln.igv_aplicable,
    }));
    const { error: errLn } = await sb.from('oc_lineas').insert(lineasInsert);
    if (errLn) {
      // Rollback cabecera para no dejar OC huérfana
      await sb.from('oc').delete().eq('id', oc.id);
      throw new Error(`Insertando líneas: ${errLn.message}`);
    }

    await bumpPaths('/oc', `/oc/${oc.id}`, '/compras/cxp');
    return { id: oc.id, numero: oc.numero };
  });
}

export async function obtenerOC(id: string): Promise<OCDetalle | null> {
  const { sb } = await requireUser();
  const { data: cab } = await sb
    .from('oc')
    .select(
      `id, numero, tipo, estado, proveedor_id, fecha, fecha_entrega_esperada,
       almacen_destino, moneda, tipo_cambio, sub_total, igv, total,
       condicion_pago, adelanto, saldo, observacion, importacion_id,
       solicitada_por, aprobada_por, aprobada_en,
       proveedores!inner(razon_social, ruc),
       almacenes(codigo, nombre)`,
    )
    .eq('id', id)
    .maybeSingle();
  if (!cab) return null;

  const { data: lineasRaw } = await sb
    .from('oc_lineas')
    .select(
      `id, material_id, descripcion_libre, cantidad, unidad_id,
       precio_unitario, descuento_porcentaje, igv_aplicable, sub_total,
       cantidad_recibida, cantidad_pendiente,
       materiales(codigo, nombre),
       unidades_medida!inner(codigo)`,
    )
    .eq('oc_id', id)
    .order('id');

  type LnRow = {
    id: string;
    material_id: string | null;
    descripcion_libre: string | null;
    cantidad: number;
    unidad_id: string;
    precio_unitario: number;
    descuento_porcentaje: number;
    igv_aplicable: boolean;
    sub_total: number;
    cantidad_recibida: number;
    cantidad_pendiente: number;
    materiales: { codigo: string; nombre: string } | null;
    unidades_medida: { codigo: string } | null;
  };

  const c = cab as unknown as {
    id: string;
    numero: string;
    tipo: TipoOC;
    estado: EstadoOC;
    proveedor_id: string;
    fecha: string;
    fecha_entrega_esperada: string | null;
    almacen_destino: string | null;
    moneda: string;
    tipo_cambio: number | null;
    sub_total: number;
    igv: number;
    total: number;
    condicion_pago: string | null;
    adelanto: number;
    saldo: number;
    observacion: string | null;
    importacion_id: string | null;
    solicitada_por: string | null;
    aprobada_por: string | null;
    aprobada_en: string | null;
    proveedores: { razon_social: string; ruc: string | null };
    almacenes: { codigo: string; nombre: string } | null;
  };

  return {
    id: c.id,
    numero: c.numero,
    tipo: c.tipo,
    estado: c.estado,
    proveedor_id: c.proveedor_id,
    proveedor_razon_social: c.proveedores.razon_social,
    proveedor_ruc: c.proveedores.ruc,
    fecha: c.fecha,
    fecha_entrega_esperada: c.fecha_entrega_esperada,
    almacen_destino: c.almacen_destino,
    almacen_codigo: c.almacenes?.codigo ?? null,
    almacen_nombre: c.almacenes?.nombre ?? null,
    moneda: c.moneda,
    tipo_cambio: c.tipo_cambio,
    sub_total: Number(c.sub_total),
    igv: Number(c.igv),
    total: Number(c.total),
    condicion_pago: c.condicion_pago,
    adelanto: Number(c.adelanto ?? 0),
    saldo: Number(c.saldo ?? c.total),
    observacion: c.observacion,
    importacion_id: c.importacion_id,
    solicitada_por: c.solicitada_por,
    aprobada_por: c.aprobada_por,
    aprobada_en: c.aprobada_en,
    lineas: ((lineasRaw ?? []) as unknown as LnRow[]).map((l) => ({
      id: l.id,
      material_id: l.material_id,
      material_codigo: l.materiales?.codigo ?? null,
      material_nombre: l.materiales?.nombre ?? l.descripcion_libre ?? '—',
      descripcion_libre: l.descripcion_libre,
      cantidad: Number(l.cantidad),
      unidad_id: l.unidad_id,
      unidad_codigo: l.unidades_medida?.codigo ?? '',
      precio_unitario: Number(l.precio_unitario),
      descuento_porcentaje: Number(l.descuento_porcentaje ?? 0),
      igv_aplicable: l.igv_aplicable,
      sub_total: Number(l.sub_total),
      cantidad_recibida: Number(l.cantidad_recibida ?? 0),
      cantidad_pendiente: Number(l.cantidad_pendiente ?? l.cantidad),
    })),
  };
}

// ---------- Cambio de estado ----------

const SchemaCambiarEstado = z.object({
  id: z.string().uuid(),
  estado: z.enum(['BORRADOR', 'APROBADA', 'ENVIADA', 'PARCIAL', 'RECIBIDA', 'PAGADA', 'CANCELADA']),
});

export async function cambiarEstadoOC(input: z.infer<typeof SchemaCambiarEstado>): Promise<ActionResult> {
  return runAction(async () => {
    const { sb, userId } = await requireUser();
    const { id, estado: nuevoEstado } = SchemaCambiarEstado.parse(input);

    // Validar transición
    const { data: actualRaw } = await sb.from('oc').select('estado').eq('id', id).maybeSingle();
    if (!actualRaw) throw new Error('OC no encontrada');
    const actual = (actualRaw as { estado: EstadoOC }).estado;
    const permitidos = TRANSICIONES_OC[actual];
    if (!permitidos.includes(nuevoEstado)) {
      throw new Error(`No se puede pasar de ${actual} a ${nuevoEstado}`);
    }

    const patch: { estado: EstadoOC; aprobada_por?: string; aprobada_en?: string } = { estado: nuevoEstado };
    if (nuevoEstado === 'APROBADA') {
      patch.aprobada_por = userId;
      patch.aprobada_en = new Date().toISOString();
    }

    const { error } = await sb.from('oc').update(patch).eq('id', id);
    if (error) throw new Error(error.message);

    await bumpPaths('/oc', `/oc/${id}`, '/compras/cxp', '/recepciones');
    return null;
  });
}

// ---------- Eliminar (solo BORRADOR sin líneas recibidas) ----------

export async function eliminarOC(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const { sb } = await requireUser();
    const { data: cab } = await sb.from('oc').select('estado').eq('id', id).maybeSingle();
    if (!cab) throw new Error('OC no encontrada');
    if ((cab as { estado: EstadoOC }).estado !== 'BORRADOR') {
      throw new Error('Solo se pueden eliminar OCs en BORRADOR');
    }
    // El FK de oc_lineas tiene ON DELETE CASCADE en el schema
    const { error } = await sb.from('oc').delete().eq('id', id);
    if (error) throw new Error(error.message);
    await bumpPaths('/oc');
    return null;
  });
}
