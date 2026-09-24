'use server';

/**
 * Las campañas de la tienda web: Halloween, Navidad, Fiestas Patrias.
 *
 * Toda esa sección de la web ya salía de la base —el título, el texto, las
 * fechas, el banner, y el botón del menú que aparece solo cuando una campaña
 * está vigente— pero no había ninguna pantalla para tocarla. Cambiar de
 * temporada significaba entrar a la base a mano, y asignar los productos era
 * abrir la ficha de cada disfraz uno por uno. Halloween 2026 llegó al 21/09/2026
 * publicada y con CERO productos por eso mismo.
 *
 * La campaña vigente la elige la fecha, no un botón: la web busca la que esté
 * activa y cuyo rango incluya el día de hoy. Por eso las fechas son lo que de
 * verdad enciende y apaga la sección, y la pantalla lo dice así.
 */

import { z } from 'zod';
import { runAction, requireUser, bumpPaths, type ActionResult } from './_helpers';

/*
 * El diseño de la campaña (mig 105): colores, textos y la pestaña del menú.
 *
 * Llega del formulario como un solo JSON y se valida campo por campo: es lo que
 * después pinta la tienda web, así que un color mal escrito no puede pasar. Todo
 * es opcional; lo que no venga, la web lo completa con el diseño de siempre.
 */
const HEX = /^#[0-9a-fA-F]{6}$/;
const color = z.string().regex(HEX, 'Color inválido').optional();
const texto = (max: number) => z.string().max(max, `Máximo ${max} caracteres`).optional();
const estiloSchema = z.object({
  color_inicio: color,
  color_medio: color,
  color_fin: color,
  color_texto: z.enum(['auto', 'claro', 'oscuro']).optional(),
  etiqueta: texto(40),
  mostrar_fechas: z.boolean().optional(),
  imagen_modo: z.enum(['fondo', 'suave']).optional(),
  menu_texto: texto(30),
  menu_color: color,
  menu_etiqueta: texto(12),
  menu_etiqueta_color: color,
}).strict();

function parseEstilo(raw: FormDataEntryValue | null) {
  if (!raw || typeof raw !== 'string') return {};
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    throw new Error('El diseño de la campaña llegó mal armado. Recarga la página e intenta de nuevo.');
  }
  const r = estiloSchema.safeParse(obj);
  if (!r.success) throw new Error(`Diseño de la campaña: ${r.error.issues[0]?.message ?? 'dato inválido'}`);
  return r.data;
}

const schema = z.object({
  codigo: z.string().min(2, 'Mínimo 2 caracteres').max(40),
  nombre: z.string().min(2, 'Mínimo 2 caracteres').max(100),
  descripcion: z.string().optional().or(z.literal('')),
  slug: z.string().regex(/^[a-z0-9-]+$/, 'Solo minúsculas, números y guiones').optional().or(z.literal('')),
  fecha_inicio: z.string().min(1, 'Poné desde cuándo se muestra'),
  fecha_fin: z.string().min(1, 'Poné hasta cuándo se muestra'),
  banner_url: z.string().url('La dirección del banner no es válida').optional().or(z.literal('')),
  activa: z.boolean().default(true),
  destacada_web: z.boolean().default(false),
  orden_web: z.coerce.number().int().min(0).default(100),
});

function slugificar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function parseForm(fd: FormData) {
  const data = schema.parse({
    codigo: fd.get('codigo'),
    nombre: fd.get('nombre'),
    descripcion: fd.get('descripcion') || '',
    slug: fd.get('slug') || '',
    fecha_inicio: fd.get('fecha_inicio'),
    fecha_fin: fd.get('fecha_fin'),
    banner_url: fd.get('banner_url') || '',
    activa: fd.get('activa') === 'on',
    destacada_web: fd.get('destacada_web') === 'on',
    orden_web: fd.get('orden_web') || 100,
  });

  /*
   * Una campaña que termina antes de empezar no se muestra NUNCA, y no hay
   * nada en pantalla que lo delate: queda cargada, activa, y muda. Se corta
   * acá, que es donde todavía se puede explicar.
   */
  if (data.fecha_fin < data.fecha_inicio) {
    throw new Error('La fecha de fin no puede ser anterior a la de inicio: así la campaña no se mostraría nunca.');
  }

  return {
    ...data,
    slug: data.slug || slugificar(data.nombre),
    descripcion: data.descripcion || null,
    banner_url: data.banner_url || null,
    estilo: parseEstilo(fd.get('estilo')),
  };
}

export async function crearCampana(_prev: unknown, fd: FormData): Promise<ActionResult<{ id: string }>> {
  const r = await runAction(async () => {
    const data = parseForm(fd);
    const { sb } = await requireUser();
    // Cast hasta regenerar tipos: `estilo` es de la mig 105.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: row, error } = await (sb as unknown as { from: (t: string) => any })
      .from('campanas')
      .insert({ ...data, codigo: data.codigo.trim().toUpperCase() })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string };
  });
  if (r.ok) await bumpPaths('/campanias');
  return r;
}

export async function actualizarCampana(id: string, _prev: unknown, fd: FormData): Promise<ActionResult> {
  const r = await runAction(async () => {
    const data = parseForm(fd);
    const { sb } = await requireUser();
    // Cast hasta regenerar tipos: `estilo` es de la mig 105.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (sb as unknown as { from: (t: string) => any })
      .from('campanas')
      .update({ ...data, codigo: data.codigo.trim().toUpperCase() })
      .eq('id', id);
    if (error) throw new Error(error.message);
    return null;
  });
  if (r.ok) await bumpPaths('/campanias', `/campanias/${id}`);
  return r;
}

/**
 * Prende o apaga la campaña sin tocar las fechas.
 *
 * Sirve para bajarla YA sin perder el rango cargado: si se apaga, la web deja
 * de mostrarla aunque esté dentro de fecha, y al volver a prenderla sigue
 * valiendo el mismo período.
 */
export async function toggleCampanaActiva(id: string, activa: boolean): Promise<ActionResult> {
  const r = await runAction(async () => {
    const { sb } = await requireUser();
    const { error } = await sb.from('campanas').update({ activa }).eq('id', id);
    if (error) throw new Error(error.message);
    return null;
  });
  if (r.ok) await bumpPaths('/campanias', `/campanias/${id}`);
  return r;
}

/**
 * Suma o saca productos de la campaña, de a muchos.
 *
 * Un producto pertenece a UNA campaña (`productos.campana_id`), así que sacarlo
 * es dejarlo en null y no borrar una fila intermedia.
 *
 * Devuelve cuántos quedaron sin publicar en la web, porque es el error que se
 * repite: se asignan treinta disfraces a Halloween, la página sigue vacía, y
 * nadie entiende que además hay que publicarlos en Publicación Web.
 */
export async function asignarProductosACampana(
  campanaId: string,
  productoIds: string[],
  quitar = false,
): Promise<ActionResult<{ afectados: number; sinPublicar: number }>> {
  const r = await runAction(async () => {
    if (productoIds.length === 0) throw new Error('No elegiste ningún producto');
    const { sb } = await requireUser();

    const { error } = await sb
      .from('productos')
      .update({ campana_id: quitar ? null : campanaId })
      .in('id', productoIds);
    if (error) throw new Error(error.message);

    if (quitar) return { afectados: productoIds.length, sinPublicar: 0 };

    const { data: pubs } = await sb
      .from('productos_publicacion')
      .select('producto_id, publicado')
      .in('producto_id', productoIds);
    const publicados = new Set(
      ((pubs ?? []) as { producto_id: string; publicado: boolean | null }[])
        .filter((p) => p.publicado)
        .map((p) => p.producto_id),
    );
    return {
      afectados: productoIds.length,
      sinPublicar: productoIds.filter((id) => !publicados.has(id)).length,
    };
  });
  if (r.ok) await bumpPaths('/campanias', `/campanias/${campanaId}`, '/web-catalogo');
  return r;
}
