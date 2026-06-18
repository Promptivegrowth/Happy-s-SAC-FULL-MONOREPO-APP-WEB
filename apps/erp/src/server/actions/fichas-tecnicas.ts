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
import { BUCKET_FICHAS, TEMPORADAS, TIPOS_IMAGEN_FICHA } from './fichas-tecnicas-helpers';
import type { FichaTecnica, FichaMedida, FichaImagen } from './fichas-tecnicas-helpers';

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
