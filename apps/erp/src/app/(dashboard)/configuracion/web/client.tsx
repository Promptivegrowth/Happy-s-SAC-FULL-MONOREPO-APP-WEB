'use client';

/**
 * Editor del contenido de la tienda web.
 *
 * Todo lo que se toca acá sale publicado apenas se guarda. Por eso la pantalla
 * insiste en dos cosas: decir el tamaño exacto que tiene que tener cada imagen
 * ANTES de subirla, y avisar cuando la que se eligió no lo cumple. Una foto con
 * la proporción equivocada no da error: sale recortada por la mitad, y eso se
 * descubre mirando la web, no acá.
 */

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@happy/ui/card';
import { Button } from '@happy/ui/button';
import { Input } from '@happy/ui/input';
import { Badge } from '@happy/ui/badge';
import {
  Save, Loader2, Upload, Trash2, Plus, ArrowUp, ArrowDown,
  ExternalLink, Image as IconoImagen, AlertTriangle, Info,
} from 'lucide-react';
import { toast } from 'sonner';
import { guardarContenidoWeb, subirImagenWeb } from '@/server/actions/web-config';
import type { ContenidoWeb, SlideWeb } from '@happy/lib/web/contenido';

/**
 * Las medidas de cada imagen del sitio.
 *
 * Salen de medir las que están publicadas hoy y del espacio real que ocupan en
 * pantalla. `tolerancia` es cuánto puede desviarse la proporción antes de que
 * se note el recorte: 4 % es aproximadamente un dedo de foto perdido en un
 * monitor de escritorio.
 */
const MEDIDAS = {
  slide: { ancho: 1920, alto: 800, nombre: 'slide del carrusel', tolerancia: 0.04 },
  cta: { ancho: 1920, alto: 900, nombre: 'fondo del banner mayorista', tolerancia: 0.06 },
} as const;

type Medida = typeof MEDIDAS[keyof typeof MEDIDAS];

/** Mide una imagen en el navegador, antes de mandarla al servidor. */
function medirImagen(file: File): Promise<{ ancho: number; alto: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ ancho: img.naturalWidth, alto: img.naturalHeight });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen')); };
    img.src = url;
  });
}

function CampoImagen({
  valor, medida, onCambio, disabled, urlWeb,
}: {
  valor: string;
  medida: Medida;
  onCambio: (url: string) => void;
  disabled?: boolean;
  /** Dónde vive la tienda: hace falta para ver las imágenes que están allá. */
  urlWeb: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [noCarga, setNoCarga] = useState(false);

  /*
   * De dónde sale la miniatura.
   *
   * Las imágenes que se suben desde acá quedan con dirección completa y se ven
   * sin más. Las originales —"/slider1.webp"— viven en la carpeta pública de la
   * TIENDA, que es otro sitio en otro dominio: pedirlas así, tal cual, las
   * buscaba dentro del ERP, donde no están, y la vista previa salía rota. Se
   * les antepone la dirección de la tienda.
   */
  const esAbsoluta = /^https?:\/\//i.test(valor);
  const src = !valor ? '' : esAbsoluta ? valor : `${urlWeb.replace(/\/$/, '')}${valor.startsWith('/') ? '' : '/'}${valor}`;

  async function elegir(file: File) {
    setAviso(null);
    setSubiendo(true);
    try {
      const { ancho, alto } = await medirImagen(file);

      /*
       * Se avisa, no se bloquea.
       *
       * Puede haber una razón para subir algo distinto —una promo puntual, una
       * imagen que el diseñador hizo a otra medida— y negarse dejaría a quien
       * edita sin salida un viernes a las 7 de la tarde. Lo que no puede pasar
       * es que se entere mirando la web.
       */
      const proporcionPedida = medida.ancho / medida.alto;
      const proporcionReal = ancho / alto;
      const desvio = Math.abs(proporcionReal - proporcionPedida) / proporcionPedida;
      if (desvio > medida.tolerancia) {
        setAviso(
          `La imagen es de ${ancho}×${alto}. Para el ${medida.nombre} la proporción tiene que parecerse a ` +
          `${medida.ancho}×${medida.alto}; con esta, la web va a recortarla por arriba y abajo.`,
        );
      } else if (ancho < medida.ancho * 0.8) {
        setAviso(`La imagen mide ${ancho} px de ancho y se va a ver borrosa en pantallas grandes. Lo ideal son ${medida.ancho} px.`);
      }

      const fd = new FormData();
      fd.append('file', file);
      const r = await subirImagenWeb(fd);
      if (!r.ok) { toast.error(r.error); return; }
      setNoCarga(false);
      onCambio(r.url);
      toast.success('Imagen subida');
    } catch (e) {
      toast.error((e as Error).message ?? 'No se pudo subir');
    } finally {
      setSubiendo(false);
      if (ref.current) ref.current.value = '';
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        {valor && !noCarga ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt=""
            className="h-16 w-28 rounded border bg-slate-50 object-cover"
            onError={() => setNoCarga(true)}
            onLoad={() => setNoCarga(false)}
          />
        ) : (
          /*
            Sin miniatura, se dice por qué.
            Un recuadro roto hace pensar que la imagen se perdió, cuando lo más
            probable es que esté publicada y solo no se pueda mostrar desde acá.
          */
          <div className="flex h-16 w-28 flex-col items-center justify-center gap-0.5 rounded border border-dashed bg-slate-50 text-center text-slate-400">
            <IconoImagen className="h-4 w-4" />
            {valor && <span className="px-1 text-[8px] leading-tight">sin vista previa</span>}
          </div>
        )}
        <div className="flex flex-col gap-1">
          <Button
            type="button" variant="outline" size="sm"
            onClick={() => ref.current?.click()}
            disabled={disabled || subiendo}
          >
            {subiendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {valor ? 'Cambiar imagen' : 'Subir imagen'}
          </Button>
          <span className="text-[10px] text-slate-500">
            {medida.ancho} × {medida.alto} px · WebP o JPG · máx. 6 MB
          </span>
        </div>
        <input
          ref={ref} type="file" accept="image/webp,image/jpeg,image/png,image/avif"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void elegir(f); }}
        />
      </div>

      <Input
        value={valor}
        onChange={(e) => onCambio(e.target.value)}
        placeholder="/slider1.webp o una dirección https://…"
        disabled={disabled}
        className="h-8 font-mono text-[11px]"
      />

      {valor && noCarga && (
        <p className="flex items-start gap-1.5 rounded-md border bg-slate-50 p-2 text-[11px] text-slate-600">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          No se puede mostrar la vista previa de esta imagen desde el ERP, pero eso no significa
          que falte: <b className="mx-1">{valor}</b> es una imagen que vino con la tienda. Ábrela
          en la web para verla, o sube una nueva y la vista previa aparece al instante.
        </p>
      )}

      {aviso && (
        <p className="flex items-start gap-1.5 rounded-md border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-900">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {aviso}
        </p>
      )}
    </div>
  );
}

const LAYOUTS = [
  { v: 'derecha-lottie', l: 'Texto a la derecha, animación a la izquierda' },
  { v: 'izquierda-lottie', l: 'Texto a la izquierda, animación a la derecha' },
  { v: 'centro', l: 'Texto centrado' },
  { v: 'centro-amplio', l: 'Texto centrado, ancho' },
] as const;

const BADGES = [
  { v: 'heart', l: '♥ Corazón' },
  { v: 'gift', l: '🎁 Regalo' },
  { v: 'sparkle', l: '✨ Destello' },
] as const;

export function WebConfigClient({ inicial, urlWeb }: { inicial: ContenidoWeb; urlWeb: string }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [c, setC] = useState<ContenidoWeb>(inicial);

  function slide(i: number, campo: keyof SlideWeb, valor: string) {
    setC((p) => ({
      ...p,
      hero_slides: p.hero_slides.map((s, k) => (k === i ? { ...s, [campo]: valor } : s)),
    }));
  }

  function mover(i: number, dir: -1 | 1) {
    setC((p) => {
      const j = i + dir;
      if (j < 0 || j >= p.hero_slides.length) return p;
      const copia = [...p.hero_slides];
      [copia[i], copia[j]] = [copia[j]!, copia[i]!];
      return { ...p, hero_slides: copia };
    });
  }

  function agregarSlide() {
    setC((p) => ({
      ...p,
      hero_slides: [...p.hero_slides, {
        imagen_url: '', alt: '', href: '/disfraces', layout: 'centro',
        pretitulo: '', titulo: '', titulo_acento: '', subtitulo: '',
        cta: 'Ver colección', badge: 'sparkle',
        titulo_color: '#231459', acento_color: '#EC1C24', lottie_url: '',
      }],
    }));
  }

  function borrarSlide(i: number) {
    if (!confirm('¿Quitar este slide del carrusel?')) return;
    setC((p) => ({ ...p, hero_slides: p.hero_slides.filter((_, k) => k !== i) }));
  }

  function guardar() {
    iniciar(async () => {
      const r = await guardarContenidoWeb(c);
      if (!r.ok) { toast.error(r.error); return; }
      toast.success('Cambios publicados', {
        description: 'Abre la tienda en otra pestaña y recarga para verlos.',
        duration: 6000,
      });
      router.refresh();
    });
  }

  return (
    <div className="space-y-4 pb-24">
      {/* ─────────── Cómo funciona ─────────── */}
      <Card className="border-corp-200 bg-corp-50/50">
        <CardContent className="py-4 text-sm text-slate-700">
          <p className="mb-2 font-semibold text-corp-900">Antes de empezar</p>
          <ul className="list-disc space-y-1.5 pl-5 text-xs">
            <li>
              Lo que cambies acá <b>sale publicado apenas presiones Guardar</b>. No hay paso de
              aprobación: la tienda queda así para todo el que entre.
            </li>
            <li>
              <b>Las medidas de las imágenes importan.</b> El sistema no las recorta: las estira o
              las corta para llenar el espacio. Cada campo dice el tamaño exacto; si subes una que
              no coincide, te avisa antes de guardar.
            </li>
            <li>
              El formato recomendado es <b>WebP</b>. Pesa la mitad que un JPG con la misma calidad y
              la portada carga más rápido, sobre todo en celular. Si solo tienes JPG o PNG, también
              sirven.
            </li>
            <li>
              Después de guardar, <b>abre la tienda y recarga</b> para confirmar que quedó como
              esperabas. Es el único modo de estar seguro.
            </li>
          </ul>
          <a
            href={urlWeb} target="_blank" rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-corp-700 underline"
          >
            <ExternalLink className="h-3.5 w-3.5" /> Abrir la tienda en otra pestaña
          </a>
        </CardContent>
      </Card>

      {/* ─────────── Slides ─────────── */}
      <Card>
        <CardContent className="space-y-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-display text-base font-semibold text-corp-900">Carrusel de la portada</h3>
              <p className="text-xs text-slate-500">
                Lo primero que ve quien entra. Rota solo cada 8 segundos. Recomendado: 3 slides.
              </p>
            </div>
            <Badge variant="secondary">{c.hero_slides.length} slide(s)</Badge>
          </div>

          <p className="flex items-start gap-1.5 rounded-md border border-sky-200 bg-sky-50 p-2 text-[11px] text-sky-900">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              <b>Sobre la animación:</b> los corazones que flotan hoy son del Día de la Madre y
              vienen de la dirección que está en «Animación». Cuando cambies a otra campaña,
              <b> borra ese campo o pega otra animación</b>: los corazones de mayo sobre una foto de
              Halloween se ven peor que no tener animación. Solo aparece en los diseños con
              animación a un costado.
            </span>
          </p>

          {c.hero_slides.map((s, i) => (
            <div key={i} className="rounded-lg border p-3">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Slide {i + 1}
                </span>
                <div className="flex gap-1">
                  <Button type="button" variant="ghost" size="sm" onClick={() => mover(i, -1)} disabled={pendiente || i === 0}>
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => mover(i, 1)} disabled={pendiente || i === c.hero_slides.length - 1}>
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => borrarSlide(i)} disabled={pendiente}>
                    <Trash2 className="h-3.5 w-3.5 text-red-500" />
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                <div className="space-y-2">
                  <Campo etiqueta="Imagen de fondo">
                    <CampoImagen
                      valor={s.imagen_url}
                      medida={MEDIDAS.slide}
                      onCambio={(url) => slide(i, 'imagen_url', url)}
                      disabled={pendiente}
                      urlWeb={urlWeb}
                    />
                  </Campo>
                  <Campo etiqueta="Descripción de la imagen" ayuda="La lee Google y quien navega sin ver. Ej: «Disfraces de Halloween para niños».">
                    <Input value={s.alt} onChange={(e) => slide(i, 'alt', e.target.value)} disabled={pendiente} className="h-8 text-xs" />
                  </Campo>
                  <Campo etiqueta="A dónde lleva el botón" ayuda="Ej: /campanias/halloween-2026 o /categoria/halloween">
                    <Input value={s.href} onChange={(e) => slide(i, 'href', e.target.value)} disabled={pendiente} className="h-8 font-mono text-[11px]" />
                  </Campo>
                  <Campo etiqueta="Animación (opcional)" ayuda="Dirección .lottie. Vacío = sin animación.">
                    <Input value={s.lottie_url} onChange={(e) => slide(i, 'lottie_url', e.target.value)} placeholder="https://lottie.host/…" disabled={pendiente} className="h-8 font-mono text-[11px]" />
                  </Campo>
                </div>

                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Campo etiqueta="Etiqueta de arriba" ayuda="Ej: ✨ Octubre 2026">
                      <Input value={s.pretitulo} onChange={(e) => slide(i, 'pretitulo', e.target.value)} disabled={pendiente} className="h-8 text-xs" />
                    </Campo>
                    <Campo etiqueta="Ícono de esa etiqueta">
                      <select value={s.badge} onChange={(e) => slide(i, 'badge', e.target.value)} disabled={pendiente} className="h-8 w-full rounded-md border border-input bg-white px-2 text-xs">
                        {BADGES.map((b) => <option key={b.v} value={b.v}>{b.l}</option>)}
                      </select>
                    </Campo>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Campo etiqueta="Título (primera línea)">
                      <Input value={s.titulo} onChange={(e) => slide(i, 'titulo', e.target.value)} disabled={pendiente} className="h-8 text-xs" />
                    </Campo>
                    <Campo etiqueta="Título (segunda línea)" ayuda="Sale en el color de acento.">
                      <Input value={s.titulo_acento} onChange={(e) => slide(i, 'titulo_acento', e.target.value)} disabled={pendiente} className="h-8 text-xs" />
                    </Campo>
                  </div>
                  <Campo etiqueta="Texto de apoyo">
                    <Input value={s.subtitulo} onChange={(e) => slide(i, 'subtitulo', e.target.value)} disabled={pendiente} className="h-8 text-xs" />
                  </Campo>
                  <div className="grid grid-cols-2 gap-2">
                    <Campo etiqueta="Texto del botón">
                      <Input value={s.cta} onChange={(e) => slide(i, 'cta', e.target.value)} disabled={pendiente} className="h-8 text-xs" />
                    </Campo>
                    <Campo etiqueta="Diseño">
                      <select value={s.layout} onChange={(e) => slide(i, 'layout', e.target.value)} disabled={pendiente} className="h-8 w-full rounded-md border border-input bg-white px-2 text-xs">
                        {LAYOUTS.map((l) => <option key={l.v} value={l.v}>{l.l}</option>)}
                      </select>
                    </Campo>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Campo etiqueta="Color del título" ayuda="Tiene que contrastar con la foto.">
                      <div className="flex gap-1">
                        <input type="color" value={s.titulo_color} onChange={(e) => slide(i, 'titulo_color', e.target.value)} disabled={pendiente} className="h-8 w-10 rounded border" />
                        <Input value={s.titulo_color} onChange={(e) => slide(i, 'titulo_color', e.target.value)} disabled={pendiente} className="h-8 font-mono text-[11px]" />
                      </div>
                    </Campo>
                    <Campo etiqueta="Color de la segunda línea">
                      <div className="flex gap-1">
                        <input type="color" value={s.acento_color} onChange={(e) => slide(i, 'acento_color', e.target.value)} disabled={pendiente} className="h-8 w-10 rounded border" />
                        <Input value={s.acento_color} onChange={(e) => slide(i, 'acento_color', e.target.value)} disabled={pendiente} className="h-8 font-mono text-[11px]" />
                      </div>
                    </Campo>
                  </div>
                </div>
              </div>
            </div>
          ))}

          <Button type="button" variant="outline" onClick={agregarSlide} disabled={pendiente || c.hero_slides.length >= 6}>
            <Plus className="h-4 w-4" /> Agregar slide
          </Button>
        </CardContent>
      </Card>

      {/* ─────────── Banner mayorista ─────────── */}
      <Card>
        <CardContent className="space-y-3 py-4">
          <div>
            <h3 className="font-display text-base font-semibold text-corp-900">Banner de venta al por mayor</h3>
            <p className="text-xs text-slate-500">
              La franja azul con la foto de fondo, más abajo en la portada. La web le pone encima un
              velo oscuro para que el texto blanco se lea: elige una foto con la que eso funcione.
            </p>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <Campo etiqueta="Imagen de fondo">
              <CampoImagen
                valor={c.cta_mayorista.imagen_url}
                medida={MEDIDAS.cta}
                onCambio={(url) => setC((p) => ({ ...p, cta_mayorista: { ...p.cta_mayorista, imagen_url: url } }))}
                disabled={pendiente}
                urlWeb={urlWeb}
              />
            </Campo>
            <div className="space-y-2">
              <Campo etiqueta="Título">
                <Input value={c.cta_mayorista.titulo} onChange={(e) => setC((p) => ({ ...p, cta_mayorista: { ...p.cta_mayorista, titulo: e.target.value } }))} disabled={pendiente} className="h-8 text-xs" />
              </Campo>
              <Campo etiqueta="Texto de apoyo">
                <Input value={c.cta_mayorista.subtitulo} onChange={(e) => setC((p) => ({ ...p, cta_mayorista: { ...p.cta_mayorista, subtitulo: e.target.value } }))} disabled={pendiente} className="h-8 text-xs" />
              </Campo>
              <div className="grid grid-cols-2 gap-2">
                <Campo etiqueta="Texto del botón">
                  <Input value={c.cta_mayorista.boton} onChange={(e) => setC((p) => ({ ...p, cta_mayorista: { ...p.cta_mayorista, boton: e.target.value } }))} disabled={pendiente} className="h-8 text-xs" />
                </Campo>
                <Campo etiqueta="WhatsApp de ese botón" ayuda="Con código de país: 51903064120">
                  <Input value={c.cta_mayorista.telefono} onChange={(e) => setC((p) => ({ ...p, cta_mayorista: { ...p.cta_mayorista, telefono: e.target.value } }))} disabled={pendiente} className="h-8 font-mono text-[11px]" />
                </Campo>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─────────── Sección destacados ─────────── */}
      <Card>
        <CardContent className="space-y-3 py-4">
          <div>
            <h3 className="font-display text-base font-semibold text-corp-900">Sección «Lo más TOP»</h3>
            <p className="text-xs text-slate-500">
              El bloque de productos destacados de la portada. Los productos que aparecen se eligen
              en cada ficha, con el interruptor «Destacado»; acá se cambia el título y la animación.
            </p>
          </div>
          <div className="grid gap-3 lg:grid-cols-3">
            <Campo etiqueta="Etiqueta pequeña" ayuda="La píldora naranja de arriba.">
              <Input value={c.destacados.etiqueta} onChange={(e) => setC((p) => ({ ...p, destacados: { ...p.destacados, etiqueta: e.target.value } }))} disabled={pendiente} className="h-8 text-xs" />
            </Campo>
            <Campo etiqueta="Título">
              <Input value={c.destacados.titulo} onChange={(e) => setC((p) => ({ ...p, destacados: { ...p.destacados, titulo: e.target.value } }))} disabled={pendiente} className="h-8 text-xs" />
            </Campo>
            <Campo etiqueta="Animación (opcional)" ayuda="Vacío = solo el título, centrado.">
              <Input value={c.destacados.lottie_url} onChange={(e) => setC((p) => ({ ...p, destacados: { ...p.destacados, lottie_url: e.target.value } }))} placeholder="https://lottie.host/…" disabled={pendiente} className="h-8 font-mono text-[11px]" />
            </Campo>
          </div>
        </CardContent>
      </Card>

      {/* ─────────── Contacto y redes ─────────── */}
      <Card>
        <CardContent className="space-y-3 py-4">
          <div>
            <h3 className="font-display text-base font-semibold text-corp-900">Contacto y redes</h3>
            <p className="text-xs text-slate-500">
              Salen en el pie de página y en el botón verde flotante. El teléfono se puede escribir
              con espacios o guiones: el sistema lo limpia solo.
            </p>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="space-y-2">
              <Campo etiqueta="WhatsApp de atención" ayuda="Con código de país. Es el del botón verde flotante.">
                <Input value={c.contacto.whatsapp} onChange={(e) => setC((p) => ({ ...p, contacto: { ...p.contacto, whatsapp: e.target.value } }))} disabled={pendiente} className="h-8 font-mono text-[11px]" />
              </Campo>
              <Campo etiqueta="Mensaje con el que arranca el chat" ayuda="Lo que aparece ya escrito cuando el cliente abre WhatsApp.">
                <Input value={c.contacto.whatsapp_saludo} onChange={(e) => setC((p) => ({ ...p, contacto: { ...p.contacto, whatsapp_saludo: e.target.value } }))} disabled={pendiente} className="h-8 text-xs" />
              </Campo>
              <Campo etiqueta="Correo">
                <Input value={c.contacto.email} onChange={(e) => setC((p) => ({ ...p, contacto: { ...p.contacto, email: e.target.value } }))} disabled={pendiente} className="h-8 text-xs" />
              </Campo>
              <Campo etiqueta="Dirección o tiendas">
                <Input value={c.contacto.direccion} onChange={(e) => setC((p) => ({ ...p, contacto: { ...p.contacto, direccion: e.target.value } }))} disabled={pendiente} className="h-8 text-xs" />
              </Campo>
            </div>
            <div className="space-y-2">
              {(['facebook', 'instagram', 'tiktok', 'youtube'] as const).map((red) => (
                <Campo key={red} etiqueta={red[0]!.toUpperCase() + red.slice(1)} ayuda="Vacío = no se muestra el ícono.">
                  <Input
                    value={c.redes[red]}
                    onChange={(e) => setC((p) => ({ ...p, redes: { ...p.redes, [red]: e.target.value } }))}
                    placeholder={`https://${red}.com/disfraceshappys`}
                    disabled={pendiente}
                    className="h-8 font-mono text-[11px]"
                  />
                </Campo>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─────────── Guardar ─────────── */}
      <div className="fixed bottom-0 left-0 right-0 z-20 border-t bg-white/95 px-4 py-3 shadow-lg backdrop-blur md:left-64">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <p className="text-xs text-slate-500">
            Los cambios se publican al guardar. Después recarga la tienda para verlos.
          </p>
          <Button variant="premium" onClick={guardar} disabled={pendiente}>
            {pendiente ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Guardar y publicar
          </Button>
        </div>
      </div>
    </div>
  );
}

function Campo({ etiqueta, ayuda, children }: { etiqueta: string; ayuda?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        {etiqueta}
      </label>
      {children}
      {ayuda && <p className="mt-0.5 text-[10px] text-slate-400">{ayuda}</p>}
    </div>
  );
}
