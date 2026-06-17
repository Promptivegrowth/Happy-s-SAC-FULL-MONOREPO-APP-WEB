'use server';

/**
 * Acciones de servidor para CAJA + COMPROBANTES (POS).
 *
 * - Apertura/cierre de sesión de caja MANUAL (sin auto-apertura).
 * - Balance en vivo por sesión activa.
 * - Excel brandeado del cierre.
 * - Emisión de comprobante (sólo registra en BD; SUNAT real fuera de scope).
 *
 * NOTA: como este archivo es 'use server', todos los exports son async.
 * Constantes / tipos viven en `caja-helpers.ts`.
 */

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import ExcelJS from 'exceljs';
import { createClient } from '@happy/db/server';
import {
  BRAND,
  type SesionCajaDTO,
  type BalanceCajaDTO,
  type ComprobantePDFData,
  type TipoComprobantePOS,
  type TipoDocumentoCliente,
  metodoLabel,
} from './caja-helpers';

// ============================================================================
// HELPERS internos (no exportados — válido en archivo 'use server')
// ============================================================================

type ServerClient = Awaited<ReturnType<typeof createClient>>;

async function requireUser(sb: ServerClient) {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error('No autenticado');
  return user;
}

async function getCajaDefault(sb: ServerClient, userId: string) {
  const { data: perfil } = await sb
    .from('perfiles')
    .select('caja_default, nombre_completo')
    .eq('id', userId)
    .single();
  if (!perfil?.caja_default) {
    throw new Error(
      'Tu usuario no tiene una caja asignada. Pídele a un administrador que configure tu "caja default" en el perfil.',
    );
  }
  const { data: caja } = await sb
    .from('cajas')
    .select('id, codigo, nombre, almacen_id, monto_apertura_default, serie_boleta, serie_factura, serie_nota_venta')
    .eq('id', perfil.caja_default)
    .single();
  if (!caja) throw new Error('La caja asignada al usuario no existe o fue desactivada.');
  return { caja, cajeroNombre: perfil.nombre_completo ?? 'Cajero' };
}

function fmtNumero(n: number, padding = 8): string {
  return String(n).padStart(padding, '0');
}

// ============================================================================
// ABRIR SESIÓN
// ============================================================================

const abrirSchema = z.object({
  monto_apertura: z.number().min(0),
  caja_id: z.string().uuid().optional().nullable(),
  observacion: z.string().max(500).optional().nullable(),
});

export async function abrirSesion(input: {
  monto_apertura: number;
  caja_id?: string | null;
  observacion?: string | null;
}) {
  const parsed = abrirSchema.parse(input);
  const sb = await createClient();
  const user = await requireUser(sb);

  // Resolución de caja:
  //   1) Si viene caja_id explícita, usar esa (y guardarla como caja_default)
  //   2) Si no, usar caja_default del perfil
  //   3) Si no hay ninguna → error claro pidiendo asignación
  let cajaId = parsed.caja_id ?? null;
  if (!cajaId) {
    const { data: perfil } = await sb.from('perfiles').select('caja_default').eq('id', user.id).single();
    cajaId = perfil?.caja_default ?? null;
  }
  if (!cajaId) {
    throw new Error(
      'Tu usuario no tiene caja asignada. Elegí una caja en el modal o pedí al admin que la configure.',
    );
  }

  const { data: caja, error: errCaja } = await sb
    .from('cajas')
    .select('id, codigo, nombre, almacen_id, monto_apertura_default')
    .eq('id', cajaId)
    .eq('activo', true)
    .single();
  if (errCaja || !caja) throw new Error('La caja indicada no existe o está inactiva.');

  // Validar que NO haya otra sesión abierta para esta caja
  const { data: abierta } = await sb
    .from('cajas_sesiones')
    .select('id, abierta_por')
    .eq('caja_id', caja.id)
    .is('cerrada_en', null)
    .maybeSingle();
  if (abierta) {
    if (abierta.abierta_por === user.id) {
      throw new Error('Ya tienes una sesión abierta en esta caja.');
    }
    throw new Error('Esta caja ya tiene una sesión abierta por otro usuario. Pídele que la cierre primero.');
  }

  const { data: nueva, error } = await sb
    .from('cajas_sesiones')
    .insert({
      caja_id: caja.id,
      abierta_por: user.id,
      monto_apertura: parsed.monto_apertura,
      observaciones: parsed.observacion ?? null,
    })
    .select('id')
    .single();
  if (error) throw new Error(`No se pudo abrir caja: ${error.message}`);

  // Si el cajero eligió manualmente una caja distinta a su default, persistirla
  // como nuevo default para no tener que elegirla la próxima vez.
  if (parsed.caja_id) {
    await sb.from('perfiles').update({ caja_default: caja.id }).eq('id', user.id);
  }

  revalidatePath('/venta');
  return { id: nueva.id, caja_nombre: caja.nombre };
}

// ============================================================================
// OBTENER SESIÓN ACTIVA (con balance en vivo)
// ============================================================================

export async function obtenerSesionActiva(): Promise<
  | { sesion: SesionCajaDTO; balance: BalanceCajaDTO }
  | null
> {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;

  let caja: Awaited<ReturnType<typeof getCajaDefault>>['caja'];
  let cajeroNombre: string;
  try {
    const r = await getCajaDefault(sb, user.id);
    caja = r.caja;
    cajeroNombre = r.cajeroNombre;
  } catch {
    return null;
  }

  const { data: sesion } = await sb
    .from('cajas_sesiones')
    .select('id, caja_id, abierta_en, abierta_por, monto_apertura, observaciones')
    .eq('caja_id', caja.id)
    .is('cerrada_en', null)
    .maybeSingle();

  if (!sesion) return null;

  const balance = await calcularBalanceInterno(sb, sesion.id, Number(sesion.monto_apertura ?? 0));

  return {
    sesion: {
      id: sesion.id,
      caja_id: caja.id,
      caja_nombre: caja.nombre,
      caja_codigo: caja.codigo,
      almacen_id: caja.almacen_id,
      abierta_en: sesion.abierta_en,
      abierta_por: sesion.abierta_por,
      cajero_nombre: cajeroNombre,
      monto_apertura: Number(sesion.monto_apertura ?? 0),
      observaciones: sesion.observaciones,
    },
    balance,
  };
}

// ============================================================================
// BALANCE EN VIVO (para refresco rápido en el modal de cierre)
// ============================================================================

export async function balanceCajaActiva(): Promise<BalanceCajaDTO | null> {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;

  let caja: Awaited<ReturnType<typeof getCajaDefault>>['caja'];
  try {
    caja = (await getCajaDefault(sb, user.id)).caja;
  } catch {
    return null;
  }

  const { data: sesion } = await sb
    .from('cajas_sesiones')
    .select('id, monto_apertura')
    .eq('caja_id', caja.id)
    .is('cerrada_en', null)
    .maybeSingle();
  if (!sesion) return null;

  return calcularBalanceInterno(sb, sesion.id, Number(sesion.monto_apertura ?? 0));
}

async function calcularBalanceInterno(
  sb: ServerClient,
  sesionId: string,
  montoApertura: number,
): Promise<BalanceCajaDTO> {
  const { data: ventas } = await sb
    .from('ventas')
    .select('id, total')
    .eq('caja_sesion_id', sesionId)
    .eq('estado', 'COMPLETADA');

  const ventaIds = (ventas ?? []).map((v) => v.id);
  const totalVentas = (ventas ?? []).reduce((a, v) => a + Number(v.total ?? 0), 0);

  let efectivo = 0, yape = 0, plin = 0, tarjeta = 0, transferencia = 0, otros = 0;

  if (ventaIds.length > 0) {
    const { data: pagos } = await sb
      .from('ventas_pagos')
      .select('metodo, monto')
      .in('venta_id', ventaIds);
    for (const p of pagos ?? []) {
      const monto = Number(p.monto ?? 0);
      const m = String(p.metodo);
      if (m === 'EFECTIVO') efectivo += monto;
      else if (m === 'YAPE') yape += monto;
      else if (m === 'PLIN') plin += monto;
      else if (m.startsWith('TARJETA')) tarjeta += monto;
      else if (m === 'TRANSFERENCIA') transferencia += monto;
      else otros += monto;
    }
  }

  return {
    total_efectivo: efectivo,
    total_yape: yape,
    total_plin: plin,
    total_tarjeta: tarjeta,
    total_transferencia: transferencia,
    total_otros: otros,
    total_ventas: totalVentas,
    cantidad_ventas: (ventas ?? []).length,
    monto_apertura: montoApertura,
    esperado_efectivo: montoApertura + efectivo,
  };
}

// ============================================================================
// CERRAR SESIÓN
// ============================================================================

// ============================================================================
// HISTORIAL DE TRANSACCIONES DE LA SESIÓN ACTIVA DEL CAJERO
// ============================================================================
export type TransaccionRow = {
  venta_id: string;
  numero_venta: string;
  fecha: string;
  cliente_nombre: string;
  cliente_doc: string | null;
  cliente_telefono: string | null;
  total: number;
  metodos: string[];
  comprobante: { tipo: string; numero_completo: string } | null;
  estado: string;
};

export async function obtenerHistorialSesion(): Promise<TransaccionRow[]> {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return [];

  let caja: Awaited<ReturnType<typeof getCajaDefault>>['caja'];
  try {
    caja = (await getCajaDefault(sb, user.id)).caja;
  } catch {
    return [];
  }

  const { data: sesion } = await sb
    .from('cajas_sesiones')
    .select('id')
    .eq('caja_id', caja.id)
    .is('cerrada_en', null)
    .maybeSingle();
  if (!sesion) return [];

  const { data: ventas } = await sb
    .from('ventas')
    .select(
      'id, numero, fecha, total, estado, nombre_cliente_rapido, documento_cliente, ' +
        'cliente:cliente_id(razon_social, nombres, apellido_paterno, apellido_materno, telefono)',
    )
    .eq('caja_sesion_id', sesion.id)
    .order('fecha', { ascending: false })
    .limit(500);

  type VR = {
    id: string;
    numero: string;
    fecha: string;
    total: string | number;
    estado: string;
    nombre_cliente_rapido: string | null;
    documento_cliente: string | null;
    cliente: {
      razon_social: string | null;
      nombres: string | null;
      apellido_paterno: string | null;
      apellido_materno: string | null;
      telefono: string | null;
    } | null;
  };
  const filas = (ventas ?? []) as unknown as VR[];
  const ids = filas.map((v) => v.id);

  // Pagos
  const pagosPorVenta = new Map<string, string[]>();
  if (ids.length > 0) {
    const { data: pagos } = await sb
      .from('ventas_pagos')
      .select('venta_id, metodo')
      .in('venta_id', ids);
    for (const p of (pagos ?? []) as { venta_id: string; metodo: string }[]) {
      const arr = pagosPorVenta.get(p.venta_id) ?? [];
      arr.push(p.metodo);
      pagosPorVenta.set(p.venta_id, arr);
    }
  }

  // Comprobantes
  const compPorVenta = new Map<string, { tipo: string; numero_completo: string }>();
  if (ids.length > 0) {
    const { data: comps } = await sb
      .from('comprobantes')
      .select('venta_id, tipo, numero_completo')
      .in('venta_id', ids)
      .order('created_at', { ascending: false });
    for (const c of (comps ?? []) as { venta_id: string; tipo: string; numero_completo: string }[]) {
      if (!compPorVenta.has(c.venta_id)) {
        compPorVenta.set(c.venta_id, { tipo: c.tipo, numero_completo: c.numero_completo });
      }
    }
  }

  return filas.map((v) => {
    const nombreCli =
      v.cliente?.razon_social ||
      [v.cliente?.nombres, v.cliente?.apellido_paterno, v.cliente?.apellido_materno].filter(Boolean).join(' ').trim() ||
      v.nombre_cliente_rapido ||
      'CLIENTE VARIOS';
    return {
      venta_id: v.id,
      numero_venta: v.numero,
      fecha: v.fecha,
      cliente_nombre: nombreCli,
      cliente_doc: v.documento_cliente,
      cliente_telefono: v.cliente?.telefono ?? null,
      total: Number(v.total ?? 0),
      metodos: Array.from(new Set(pagosPorVenta.get(v.id) ?? [])),
      comprobante: compPorVenta.get(v.id) ?? null,
      estado: v.estado,
    };
  });
}

const cerrarSchema = z.object({
  monto_contado_efectivo: z.number().min(0),
  observacion: z.string().max(500).optional().nullable(),
});

export async function cerrarSesion(input: { monto_contado_efectivo: number; observacion?: string | null }) {
  const parsed = cerrarSchema.parse(input);
  const sb = await createClient();
  const user = await requireUser(sb);
  const { caja } = await getCajaDefault(sb, user.id);

  const { data: sesion } = await sb
    .from('cajas_sesiones')
    .select('id, monto_apertura, observaciones')
    .eq('caja_id', caja.id)
    .is('cerrada_en', null)
    .maybeSingle();
  if (!sesion) throw new Error('No hay sesión de caja abierta para cerrar.');

  const balance = await calcularBalanceInterno(sb, sesion.id, Number(sesion.monto_apertura ?? 0));
  const diferencia = parsed.monto_contado_efectivo - balance.esperado_efectivo;

  const observacionesFinal = [sesion.observaciones, parsed.observacion]
    .filter(Boolean)
    .join('\n---\n') || null;

  const { error } = await sb
    .from('cajas_sesiones')
    .update({
      cerrada_por: user.id,
      cerrada_en: new Date().toISOString(),
      monto_cierre_efectivo: parsed.monto_contado_efectivo,
      monto_esperado_efectivo: balance.esperado_efectivo,
      diferencia,
      total_efectivo: balance.total_efectivo,
      total_yape: balance.total_yape,
      total_plin: balance.total_plin,
      total_tarjeta: balance.total_tarjeta,
      total_transferencia: balance.total_transferencia,
      total_otros: balance.total_otros,
      observaciones: observacionesFinal,
    })
    .eq('id', sesion.id);
  if (error) throw new Error(`No se pudo cerrar caja: ${error.message}`);

  revalidatePath('/venta');
  return {
    id: sesion.id,
    diferencia,
    esperado: balance.esperado_efectivo,
    contado: parsed.monto_contado_efectivo,
    balance,
  };
}

// ============================================================================
// EXCEL DEL CIERRE (brandeado)
// ============================================================================

export async function generarExcelCierre(sesionId: string): Promise<{ base64: string; filename: string; mime: string }> {
  const sb = await createClient();
  await requireUser(sb);

  // Cargar sesión (cajas tiene FK, perfiles NO — los traemos en query separada)
  const { data: sesion, error: errSesion } = await sb
    .from('cajas_sesiones')
    .select(`
      id, caja_id, abierta_en, cerrada_en, abierta_por, cerrada_por,
      monto_apertura, monto_cierre_efectivo,
      monto_esperado_efectivo, diferencia, observaciones,
      total_efectivo, total_yape, total_plin, total_tarjeta, total_transferencia, total_otros,
      cajas:caja_id ( id, nombre, codigo )
    `)
    .eq('id', sesionId)
    .single();
  if (errSesion || !sesion) throw new Error('Sesión no encontrada.');

  const { data: empresa } = await sb
    .from('empresa')
    .select('razon_social, nombre_comercial, ruc, direccion_fiscal, telefono, email, logo_url')
    .maybeSingle();

  // Nombres de cajeros (sin FK declarada — query separada)
  const userIds = [sesion.abierta_por, sesion.cerrada_por].filter((x): x is string => !!x);
  const perfilesById = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: perfiles } = await sb
      .from('perfiles')
      .select('id, nombre_completo')
      .in('id', userIds);
    for (const p of perfiles ?? []) perfilesById.set(p.id, p.nombre_completo ?? '');
  }

  // Ventas (vendedor sin FK declarada — lo resolvemos por separado)
  const { data: ventasRaw } = await sb
    .from('ventas')
    .select(`
      id, numero, fecha, total, sub_total, igv, vendedor_usuario_id,
      nombre_cliente_rapido, documento_cliente, comprobante_id
    `)
    .eq('caja_sesion_id', sesionId)
    .eq('estado', 'COMPLETADA')
    .order('fecha', { ascending: true });

  const ventas = ventasRaw ?? [];
  const ventaIds = ventas.map((v) => v.id);
  const compIds = ventas.map((v) => v.comprobante_id).filter((x): x is string => !!x);
  const vendIds = Array.from(new Set(ventas.map((v) => v.vendedor_usuario_id).filter((x): x is string => !!x)));

  const compByIdMap = new Map<string, { tipo: string; serie: string | null; numero: number | null; numero_completo: string | null }>();
  if (compIds.length > 0) {
    const { data: comps } = await sb
      .from('comprobantes')
      .select('id, tipo, serie, numero, numero_completo')
      .in('id', compIds);
    for (const c of comps ?? []) {
      compByIdMap.set(c.id, { tipo: c.tipo, serie: c.serie, numero: c.numero, numero_completo: c.numero_completo });
    }
  }

  const vendByIdMap = new Map<string, string>();
  if (vendIds.length > 0) {
    const { data: perfiles } = await sb
      .from('perfiles')
      .select('id, nombre_completo')
      .in('id', vendIds);
    for (const p of perfiles ?? []) vendByIdMap.set(p.id, p.nombre_completo ?? '');
  }

  const pagosByVenta = new Map<string, { metodo: string; monto: number }[]>();
  if (ventaIds.length > 0) {
    const { data: pagos } = await sb
      .from('ventas_pagos')
      .select('venta_id, metodo, monto')
      .in('venta_id', ventaIds);
    for (const p of pagos ?? []) {
      const arr = pagosByVenta.get(p.venta_id as string) ?? [];
      arr.push({ metodo: String(p.metodo), monto: Number(p.monto ?? 0) });
      pagosByVenta.set(p.venta_id as string, arr);
    }
  }

  // Helpers para la unión de FKs (Supabase puede devolver array o objeto)
  type MaybeOne<T> = T | T[] | null;
  const pickOne = <T>(v: MaybeOne<T>): T | null =>
    Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

  const caja = pickOne(sesion.cajas as MaybeOne<{ id: string; nombre: string; codigo: string }>);
  const abridorNombre = sesion.abierta_por ? perfilesById.get(sesion.abierta_por) ?? null : null;
  const cerradorNombre = sesion.cerrada_por ? perfilesById.get(sesion.cerrada_por) ?? null : null;

  const totalVentas = ventas.reduce((a, v) => a + Number(v.total ?? 0), 0);
  const totalIgv = ventas.reduce((a, v) => a + Number(v.igv ?? 0), 0);

  // ---- Construir workbook ----
  const wb = new ExcelJS.Workbook();
  wb.creator = empresa?.razon_social ?? 'HAPPY SAC';
  wb.created = new Date();
  const ws = wb.addWorksheet('Cierre de caja', {
    pageSetup: { paperSize: 9, orientation: 'portrait', margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 } },
  });

  // Anchos generosos (10 columnas para que entre el detalle de ventas)
  const COLS = 10;
  ws.columns = Array.from({ length: COLS }, (_, i) => ({ key: `c${i + 1}`, width: i === 0 ? 6 : 14 }));

  // ---- Logo (si está disponible y es URL pública) ----
  let row = 1;
  let logoHeight = 0;
  if (empresa?.logo_url) {
    try {
      const resp = await fetch(empresa.logo_url);
      if (resp.ok) {
        const ab = await resp.arrayBuffer();
        const ext = (empresa.logo_url.split('.').pop() ?? 'png').toLowerCase();
        const extension: 'png' | 'jpeg' | 'gif' = ext === 'jpg' || ext === 'jpeg' ? 'jpeg' : ext === 'gif' ? 'gif' : 'png';
        // ExcelJS espera un Buffer "clásico" — castamos para evitar el clash
        // de tipos Buffer<ArrayBuffer> en TS estricto.
        const buf = Buffer.from(ab) as unknown as Parameters<typeof wb.addImage>[0]['buffer'];
        const imgId = wb.addImage({ buffer: buf, extension });
        ws.addImage(imgId, { tl: { col: 0, row: 0 }, ext: { width: 120, height: 60 } });
        logoHeight = 60;
      }
    } catch {
      // si falla, seguimos sin logo
    }
  }

  // Cabecera con título brandeado (a la derecha si hay logo)
  ws.mergeCells(row, logoHeight ? 2 : 1, row, COLS);
  const title = ws.getCell(row, logoHeight ? 2 : 1);
  title.value = empresa?.nombre_comercial || empresa?.razon_social || 'Reporte de cierre de caja';
  title.font = { name: 'Calibri', size: 18, bold: true, color: { argb: BRAND.naranja } };
  title.alignment = { vertical: 'middle', horizontal: 'left' };
  ws.getRow(row).height = 28;
  row++;

  if (empresa) {
    ws.mergeCells(row, 1, row, COLS);
    const c = ws.getCell(row, 1);
    c.value = `RUC ${empresa.ruc} · ${empresa.direccion_fiscal ?? ''}`;
    c.font = { name: 'Calibri', size: 10, color: { argb: 'FF64748B' } };
    row++;
    if (empresa.telefono || empresa.email) {
      ws.mergeCells(row, 1, row, COLS);
      const c2 = ws.getCell(row, 1);
      c2.value = [empresa.telefono, empresa.email].filter(Boolean).join(' · ');
      c2.font = { name: 'Calibri', size: 9, color: { argb: 'FF94A3B8' } };
      row++;
    }
  }

  // Asegurar altura suficiente para el logo
  if (logoHeight && ws.getRow(1).height < 50) ws.getRow(1).height = 50;
  row++;

  // ---- Subtítulo CIERRE DE CAJA ----
  ws.mergeCells(row, 1, row, COLS);
  const subtitulo = ws.getCell(row, 1);
  subtitulo.value = 'REPORTE DE CIERRE DE CAJA';
  subtitulo.font = { name: 'Calibri', size: 14, bold: true, color: { argb: BRAND.azul } };
  subtitulo.alignment = { horizontal: 'center' };
  ws.getRow(row).height = 22;
  row++;
  row++;

  // ---- DATOS DE LA SESIÓN ----
  const dataPairs: Array<[string, string]> = [
    ['Caja', caja ? `${caja.nombre} (${caja.codigo})` : '-'],
    ['Cajero (apertura)', abridorNombre ?? '-'],
    ['Apertura', new Date(sesion.abierta_en).toLocaleString('es-PE')],
    ['Cierre', sesion.cerrada_en ? new Date(sesion.cerrada_en).toLocaleString('es-PE') : 'EN CURSO'],
    ['Cajero (cierre)', cerradorNombre ?? '-'],
    ['Observaciones', sesion.observaciones ?? '-'],
  ];
  for (const [label, value] of dataPairs) {
    const lblCell = ws.getCell(row, 1);
    lblCell.value = label;
    lblCell.font = { bold: true, size: 10, color: { argb: BRAND.textoOscuro } };
    ws.mergeCells(row, 2, row, COLS);
    const valCell = ws.getCell(row, 2);
    valCell.value = value;
    valCell.font = { size: 10, color: { argb: BRAND.textoOscuro } };
    row++;
  }
  row++;

  // ---- TOTALES POR MÉTODO ----
  const metodosRows: Array<[string, number]> = [
    ['Efectivo', Number(sesion.total_efectivo ?? 0)],
    ['Yape', Number(sesion.total_yape ?? 0)],
    ['Plin', Number(sesion.total_plin ?? 0)],
    ['Tarjeta', Number(sesion.total_tarjeta ?? 0)],
    ['Transferencia', Number(sesion.total_transferencia ?? 0)],
    ['Otros', Number(sesion.total_otros ?? 0)],
  ];

  const seccionTitulo = (texto: string) => {
    ws.mergeCells(row, 1, row, COLS);
    const c = ws.getCell(row, 1);
    c.value = texto;
    c.font = { name: 'Calibri', size: 12, bold: true, color: { argb: BRAND.blanco } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND.azul } };
    c.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    ws.getRow(row).height = 22;
    row++;
  };

  seccionTitulo('TOTALES POR MÉTODO DE PAGO');
  metodosRows.forEach(([label, value], i) => {
    const c1 = ws.getCell(row, 1);
    c1.value = label;
    c1.font = { size: 10 };
    ws.mergeCells(row, 2, row, COLS - 1);
    const filler = ws.getCell(row, 2);
    filler.value = '';
    const cV = ws.getCell(row, COLS);
    cV.value = value;
    cV.numFmt = '"S/" #,##0.00';
    cV.font = { size: 10, bold: value > 0 };
    cV.alignment = { horizontal: 'right' };
    if (i % 2 === 1) {
      [c1, filler, cV].forEach((x) => {
        x.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND.bgSuave } };
      });
    }
    row++;
  });
  row++;

  // ---- RESUMEN DE VENTAS ----
  seccionTitulo('RESUMEN DE VENTAS');
  const resumenRows: Array<[string, string | number, 'moneda' | 'numero' | 'texto']> = [
    ['Cantidad de ventas', ventas.length, 'numero'],
    ['Sub-total (sin IGV)', totalVentas - totalIgv, 'moneda'],
    ['IGV', totalIgv, 'moneda'],
    ['Total ventas', totalVentas, 'moneda'],
  ];
  for (const [label, val, fmt] of resumenRows) {
    const c1 = ws.getCell(row, 1);
    c1.value = label;
    c1.font = { size: 10 };
    ws.mergeCells(row, 2, row, COLS - 1);
    const cV = ws.getCell(row, COLS);
    cV.value = val;
    if (fmt === 'moneda') cV.numFmt = '"S/" #,##0.00';
    else if (fmt === 'numero') cV.numFmt = '#,##0';
    cV.font = { size: 10, bold: true };
    cV.alignment = { horizontal: 'right' };
    row++;
  }
  row++;

  // ---- CUADRE DE EFECTIVO ----
  seccionTitulo('CUADRE DE EFECTIVO');
  const apertura = Number(sesion.monto_apertura ?? 0);
  const totEf = Number(sesion.total_efectivo ?? 0);
  const esperado = Number(sesion.monto_esperado_efectivo ?? apertura + totEf);
  const contado = Number(sesion.monto_cierre_efectivo ?? 0);
  const diferencia = Number(sesion.diferencia ?? contado - esperado);

  const cuadre: Array<[string, number, 'apertura' | 'normal' | 'diferencia']> = [
    ['Monto de apertura', apertura, 'apertura'],
    ['(+) Efectivo cobrado', totEf, 'normal'],
    ['(=) Efectivo esperado', esperado, 'normal'],
    ['Efectivo contado', contado, 'normal'],
    ['(=) Diferencia', diferencia, 'diferencia'],
  ];
  cuadre.forEach(([label, val, kind]) => {
    const c1 = ws.getCell(row, 1);
    c1.value = label;
    c1.font = { size: 10, bold: kind === 'diferencia' };
    ws.mergeCells(row, 2, row, COLS - 1);
    const cV = ws.getCell(row, COLS);
    cV.value = val;
    cV.numFmt = '"S/" #,##0.00';
    cV.font = { size: 10, bold: kind === 'diferencia' };
    cV.alignment = { horizontal: 'right' };
    if (kind === 'diferencia') {
      const ok = Math.abs(val) < 0.01;
      const argb = ok ? 'FFD1FAE5' : 'FFFEE2E2';
      const textArgb = ok ? BRAND.verde : BRAND.rojo;
      [c1, cV].forEach((x) => {
        x.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
        x.font = { ...(x.font ?? {}), color: { argb: textArgb }, bold: true };
      });
    }
    row++;
  });
  row++;

  // ---- DETALLE DE VENTAS ----
  seccionTitulo('DETALLE DE VENTAS');

  type ColDef = { header: string; width: number; fmt?: 'moneda' };
  const cols: ColDef[] = [
    { header: '#', width: 5 },
    { header: 'Hora', width: 10 },
    { header: 'Comprobante', width: 18 },
    { header: 'N° venta', width: 14 },
    { header: 'Cliente', width: 24 },
    { header: 'Doc.', width: 14 },
    { header: 'Vendedor', width: 18 },
    { header: 'Método(s)', width: 22 },
    { header: 'IGV', width: 10, fmt: 'moneda' },
    { header: 'Total', width: 12, fmt: 'moneda' },
  ];
  // Ajustar widths reales en ws.columns
  ws.columns = cols.map((c, i) => ({ key: `c${i + 1}`, width: c.width }));

  const headerRow = ws.getRow(row);
  cols.forEach((col, i) => {
    const c = headerRow.getCell(i + 1);
    c.value = col.header;
    c.font = { name: 'Calibri', size: 10, bold: true, color: { argb: BRAND.blanco } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND.azul } };
    c.alignment = { vertical: 'middle', horizontal: 'left' };
  });
  headerRow.height = 22;
  row++;

  ventas.forEach((v, idx) => {
    const comp = v.comprobante_id ? compByIdMap.get(v.comprobante_id) ?? null : null;
    const vendNombre = v.vendedor_usuario_id ? vendByIdMap.get(v.vendedor_usuario_id) ?? null : null;
    const pagos = pagosByVenta.get(v.id) ?? [];
    const metodosStr = pagos.length
      ? pagos.map((p) => `${metodoLabel(p.metodo)} ${p.monto.toFixed(2)}`).join(' · ')
      : '-';
    const hora = new Date(v.fecha).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
    const cliente = v.nombre_cliente_rapido ?? '-';
    const doc = v.documento_cliente ?? '-';
    const compTxt = comp
      ? comp.numero_completo ?? `${comp.serie ?? ''}-${fmtNumero(comp.numero ?? 0)}`
      : 'Sin comp.';

    const dataRow = ws.getRow(row);
    dataRow.getCell(1).value = idx + 1;
    dataRow.getCell(2).value = hora;
    dataRow.getCell(3).value = compTxt;
    dataRow.getCell(4).value = v.numero;
    dataRow.getCell(5).value = cliente;
    dataRow.getCell(6).value = doc;
    dataRow.getCell(7).value = vendNombre ?? '-';
    dataRow.getCell(8).value = metodosStr;
    dataRow.getCell(9).value = Number(v.igv ?? 0);
    dataRow.getCell(10).value = Number(v.total ?? 0);

    dataRow.eachCell((cell, colNum) => {
      cell.font = { name: 'Calibri', size: 9, color: { argb: BRAND.textoOscuro } };
      cell.alignment = { vertical: 'middle', horizontal: colNum >= 9 ? 'right' : 'left' };
      if (idx % 2 === 1) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND.bgSuave } };
      }
      const col = cols[colNum - 1];
      if (col?.fmt === 'moneda') cell.numFmt = '"S/" #,##0.00';
    });
    row++;
  });

  if (ventas.length === 0) {
    ws.mergeCells(row, 1, row, COLS);
    const c = ws.getCell(row, 1);
    c.value = 'No se registraron ventas en esta sesión.';
    c.alignment = { horizontal: 'center' };
    c.font = { italic: true, color: { argb: 'FF94A3B8' } };
    row++;
  }

  // Footer
  row++;
  ws.mergeCells(row, 1, row, COLS);
  const footer = ws.getCell(row, 1);
  footer.value = `Generado el ${new Date().toLocaleString('es-PE')} · ${empresa?.razon_social ?? 'HAPPY SAC'}`;
  footer.font = { italic: true, size: 8, color: { argb: 'FF94A3B8' } };
  footer.alignment = { horizontal: 'right' };

  const buf = await wb.xlsx.writeBuffer();
  const base64 = Buffer.from(buf as ArrayBuffer).toString('base64');
  const fechaSlug = new Date(sesion.cerrada_en ?? sesion.abierta_en).toISOString().slice(0, 10);

  return {
    base64,
    filename: `cierre_caja_${caja?.codigo ?? 'caja'}_${fechaSlug}.xlsx`,
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
}

// ============================================================================
// EMITIR COMPROBANTE (para venta ya registrada — útil cuando se quiere
// re-emitir o cuando la venta se grabó como NOTA_VENTA y se promueve a
// BOLETA/FACTURA luego). NO toca SUNAT real; sólo registra y devuelve datos
// para PDF.
// ============================================================================

const clienteSchema = z.object({
  razon_social: z.string().optional().nullable(),
  nombres: z.string().optional().nullable(),
  apellidos: z.string().optional().nullable(),
  tipo_documento: z.enum(['DNI', 'RUC', 'CE', 'PASAPORTE']).nullable().optional(),
  numero_documento: z.string().optional().nullable(),
  direccion: z.string().optional().nullable(),
});

const emitirSchema = z.object({
  venta_id: z.string().uuid(),
  tipo: z.enum(['BOLETA', 'FACTURA', 'NOTA_VENTA']),
  cliente_data: clienteSchema,
});

export async function emitirComprobante(input: z.infer<typeof emitirSchema>): Promise<{
  id: string;
  numero_completo: string;
  pdf_data: ComprobantePDFData;
}> {
  const parsed = emitirSchema.parse(input);
  const sb = await createClient();
  const user = await requireUser(sb);

  // Venta
  const { data: venta, error: errV } = await sb
    .from('ventas')
    .select(`
      id, numero, fecha, caja_id, almacen_id, sub_total, igv, total,
      nombre_cliente_rapido, documento_cliente, tipo_documento_cliente, cliente_id,
      vendedor_usuario_id
    `)
    .eq('id', parsed.venta_id)
    .single();
  if (errV || !venta) throw new Error('Venta no encontrada');

  // Nombre del vendedor (perfiles no tiene FK declarada)
  let vendedorNombre = 'Vendedor';
  if (venta.vendedor_usuario_id) {
    const { data: p } = await sb
      .from('perfiles')
      .select('nombre_completo')
      .eq('id', venta.vendedor_usuario_id)
      .maybeSingle();
    if (p?.nombre_completo) vendedorNombre = p.nombre_completo;
  }

  // Líneas
  const { data: lineas } = await sb
    .from('ventas_lineas')
    .select(`
      cantidad, precio_unitario, descuento_monto,
      variantes:variante_id (
        sku, talla,
        productos:producto_id ( nombre, codigo )
      )
    `)
    .eq('venta_id', venta.id);

  // Pagos
  const { data: pagosVenta } = await sb
    .from('ventas_pagos')
    .select('metodo, monto')
    .eq('venta_id', venta.id);

  // Empresa
  const { data: empresaRaw } = await sb
    .from('empresa')
    .select('razon_social, nombre_comercial, ruc, direccion_fiscal, telefono, email, logo_url, igv_porcentaje')
    .maybeSingle();

  // Determinar serie según tipo + caja
  let comprobanteId = '';
  let serie = '';
  let numeroNum = 0;
  let numeroCompleto = '';

  if (!venta.caja_id) throw new Error('La venta no está vinculada a una caja.');
  const ventaCajaId: string = venta.caja_id;

  if (parsed.tipo === 'NOTA_VENTA') {
    // Nota de venta: no es SUNAT — se intenta buscar serie configurada o se usa "NV01"
    const { data: caja } = await sb
      .from('cajas')
      .select('serie_nota_venta')
      .eq('id', ventaCajaId)
      .single();
    serie = caja?.serie_nota_venta ?? 'NV01';

    const { data: numComp } = await sb.rpc('next_correlativo', { p_clave: `COMP_${serie}`, p_padding: 8 });
    numeroNum = Number(numComp);
    numeroCompleto = `${serie}-${fmtNumero(numeroNum, 8)}`;

    // No insertamos en tabla `comprobantes` para NOTA_VENTA, pero sí devolvemos número artificial.
    comprobanteId = '';
  } else {
    // BOLETA / FACTURA — usa series_comprobantes activa para la caja
    const { data: serieRow } = await sb
      .from('series_comprobantes')
      .select('serie, ultimo_correlativo')
      .eq('tipo', parsed.tipo)
      .eq('caja_id', ventaCajaId)
      .eq('activa', true)
      .maybeSingle();

    // Fallback: serie configurada en la caja directamente
    let serieElegida = serieRow?.serie;
    if (!serieElegida) {
      const { data: caja } = await sb
        .from('cajas')
        .select('serie_boleta, serie_factura')
        .eq('id', ventaCajaId)
        .single();
      serieElegida = parsed.tipo === 'BOLETA' ? caja?.serie_boleta ?? undefined : caja?.serie_factura ?? undefined;
    }
    if (!serieElegida) {
      throw new Error(`No hay serie configurada para ${parsed.tipo} en esta caja.`);
    }
    serie = serieElegida;

    const { data: numComp } = await sb.rpc('next_correlativo', { p_clave: `COMP_${serie}`, p_padding: 8 });
    numeroNum = Number(numComp);
    numeroCompleto = `${serie}-${fmtNumero(numeroNum, 8)}`;

    // Validar RUC en factura
    if (parsed.tipo === 'FACTURA') {
      if (parsed.cliente_data.tipo_documento !== 'RUC' || !parsed.cliente_data.numero_documento) {
        throw new Error('Para emitir FACTURA, el cliente debe tener RUC válido.');
      }
    }

    const nombreCliente = parsed.cliente_data.razon_social
      ?? [parsed.cliente_data.nombres, parsed.cliente_data.apellidos].filter(Boolean).join(' ').trim()
      ?? null;

    const { data: comp, error: errComp } = await sb
      .from('comprobantes')
      .insert({
        tipo: parsed.tipo,
        serie,
        numero: numeroNum,
        venta_id: venta.id,
        cliente_id: venta.cliente_id,
        tipo_documento_cliente: (parsed.cliente_data.tipo_documento ?? null) as TipoDocumentoCliente | null,
        numero_documento_cliente: parsed.cliente_data.numero_documento ?? null,
        razon_social_cliente: nombreCliente,
        direccion_cliente: parsed.cliente_data.direccion ?? null,
        fecha_emision: new Date().toISOString(),
        sub_total: Number(venta.sub_total ?? 0),
        igv: Number(venta.igv ?? 0),
        total: Number(venta.total ?? 0),
        moneda: 'PEN',
        estado: 'BORRADOR',
        forma_pago: 'CONTADO',
      })
      .select('id')
      .single();
    if (errComp) throw new Error(`No se pudo crear comprobante: ${errComp.message}`);
    comprobanteId = comp.id;

    // Líneas comprobante (best-effort; no detiene si falla)
    if (lineas && lineas.length) {
      type LineaRaw = {
        cantidad: number; precio_unitario: number; descuento_monto: number | null;
        variantes: { sku: string; talla: string; productos: { nombre: string; codigo: string } | { nombre: string; codigo: string }[] | null } | { sku: string; talla: string; productos: { nombre: string; codigo: string } | { nombre: string; codigo: string }[] | null }[] | null;
      };
      type MaybeOne<T> = T | T[] | null;
      const pickOne = <T,>(v: MaybeOne<T>): T | null => Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
      const compLineas = (lineas as LineaRaw[]).map((l) => {
        const variante = pickOne(l.variantes);
        const producto = variante ? pickOne(variante.productos) : null;
        const desc = Number(l.descuento_monto ?? 0);
        const totalLinea = l.cantidad * l.precio_unitario - desc;
        const subLinea = +(totalLinea / 1.18).toFixed(2);
        const igvLinea = +(totalLinea - subLinea).toFixed(2);
        return {
          comprobante_id: comp.id,
          codigo: producto?.codigo ?? '',
          descripcion: producto?.nombre ? `${producto.nombre} - Talla ${variante?.talla.replace('T', '') ?? ''}` : '',
          cantidad: l.cantidad,
          unidad_sunat: 'NIU',
          precio_unitario: l.precio_unitario,
          descuento: desc,
          sub_total: subLinea,
          igv: igvLinea,
          total: totalLinea,
        };
      });
      await sb.from('comprobantes_lineas').insert(compLineas);
    }

    // Vincular comprobante a la venta
    await sb.from('ventas').update({ comprobante_id: comp.id }).eq('id', venta.id);
  }

  // ---- Construir pdf_data ----
  type MaybeOne<T> = T | T[] | null;
  const pickOne = <T,>(v: MaybeOne<T>): T | null => Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

  const empresaPDF = {
    razon_social: empresaRaw?.razon_social ?? 'HAPPY SAC',
    nombre_comercial: empresaRaw?.nombre_comercial ?? null,
    ruc: empresaRaw?.ruc ?? '',
    direccion_fiscal: empresaRaw?.direccion_fiscal ?? null,
    telefono: empresaRaw?.telefono ?? null,
    email: empresaRaw?.email ?? null,
    logo_url: empresaRaw?.logo_url ?? null,
    igv_porcentaje: Number(empresaRaw?.igv_porcentaje ?? 18),
  };

  const nombreClienteFinal = parsed.cliente_data.razon_social
    ?? [parsed.cliente_data.nombres, parsed.cliente_data.apellidos].filter(Boolean).join(' ').trim()
    ?? 'CLIENTE VARIOS';

  type LineaRaw = {
    cantidad: number; precio_unitario: number; descuento_monto: number | null;
    variantes: MaybeOne<{ sku: string; talla: string; productos: MaybeOne<{ nombre: string; codigo: string }> }>;
  };

  const items = ((lineas ?? []) as LineaRaw[]).map((l) => {
    const variante = pickOne(l.variantes);
    const producto = variante ? pickOne(variante.productos) : null;
    const desc = Number(l.descuento_monto ?? 0);
    return {
      descripcion: producto?.nombre
        ? `${producto.nombre} (T ${variante?.talla.replace('T', '') ?? ''})`
        : variante?.sku ?? 'Item',
      cantidad: l.cantidad,
      precio_unitario: Number(l.precio_unitario),
      sub_total: l.cantidad * Number(l.precio_unitario) - desc,
    };
  });

  const pdfData: ComprobantePDFData = {
    empresa: empresaPDF,
    comprobante: {
      tipo: parsed.tipo,
      numero_completo: numeroCompleto,
      fecha: new Date().toISOString(),
      igv_porcentaje: empresaPDF.igv_porcentaje,
    },
    cliente: {
      tipo_documento: parsed.cliente_data.tipo_documento ?? null,
      numero_documento: parsed.cliente_data.numero_documento ?? null,
      nombre_o_razon_social: nombreClienteFinal || 'CLIENTE VARIOS',
      direccion: parsed.cliente_data.direccion ?? null,
    },
    items,
    totales: {
      sub_total: Number(venta.sub_total ?? 0),
      igv: Number(venta.igv ?? 0),
      total: Number(venta.total ?? 0),
    },
    pagos: (pagosVenta ?? []).map((p) => ({ metodo: String(p.metodo), monto: Number(p.monto ?? 0) })),
    vendedor: vendedorNombre,
  };

  revalidatePath('/venta');
  // user no se usa más, pero requerirlo asegura la sesión
  void user;
  return { id: comprobanteId, numero_completo: numeroCompleto, pdf_data: pdfData };
}
