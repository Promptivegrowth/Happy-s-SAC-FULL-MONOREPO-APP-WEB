'use server';

import { z } from 'zod';
import { runAction, requireUser, type ActionResult } from './_helpers';

/**
 * Trazabilidad end-to-end.
 *
 * El esquema separa los eventos en varias tablas (kardex_movimientos,
 * trazabilidad_eventos, ot_eventos, controles_calidad…). Esta capa
 * consolida todas esas fuentes en un único timeline cronológico
 * tipado para la UI.
 */

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

export type TrazaEventoTipo =
  | 'TRAZA' // de trazabilidad_eventos (producción, traslado, venta, etc.)
  | 'KARDEX' // de kardex_movimientos
  | 'OT_EVENTO' // de ot_eventos
  | 'CALIDAD' // de controles_calidad
  | 'CORTE' // de ot_corte
  | 'OS' // orden de servicio derivada de la OT
  | 'INGRESO_PT'; // ingresos_pt

export type TrazaEvento = {
  id: string;
  fuente: TrazaEventoTipo;
  fecha: string;
  titulo: string;
  detalle: string | null;
  /** Subtipo libre que puede usar la UI para pintar iconos/colores. */
  subtipo: string | null;
  cantidad: number | null;
  almacen_origen: { id: string; codigo: string; nombre: string } | null;
  almacen_destino: { id: string; codigo: string; nombre: string } | null;
  ot: { id: string; numero: string } | null;
  taller: { id: string; nombre: string } | null;
  operario: { id: string; nombres: string; apellido_paterno: string | null } | null;
  cliente: { id: string; razon_social: string | null; nombres: string | null } | null;
  referencia_tipo: string | null;
  referencia_id: string | null;
};

export type LoteDetalle = {
  id: string;
  codigo: string;
  cantidad_inicial: number;
  cantidad_actual: number;
  costo_unitario: number | null;
  fecha_produccion: string | null;
  fecha_ingreso: string | null;
  estado: string;
  observacion: string | null;
  variante: {
    id: string;
    sku: string;
    talla: string;
    color: string | null;
    producto: { id: string; codigo: string; nombre: string };
  };
  almacen_actual: { id: string; codigo: string; nombre: string } | null;
  ot: { id: string; numero: string; estado: string } | null;
  ingreso_pt_id: string | null;
};

export type VarianteDetalle = {
  id: string;
  sku: string;
  talla: string;
  color: string | null;
  producto: { id: string; codigo: string; nombre: string };
  stock_por_almacen: { almacen_id: string; codigo: string; nombre: string; cantidad: number }[];
  lotes_activos: {
    id: string;
    codigo: string;
    cantidad_actual: number;
    cantidad_inicial: number;
    fecha_produccion: string | null;
    almacen_codigo: string | null;
    estado: string;
  }[];
};

export type OTDetalle = {
  id: string;
  numero: string;
  estado: string;
  fecha_apertura: string | null;
  fecha_cierre: string | null;
  fecha_entrega_objetivo: string | null;
  observacion: string | null;
  producto: { id: string; codigo: string; nombre: string } | null;
  almacen_produccion: { id: string; codigo: string; nombre: string } | null;
  lineas: { producto_id: string; talla: string; cantidad_planificada: number; cantidad_terminada: number }[];
  lotes_generados: {
    id: string;
    codigo: string;
    cantidad_inicial: number;
    cantidad_actual: number;
    variante_sku: string;
  }[];
};

export type BusquedaResultado = {
  tipo: 'LOTE' | 'VARIANTE' | 'OT';
  id: string;
  codigo: string;
  descripcion: string;
  href: string;
};

// ---------------------------------------------------------------------------
// Helpers internos: construcción y mapeo de eventos
// ---------------------------------------------------------------------------

type AlmacenLite = { id: string; codigo: string; nombre: string } | null;
type TallerLite = { id: string; nombre: string } | null;
type OperarioLite = { id: string; nombres: string; apellido_paterno: string | null } | null;
type ClienteLite = { id: string; razon_social: string | null; nombres: string | null } | null;
type OtLite = { id: string; numero: string } | null;

function vacioEvento(over: Partial<TrazaEvento> & Pick<TrazaEvento, 'id' | 'fuente' | 'fecha' | 'titulo'>): TrazaEvento {
  return {
    detalle: null,
    subtipo: null,
    cantidad: null,
    almacen_origen: null,
    almacen_destino: null,
    ot: null,
    taller: null,
    operario: null,
    cliente: null,
    referencia_tipo: null,
    referencia_id: null,
    ...over,
  };
}

type TrazaRowRaw = {
  id: number;
  fecha: string;
  tipo: string;
  cantidad: number | string | null;
  observacion: string | null;
  referencia_tipo: string | null;
  referencia_id: string | null;
  almacen_origen: AlmacenLite;
  almacen_destino: AlmacenLite;
  ot: OtLite;
  taller: TallerLite;
  operario: OperarioLite;
  cliente: ClienteLite;
};

function mapTrazaEvento(r: TrazaRowRaw): TrazaEvento {
  return vacioEvento({
    id: `traza:${r.id}`,
    fuente: 'TRAZA',
    fecha: r.fecha,
    titulo: r.tipo,
    subtipo: r.tipo,
    detalle: r.observacion,
    cantidad: r.cantidad != null ? Number(r.cantidad) : null,
    almacen_origen: r.almacen_origen,
    almacen_destino: r.almacen_destino,
    ot: r.ot,
    taller: r.taller,
    operario: r.operario,
    cliente: r.cliente,
    referencia_tipo: r.referencia_tipo,
    referencia_id: r.referencia_id,
  });
}

type KardexRowRaw = {
  id: number;
  fecha: string;
  tipo: string;
  cantidad: number | string;
  observacion: string | null;
  referencia_tipo: string | null;
  referencia_id: string | null;
  almacen: AlmacenLite;
  almacen_contraparte: AlmacenLite;
  operario: OperarioLite;
};

function mapKardexEvento(r: KardexRowRaw): TrazaEvento {
  const esEntrada = r.tipo.startsWith('ENTRADA_');
  const esSalida = r.tipo.startsWith('SALIDA_');
  return vacioEvento({
    id: `kardex:${r.id}`,
    fuente: 'KARDEX',
    fecha: r.fecha,
    titulo: r.tipo.replace(/_/g, ' '),
    subtipo: r.tipo,
    detalle: r.observacion,
    cantidad: Number(r.cantidad),
    almacen_origen: esSalida ? r.almacen : r.almacen_contraparte ?? null,
    almacen_destino: esEntrada ? r.almacen : r.almacen_contraparte ?? null,
    operario: r.operario,
    referencia_tipo: r.referencia_tipo,
    referencia_id: r.referencia_id,
  });
}

type OtEventoRowRaw = {
  id: number;
  fecha: string;
  tipo: string;
  estado_anterior: string | null;
  estado_nuevo: string | null;
  detalle: string | null;
  ot: OtLite;
};

function mapOtEvento(r: OtEventoRowRaw): TrazaEvento {
  let titulo = r.tipo;
  if (r.tipo === 'ESTADO_CAMBIO' && r.estado_nuevo) {
    titulo = `Estado → ${r.estado_nuevo}`;
  }
  return vacioEvento({
    id: `otev:${r.id}`,
    fuente: 'OT_EVENTO',
    fecha: r.fecha,
    titulo,
    subtipo: r.tipo,
    detalle: r.detalle,
    ot: r.ot,
  });
}

type CalidadRowRaw = {
  id: string;
  numero: string;
  fecha: string | null;
  cantidad_revisada: number;
  cantidad_ok: number | null;
  cantidad_falla: number | null;
  cantidad_reproceso: number | null;
  cantidad_segunda: number | null;
  cantidad_merma: number | null;
  observacion: string | null;
  responsable_taller: TallerLite;
  responsable_operario: OperarioLite;
  ot: OtLite;
};

function mapCalidadEvento(r: CalidadRowRaw): TrazaEvento {
  const ok = r.cantidad_ok ?? 0;
  const fallas = (r.cantidad_falla ?? 0) + (r.cantidad_merma ?? 0) + (r.cantidad_reproceso ?? 0) + (r.cantidad_segunda ?? 0);
  return vacioEvento({
    id: `cc:${r.id}`,
    fuente: 'CALIDAD',
    fecha: r.fecha ?? new Date(0).toISOString(),
    titulo: `Control de calidad ${r.numero}`,
    subtipo: fallas > 0 ? 'CON_FALLAS' : 'OK',
    detalle: r.observacion ?? `Revisadas ${r.cantidad_revisada} · OK ${ok} · con observaciones ${fallas}`,
    cantidad: r.cantidad_revisada,
    taller: r.responsable_taller,
    operario: r.responsable_operario,
    ot: r.ot,
  });
}

// Ordena eventos asc por fecha; los sin fecha quedan al inicio.
function ordenarPorFecha(evs: TrazaEvento[]): TrazaEvento[] {
  return [...evs].sort((a, b) => {
    const fa = new Date(a.fecha).getTime();
    const fb = new Date(b.fecha).getTime();
    if (Number.isNaN(fa) && Number.isNaN(fb)) return 0;
    if (Number.isNaN(fa)) return -1;
    if (Number.isNaN(fb)) return 1;
    return fa - fb;
  });
}

const SELECT_TRAZA =
  'id, fecha, tipo, cantidad, observacion, referencia_tipo, referencia_id, ' +
  'almacen_origen:almacen_origen(id, codigo, nombre), ' +
  'almacen_destino:almacen_destino(id, codigo, nombre), ' +
  'ot:ot_id(id, numero), ' +
  'taller:taller_id(id, nombre), ' +
  'operario:operario_id(id, nombres, apellido_paterno), ' +
  'cliente:cliente_id(id, razon_social, nombres)';

const SELECT_KARDEX =
  'id, fecha, tipo, cantidad, observacion, referencia_tipo, referencia_id, ' +
  'almacen:almacen_id(id, codigo, nombre), ' +
  'almacen_contraparte:almacen_contraparte(id, codigo, nombre), ' +
  'operario:operario_id(id, nombres, apellido_paterno)';

const SELECT_OT_EVENTO =
  'id, fecha, tipo, estado_anterior, estado_nuevo, detalle, ot:ot_id(id, numero)';

const SELECT_CALIDAD =
  'id, numero, fecha, cantidad_revisada, cantidad_ok, cantidad_falla, cantidad_reproceso, ' +
  'cantidad_segunda, cantidad_merma, observacion, ' +
  'responsable_taller:responsable_taller_id(id, nombre), ' +
  'responsable_operario:responsable_operario_id(id, nombres, apellido_paterno), ' +
  'ot:ot_id(id, numero)';

const MAX_EVENTOS = 200;

// ---------------------------------------------------------------------------
// historicoLote
// ---------------------------------------------------------------------------

export async function historicoLote(
  loteCodigo: string,
): Promise<ActionResult<{ lote: LoteDetalle; eventos: TrazaEvento[] }>> {
  return runAction(async () => {
    if (!loteCodigo) throw new Error('Código de lote requerido');
    const { sb } = await requireUser();

    const { data: loteRow, error: loteErr } = await sb
      .from('lotes_pt')
      .select(
        'id, codigo, cantidad_inicial, cantidad_actual, costo_unitario, fecha_produccion, fecha_ingreso, estado, observacion, ingreso_pt_id, ' +
          'variante:variante_id(id, sku, talla, color_variante, producto:producto_id(id, codigo, nombre)), ' +
          'almacen_actual:almacen_actual(id, codigo, nombre), ' +
          'ot:ot_id(id, numero, estado)',
      )
      .eq('codigo', loteCodigo)
      .maybeSingle();
    if (loteErr) throw new Error(loteErr.message);
    if (!loteRow) throw new Error(`Lote ${loteCodigo} no encontrado`);

    type LoteRaw = {
      id: string;
      codigo: string;
      cantidad_inicial: number;
      cantidad_actual: number;
      costo_unitario: string | number | null;
      fecha_produccion: string | null;
      fecha_ingreso: string | null;
      estado: string;
      observacion: string | null;
      ingreso_pt_id: string | null;
      variante: {
        id: string;
        sku: string;
        talla: string;
        color_variante: string | null;
        producto: { id: string; codigo: string; nombre: string } | null;
      } | null;
      almacen_actual: AlmacenLite;
      ot: { id: string; numero: string; estado: string } | null;
    };
    const raw = loteRow as unknown as LoteRaw;
    if (!raw.variante || !raw.variante.producto) throw new Error('Lote sin variante o producto asociado');

    const lote: LoteDetalle = {
      id: raw.id,
      codigo: raw.codigo,
      cantidad_inicial: raw.cantidad_inicial,
      cantidad_actual: raw.cantidad_actual,
      costo_unitario: raw.costo_unitario != null ? Number(raw.costo_unitario) : null,
      fecha_produccion: raw.fecha_produccion,
      fecha_ingreso: raw.fecha_ingreso,
      estado: raw.estado,
      observacion: raw.observacion,
      ingreso_pt_id: raw.ingreso_pt_id,
      variante: {
        id: raw.variante.id,
        sku: raw.variante.sku,
        talla: raw.variante.talla,
        color: raw.variante.color_variante,
        producto: raw.variante.producto,
      },
      almacen_actual: raw.almacen_actual,
      ot: raw.ot,
    };

    // 1) trazabilidad_eventos por lote
    const { data: trazaRows, error: trazaErr } = await sb
      .from('trazabilidad_eventos')
      .select(SELECT_TRAZA)
      .eq('lote_pt_id', lote.id)
      .order('fecha', { ascending: true })
      .limit(MAX_EVENTOS);
    if (trazaErr) throw new Error(trazaErr.message);

    // 2) kardex_movimientos por lote
    const { data: kardexRows, error: kardexErr } = await sb
      .from('kardex_movimientos')
      .select(SELECT_KARDEX)
      .eq('lote_pt_id', lote.id)
      .order('fecha', { ascending: true })
      .limit(MAX_EVENTOS);
    if (kardexErr) throw new Error(kardexErr.message);

    // 3) controles_calidad asociados al mismo ingreso_pt
    let calidadRows: unknown[] = [];
    if (lote.ingreso_pt_id) {
      const { data, error } = await sb
        .from('controles_calidad')
        .select(SELECT_CALIDAD)
        .eq('ingreso_pt_id', lote.ingreso_pt_id)
        .order('fecha', { ascending: true })
        .limit(50);
      if (error) throw new Error(error.message);
      calidadRows = data ?? [];
    }

    // 4) ot_eventos si el lote vino de una OT
    let otRows: unknown[] = [];
    if (lote.ot?.id) {
      const { data, error } = await sb
        .from('ot_eventos')
        .select(SELECT_OT_EVENTO)
        .eq('ot_id', lote.ot.id)
        .order('fecha', { ascending: true })
        .limit(100);
      if (error) throw new Error(error.message);
      otRows = data ?? [];
    }

    const eventos: TrazaEvento[] = [
      ...((trazaRows ?? []) as unknown as TrazaRowRaw[]).map(mapTrazaEvento),
      ...((kardexRows ?? []) as unknown as KardexRowRaw[]).map(mapKardexEvento),
      ...(calidadRows as CalidadRowRaw[]).map(mapCalidadEvento),
      ...(otRows as OtEventoRowRaw[]).map(mapOtEvento),
    ];

    return { lote, eventos: ordenarPorFecha(eventos).slice(0, MAX_EVENTOS) };
  });
}

// ---------------------------------------------------------------------------
// historicoVariante
// ---------------------------------------------------------------------------

const histVarianteSchema = z.object({
  desde: z.string().optional(),
  hasta: z.string().optional(),
  limite: z.coerce.number().int().min(10).max(MAX_EVENTOS).default(MAX_EVENTOS),
});

export async function historicoVariante(
  varianteId: string,
  filtros: z.input<typeof histVarianteSchema> = {},
): Promise<ActionResult<{ variante: VarianteDetalle; eventos: TrazaEvento[] }>> {
  return runAction(async () => {
    if (!varianteId) throw new Error('Variante requerida');
    const f = histVarianteSchema.parse(filtros);
    const { sb } = await requireUser();

    const { data: varRow, error: varErr } = await sb
      .from('productos_variantes')
      .select('id, sku, talla, color_variante, producto:producto_id(id, codigo, nombre)')
      .eq('id', varianteId)
      .maybeSingle();
    if (varErr) throw new Error(varErr.message);
    if (!varRow) throw new Error('Variante no encontrada');

    type VarRaw = {
      id: string;
      sku: string;
      talla: string;
      color_variante: string | null;
      producto: { id: string; codigo: string; nombre: string } | null;
    };
    const v = varRow as unknown as VarRaw;
    if (!v.producto) throw new Error('Variante sin producto asociado');

    // Stock por almacén
    const { data: stockRows } = await sb
      .from('stock_actual')
      .select('cantidad, almacen:almacen_id(id, codigo, nombre)')
      .eq('variante_id', varianteId);

    type StockRow = { cantidad: string | number; almacen: AlmacenLite };
    const stock_por_almacen = ((stockRows ?? []) as unknown as StockRow[])
      .filter((s) => s.almacen != null)
      .map((s) => ({
        almacen_id: s.almacen!.id,
        codigo: s.almacen!.codigo,
        nombre: s.almacen!.nombre,
        cantidad: Number(s.cantidad),
      }));

    // Lotes activos
    const { data: lotesRows } = await sb
      .from('lotes_pt')
      .select('id, codigo, cantidad_actual, cantidad_inicial, fecha_produccion, estado, almacen_actual:almacen_actual(codigo)')
      .eq('variante_id', varianteId)
      .order('fecha_ingreso', { ascending: false })
      .limit(50);
    type LoteRow = {
      id: string;
      codigo: string;
      cantidad_actual: number;
      cantidad_inicial: number;
      fecha_produccion: string | null;
      estado: string;
      almacen_actual: { codigo: string } | null;
    };
    const lotes_activos = ((lotesRows ?? []) as unknown as LoteRow[]).map((l) => ({
      id: l.id,
      codigo: l.codigo,
      cantidad_actual: l.cantidad_actual,
      cantidad_inicial: l.cantidad_inicial,
      fecha_produccion: l.fecha_produccion,
      almacen_codigo: l.almacen_actual?.codigo ?? null,
      estado: l.estado,
    }));

    const variante: VarianteDetalle = {
      id: v.id,
      sku: v.sku,
      talla: v.talla,
      color: v.color_variante,
      producto: v.producto,
      stock_por_almacen,
      lotes_activos,
    };

    // 1) kardex de la variante
    let qKardex = sb
      .from('kardex_movimientos')
      .select(SELECT_KARDEX)
      .eq('variante_id', varianteId)
      .order('fecha', { ascending: false })
      .limit(f.limite);
    if (f.desde) qKardex = qKardex.gte('fecha', `${f.desde}T00:00:00`);
    if (f.hasta) qKardex = qKardex.lte('fecha', `${f.hasta}T23:59:59`);
    const { data: kardexRows, error: kardexErr } = await qKardex;
    if (kardexErr) throw new Error(kardexErr.message);

    // 2) trazabilidad_eventos por variante
    let qTraza = sb
      .from('trazabilidad_eventos')
      .select(SELECT_TRAZA)
      .eq('variante_id', varianteId)
      .order('fecha', { ascending: false })
      .limit(f.limite);
    if (f.desde) qTraza = qTraza.gte('fecha', `${f.desde}T00:00:00`);
    if (f.hasta) qTraza = qTraza.lte('fecha', `${f.hasta}T23:59:59`);
    const { data: trazaRows, error: trazaErr } = await qTraza;
    if (trazaErr) throw new Error(trazaErr.message);

    // 3) controles_calidad del producto (luego se puede afinar por talla en cliente)
    const { data: ccRows } = await sb
      .from('controles_calidad')
      .select(SELECT_CALIDAD)
      .eq('producto_id', v.producto.id)
      .order('fecha', { ascending: false })
      .limit(50);

    const eventos: TrazaEvento[] = [
      ...((kardexRows ?? []) as unknown as KardexRowRaw[]).map(mapKardexEvento),
      ...((trazaRows ?? []) as unknown as TrazaRowRaw[]).map(mapTrazaEvento),
      ...((ccRows ?? []) as unknown as CalidadRowRaw[]).map(mapCalidadEvento),
    ];

    return { variante, eventos: ordenarPorFecha(eventos).reverse().slice(0, f.limite) };
  });
}

// ---------------------------------------------------------------------------
// historicoOT
// ---------------------------------------------------------------------------

export async function historicoOT(
  otId: string,
): Promise<ActionResult<{ ot: OTDetalle; eventos: TrazaEvento[] }>> {
  return runAction(async () => {
    if (!otId) throw new Error('OT requerida');
    const { sb } = await requireUser();

    const { data: otRow, error: otErr } = await sb
      .from('ot')
      .select(
        'id, numero, estado, fecha_apertura, fecha_cierre, fecha_entrega_objetivo, observacion, ' +
          'almacen_produccion:almacen_produccion(id, codigo, nombre)',
      )
      .eq('id', otId)
      .maybeSingle();
    if (otErr) throw new Error(otErr.message);
    if (!otRow) throw new Error('OT no encontrada');

    type OtRaw = {
      id: string;
      numero: string;
      estado: string;
      fecha_apertura: string | null;
      fecha_cierre: string | null;
      fecha_entrega_objetivo: string | null;
      observacion: string | null;
      almacen_produccion: AlmacenLite;
    };
    const o = otRow as unknown as OtRaw;

    // Líneas + producto
    const { data: lineasRows } = await sb
      .from('ot_lineas')
      .select('producto_id, talla, cantidad_planificada, cantidad_terminada, producto:producto_id(id, codigo, nombre)')
      .eq('ot_id', otId);
    type LineaRaw = {
      producto_id: string;
      talla: string;
      cantidad_planificada: number;
      cantidad_terminada: number | null;
      producto: { id: string; codigo: string; nombre: string } | null;
    };
    const lineasArr = ((lineasRows ?? []) as unknown as LineaRaw[]);
    const lineas = lineasArr.map((l) => ({
      producto_id: l.producto_id,
      talla: l.talla,
      cantidad_planificada: l.cantidad_planificada,
      cantidad_terminada: l.cantidad_terminada ?? 0,
    }));
    const productoPrincipal = lineasArr.find((l) => l.producto)?.producto ?? null;

    // Lotes generados por la OT
    const { data: lotesRows } = await sb
      .from('lotes_pt')
      .select('id, codigo, cantidad_inicial, cantidad_actual, variante:variante_id(sku)')
      .eq('ot_id', otId)
      .order('created_at', { ascending: true });
    type LoteRow = {
      id: string;
      codigo: string;
      cantidad_inicial: number;
      cantidad_actual: number;
      variante: { sku: string } | null;
    };
    const lotes_generados = ((lotesRows ?? []) as unknown as LoteRow[]).map((l) => ({
      id: l.id,
      codigo: l.codigo,
      cantidad_inicial: l.cantidad_inicial,
      cantidad_actual: l.cantidad_actual,
      variante_sku: l.variante?.sku ?? '—',
    }));

    const ot: OTDetalle = {
      id: o.id,
      numero: o.numero,
      estado: o.estado,
      fecha_apertura: o.fecha_apertura,
      fecha_cierre: o.fecha_cierre,
      fecha_entrega_objetivo: o.fecha_entrega_objetivo,
      observacion: o.observacion,
      producto: productoPrincipal,
      almacen_produccion: o.almacen_produccion,
      lineas,
      lotes_generados,
    };

    // 1) ot_eventos
    const { data: otEvRows } = await sb
      .from('ot_eventos')
      .select(SELECT_OT_EVENTO)
      .eq('ot_id', otId)
      .order('fecha', { ascending: true });

    // 2) ot_corte
    const { data: corteRows } = await sb
      .from('ot_corte')
      .select('id, numero, fecha_inicio, fecha_fin, estado, observacion, responsable_operario:responsable_operario_id(id, nombres, apellido_paterno)')
      .eq('ot_id', otId);
    type CorteRow = {
      id: string;
      numero: string;
      fecha_inicio: string | null;
      fecha_fin: string | null;
      estado: string;
      observacion: string | null;
      responsable_operario: OperarioLite;
    };
    const corteEventos: TrazaEvento[] = ((corteRows ?? []) as unknown as CorteRow[]).flatMap((c) => {
      const evs: TrazaEvento[] = [];
      if (c.fecha_inicio) {
        evs.push(
          vacioEvento({
            id: `corte-ini:${c.id}`,
            fuente: 'CORTE',
            fecha: c.fecha_inicio,
            titulo: `Corte ${c.numero} iniciado`,
            subtipo: 'INICIO',
            detalle: c.observacion,
            operario: c.responsable_operario,
            ot: { id: ot.id, numero: ot.numero },
          }),
        );
      }
      if (c.fecha_fin) {
        evs.push(
          vacioEvento({
            id: `corte-fin:${c.id}`,
            fuente: 'CORTE',
            fecha: c.fecha_fin,
            titulo: `Corte ${c.numero} ${c.estado}`,
            subtipo: 'FIN',
            detalle: c.observacion,
            operario: c.responsable_operario,
            ot: { id: ot.id, numero: ot.numero },
          }),
        );
      }
      return evs;
    });

    // 3) ordenes_servicio
    const { data: osRows } = await sb
      .from('ordenes_servicio')
      .select(
        'id, numero, fecha_emision, fecha_recepcion, estado, observaciones, ' +
          'taller:taller_id(id, nombre)',
      )
      .eq('ot_id', otId);
    type OsRow = {
      id: string;
      numero: string;
      fecha_emision: string | null;
      fecha_recepcion: string | null;
      estado: string;
      observaciones: string | null;
      taller: TallerLite;
    };
    const osEventos: TrazaEvento[] = ((osRows ?? []) as unknown as OsRow[]).flatMap((s) => {
      const evs: TrazaEvento[] = [];
      if (s.fecha_emision) {
        evs.push(
          vacioEvento({
            id: `os-em:${s.id}`,
            fuente: 'OS',
            fecha: `${s.fecha_emision}T00:00:00`,
            titulo: `OS ${s.numero} emitida`,
            subtipo: 'EMISION',
            detalle: s.observaciones,
            taller: s.taller,
            ot: { id: ot.id, numero: ot.numero },
          }),
        );
      }
      if (s.fecha_recepcion) {
        evs.push(
          vacioEvento({
            id: `os-rec:${s.id}`,
            fuente: 'OS',
            fecha: `${s.fecha_recepcion}T00:00:00`,
            titulo: `OS ${s.numero} recepcionada`,
            subtipo: 'RECEPCION',
            detalle: s.observaciones,
            taller: s.taller,
            ot: { id: ot.id, numero: ot.numero },
          }),
        );
      }
      return evs;
    });

    // 4) kardex por referencia OT
    const { data: kardexRows } = await sb
      .from('kardex_movimientos')
      .select(SELECT_KARDEX)
      .eq('referencia_tipo', 'OT')
      .eq('referencia_id', otId)
      .order('fecha', { ascending: true })
      .limit(MAX_EVENTOS);

    // 5) controles_calidad por ot_id
    const { data: ccRows } = await sb
      .from('controles_calidad')
      .select(SELECT_CALIDAD)
      .eq('ot_id', otId)
      .order('fecha', { ascending: true });

    const eventos: TrazaEvento[] = [
      ...((otEvRows ?? []) as unknown as OtEventoRowRaw[]).map(mapOtEvento),
      ...corteEventos,
      ...osEventos,
      ...((kardexRows ?? []) as unknown as KardexRowRaw[]).map(mapKardexEvento),
      ...((ccRows ?? []) as unknown as CalidadRowRaw[]).map(mapCalidadEvento),
    ];

    return { ot, eventos: ordenarPorFecha(eventos).slice(0, MAX_EVENTOS) };
  });
}

// ---------------------------------------------------------------------------
// buscarEntidad
// ---------------------------------------------------------------------------

export async function buscarEntidad(query: string): Promise<ActionResult<BusquedaResultado[]>> {
  return runAction(async () => {
    const q = (query ?? '').trim();
    if (q.length < 2) return [];
    const { sb } = await requireUser();

    const pattern = `%${q}%`;
    const upper = q.toUpperCase();

    // Búsqueda en paralelo (max ~7 por fuente para no inflar resultados)
    const [lotesRes, varsRes, otsRes, otsByNumberRes] = await Promise.all([
      sb
        .from('lotes_pt')
        .select('id, codigo, cantidad_actual, variante:variante_id(sku, producto:producto_id(nombre))')
        .ilike('codigo', pattern)
        .limit(7),
      sb
        .from('productos_variantes')
        .select('id, sku, talla, producto:producto_id(nombre, codigo)')
        .or(`sku.ilike.${pattern},codigo_barras.ilike.${pattern}`)
        .limit(7),
      sb
        .from('ot')
        .select('id, numero, estado')
        .ilike('numero', pattern)
        .limit(7),
      // Permite "234" → "OT-000234"
      sb
        .from('ot')
        .select('id, numero, estado')
        .ilike('numero', `%${upper.replace(/^OT-?/, '')}%`)
        .limit(5),
    ]);

    const out: BusquedaResultado[] = [];

    type LoteB = { id: string; codigo: string; cantidad_actual: number; variante: { sku: string; producto: { nombre: string } | null } | null };
    for (const l of ((lotesRes.data ?? []) as unknown as LoteB[])) {
      out.push({
        tipo: 'LOTE',
        id: l.id,
        codigo: l.codigo,
        descripcion: `${l.variante?.producto?.nombre ?? 'Producto'} · ${l.variante?.sku ?? ''} · stock ${l.cantidad_actual}`,
        href: `/trazabilidad/lote/${encodeURIComponent(l.codigo)}`,
      });
    }

    type VarB = { id: string; sku: string; talla: string; producto: { nombre: string; codigo: string } | null };
    for (const v of ((varsRes.data ?? []) as unknown as VarB[])) {
      out.push({
        tipo: 'VARIANTE',
        id: v.id,
        codigo: v.sku,
        descripcion: `${v.producto?.nombre ?? 'Producto'} · talla ${v.talla.replace('T', '')}`,
        href: `/trazabilidad/variante/${v.id}`,
      });
    }

    const seen = new Set<string>();
    type OtB = { id: string; numero: string; estado: string };
    for (const o of [...((otsRes.data ?? []) as unknown as OtB[]), ...((otsByNumberRes.data ?? []) as unknown as OtB[])]) {
      if (seen.has(o.id)) continue;
      seen.add(o.id);
      out.push({
        tipo: 'OT',
        id: o.id,
        codigo: o.numero,
        descripcion: `Orden de trabajo · ${o.estado.replace(/_/g, ' ')}`,
        href: `/trazabilidad/ot/${o.id}`,
      });
    }

    return out.slice(0, 20);
  });
}

// ---------------------------------------------------------------------------
// listarEventosTraza
// ---------------------------------------------------------------------------

const listarSchema = z.object({
  tipo: z.string().optional().or(z.literal('')),
  fecha_desde: z.string().optional().or(z.literal('')),
  fecha_hasta: z.string().optional().or(z.literal('')),
  pagina: z.coerce.number().int().min(1).default(1),
  por_pagina: z.coerce.number().int().min(10).max(200).default(50),
});

export type EventoTrazaListado = {
  id: number;
  fecha: string;
  tipo: string;
  cantidad: number | null;
  observacion: string | null;
  lote: { id: string; codigo: string } | null;
  variante: { id: string; sku: string; producto_nombre: string } | null;
  almacen_origen: { codigo: string } | null;
  almacen_destino: { codigo: string } | null;
  ot: { id: string; numero: string } | null;
  cliente: { id: string; razon_social: string | null; nombres: string | null } | null;
};

export async function listarEventosTraza(
  input: z.input<typeof listarSchema>,
): Promise<
  ActionResult<{ rows: EventoTrazaListado[]; total: number; pagina: number; por_pagina: number }>
> {
  return runAction(async () => {
    const data = listarSchema.parse(input);
    const { sb } = await requireUser();

    let q = sb
      .from('trazabilidad_eventos')
      .select(
        'id, fecha, tipo, cantidad, observacion, ' +
          'lote:lote_pt_id(id, codigo), ' +
          'variante:variante_id(id, sku, producto:producto_id(nombre)), ' +
          'almacen_origen:almacen_origen(codigo), ' +
          'almacen_destino:almacen_destino(codigo), ' +
          'ot:ot_id(id, numero), ' +
          'cliente:cliente_id(id, razon_social, nombres)',
        { count: 'exact' },
      )
      .order('fecha', { ascending: false })
      .order('id', { ascending: false });

    if (data.tipo) q = q.eq('tipo', data.tipo);
    if (data.fecha_desde) q = q.gte('fecha', `${data.fecha_desde}T00:00:00`);
    if (data.fecha_hasta) q = q.lte('fecha', `${data.fecha_hasta}T23:59:59`);

    const offset = (data.pagina - 1) * data.por_pagina;
    q = q.range(offset, offset + data.por_pagina - 1);

    const { data: rows, count, error } = await q;
    if (error) throw new Error(error.message);

    type Row = {
      id: number;
      fecha: string;
      tipo: string;
      cantidad: number | null;
      observacion: string | null;
      lote: { id: string; codigo: string } | null;
      variante: { id: string; sku: string; producto: { nombre: string } | null } | null;
      almacen_origen: { codigo: string } | null;
      almacen_destino: { codigo: string } | null;
      ot: { id: string; numero: string } | null;
      cliente: { id: string; razon_social: string | null; nombres: string | null } | null;
    };

    const mapped: EventoTrazaListado[] = ((rows ?? []) as unknown as Row[]).map((r) => ({
      id: r.id,
      fecha: r.fecha,
      tipo: r.tipo,
      cantidad: r.cantidad,
      observacion: r.observacion,
      lote: r.lote,
      variante: r.variante
        ? { id: r.variante.id, sku: r.variante.sku, producto_nombre: r.variante.producto?.nombre ?? '—' }
        : null,
      almacen_origen: r.almacen_origen,
      almacen_destino: r.almacen_destino,
      ot: r.ot,
      cliente: r.cliente,
    }));

    return {
      rows: mapped,
      total: Number(count ?? 0),
      pagina: data.pagina,
      por_pagina: data.por_pagina,
    };
  });
}

// ---------------------------------------------------------------------------
// Stats mini-dashboard
// ---------------------------------------------------------------------------

export type TrazaStats = {
  lotes_activos: number;
  eventos_hoy: number;
  eventos_semana: number;
};

export async function trazaStats(): Promise<ActionResult<TrazaStats>> {
  return runAction(async () => {
    const { sb } = await requireUser();
    const ahora = new Date();
    const hoyIso = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()).toISOString();
    const hace7 = new Date(ahora.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [lotesQ, hoyQ, semQ] = await Promise.all([
      sb
        .from('lotes_pt')
        .select('id', { count: 'exact', head: true })
        .in('estado', ['DISPONIBLE', 'EN_TRASLADO', 'RESERVADO']),
      sb
        .from('trazabilidad_eventos')
        .select('id', { count: 'exact', head: true })
        .gte('fecha', hoyIso),
      sb
        .from('trazabilidad_eventos')
        .select('id', { count: 'exact', head: true })
        .gte('fecha', hace7),
    ]);

    return {
      lotes_activos: Number(lotesQ.count ?? 0),
      eventos_hoy: Number(hoyQ.count ?? 0),
      eventos_semana: Number(semQ.count ?? 0),
    };
  });
}
