'use server';

import { runAction, requireUser, type ActionResult } from './_helpers';

const BUCKET_DEFAULT = 'disfraces-fotos';
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = ['image/png', 'image/jpeg', 'image/webp', 'image/avif'];

export type UploadResult = { url: string; path: string };

/**
 * Sube un archivo a Supabase Storage y devuelve URL pública.
 * El archivo se guarda en {prefix}/{timestamp}-{nombre}.
 */
export async function subirArchivo(
  fd: FormData,
  bucket: string = BUCKET_DEFAULT,
  prefix: string = 'productos',
): Promise<ActionResult<UploadResult>> {
  return runAction(async () => {
    const file = fd.get('file');
    if (!(file instanceof File)) throw new Error('Archivo no enviado');
    if (!ALLOWED.includes(file.type)) throw new Error(`Tipo no permitido: ${file.type}. Solo PNG/JPG/WebP/AVIF.`);
    if (file.size > MAX_BYTES) throw new Error(`Archivo excede ${(MAX_BYTES / 1024 / 1024).toFixed(0)}MB`);

    const { sb } = await requireUser();

    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png';
    const safeName = file.name.replace(/[^a-z0-9.-]/gi, '_').slice(0, 60);
    const path = `${prefix}/${Date.now()}-${safeName.replace(/\.[^.]+$/, '')}.${ext}`;

    const buf = await file.arrayBuffer();
    const { error: upErr } = await sb.storage.from(bucket).upload(path, buf, {
      contentType: file.type,
      cacheControl: '31536000',
      upsert: false,
    });
    if (upErr) throw new Error(upErr.message);

    const { data: pub } = sb.storage.from(bucket).getPublicUrl(path);
    return { url: pub.publicUrl, path };
  });
}

export async function eliminarArchivo(
  path: string,
  bucket: string = BUCKET_DEFAULT,
): Promise<ActionResult> {
  return runAction(async () => {
    const { sb } = await requireUser();
    const { error } = await sb.storage.from(bucket).remove([path]);
    if (error) throw new Error(error.message);
    return null;
  });
}

/** Server action: agrega imagen a la galería de un producto.
 *  Retorna el id real de la fila creada para que el frontend pueda eliminarla
 *  sin tener que recargar la página (antes usaba un UUID random que no
 *  existía en BD → el botón eliminar fallaba silenciosamente). */
export async function agregarImagenProducto(
  productoId: string,
  url: string,
  esPortada: boolean = false,
): Promise<ActionResult<{ id: string; orden: number }>> {
  return runAction(async () => {
    const { sb } = await requireUser();

    // Idempotencia: si ya existe una imagen con la misma URL en este producto,
    // no insertamos otra fila (evita duplicados al doble-click o re-upload).
    const { data: existing } = await sb
      .from('productos_imagenes')
      .select('id, orden')
      .eq('producto_id', productoId)
      .eq('url', url)
      .maybeSingle();
    if (existing) {
      return { id: existing.id as string, orden: (existing.orden as number) ?? 0 };
    }

    const { data: max } = await sb
      .from('productos_imagenes')
      .select('orden')
      .eq('producto_id', productoId)
      .order('orden', { ascending: false })
      .limit(1)
      .maybeSingle();
    const orden = ((max as { orden?: number } | null)?.orden ?? -1) + 1;

    const { data: row, error } = await sb
      .from('productos_imagenes')
      .insert({
        producto_id: productoId,
        url,
        orden,
        es_portada: esPortada,
        tipo: 'FOTO',
      })
      .select('id, orden')
      .single();
    if (error) throw new Error(error.message);

    if (esPortada) {
      await sb.from('productos').update({ imagen_principal_url: url }).eq('id', productoId);
    }
    return { id: row.id as string, orden: (row.orden as number) ?? orden };
  });
}

export async function eliminarImagenProducto(imagenId: string): Promise<ActionResult> {
  return runAction(async () => {
    const { sb } = await requireUser();
    const { error } = await sb.from('productos_imagenes').delete().eq('id', imagenId);
    if (error) throw new Error(error.message);
    return null;
  });
}
