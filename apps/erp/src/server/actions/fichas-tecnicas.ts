'use server';

/**
 * Server actions para FICHAS TÉCNICAS de productos.
 *
 * Agregado puro — no toca ninguna lógica existente de productos/variantes/
 * recetas/procesos. Todo vive en las tablas nuevas:
 *  - productos_fichas_tecnicas
 *  - fichas_medidas
 *  - fichas_medidas_valores
 *  - fichas_imagenes
 *
 * Y en el bucket Storage `productos-fichas` (público).
 */

import { z } from 'zod';
import { createClient } from '@happy/db/server';
import { createServiceClient } from '@happy/db/service';
import { runAction, requireUser, bumpPaths, type ActionResult } from './_helpers';
import { BUCKET_FICHAS, TEMPORADAS, TIPOS_IMAGEN_FICHA, TIPOS_TELA, PLANTILLAS_PRENDA } from './fichas-tecnicas-helpers';
import type {
  FichaTecnica, FichaMedida, FichaImagen,
  PiezaCorte, AvioRow, ProcesoFichaRow,
} from './fichas-tecnicas-helpers';

// Las tablas nuevas (mig 45) aún no están en los types auto-generados.
// Cast pragmático para acceder a ellas hasta regenerar.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = { from: (t: string) => any; storage: any };

// ============================================================================
// LECTURA — obtener ficha vigente + medidas + imágenes
// ============================================================================
export async function obtenerFichaVigente(productoId: string): Promise<{
  ficha: FichaTecnica | null;
  medidas: FichaMedida[];
  imagenes: FichaImagen[];
  revisiones: { id: string; revision: number; vigente: boolean; updated_at: string }[];
}> {
  const sb = (await createClient()) as unknown as AnyClient;

  // 1) Cabecera vigente
  const { data: ficha } = await sb
    .from('productos_fichas_tecnicas')
    .select('*')
    .eq('producto_id', productoId)
    .eq('vigente', true)
    .maybeSingle();

  // 2) Lista de revisiones del producto (para el selector)
  const { data: revs } = await sb
    .from('productos_fichas_tecnicas')
    .select('id, revision, vigente, updated_at')
    .eq('producto_id', productoId)
    .order('revision', { ascending: false });

  if (!ficha) {
    return { ficha: null, medidas: [], imagenes: [], revisiones: (revs ?? []) as unknown as { id: string; revision: number; vigente: boolean; updated_at: string }[] };
  }

  // 3) Medidas + valores en paralelo
  const [{ data: medidas }, { data: imagenes }] = await Promise.all([
    sb
      .from('fichas_medidas')
      .select('*, fichas_medidas_valores(talla, valor)')
      .eq('ficha_id', ficha.id)
      .order('orden'),
    sb
      .from('fichas_imagenes')
      .select('*')
      .eq('ficha_id', ficha.id)
      .order('orden'),
  ]);

  const medidasMapped: FichaMedida[] = ((medidas ?? []) as unknown as {
    id: string;
    ficha_id: string;
    codigo: string;
    descripcion: string;
    tolerancia_cm: number | string | null;
    observaciones: string | null;
    orden: number;
    fichas_medidas_valores: { talla: string; valor: number | string | null }[] | null;
  }[]).map((m) => ({
    id: m.id,
    ficha_id: m.ficha_id,
    codigo: m.codigo,
    descripcion: m.descripcion,
    tolerancia_cm: Number(m.tolerancia_cm ?? 0),
    observaciones: m.observaciones,
    orden: m.orden,
    valores: (m.fichas_medidas_valores ?? []).map((v) => ({
      talla: v.talla,
      valor: v.valor !== null ? Number(v.valor) : null,
    })),
  }));

  return {
    ficha: ficha as unknown as FichaTecnica,
    medidas: medidasMapped,
    imagenes: (imagenes ?? []) as unknown as FichaImagen[],
    revisiones: (revs ?? []) as { id: string; revision: number; vigente: boolean; updated_at: string }[],
  };
}

// ============================================================================
// CREAR FICHA (revisión 1 si no hay; nueva revisión si ya existe vigente)
// ============================================================================
export async function crearFichaTecnica(productoId: string): Promise<ActionResult<{ id: string; revision: number }>> {
  const r = await runAction(async () => {
    const { sb: sbRaw, userId } = await requireUser();
    const sb = sbRaw as unknown as AnyClient;

    // ¿Hay vigente? Si sí, marcar como NO vigente y crear nueva revisión.
    const { data: vigente } = await sb
      .from('productos_fichas_tecnicas')
      .select('id, revision')
      .eq('producto_id', productoId)
      .eq('vigente', true)
      .maybeSingle();

    let nuevaRevision = 1;
    if (vigente) {
      await sb.from('productos_fichas_tecnicas').update({ vigente: false }).eq('id', vigente.id);
      nuevaRevision = (Number(vigente.revision) ?? 1) + 1;
    }

    const { data: ficha, error } = await sb
      .from('productos_fichas_tecnicas')
      .insert({
        producto_id: productoId,
        revision: nuevaRevision,
        vigente: true,
        creada_por: userId,
      })
      .select('id, revision')
      .single();
    if (error) throw new Error(error.message);
    return { id: ficha.id as string, revision: Number(ficha.revision) };
  });
  if (r.ok) await bumpPaths(`/productos/${productoId}`);
  return r;
}

// ============================================================================
// ACTUALIZAR CABECERA
// ============================================================================
const cabeceraSchema = z.object({
  temporada: z.enum(TEMPORADAS).nullable().optional(),
  fecha_aprobacion: z.string().nullable().optional().or(z.literal('')),
  cliente_referencia: z.string().nullable().optional().or(z.literal('')),
  descripcion_larga: z.string().nullable().optional().or(z.literal('')),
  alcance_uso: z.string().nullable().optional().or(z.literal('')),
  observaciones: z.string().nullable().optional().or(z.literal('')),
  tela_principal_nombre: z.string().nullable().optional().or(z.literal('')),
  tela_principal_composicion: z.string().nullable().optional().or(z.literal('')),
  tela_principal_color: z.string().nullable().optional().or(z.literal('')),
  tela_principal_densidad: z.string().nullable().optional().or(z.literal('')),
  tela_principal_ancho: z.string().nullable().optional().or(z.literal('')),
  tela_secundaria_nombre: z.string().nullable().optional().or(z.literal('')),
  tela_secundaria_composicion: z.string().nullable().optional().or(z.literal('')),
  tela_secundaria_color: z.string().nullable().optional().or(z.literal('')),
  tela_secundaria_densidad: z.string().nullable().optional().or(z.literal('')),
  tela_secundaria_ancho: z.string().nullable().optional().or(z.literal('')),
  // Telas secundarias 2..8 (mig 59) — cliente pidió hasta 9 telas totales
  tela_secundaria_2_nombre: z.string().nullable().optional().or(z.literal('')),
  tela_secundaria_2_composicion: z.string().nullable().optional().or(z.literal('')),
  tela_secundaria_2_color: z.string().nullable().optional().or(z.literal('')),
  tela_secundaria_2_densidad: z.string().nullable().optional().or(z.literal('')),
  tela_secundaria_2_ancho: z.string().nullable().optional().or(z.literal('')),
  tela_secundaria_3_nombre: z.string().nullable().optional().or(z.literal('')),
  tela_secundaria_3_composicion: z.string().nullable().optional().or(z.literal('')),
  tela_secundaria_3_color: z.string().nullable().optional().or(z.literal('')),
  tela_secundaria_3_densidad: z.string().nullable().optional().or(z.literal('')),
  tela_secundaria_3_ancho: z.string().nullable().optional().or(z.literal('')),
  tela_secundaria_4_nombre: z.string().nullable().optional().or(z.literal('')),
  tela_secundaria_4_composicion: z.string().nullable().optional().or(z.literal('')),
  tela_secundaria_4_color: z.string().nullable().optional().or(z.literal('')),
  tela_secundaria_4_densidad: z.string().nullable().optional().or(z.literal('')),
  tela_secundaria_4_ancho: z.string().nullable().optional().or(z.literal('')),
  tela_secundaria_5_nombre: z.string().nullable().optional().or(z.literal('')),
  tela_secundaria_5_composicion: z.string().nullable().optional().or(z.literal('')),
  tela_secundaria_5_color: z.string().nullable().optional().or(z.literal('')),
  tela_secundaria_5_densidad: z.string().nullable().optional().or(z.literal('')),
  tela_secundaria_5_ancho: z.string().nullable().optional().or(z.literal('')),
  tela_secundaria_6_nombre: z.string().nullable().optional().or(z.literal('')),
  tela_secundaria_6_composicion: z.string().nullable().optional().or(z.literal('')),
  tela_secundaria_6_color: z.string().nullable().optional().or(z.literal('')),
  tela_secundaria_6_densidad: z.string().nullable().optional().or(z.literal('')),
  tela_secundaria_6_ancho: z.string().nullable().optional().or(z.literal('')),
  tela_secundaria_7_nombre: z.string().nullable().optional().or(z.literal('')),
  tela_secundaria_7_composicion: z.string().nullable().optional().or(z.literal('')),
  tela_secundaria_7_color: z.string().nullable().optional().or(z.literal('')),
  tela_secundaria_7_densidad: z.string().nullable().optional().or(z.literal('')),
  tela_secundaria_7_ancho: z.string().nullable().optional().or(z.literal('')),
  tela_secundaria_8_nombre: z.string().nullable().optional().or(z.literal('')),
  tela_secundaria_8_composicion: z.string().nullable().optional().or(z.literal('')),
  tela_secundaria_8_color: z.string().nullable().optional().or(z.literal('')),
  tela_secundaria_8_densidad: z.string().nullable().optional().or(z.literal('')),
  tela_secundaria_8_ancho: z.string().nullable().optional().or(z.literal('')),
  puntadas_remalle: z.string().nullable().optional().or(z.literal('')),
  puntadas_recta: z.string().nullable().optional().or(z.literal('')),
  notas_confeccion: z.string().nullable().optional().or(z.literal('')),
  notas_acabados: z.string().nullable().optional().or(z.literal('')),
  envase_primario: z.string().nullable().optional().or(z.literal('')),
  envase_secundario: z.string().nullable().optional().or(z.literal('')),
  cinta_embalaje: z.string().nullable().optional().or(z.literal('')),
  sticker_talla: z.string().nullable().optional().or(z.literal('')),
  rotulado_primario: z.string().nullable().optional().or(z.literal('')),
  rotulado_secundario: z.string().nullable().optional().or(z.literal('')),
});

function emptyToNull(v: unknown) {
  return v === '' ? null : v;
}

export async function actualizarFichaTecnica(
  fichaId: string,
  input: z.input<typeof cabeceraSchema>,
): Promise<ActionResult> {
  const r = await runAction(async () => {
    const { sb: sbRaw } = await requireUser();
    const sb = sbRaw as unknown as AnyClient;
    const parsed = cabeceraSchema.parse(input);
    const update: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (v !== undefined) update[k] = emptyToNull(v);
    }
    const { data: f, error } = await sb
      .from('productos_fichas_tecnicas')
      .update(update)
      .eq('id', fichaId)
      .select('producto_id')
      .single();
    if (error) throw new Error(error.message);
    return f;
  });
  if (r.ok && r.data) await bumpPaths(`/productos/${(r.data as { producto_id: string }).producto_id}`);
  return r;
}

// ============================================================================
// MEDIDAS — guardar lote (replace all): medidas + valores por talla
// ============================================================================
const medidaInputSchema = z.object({
  codigo: z.string().min(1).max(8),
  descripcion: z.string().min(1).max(200),
  tolerancia_cm: z.number().min(0).max(50).default(0),
  observaciones: z.string().nullable().optional().or(z.literal('')),
  orden: z.number().int().default(0),
  valores: z.array(z.object({
    talla: z.string().min(1).max(20),
    valor: z.number().nullable(),
  })),
});

export async function guardarMedidasFicha(
  fichaId: string,
  medidas: z.input<typeof medidaInputSchema>[],
): Promise<ActionResult> {
  return runAction(async () => {
    const { sb: sbRaw } = await requireUser();
    const sb = sbRaw as unknown as AnyClient;
    const parsed = medidas.map((m) => medidaInputSchema.parse(m));

    await sb.from('fichas_medidas').delete().eq('ficha_id', fichaId);
    if (parsed.length === 0) return null;

    const medidasInsert = parsed.map((m, i) => ({
      ficha_id: fichaId,
      codigo: m.codigo.trim().toUpperCase(),
      descripcion: m.descripcion.trim(),
      tolerancia_cm: m.tolerancia_cm,
      observaciones: m.observaciones === '' ? null : (m.observaciones ?? null),
      orden: m.orden ?? i,
    }));
    const { data: medidasOK, error: errM } = await sb
      .from('fichas_medidas')
      .insert(medidasInsert)
      .select('id, codigo');
    if (errM) throw new Error(errM.message);

    const idByCodigo = new Map<string, string>();
    for (const m of (medidasOK ?? []) as { id: string; codigo: string }[]) {
      idByCodigo.set(m.codigo, m.id);
    }

    const valoresInsert: { medida_id: string; talla: string; valor: number | null }[] = [];
    for (const m of parsed) {
      const mid = idByCodigo.get(m.codigo.trim().toUpperCase());
      if (!mid) continue;
      for (const v of m.valores) {
        if (v.valor !== null) {
          valoresInsert.push({ medida_id: mid, talla: v.talla.trim(), valor: v.valor });
        }
      }
    }
    if (valoresInsert.length > 0) {
      const { error: errV } = await sb.from('fichas_medidas_valores').insert(valoresInsert);
      if (errV) throw new Error(errV.message);
    }
    return null;
  });
}

// ============================================================================
// IMÁGENES — subir, listar, eliminar
// ============================================================================
const subirImagenSchema = z.object({
  tipo: z.enum(TIPOS_IMAGEN_FICHA),
  leyenda: z.string().nullable().optional().or(z.literal('')),
  filename: z.string().min(1),
  mime: z.string().regex(/^image\/(png|jpeg|jpg|webp)$/),
  base64: z.string().min(1), // sin prefijo data:
});

export async function subirImagenFicha(
  fichaId: string,
  input: z.input<typeof subirImagenSchema>,
): Promise<ActionResult<{ id: string; url: string }>> {
  return runAction(async () => {
    await requireUser();
    const parsed = subirImagenSchema.parse(input);

    if (parsed.base64.length > 14_000_000) throw new Error('Imagen demasiado grande (máx 10MB)');

    const admin = createServiceClient() as unknown as AnyClient;
    const ext = parsed.mime === 'image/png' ? 'png' : parsed.mime === 'image/webp' ? 'webp' : 'jpg';
    const safeName = parsed.filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
    const path = `${fichaId}/${Date.now()}_${safeName}.${ext}`;
    const buf = Buffer.from(parsed.base64, 'base64');

    const { error: upErr } = await admin.storage
      .from(BUCKET_FICHAS)
      .upload(path, buf, { contentType: parsed.mime, upsert: false });
    if (upErr) throw new Error(`Storage: ${upErr.message}`);

    const { data: pub } = admin.storage.from(BUCKET_FICHAS).getPublicUrl(path);

    const { data: existentes } = await admin
      .from('fichas_imagenes')
      .select('orden')
      .eq('ficha_id', fichaId)
      .order('orden', { ascending: false })
      .limit(1);
    const arr = (existentes ?? []) as { orden: number }[];
    const siguienteOrden = arr[0] ? Number(arr[0].orden) + 1 : 0;

    const { data: img, error: insErr } = await admin
      .from('fichas_imagenes')
      .insert({
        ficha_id: fichaId,
        tipo: parsed.tipo,
        url: pub.publicUrl,
        leyenda: parsed.leyenda === '' ? null : (parsed.leyenda ?? null),
        orden: siguienteOrden,
      })
      .select('id, url')
      .single();
    if (insErr) throw new Error(insErr.message);
    return { id: img.id as string, url: img.url as string };
  });
}

/**
 * Vincula una imagen YA EXISTENTE de la galería del producto a la ficha
 * técnica, sin re-subir el archivo. Útil cuando la foto principal/posterior
 * del producto sirve también para la ficha técnica — evita duplicar storage
 * y permite reusar fotos con un solo click.
 *
 * Se valida que la URL pertenezca al producto de la ficha (no a otro
 * producto cualquiera) para evitar inyección de URLs.
 */
const vincularSchema = z.object({
  tipo: z.enum([
    'DELANTERO', 'POSTERIOR', 'LATERAL',
    'CORTE_DIAGRAMA', 'CONFECCION_DETALLE',
    'MEDIDAS_DIAGRAMA', 'ETIQUETA',
    'ACABADOS_DOBLADO', 'CALLOUT', 'OTRA',
  ]),
  url: z.string().url('URL inválida'),
  leyenda: z.string().nullable().optional().or(z.literal('')),
});

export async function vincularImagenDesdeGaleria(
  fichaId: string,
  input: z.input<typeof vincularSchema>,
): Promise<ActionResult<{ id: string; url: string }>> {
  return runAction(async () => {
    await requireUser();
    const parsed = vincularSchema.parse(input);
    const admin = createServiceClient() as unknown as AnyClient;

    // 1. Verificar que la ficha existe + obtener producto_id
    const { data: ficha } = await admin
      .from('productos_fichas_tecnicas')
      .select('producto_id')
      .eq('id', fichaId)
      .single();
    if (!ficha) throw new Error('Ficha no encontrada');

    // 2. Verificar que la URL pertenece a la galería del mismo producto
    //    (puede ser productos_imagenes.url o productos.imagen_principal_url)
    const { data: enGaleria } = await admin
      .from('productos_imagenes')
      .select('id')
      .eq('producto_id', ficha.producto_id)
      .eq('url', parsed.url)
      .maybeSingle();
    let urlValida = !!enGaleria;
    if (!urlValida) {
      const { data: prod } = await admin
        .from('productos')
        .select('imagen_principal_url')
        .eq('id', ficha.producto_id)
        .single();
      urlValida = prod?.imagen_principal_url === parsed.url;
    }
    if (!urlValida) {
      throw new Error('Esta imagen no pertenece a la galería del producto');
    }

    // 3. Calcular siguiente orden
    const { data: existentes } = await admin
      .from('fichas_imagenes')
      .select('orden')
      .eq('ficha_id', fichaId)
      .order('orden', { ascending: false })
      .limit(1);
    const arr = (existentes ?? []) as { orden: number }[];
    const siguienteOrden = arr[0] ? Number(arr[0].orden) + 1 : 0;

    // 4. Insertar registro nuevo (NO re-sube el archivo, solo apunta a la URL)
    const { data: img, error } = await admin
      .from('fichas_imagenes')
      .insert({
        ficha_id: fichaId,
        tipo: parsed.tipo,
        url: parsed.url,
        leyenda: parsed.leyenda === '' ? null : (parsed.leyenda ?? null),
        orden: siguienteOrden,
      })
      .select('id, url')
      .single();
    if (error) throw new Error(error.message);
    return { id: img.id as string, url: img.url as string };
  });
}

export async function eliminarImagenFicha(imagenId: string): Promise<ActionResult> {
  return runAction(async () => {
    await requireUser();
    const admin = createServiceClient() as unknown as AnyClient;

    const { data: img } = await admin
      .from('fichas_imagenes')
      .select('url')
      .eq('id', imagenId)
      .single();

    if (img?.url) {
      const marker = `/${BUCKET_FICHAS}/`;
      const idx = (img.url as string).indexOf(marker);
      if (idx >= 0) {
        const path = (img.url as string).slice(idx + marker.length);
        await admin.storage.from(BUCKET_FICHAS).remove([path]);
      }
    }

    const { error } = await admin.from('fichas_imagenes').delete().eq('id', imagenId);
    if (error) throw new Error(error.message);
    return null;
  });
}

export async function actualizarLeyendaImagen(
  imagenId: string,
  leyenda: string,
): Promise<ActionResult> {
  return runAction(async () => {
    const { sb: sbRaw } = await requireUser();
    const sb = sbRaw as unknown as AnyClient;
    const { error } = await sb
      .from('fichas_imagenes')
      .update({ leyenda: leyenda.trim() || null })
      .eq('id', imagenId);
    if (error) throw new Error(error.message);
    return null;
  });
}

// ============================================================================
// FASE 2 — PIEZAS DE CORTE
// ============================================================================
export async function obtenerPiezasCorte(fichaId: string): Promise<PiezaCorte[]> {
  const sb = (await createClient()) as unknown as AnyClient;
  const { data } = await sb
    .from('fichas_piezas_corte')
    .select('*')
    .eq('ficha_id', fichaId)
    .order('orden');
  return (data ?? []) as unknown as PiezaCorte[];
}

const piezaInputSchema = z.object({
  tipo_tela: z.enum(TIPOS_TELA),
  descripcion: z.string().min(1).max(100),
  cantidad: z.number().int().min(1),
  posicion: z.string().nullable().optional().or(z.literal('')),
  orientacion: z.string().nullable().optional().or(z.literal('')),
  observaciones: z.string().nullable().optional().or(z.literal('')),
  orden: z.number().int().default(0),
});

export async function guardarPiezasCorte(
  fichaId: string,
  piezas: z.input<typeof piezaInputSchema>[],
): Promise<ActionResult> {
  return runAction(async () => {
    const { sb: sbRaw } = await requireUser();
    const sb = sbRaw as unknown as AnyClient;
    const parsed = piezas.map((p) => piezaInputSchema.parse(p));

    await sb.from('fichas_piezas_corte').delete().eq('ficha_id', fichaId);
    if (parsed.length === 0) return null;

    const insert = parsed.map((p, i) => ({
      ficha_id: fichaId,
      tipo_tela: p.tipo_tela,
      descripcion: p.descripcion.trim(),
      cantidad: p.cantidad,
      posicion: p.posicion === '' ? null : (p.posicion ?? null),
      orientacion: p.orientacion === '' ? null : (p.orientacion ?? null),
      observaciones: p.observaciones === '' ? null : (p.observaciones ?? null),
      orden: p.orden ?? i,
    }));
    const { error } = await sb.from('fichas_piezas_corte').insert(insert);
    if (error) throw new Error(error.message);
    return null;
  });
}

// ============================================================================
// FASE 2 — AVÍOS (derivado de receta activa + materiales)
// ============================================================================
export async function obtenerAviosProducto(productoId: string): Promise<AvioRow[]> {
  const sb = (await createClient()) as unknown as AnyClient;

  // 1) Receta activa
  const { data: receta } = await sb
    .from('recetas')
    .select('id')
    .eq('producto_id', productoId)
    .eq('activa', true)
    .maybeSingle();
  if (!receta?.id) return [];

  // 2) Líneas de receta agrupadas por material (sumar cantidades de todas las tallas)
  const { data: lineas } = await sb
    .from('recetas_lineas')
    .select('material_id, cantidad, unidad_id')
    .eq('receta_id', receta.id);
  if (!lineas || lineas.length === 0) return [];

  type LR = { material_id: string; cantidad: number | string; unidad_id: string | null };
  const sumByMaterial = new Map<string, number>();
  for (const l of lineas as LR[]) {
    const acc = sumByMaterial.get(l.material_id) ?? 0;
    sumByMaterial.set(l.material_id, acc + Number(l.cantidad ?? 0));
  }
  const matIds = Array.from(sumByMaterial.keys());

  // 3) Cargar materiales (codigo, nombre, categoria, color, imagen, unidad)
  const { data: mats } = await sb
    .from('materiales')
    .select('id, codigo, nombre, categoria, color_nombre, imagen_url, unidad_consumo_id')
    .in('id', matIds);

  type MR = {
    id: string; codigo: string; nombre: string; categoria: string;
    color_nombre: string | null; imagen_url: string | null;
    unidad_consumo_id: string | null;
  };
  const matMap = new Map<string, MR>();
  for (const m of (mats ?? []) as MR[]) matMap.set(m.id, m);

  // 4) Cargar unidades para mostrar simbolo
  const unidadIds = Array.from(new Set(((mats ?? []) as MR[]).map((m) => m.unidad_consumo_id).filter(Boolean) as string[]));
  const unidadByID = new Map<string, string>();
  if (unidadIds.length > 0) {
    const { data: unis } = await sb.from('unidades_medida').select('id, simbolo').in('id', unidadIds);
    for (const u of (unis ?? []) as { id: string; simbolo: string }[]) unidadByID.set(u.id, u.simbolo);
  }

  return matIds.map((id) => {
    const m = matMap.get(id);
    return {
      material_id: id,
      codigo: m?.codigo ?? '—',
      nombre: m?.nombre ?? '—',
      categoria: String(m?.categoria ?? '—'),
      color: m?.color_nombre ?? null,
      imagen_url: m?.imagen_url ?? null,
      cantidad_total: sumByMaterial.get(id) ?? 0,
      unidad: m?.unidad_consumo_id ? unidadByID.get(m.unidad_consumo_id) ?? '' : '',
    } satisfies AvioRow;
  });
}

export async function obtenerProcesosProducto(productoId: string): Promise<ProcesoFichaRow[]> {
  const sb = (await createClient()) as unknown as AnyClient;

  const { data: procs } = await sb
    .from('productos_procesos')
    .select('id, proceso, orden, area_id, tiempo_estandar_min, maquina, descripcion_operativa')
    .eq('producto_id', productoId)
    .eq('activo', true)
    .order('orden');

  type PR = {
    id: string; proceso: string; orden: number; area_id: string | null;
    tiempo_estandar_min: number | string | null;
    maquina: string | null; descripcion_operativa: string | null;
  };
  const filas = (procs ?? []) as PR[];

  const areaIds = Array.from(new Set(filas.map((p) => p.area_id).filter(Boolean) as string[]));
  const areaByID = new Map<string, string>();
  if (areaIds.length > 0) {
    const { data: areas } = await sb.from('areas_produccion').select('id, nombre').in('id', areaIds);
    for (const a of (areas ?? []) as { id: string; nombre: string }[]) areaByID.set(a.id, a.nombre);
  }

  return filas.map((p) => ({
    id: p.id,
    proceso: p.proceso,
    orden: p.orden,
    area: p.area_id ? areaByID.get(p.area_id) ?? null : null,
    maquina: p.maquina,
    descripcion_operativa: p.descripcion_operativa,
    tiempo_estandar_min: Number(p.tiempo_estandar_min ?? 0),
  } satisfies ProcesoFichaRow));
}

// Actualizar maquina/descripcion de un proceso (no rompe nada existente)
const procesoFichaSchema = z.object({
  maquina: z.string().nullable().optional().or(z.literal('')),
  descripcion_operativa: z.string().nullable().optional().or(z.literal('')),
});

export async function actualizarProcesoFicha(
  procesoId: string,
  input: z.input<typeof procesoFichaSchema>,
): Promise<ActionResult> {
  return runAction(async () => {
    const { sb: sbRaw } = await requireUser();
    const sb = sbRaw as unknown as AnyClient;
    const data = procesoFichaSchema.parse(input);
    const { error } = await sb
      .from('productos_procesos')
      .update({
        maquina: data.maquina === '' ? null : (data.maquina ?? null),
        descripcion_operativa: data.descripcion_operativa === '' ? null : (data.descripcion_operativa ?? null),
      })
      .eq('id', procesoId);
    if (error) throw new Error(error.message);
    return null;
  });
}

// ============================================================================
// FASE 2 — Cargar empresa para PDF
// ============================================================================
export async function cargarDatosParaPDFFicha(fichaId: string, productoId: string) {
  const sb = (await createClient()) as unknown as AnyClient;

  const [vigente, piezas, avios, procesos, empresaRes, productoRes] = await Promise.all([
    obtenerFichaVigente(productoId),
    obtenerPiezasCorte(fichaId),
    obtenerAviosProducto(productoId),
    obtenerProcesosProducto(productoId),
    sb.from('empresa').select('razon_social, nombre_comercial, ruc, direccion_fiscal, telefono, email, logo_url').single(),
    sb.from('productos').select('codigo, nombre').eq('id', productoId).single(),
  ]);

  let logo_dataurl: string | null = null;
  const empresa = empresaRes.data as { razon_social: string; nombre_comercial: string | null; ruc: string; direccion_fiscal: string | null; telefono: string | null; email: string | null; logo_url: string | null } | null;
  if (empresa?.logo_url) {
    try {
      const resp = await fetch(empresa.logo_url);
      if (resp.ok) {
        const buf = Buffer.from(await resp.arrayBuffer());
        const ext = (empresa.logo_url.split('.').pop() ?? 'png').toLowerCase();
        const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png';
        logo_dataurl = `data:${mime};base64,${buf.toString('base64')}`;
      }
    } catch { /* opcional */ }
  }

  return {
    ficha: vigente.ficha,
    medidas: vigente.medidas,
    imagenes: vigente.imagenes,
    piezas,
    avios,
    procesos,
    empresa,
    logo_dataurl,
    producto: productoRes.data as { codigo: string; nombre: string } | null,
  };
}

// ============================================================================
// FASE 3 — LINKS PÚBLICOS COMPARTIBLES
// ============================================================================
export type LinkPublicoRow = {
  id: string;
  token: string;
  expira_en: string | null;
  vistas: number;
  ultima_vista_en: string | null;
  activo: boolean;
  created_at: string;
};

export async function listarLinksPublicos(fichaId: string): Promise<LinkPublicoRow[]> {
  const sb = (await createClient()) as unknown as AnyClient;
  const { data } = await sb
    .from('fichas_links_publicos')
    .select('*')
    .eq('ficha_id', fichaId)
    .order('created_at', { ascending: false });
  return (data ?? []) as unknown as LinkPublicoRow[];
}

const generarLinkSchema = z.object({
  dias_validez: z.number().int().min(0).max(365).default(30),
});

export async function generarLinkPublico(
  fichaId: string,
  input: z.input<typeof generarLinkSchema>,
): Promise<ActionResult<{ token: string; expira_en: string | null }>> {
  return runAction(async () => {
    const { sb: sbRaw, userId } = await requireUser();
    const sb = sbRaw as unknown as AnyClient;
    const data = generarLinkSchema.parse(input);
    const expira_en = data.dias_validez > 0
      ? new Date(Date.now() + data.dias_validez * 24 * 60 * 60 * 1000).toISOString()
      : null;
    const { data: link, error } = await sb
      .from('fichas_links_publicos')
      .insert({ ficha_id: fichaId, expira_en, creado_por: userId, activo: true })
      .select('token, expira_en')
      .single();
    if (error) throw new Error(error.message);
    return { token: link.token as string, expira_en: link.expira_en as string | null };
  });
}

export async function revocarLinkPublico(linkId: string): Promise<ActionResult> {
  return runAction(async () => {
    const { sb: sbRaw } = await requireUser();
    const sb = sbRaw as unknown as AnyClient;
    const { error } = await sb.from('fichas_links_publicos').update({ activo: false }).eq('id', linkId);
    if (error) throw new Error(error.message);
    return null;
  });
}

// ============================================================================
// FASE 3 — APLICAR PLANTILLA (no sobreescribe lo ya cargado)
// ============================================================================
export async function aplicarPlantillaFicha(
  fichaId: string,
  plantillaKey: string,
): Promise<ActionResult<{ medidas_agregadas: number; piezas_agregadas: number }>> {
  return runAction(async () => {
    const { sb: sbRaw } = await requireUser();
    const sb = sbRaw as unknown as AnyClient;
    const plantilla = PLANTILLAS_PRENDA.find((p) => p.key === plantillaKey);
    if (!plantilla) throw new Error('Plantilla no encontrada');

    // 1) Medidas — solo agregar las que NO existen (por código)
    const { data: medExist } = await sb.from('fichas_medidas').select('codigo').eq('ficha_id', fichaId);
    const yaExisten = new Set(((medExist ?? []) as { codigo: string }[]).map((m) => m.codigo.toUpperCase()));
    const medidasNuevas = plantilla.medidas.filter((m) => !yaExisten.has(m.codigo.toUpperCase()));

    let medidasAgregadas = 0;
    if (medidasNuevas.length > 0) {
      const { data: ordenMax } = await sb
        .from('fichas_medidas')
        .select('orden')
        .eq('ficha_id', fichaId)
        .order('orden', { ascending: false })
        .limit(1);
      const arrOrd = (ordenMax ?? []) as { orden: number }[];
      const startOrden = arrOrd[0] ? Number(arrOrd[0].orden) + 1 : 0;
      const insertMedidas = medidasNuevas.map((m, i) => ({
        ficha_id: fichaId,
        codigo: m.codigo,
        descripcion: m.descripcion,
        tolerancia_cm: m.tolerancia_cm,
        orden: startOrden + i,
      }));
      const { data: medIns, error } = await sb.from('fichas_medidas').insert(insertMedidas).select('id');
      if (error) throw new Error('Medidas: ' + error.message);
      medidasAgregadas = ((medIns ?? []) as unknown[]).length;
    }

    // 2) Piezas — solo agregar si NO hay piezas todavía (no romper si el usuario ya cargó)
    const { data: piezExist } = await sb.from('fichas_piezas_corte').select('id').eq('ficha_id', fichaId).limit(1);
    let piezasAgregadas = 0;
    if (!piezExist || (piezExist as unknown[]).length === 0) {
      const insertPiezas = plantilla.piezas.map((p, i) => ({
        ficha_id: fichaId,
        tipo_tela: p.tipo_tela,
        descripcion: p.descripcion,
        cantidad: p.cantidad,
        posicion: p.posicion,
        orientacion: p.orientacion,
        orden: i,
      }));
      const { error } = await sb.from('fichas_piezas_corte').insert(insertPiezas);
      if (error) throw new Error('Piezas: ' + error.message);
      piezasAgregadas = insertPiezas.length;
    }

    return { medidas_agregadas: medidasAgregadas, piezas_agregadas: piezasAgregadas };
  });
}

// ============================================================================
// FASE 3 — DIFF entre revisión actual y la anterior
// ============================================================================
export type DiffRevisiones = {
  rev_anterior: number;
  rev_actual: number;
  campos_cambiados: { campo: string; anterior: string | null; actual: string | null }[];
  medidas_cambiadas: { codigo: string; descripcion: string; cambios: { talla: string; anterior: number | null; actual: number | null }[] }[];
};

export async function obtenerDiffRevisiones(productoId: string): Promise<DiffRevisiones | null> {
  const sb = (await createClient()) as unknown as AnyClient;
  const { data: revs } = await sb
    .from('productos_fichas_tecnicas')
    .select('id, revision')
    .eq('producto_id', productoId)
    .order('revision', { ascending: false })
    .limit(2);
  const arr = (revs ?? []) as { id: string; revision: number }[];
  if (arr.length < 2) return null;
  const actual = arr[0]!;
  const anterior = arr[1]!;

  const camposComparar = [
    'temporada','descripcion_larga','alcance_uso','observaciones',
    'tela_principal_nombre','tela_principal_composicion','tela_principal_color','tela_principal_ancho',
    'tela_secundaria_nombre','tela_secundaria_composicion','tela_secundaria_color','tela_secundaria_ancho',
    'puntadas_remalle','puntadas_recta','notas_confeccion','notas_acabados',
    'envase_primario','envase_secundario','rotulado_primario','rotulado_secundario',
  ];
  const { data: fActual } = await sb.from('productos_fichas_tecnicas').select(camposComparar.join(',')).eq('id', actual.id).single();
  const { data: fAnterior } = await sb.from('productos_fichas_tecnicas').select(camposComparar.join(',')).eq('id', anterior.id).single();
  const fA = (fActual ?? {}) as Record<string, string | null>;
  const fB = (fAnterior ?? {}) as Record<string, string | null>;

  const campos_cambiados: DiffRevisiones['campos_cambiados'] = [];
  for (const c of camposComparar) {
    const va = fA[c] ?? null;
    const vb = fB[c] ?? null;
    if ((va ?? '') !== (vb ?? '')) {
      campos_cambiados.push({ campo: c, anterior: vb, actual: va });
    }
  }

  const [medAct, medAnt] = await Promise.all([
    sb.from('fichas_medidas').select('id, codigo, descripcion, fichas_medidas_valores(talla, valor)').eq('ficha_id', actual.id),
    sb.from('fichas_medidas').select('id, codigo, descripcion, fichas_medidas_valores(talla, valor)').eq('ficha_id', anterior.id),
  ]);
  type M = { codigo: string; descripcion: string; fichas_medidas_valores: { talla: string; valor: number | string | null }[] | null };
  const mapAnt = new Map<string, M>();
  for (const m of (medAnt.data ?? []) as M[]) mapAnt.set(m.codigo.toUpperCase(), m);

  const medidas_cambiadas: DiffRevisiones['medidas_cambiadas'] = [];
  for (const m of (medAct.data ?? []) as M[]) {
    const prev = mapAnt.get(m.codigo.toUpperCase());
    const vAct = new Map((m.fichas_medidas_valores ?? []).map((v) => [v.talla, v.valor !== null ? Number(v.valor) : null]));
    const vAnt = new Map(((prev?.fichas_medidas_valores ?? [])).map((v) => [v.talla, v.valor !== null ? Number(v.valor) : null]));
    const tallas = new Set([...vAct.keys(), ...vAnt.keys()]);
    const cambios: { talla: string; anterior: number | null; actual: number | null }[] = [];
    for (const t of tallas) {
      const a = vAnt.get(t) ?? null;
      const b = vAct.get(t) ?? null;
      if (a !== b) cambios.push({ talla: t, anterior: a, actual: b });
    }
    if (cambios.length > 0) medidas_cambiadas.push({ codigo: m.codigo, descripcion: m.descripcion, cambios });
  }

  return {
    rev_anterior: anterior.revision,
    rev_actual: actual.revision,
    campos_cambiados,
    medidas_cambiadas,
  };
}
