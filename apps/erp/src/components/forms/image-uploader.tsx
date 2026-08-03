'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import Image from 'next/image';
import { Button } from '@happy/ui/button';
import { Loader2, UploadCloud, X, ImageIcon } from 'lucide-react';
import { toast } from 'sonner';
import { subirArchivo } from '@/server/actions/storage';

type Props = {
  /** URL inicial (modo edición) */
  value?: string | null;
  /** Callback cuando se sube una imagen nueva */
  onChange: (url: string | null, path?: string) => void;
  /** Bucket destino. Default: 'disfraces-fotos' */
  bucket?: string;
  /** Carpeta dentro del bucket. Default: 'productos' */
  prefix?: string;
  /** Nombre del input hidden — para usar dentro de un form */
  name?: string;
  /** Texto del placeholder */
  label?: string;
  /** Aspecto del preview */
  aspect?: 'square' | 'video' | 'auto';
  className?: string;
};

/**
 * Reduce una imagen en el navegador a un máximo de `maxSide` px por el lado
 * más largo y la re-codifica a WebP. Devuelve un File liviano (típicamente
 * < 500KB). Si algo falla (formato no rasterizable, canvas bloqueado), devuelve
 * el archivo original sin romper la subida.
 */
async function comprimirImagen(file: File, maxSide = 1600, quality = 0.85): Promise<File> {
  try {
    if (!file.type.startsWith('image/')) return file;
    const bitmap = await createImageBitmap(file).catch(() => null);
    if (!bitmap) return file;
    const escala = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * escala));
    const h = Math.max(1, Math.round(bitmap.height * escala));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/webp', quality));
    bitmap.close?.();
    if (!blob || blob.size >= file.size) return file; // no mejoró: usar original
    const base = file.name.replace(/\.[^.]+$/, '') || 'imagen';
    return new File([blob], `${base}.webp`, { type: 'image/webp' });
  } catch {
    return file;
  }
}

export function ImageUploader({
  value,
  onChange,
  bucket = 'disfraces-fotos',
  prefix = 'productos',
  name,
  label = 'Subir imagen',
  aspect = 'square',
  className = '',
}: Props) {
  // Modo "galería": cuando NO hay prop `name` (no es campo de formulario),
  // el uploader es un slot reutilizable que debe volver a vacío después de
  // cada upload para que el padre maneje la lista completa de imágenes.
  // Modo "formulario": cuando hay `name`, mantiene la imagen como preview
  // del campo hidden del form (ej. imagen_principal_url del producto).
  const isGalleryMode = !name;
  const [url, setUrl] = useState<string | null>(value ?? null);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  // Sincroniza el preview interno con el value controlado por el padre.
  // Útil cuando el padre cambia value externamente (ej. reset de form).
  useEffect(() => {
    setUrl(value ?? null);
  }, [value]);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    start(async () => {
      // Comprimir/redimensionar en el navegador ANTES de subir. Evita el límite
      // de body de los server actions (1MB por defecto) y el tope de ~4.5MB de
      // las funciones serverless de Vercel — que hacían fallar fotos grandes —,
      // y de paso hace que las imágenes carguen más rápido en la web.
      const optimizada = await comprimirImagen(file);
      const fd = new FormData();
      fd.append('file', optimizada);
      const r = await subirArchivo(fd, bucket, prefix);
      if (r.ok && r.data) {
        // Notificar al padre con la URL nueva
        onChange(r.data.url, r.data.path);
        // En modo galería: resetear preview a vacío (el padre se encargó
        // de agregar la imagen a su lista). En modo form: mostrar preview.
        if (isGalleryMode) {
          setUrl(null);
        } else {
          setUrl(r.data.url);
        }
        toast.success('Imagen subida');
      } else {
        toast.error(r.error ?? 'Error al subir');
      }
    });
    if (fileRef.current) fileRef.current.value = '';
  }

  function clear() {
    setUrl(null);
    onChange(null);
  }

  const aspectClass = aspect === 'square' ? 'aspect-square' : aspect === 'video' ? 'aspect-video' : '';

  return (
    <div className={className}>
      {name && <input type="hidden" name={name} value={url ?? ''} />}
      <div className={`group relative ${aspectClass} overflow-hidden rounded-xl border-2 border-dashed border-input bg-slate-50 transition hover:border-happy-400`}>
        {url ? (
          <>
            <Image src={url} alt="" fill className="object-cover" sizes="(max-width: 768px) 100vw, 33vw" />
            <button
              type="button"
              onClick={clear}
              className="absolute right-2 top-2 rounded-full bg-danger p-1.5 text-white opacity-0 shadow-lg transition group-hover:opacity-100"
              aria-label="Quitar imagen"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={pending}
            className="flex h-full w-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-slate-500 transition hover:bg-happy-50/40"
          >
            {pending ? (
              <>
                <Loader2 className="h-6 w-6 animate-spin text-happy-500" />
                <span>Subiendo…</span>
              </>
            ) : (
              <>
                <ImageIcon className="h-8 w-8 text-slate-300" />
                <span className="font-medium">{label}</span>
                <span className="text-[10px] text-slate-400">PNG · JPG · WebP · max 10MB</span>
              </>
            )}
          </button>
        )}
      </div>
      {url && (
        <div className="mt-2 flex justify-center">
          <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={pending}>
            {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <UploadCloud className="h-3 w-3" />}
            Reemplazar
          </Button>
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/avif"
        onChange={onPick}
        className="hidden"
      />
    </div>
  );
}
