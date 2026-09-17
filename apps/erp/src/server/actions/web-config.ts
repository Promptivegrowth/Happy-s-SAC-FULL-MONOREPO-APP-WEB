'use server';

/**
 * Lo que se edita de la tienda web desde el ERP.
 *
 * El slider de la portada, el banner de venta al por mayor, los teléfonos y las
 * redes. Antes vivían dentro del código del sitio: cambiar la campaña de mayo
 * por la de Halloween significaba editar un archivo y volver a publicar la web.
 *
 * Al guardar se revalida la portada de la tienda además de la pantalla del ERP,
 * para que el cambio se vea de inmediato y no dentro de una hora, cuando venza
 * la caché. Quien edita necesita abrir la web en otra pestaña y comprobar.
 */

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@happy/db/server';
import { requireRol } from '@/server/session';
import {
  contenidoDesdeFilas, soloDigitos, type ContenidoWeb,
} from '@happy/lib/web/contenido';

const BUCKET = 'banners-web';
const MAX_BYTES = 6 * 1024 * 1024;
const TIPOS = ['image/webp', 'image/jpeg', 'image/png', 'image/avif'];

export async function obtenerContenido(): Promise<ContenidoWeb> {
  const sb = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sbAny = sb as unknown as { from: (t: string) => any };
  const { data } = await sbAny.from('web_config').select('clave, valor');
  return contenidoDesdeFilas(data as Array<{ clave: string; valor: unknown }> | null);
}

const slideSchema = z.object({
  imagen_url: z.string().trim().min(1, 'Cada slide necesita una imagen'),
  alt: z.string().trim().max(200).default(''),
  href: z.string().trim().max(300).default('/disfraces'),
  layout: z.enum(['izquierda-lottie', 'derecha-lottie', 'centro', 'centro-amplio']),
  pretitulo: z.string().trim().max(60).default(''),
  titulo: z.string().trim().max(60).default(''),
  titulo_acento: z.string().trim().max(60).default(''),
  subtitulo: z.string().trim().max(300).default(''),
  cta: z.string().trim().max(40).default('Ver colección'),
  badge: z.enum(['heart', 'gift', 'sparkle']),
  titulo_color: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, 'El color va en formato #RRGGBB'),
  acento_color: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, 'El color va en formato #RRGGBB'),
  lottie_url: z.string().trim().max(500).default(''),
});

const schema = z.object({
  hero_slides: z.array(slideSchema).max(6, 'Con más de 6 slides nadie llega a ver el último'),
  cta_mayorista: z.object({
    titulo: z.string().trim().max(120).default(''),
    subtitulo: z.string().trim().max(200).default(''),
    boton: z.string().trim().max(60).default(''),
    telefono: z.string().trim().max(30).default(''),
    imagen_url: z.string().trim().max(500).default(''),
  }),
  contacto: z.object({
    whatsapp: z.string().trim().max(30).default(''),
    whatsapp_saludo: z.string().trim().max(300).default(''),
    email: z.string().trim().max(120).default(''),
    direccion: z.string().trim().max(200).default(''),
  }),
  redes: z.object({
    facebook: z.string().trim().max(300).default(''),
    instagram: z.string().trim().max(300).default(''),
    tiktok: z.string().trim().max(300).default(''),
    youtube: z.string().trim().max(300).default(''),
  }),
  destacados: z.object({
    titulo: z.string().trim().max(60).default('Lo más TOP'),
    etiqueta: z.string().trim().max(60).default('Selección destacada'),
    lottie_url: z.string().trim().max(500).default(''),
  }),
});

/** Una red vacía se guarda vacía; una cargada tiene que ser un enlace de verdad. */
function urlValida(u: string): boolean {
  if (!u) return true;
  return /^https?:\/\/.+\..+/.test(u);
}

export async function guardarContenidoWeb(
  input: z.infer<typeof schema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireRol('gerente');
    const d = schema.parse(input);

    if (d.hero_slides.length === 0) {
      return { ok: false, error: 'Deja al menos un slide: la portada arranca con el carrusel y sin slides queda en blanco.' };
    }
    for (const [i, r] of Object.entries(d.redes)) {
      if (!urlValida(r)) {
        return { ok: false, error: `El enlace de ${i} tiene que empezar con https:// y ser una dirección completa.` };
      }
    }
    if (d.contacto.whatsapp && soloDigitos(d.contacto.whatsapp).length < 9) {
      return { ok: false, error: 'El WhatsApp necesita el código de país: 51 y los 9 dígitos, por ejemplo 51903064120.' };
    }

    const sb = await createClient();
    const { data: { user } } = await sb.auth.getUser();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sbAny = sb as unknown as { from: (t: string) => any };

    const filas = [
      { clave: 'hero_slides', valor: d.hero_slides },
      { clave: 'cta_mayorista', valor: { ...d.cta_mayorista, telefono: soloDigitos(d.cta_mayorista.telefono) } },
      { clave: 'contacto', valor: { ...d.contacto, whatsapp: soloDigitos(d.contacto.whatsapp) } },
      { clave: 'redes', valor: d.redes },
      { clave: 'destacados', valor: d.destacados },
    ];

    for (const f of filas) {
      const { error } = await sbAny
        .from('web_config')
        .upsert({ ...f, actualizado_por: user?.id ?? null, updated_at: new Date().toISOString() },
                { onConflict: 'clave' });
      if (error) return { ok: false, error: error.message };
    }

    revalidatePath('/configuracion/web');
    return { ok: true };
  } catch (e) {
    const msg = e instanceof z.ZodError
      ? (e.errors[0]?.message ?? 'Datos inválidos')
      : (e as Error).message || 'No se pudo guardar';
    return { ok: false, error: msg };
  }
}

/**
 * Sube una imagen del sitio y devuelve su dirección pública.
 *
 * No se comprueba el tamaño en píxeles acá: el navegador ya lo midió antes de
 * mandarla y avisó si no coincide. Lo que sí se corta es el peso, porque una
 * foto de 8 MB en la portada la hace lenta para todos, sobre todo en celular.
 */
export async function subirImagenWeb(
  fd: FormData,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  try {
    await requireRol('gerente');
    const file = fd.get('file');
    if (!(file instanceof File)) return { ok: false, error: 'No llegó ningún archivo' };
    if (!TIPOS.includes(file.type)) {
      return { ok: false, error: `Formato no admitido (${file.type}). Usa WebP, JPG o PNG.` };
    }
    if (file.size > MAX_BYTES) {
      return {
        ok: false,
        error: `La imagen pesa ${(file.size / 1024 / 1024).toFixed(1)} MB y el máximo son 6 MB. Conviértela a WebP para bajarle el peso sin perder calidad.`,
      };
    }

    const sb = await createClient();
    const ext = (file.name.split('.').pop() ?? 'webp').toLowerCase();
    const base = file.name.replace(/\.[^.]+$/, '').replace(/[^a-z0-9-]/gi, '-').slice(0, 50);
    const path = `portada/${Date.now()}-${base}.${ext}`;

    const { error } = await sb.storage.from(BUCKET).upload(path, await file.arrayBuffer(), {
      contentType: file.type,
      cacheControl: '31536000',
      upsert: false,
    });
    if (error) return { ok: false, error: error.message };

    const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
    return { ok: true, url: data.publicUrl };
  } catch (e) {
    return { ok: false, error: (e as Error).message || 'No se pudo subir la imagen' };
  }
}
