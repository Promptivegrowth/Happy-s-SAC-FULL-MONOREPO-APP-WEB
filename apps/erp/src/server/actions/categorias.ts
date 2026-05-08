'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { runAction, requireUser, bumpPaths, type ActionResult } from './_helpers';

const schema = z.object({
  // codigo opcional: si vacío al submit, se autogenera desde el nombre.
  codigo: z.string().max(20).optional().or(z.literal('')),
  nombre: z.string().min(2, 'Mínimo 2 caracteres').max(100),
  descripcion: z.string().optional().or(z.literal('')),
  slug: z.string().regex(/^[a-z0-9-]+$/, 'Solo minúsculas, números y guiones').optional().or(z.literal('')),
  icono: z.string().optional().or(z.literal('')),
  imagen_url: z.string().url('URL de imagen inválida').optional().or(z.literal('')),
  publicar_en_web: z.boolean().default(true),
  orden_web: z.coerce.number().int().min(0).default(100),
  activo: z.boolean().default(true),
});

function parseForm(fd: FormData) {
  return schema.parse({
    codigo: fd.get('codigo') || '',
    nombre: fd.get('nombre'),
    descripcion: fd.get('descripcion') || '',
    slug: fd.get('slug') || '',
    icono: fd.get('icono') || '',
    imagen_url: fd.get('imagen_url') || '',
    publicar_en_web: fd.get('publicar_en_web') === 'on',
    orden_web: fd.get('orden_web') || 100,
    activo: fd.get('activo') === 'on',
  });
}

/**
 * Normaliza un texto: mayúsculas, sin acentos, solo letras A-Z.
 * "Día de la Madre" → "DIADELAMADRE"
 */
function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '');
}

/**
 * Genera candidatos de prefijo de 3 letras desde un nombre, ordenados por
 * preferencia. Estrategia escalonada para evitar colisiones:
 *   1. 1ra letra + 2 primeras consonantes distintas    "HALLOWEEN" → HLW
 *   2. 1ra letra + 2 primeras consonantes (con repes)  "HALLOWEEN" → HLL
 *   3. 1ra letra + 1 consonante + 1 vocal              "HALLOWEEN" → HLA
 *   4. Primeras 3 letras tal cual                      "HALLOWEEN" → HAL
 *   5. Sufijo numérico sobre el primer candidato       "HLW" + 2 → HLW2
 */
function generarCandidatos(nombre: string): string[] {
  const norm = normalizar(nombre);
  if (norm.length === 0) return ['PRD'];
  if (norm.length <= 3) return [norm.padEnd(3, 'X')];

  const primera = norm[0]!;
  const resto = norm.slice(1);
  const consonantes = resto.replace(/[AEIOU]/g, '');
  const consonantesUnicas = Array.from(new Set(consonantes));
  const vocales = resto.replace(/[^AEIOU]/g, '');

  const candidatos = new Set<string>();
  // 1. 1ra + 2 consonantes únicas
  if (consonantesUnicas.length >= 2) {
    candidatos.add(primera + consonantesUnicas[0] + consonantesUnicas[1]);
  }
  // 2. 1ra + 2 consonantes (con repes)
  if (consonantes.length >= 2) {
    candidatos.add(primera + consonantes[0] + consonantes[1]);
  }
  // 3. 1ra + 1 consonante + 1 vocal
  if (consonantes.length >= 1 && vocales.length >= 1) {
    candidatos.add(primera + consonantes[0] + vocales[0]);
  }
  // 4. Primeras 3 letras tal cual
  candidatos.add(norm.slice(0, 3));
  return Array.from(candidatos);
}

/**
 * Devuelve un código de 3 letras libre para una categoría nueva, basado en
 * el nombre. Si todos los candidatos chocan, sufija con número (HLW2, HLW3).
 * `excluirId`: al editar, ignora la categoría actual al chequear duplicados.
 */
export async function sugerirCodigoCategoria(
  nombre: string,
  excluirId?: string,
): Promise<ActionResult<{ codigo: string; alternativo: boolean }>> {
  const r = await runAction(async () => {
    if (!nombre || nombre.trim().length < 2) {
      return { codigo: '', alternativo: false };
    }
    const { sb } = await requireUser();
    const candidatos = generarCandidatos(nombre);

    // Chequea cada candidato contra la base; el primero libre gana.
    let q = sb.from('categorias').select('codigo').in('codigo', candidatos);
    if (excluirId) q = q.neq('id', excluirId);
    const { data: ocupados } = await q;
    const tomados = new Set((ocupados ?? []).map((r) => r.codigo as string));
    const libre = candidatos.find((c) => !tomados.has(c));
    if (libre) return { codigo: libre, alternativo: libre !== candidatos[0] };

    // Todos chocan: sufija el primero con un número incremental.
    const base = candidatos[0]!.slice(0, 3);
    for (let n = 2; n <= 99; n++) {
      const intento = `${base}${n}`;
      let q2 = sb.from('categorias').select('id').eq('codigo', intento);
      if (excluirId) q2 = q2.neq('id', excluirId);
      const { data: hit } = await q2.maybeSingle();
      if (!hit) return { codigo: intento, alternativo: true };
    }
    throw new Error('No se pudo generar un código libre. Ingresá uno manualmente.');
  });
  return r;
}

export async function crearCategoria(_prev: unknown, fd: FormData): Promise<ActionResult<{ id: string }>> {
  const r = await runAction(async () => {
    const data = parseForm(fd);
    const { sb } = await requireUser();

    // Si vino sin código, autogenerar uno libre desde el nombre.
    let codigo = (data.codigo ?? '').trim().toUpperCase();
    if (!codigo) {
      const sug = await sugerirCodigoCategoria(data.nombre);
      if (!sug.ok || !sug.data?.codigo) {
        throw new Error(sug.error ?? 'No se pudo generar el código automáticamente');
      }
      codigo = sug.data.codigo;
    }

    const { data: row, error } = await sb.from('categorias').insert({
      ...data,
      codigo,
      slug: data.slug || data.nombre.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      descripcion: data.descripcion || null,
      icono: data.icono || null,
      imagen_url: data.imagen_url || null,
    }).select('id').single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });
  if (r.ok) {
    await bumpPaths('/categorias', '/web-catalogo');
    redirect('/categorias');
  }
  return r;
}

export async function actualizarCategoria(id: string, _prev: unknown, fd: FormData): Promise<ActionResult> {
  const r = await runAction(async () => {
    const data = parseForm(fd);
    const codigo = (data.codigo ?? '').trim().toUpperCase();
    if (!codigo) {
      // En edición el código no se regenera automáticamente: protege la
      // trazabilidad de los SKUs existentes que ya derivan de él.
      throw new Error('El código no puede quedar vacío al editar una categoría existente.');
    }
    const { sb } = await requireUser();
    const { error } = await sb.from('categorias').update({
      ...data,
      codigo,
      slug: data.slug || data.nombre.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      descripcion: data.descripcion || null,
      icono: data.icono || null,
      imagen_url: data.imagen_url || null,
    }).eq('id', id);
    if (error) throw new Error(error.message);
    return null;
  });
  if (r.ok) {
    await bumpPaths('/categorias', `/categorias/${id}`, '/web-catalogo');
    redirect('/categorias');
  }
  return r;
}

/**
 * Toggle de categoría. Considera categorías extra: un producto NO se
 * despublica si todavía pertenece a otra categoría activa (principal
 * o extra). Es la "red de seguridad" pedida por el negocio para que
 * los disfraces multi-temporada (Halloween + Día de la Madre) no
 * desaparezcan al rotar campañas.
 *
 * - ENCENDER: publica todos los productos cuya principal sea esta
 *   categoría O que la tengan como extra.
 * - APAGAR: despublica solo los productos que se quedan SIN
 *   ninguna categoría activa (ni principal ni extras).
 */
export async function toggleCategoriaActivo(
  id: string,
  activo: boolean,
): Promise<ActionResult<{ afectados: number }>> {
  const r = await runAction(async () => {
    const { sb, userId } = await requireUser();

    const { error: errCat } = await sb.from('categorias').update({ activo }).eq('id', id);
    if (errCat) throw new Error(errCat.message);

    // Productos que tocan a esta categoría (como principal O como extra).
    // Cast hasta regenerar tipos tras aplicar mig 31.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sbAny = sb as unknown as { from: (t: string) => any };
    const [{ data: principales }, { data: extras }] = await Promise.all([
      sb.from('productos').select('id').eq('categoria_id', id).eq('activo', true),
      sbAny
        .from('productos_categorias_extra')
        .select('producto_id, productos!inner(activo)')
        .eq('categoria_id', id)
        .eq('productos.activo', true),
    ]);

    const idsPrincipales = (principales ?? []).map((p) => p.id as string);
    const idsExtras = ((extras ?? []) as { producto_id: string }[]).map((e) => e.producto_id);
    const idsAfectados = Array.from(new Set([...idsPrincipales, ...idsExtras]));

    if (idsAfectados.length === 0) return { afectados: 0 };

    if (activo) {
      // ENCENDER: publica todos los afectados (principales + extras).
      const ahora = new Date().toISOString();
      const filas = idsAfectados.map((pid) => ({
        producto_id: pid,
        publicado: true,
        publicado_por: userId,
        publicado_en: ahora,
      }));
      const { error: errPub } = await sb
        .from('productos_publicacion')
        .upsert(filas, { onConflict: 'producto_id' });
      if (errPub) throw new Error(errPub.message);
    } else {
      // APAGAR: solo despublica los que se quedan sin ninguna otra
      // categoría activa. Para eso traemos para cada afectado todas
      // sus categorías (principal + extras) y vemos si al menos una
      // sigue activa (excluyendo la que acabamos de apagar).
      const [{ data: prodCats }, { data: extrasCats }] = await Promise.all([
        sb
          .from('productos')
          .select('id, categorias!inner(id, activo)')
          .in('id', idsAfectados),
        sbAny
          .from('productos_categorias_extra')
          .select('producto_id, categorias!inner(id, activo)')
          .in('producto_id', idsAfectados),
      ]);

      type CatRef = { id: string; activo: boolean };
      const altActivasPorProd = new Map<string, boolean>();
      for (const p of prodCats ?? []) {
        const cat = (p as unknown as { categorias: CatRef }).categorias;
        if (cat && cat.id !== id && cat.activo) altActivasPorProd.set(p.id as string, true);
      }
      for (const e of (extrasCats ?? []) as { producto_id: string; categorias?: CatRef }[]) {
        const cat = e.categorias;
        if (cat && cat.id !== id && cat.activo) {
          altActivasPorProd.set(e.producto_id, true);
        }
      }

      const idsADespublicar = idsAfectados.filter((pid) => !altActivasPorProd.get(pid));
      if (idsADespublicar.length > 0) {
        const { error: errUnpub } = await sb
          .from('productos_publicacion')
          .update({ publicado: false })
          .in('producto_id', idsADespublicar);
        if (errUnpub) throw new Error(errUnpub.message);
      }
    }

    return { afectados: idsAfectados.length };
  });
  if (r.ok) await bumpPaths('/categorias', '/web-catalogo', '/productos');
  return r;
}

/**
 * Atajo de emergencia: enciende TODAS las categorías + publica TODOS
 * los productos con categoría asignada en un click.
 * - Categorías apagadas → se encienden (activo=true)
 * - Productos con categoría → se publican (publicado=true)
 * - Productos SIN categoría (huérfanos) → se omiten (necesitan
 *   que el usuario les asigne categoría primero). Se reporta el
 *   conteo para mostrar la alerta separada con CTA "Asignar categoría".
 */
export async function publicarTodoElCatalogo(): Promise<ActionResult<{ publicados: number; categorias: number; huerfanos: number }>> {
  const r = await runAction(async () => {
    const { sb, userId } = await requireUser();

    // Encender todas las categorías que estuvieran apagadas.
    const { data: cats } = await sb.from('categorias').select('id, activo');
    if (!cats || cats.length === 0) return { publicados: 0, categorias: 0, huerfanos: 0 };

    const apagadas = cats.filter((c) => !c.activo).map((c) => c.id);
    if (apagadas.length > 0) {
      const { error: errCat } = await sb
        .from('categorias')
        .update({ activo: true })
        .in('id', apagadas);
      if (errCat) throw new Error(errCat.message);
    }

    const catIds = cats.map((c) => c.id);
    const { data: prods } = await sb
      .from('productos')
      .select('id')
      .in('categoria_id', catIds)
      .eq('activo', true);

    // Conteo informativo de huérfanos para mostrar al usuario.
    const { count: huerfanos } = await sb
      .from('productos')
      .select('id', { count: 'exact', head: true })
      .is('categoria_id', null)
      .eq('activo', true);

    if (!prods || prods.length === 0) {
      return { publicados: 0, categorias: cats.length, huerfanos: huerfanos ?? 0 };
    }

    const ahora = new Date().toISOString();
    const filas = prods.map((p) => ({
      producto_id: p.id,
      publicado: true,
      publicado_por: userId,
      publicado_en: ahora,
    }));

    const { error } = await sb
      .from('productos_publicacion')
      .upsert(filas, { onConflict: 'producto_id' });
    if (error) throw new Error(error.message);

    return { publicados: prods.length, categorias: cats.length, huerfanos: huerfanos ?? 0 };
  });
  if (r.ok) await bumpPaths('/categorias', '/web-catalogo', '/productos');
  return r;
}

/**
 * Asigna una categoría en lote a TODOS los productos huérfanos
 * (categoria_id null) que coincidan con un patrón en el nombre, o a
 * ids específicos. Útil para clasificar masivamente los auto-creados
 * desde import de fotos.
 */
export async function asignarCategoriaMasivo(
  categoriaId: string,
  productoIds: string[],
): Promise<ActionResult<{ asignados: number }>> {
  const r = await runAction(async () => {
    if (!productoIds || productoIds.length === 0) {
      throw new Error('Selecciona al menos un producto');
    }
    const { sb } = await requireUser();
    const { error } = await sb
      .from('productos')
      .update({ categoria_id: categoriaId })
      .in('id', productoIds);
    if (error) throw new Error(error.message);
    return { asignados: productoIds.length };
  });
  if (r.ok) await bumpPaths('/categorias', '/productos', '/web-catalogo');
  return r;
}

/**
 * Acción masiva: publica TODOS los productos activos de una categoría.
 * Hace upsert en productos_publicacion con publicado=true para cada uno.
 * Retorna el número de productos efectivamente publicados (excluye los que ya estaban).
 */
export async function publicarTodosCategoria(categoriaId: string): Promise<ActionResult<{ afectados: number }>> {
  const r = await runAction(async () => {
    const { sb, userId } = await requireUser();

    // Traer todos los productos activos de la categoría
    const { data: prods, error: errProds } = await sb
      .from('productos')
      .select('id')
      .eq('categoria_id', categoriaId)
      .eq('activo', true);
    if (errProds) throw new Error(errProds.message);
    if (!prods || prods.length === 0) return { afectados: 0 };

    const ahora = new Date().toISOString();
    const filas = prods.map((p) => ({
      producto_id: p.id,
      publicado: true,
      publicado_por: userId,
      publicado_en: ahora,
    }));

    // Upsert por producto_id (PK de productos_publicacion). El trigger
    // tg_publicacion_set_slug se encarga de generar slug si falta.
    const { error } = await sb
      .from('productos_publicacion')
      .upsert(filas, { onConflict: 'producto_id' });
    if (error) throw new Error(error.message);

    return { afectados: prods.length };
  });
  if (r.ok) await bumpPaths('/categorias', '/web-catalogo', '/productos');
  return r;
}

/** Despublica TODOS los productos de una categoría (publicado=false). */
export async function despublicarTodosCategoria(categoriaId: string): Promise<ActionResult<{ afectados: number }>> {
  const r = await runAction(async () => {
    const { sb } = await requireUser();
    const { data: prods, error: errProds } = await sb
      .from('productos')
      .select('id')
      .eq('categoria_id', categoriaId);
    if (errProds) throw new Error(errProds.message);
    if (!prods || prods.length === 0) return { afectados: 0 };

    const { error } = await sb
      .from('productos_publicacion')
      .update({ publicado: false })
      .in('producto_id', prods.map((p) => p.id));
    if (error) throw new Error(error.message);
    return { afectados: prods.length };
  });
  if (r.ok) await bumpPaths('/categorias', '/web-catalogo', '/productos');
  return r;
}

export async function eliminarCategoria(id: string): Promise<ActionResult> {
  const r = await runAction(async () => {
    const { sb } = await requireUser();
    const { error } = await sb.from('categorias').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return null;
  });
  if (r.ok) await bumpPaths('/categorias', '/web-catalogo');
  return r;
}
