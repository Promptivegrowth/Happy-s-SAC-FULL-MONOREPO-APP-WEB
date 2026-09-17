/**
 * El contenido editable de la tienda web.
 *
 * Vive en el paquete compartido porque lo escriben desde el ERP y lo lee la
 * web: si cada lado definiera su propia forma, el día que se agregue un campo
 * uno de los dos lo ignoraría en silencio.
 *
 * Todo trae un valor por defecto igual a lo que hoy está publicado. La web
 * nunca debe quedar en blanco porque alguien borró una fila o porque la base
 * no respondió: es una tienda, no un panel interno.
 */

export type LayoutSlide = 'izquierda-lottie' | 'derecha-lottie' | 'centro' | 'centro-amplio';
export type BadgeSlide = 'heart' | 'gift' | 'sparkle';

export type SlideWeb = {
  imagen_url: string;
  alt: string;
  href: string;
  layout: LayoutSlide;
  pretitulo: string;
  titulo: string;
  titulo_acento: string;
  subtitulo: string;
  cta: string;
  badge: BadgeSlide;
  /** Color del título, en hexadecimal. Tiene que contrastar con la foto. */
  titulo_color: string;
  /** Color de la segunda línea del título. */
  acento_color: string;
  /**
   * Animación que acompaña al slide, si la campaña la usa.
   *
   * Es la que hoy hace flotar los corazones del Día de la Madre. Cuando se
   * cambia la campaña hay que cambiarla o vaciarla: los corazones de mayo en
   * un slide de Halloween se ven peor que no tener animación.
   */
  lottie_url: string;
};

export type CtaMayorista = {
  titulo: string;
  subtitulo: string;
  boton: string;
  /** Solo dígitos, con código de país: 51903064120. */
  telefono: string;
  imagen_url: string;
};

export type ContactoWeb = {
  whatsapp: string;
  whatsapp_saludo: string;
  email: string;
  direccion: string;
};

export type RedesWeb = {
  facebook: string;
  instagram: string;
  tiktok: string;
  youtube: string;
};

export type SeccionDestacados = {
  titulo: string;
  etiqueta: string;
  /**
   * Animación que acompaña al título.
   *
   * Es temática igual que la del carrusel: la de hoy son globos del Día de la
   * Madre. Al cambiar de campaña hay que cambiarla o vaciarla.
   */
  lottie_url: string;
};

export type ContenidoWeb = {
  hero_slides: SlideWeb[];
  cta_mayorista: CtaMayorista;
  contacto: ContactoWeb;
  redes: RedesWeb;
  destacados: SeccionDestacados;
};

/** Lo que está publicado hoy. Es el piso: la web nunca muestra menos que esto. */
export const CONTENIDO_POR_DEFECTO: ContenidoWeb = {
  hero_slides: [
    {
      imagen_url: '/slider1.webp',
      alt: 'Día de la Madre — disfraces típicos para mamá',
      href: '/campanias/dia-de-la-madre-2026',
      layout: 'derecha-lottie',
      pretitulo: '✨ Mayo 2026',
      titulo: '¡Feliz día,',
      titulo_acento: 'Mami!',
      subtitulo: 'Disfraces típicos y trajes especiales para que su show del Día de la Madre sea inolvidable.',
      cta: 'Ver colección',
      badge: 'heart',
      titulo_color: '#231459',
      acento_color: '#EC1C24',
      lottie_url: 'https://lottie.host/0be6f22b-54c5-4c84-bce8-5c7367018885/jmgIfyFbJo.lottie',
    },
  ],
  cta_mayorista: {
    titulo: '¿Compra al por mayor o personalizada?',
    subtitulo: 'Hablemos por WhatsApp — atención directa con nuestro equipo',
    boton: 'Escribir al +51 903 064 120',
    telefono: '51903064120',
    imagen_url: '/CTA.webp',
  },
  contacto: {
    whatsapp: '51903064120',
    whatsapp_saludo: 'Hola! Estoy en disfraceshappys.com y quisiera consultar...',
    email: 'ventas@disfraceshappys.com.pe',
    direccion: 'Tiendas físicas: Huallaga · La Quinta (Lima)',
  },
  redes: {
    facebook: 'https://facebook.com/disfraceshappys',
    instagram: 'https://instagram.com/disfraceshappys',
    tiktok: '',
    youtube: '',
  },
  destacados: {
    titulo: 'Lo más TOP',
    etiqueta: 'Selección destacada',
    lottie_url: 'https://lottie.host/3a89ec89-700f-4765-a30e-9209e1133377/zdzFqqAyIg.lottie',
  },
};

const LAYOUTS: LayoutSlide[] = ['izquierda-lottie', 'derecha-lottie', 'centro', 'centro-amplio'];
const BADGES: BadgeSlide[] = ['heart', 'gift', 'sparkle'];

const texto = (v: unknown, porDefecto = ''): string =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : porDefecto;

/**
 * Convierte una fila guardada en un slide utilizable.
 *
 * Un slide sin imagen no se muestra: sería una franja vacía a pantalla
 * completa, que es peor que un slide menos. El resto de los campos se
 * completan con algo sensato antes que descartar el slide entero.
 */
function aSlide(raw: unknown): SlideWeb | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const imagen = texto(r.imagen_url);
  if (!imagen) return null;

  const layout = texto(r.layout) as LayoutSlide;
  const badge = texto(r.badge) as BadgeSlide;

  return {
    imagen_url: imagen,
    alt: texto(r.alt, 'Disfraces Happys'),
    href: texto(r.href, '/disfraces'),
    layout: LAYOUTS.includes(layout) ? layout : 'centro',
    pretitulo: texto(r.pretitulo),
    titulo: texto(r.titulo),
    titulo_acento: texto(r.titulo_acento),
    subtitulo: texto(r.subtitulo),
    cta: texto(r.cta, 'Ver colección'),
    badge: BADGES.includes(badge) ? badge : 'sparkle',
    titulo_color: texto(r.titulo_color, '#231459'),
    acento_color: texto(r.acento_color, '#EC1C24'),
    lottie_url: texto(r.lottie_url),
  };
}

/**
 * Arma el contenido a partir de las filas de `web_config`.
 *
 * Cada clave se resuelve por separado: si el slider está mal cargado, los
 * teléfonos del pie de página siguen saliendo bien. No hay razón para que un
 * error en una sección se lleve puesta a las otras.
 */
export function contenidoDesdeFilas(
  filas: Array<{ clave: string; valor: unknown }> | null | undefined,
): ContenidoWeb {
  const mapa = new Map((filas ?? []).map((f) => [f.clave, f.valor]));
  const objeto = (clave: string): Record<string, unknown> => {
    const v = mapa.get(clave);
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  };

  const slidesRaw = mapa.get('hero_slides');
  const slides = Array.isArray(slidesRaw)
    ? slidesRaw.map(aSlide).filter((s): s is SlideWeb => s !== null)
    : [];

  const cta = objeto('cta_mayorista');
  const destacados = objeto('destacados');
  const contacto = objeto('contacto');
  const redes = objeto('redes');
  const d = CONTENIDO_POR_DEFECTO;

  return {
    hero_slides: slides.length > 0 ? slides : d.hero_slides,
    cta_mayorista: {
      titulo: texto(cta.titulo, d.cta_mayorista.titulo),
      subtitulo: texto(cta.subtitulo, d.cta_mayorista.subtitulo),
      boton: texto(cta.boton, d.cta_mayorista.boton),
      telefono: soloDigitos(texto(cta.telefono, d.cta_mayorista.telefono)),
      imagen_url: texto(cta.imagen_url, d.cta_mayorista.imagen_url),
    },
    contacto: {
      whatsapp: soloDigitos(texto(contacto.whatsapp, d.contacto.whatsapp)),
      whatsapp_saludo: texto(contacto.whatsapp_saludo, d.contacto.whatsapp_saludo),
      email: texto(contacto.email, d.contacto.email),
      direccion: texto(contacto.direccion, d.contacto.direccion),
    },
    redes: {
      facebook: texto(redes.facebook),
      instagram: texto(redes.instagram),
      tiktok: texto(redes.tiktok),
      youtube: texto(redes.youtube),
    },
    destacados: {
      titulo: texto(destacados.titulo, d.destacados.titulo),
      etiqueta: texto(destacados.etiqueta, d.destacados.etiqueta),
      // La animación sí puede quedar vacía: es como se apaga al cambiar de campaña.
      lottie_url: typeof destacados.lottie_url === 'string'
        ? destacados.lottie_url.trim()
        : d.destacados.lottie_url,
    },
  };
}

/**
 * Deja un teléfono como lo quiere WhatsApp: solo dígitos, con código de país.
 *
 * Se escribe de mil maneras —"+51 903 064 120", "903-064-120"— y wa.me no
 * perdona ninguna: con un espacio adentro el enlace abre un chat vacío.
 */
export function soloDigitos(telefono: string): string {
  return (telefono ?? '').replace(/\D/g, '');
}

/** El enlace de WhatsApp, con saludo si se le pasó uno. */
export function enlaceWhatsApp(telefono: string, saludo?: string): string {
  const n = soloDigitos(telefono);
  if (!n) return '#';
  return saludo && saludo.trim()
    ? `https://wa.me/${n}?text=${encodeURIComponent(saludo.trim())}`
    : `https://wa.me/${n}`;
}

/** El teléfono como se lee: +51 903 064 120. */
export function telefonoLegible(telefono: string): string {
  const n = soloDigitos(telefono);
  if (n.length === 11 && n.startsWith('51')) {
    return `+51 ${n.slice(2, 5)} ${n.slice(5, 8)} ${n.slice(8)}`;
  }
  return n ? `+${n}` : '';
}
