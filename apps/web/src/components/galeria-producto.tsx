'use client';

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight, X, ZoomIn } from 'lucide-react';
import { Badge } from '@happy/ui/badge';
import { BLUR_DATA_URL } from '@/lib/image';

/**
 * Galería de imágenes del producto con lightbox (zoom) al click.
 * Cliente pidió (post-2026-07-08):
 *  - Poder agrandar la imagen principal
 *  - Poder agrandar las imágenes secundarias (miniaturas)
 *
 * Diseño:
 *  - Imagen principal grande con cursor:zoom-in y botón lupa
 *  - Miniaturas debajo — click cambia la principal
 *  - Modal fullscreen con navegación anterior/siguiente + swipe con teclado
 */
export function GaleriaProducto({
  imagenes,
  nombre,
  descuentoBadge,
}: {
  imagenes: string[];
  nombre: string;
  /** Ej: "-30%" para mostrar sobre la imagen principal. Opcional. */
  descuentoBadge?: string | null;
}) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [zoomIdx, setZoomIdx] = useState(0);

  const abrirZoom = useCallback((idx: number) => {
    setZoomIdx(idx);
    setZoomOpen(true);
  }, []);

  const cerrarZoom = useCallback(() => setZoomOpen(false), []);
  const siguiente = useCallback(
    () => setZoomIdx((i) => (i + 1) % imagenes.length),
    [imagenes.length],
  );
  const anterior = useCallback(
    () => setZoomIdx((i) => (i - 1 + imagenes.length) % imagenes.length),
    [imagenes.length],
  );

  // Navegación con teclado dentro del lightbox
  useEffect(() => {
    if (!zoomOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') cerrarZoom();
      else if (e.key === 'ArrowRight') siguiente();
      else if (e.key === 'ArrowLeft') anterior();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoomOpen, cerrarZoom, siguiente, anterior]);

  if (imagenes.length === 0) {
    return (
      <div className="flex aspect-square items-center justify-center rounded-2xl border bg-slate-50 text-7xl">
        🎭
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Imagen principal */}
      <button
        type="button"
        onClick={() => abrirZoom(selectedIdx)}
        className="group relative block aspect-square w-full overflow-hidden rounded-2xl border bg-slate-50 cursor-zoom-in"
        aria-label="Ampliar imagen"
      >
        <Image
          src={imagenes[selectedIdx] ?? imagenes[0]!}
          alt={nombre}
          fill
          className="object-cover transition-transform duration-300 group-hover:scale-105"
          sizes="(max-width:1024px) 100vw, 50vw"
          placeholder="blur"
          blurDataURL={BLUR_DATA_URL}
          priority
        />
        {descuentoBadge && (
          <Badge className="absolute right-3 top-3 bg-danger px-3 py-1.5 text-sm font-bold hover:bg-danger">
            {descuentoBadge}
          </Badge>
        )}
        <span className="absolute bottom-3 right-3 flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
          <ZoomIn className="h-3 w-3" /> Ampliar
        </span>
      </button>

      {/* Miniaturas — cliente pidió (2026-07-10) poder ampliar directamente
          las miniaturas sin doble-click. Ahora cada miniatura tiene un
          botón "lupa" flotante que abre el lightbox de esa imagen. El
          click en la miniatura misma sigue cambiando la principal. */}
      {imagenes.length > 1 && (
        <div className="grid grid-cols-5 gap-2 sm:grid-cols-6">
          {imagenes.map((url, i) => (
            <div key={i} className="relative">
              <button
                type="button"
                onClick={() => setSelectedIdx(i)}
                className={`relative block aspect-square w-full overflow-hidden rounded-lg border-2 bg-slate-50 transition ${
                  selectedIdx === i
                    ? 'border-happy-500 ring-2 ring-happy-200'
                    : 'border-slate-200 hover:border-happy-300'
                }`}
                aria-label={`Foto ${i + 1} de ${imagenes.length}`}
                title="Mostrar en el visor grande"
              >
                <Image
                  src={url}
                  alt={`${nombre} foto ${i + 1}`}
                  fill
                  className="object-cover"
                  sizes="(max-width:1024px) 20vw, 10vw"
                  placeholder="blur"
                  blurDataURL={BLUR_DATA_URL}
                />
              </button>
              <button
                type="button"
                onClick={() => abrirZoom(i)}
                className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-slate-700 shadow-sm ring-1 ring-slate-200 transition hover:bg-happy-50 hover:text-happy-600 hover:ring-happy-300"
                aria-label={`Ampliar foto ${i + 1}`}
                title="Ampliar (abre visor)"
              >
                <ZoomIn className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox modal */}
      {zoomOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 p-4"
          onClick={cerrarZoom}
          role="dialog"
          aria-modal="true"
        >
          {/* Botón cerrar */}
          <button
            type="button"
            onClick={cerrarZoom}
            className="absolute right-4 top-4 z-10 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            aria-label="Cerrar"
          >
            <X className="h-6 w-6" />
          </button>

          {/* Navegación */}
          {imagenes.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); anterior(); }}
                className="absolute left-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white hover:bg-white/20"
                aria-label="Imagen anterior"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); siguiente(); }}
                className="absolute right-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white hover:bg-white/20"
                aria-label="Imagen siguiente"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            </>
          )}

          <div
            className="relative max-h-[90vh] max-w-[92vw]"
            onClick={(e) => e.stopPropagation()}
          >
            <Image
              src={imagenes[zoomIdx] ?? imagenes[0]!}
              alt={`${nombre} foto ${zoomIdx + 1}`}
              width={1600}
              height={1600}
              className="max-h-[90vh] w-auto object-contain"
              placeholder="blur"
              blurDataURL={BLUR_DATA_URL}
              priority
            />
            {imagenes.length > 1 && (
              <p className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-xs text-white">
                {zoomIdx + 1} / {imagenes.length}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
