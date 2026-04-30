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
  const [url, setUrl] = useState<string | null>(value ?? null);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  // Sincroniza con el `value` controlado por el padre. Sin esto, el uploader
  // se queda mostrando la última imagen subida aunque el padre lo resetee
  // (caso galería: el padre pasa value=null para que vuelva a slot vacío y
  // pueda subir más fotos sin que se vean duplicadas).
  useEffect(() => {
    setUrl(value ?? null);
  }, [value]);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    start(async () => {
      const fd = new FormData();
      fd.append('file', file);
      const r = await subirArchivo(fd, bucket, prefix);
      if (r.ok && r.data) {
        setUrl(r.data.url);
        onChange(r.data.url, r.data.path);
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
