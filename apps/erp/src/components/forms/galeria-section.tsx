'use client';

import { useState, useTransition } from 'react';
import Image from 'next/image';
import { Card } from '@happy/ui/card';
import { Button } from '@happy/ui/button';
import { Badge } from '@happy/ui/badge';
import { ImageUploader } from './image-uploader';
import { agregarImagenProducto, eliminarImagenProducto } from '@/server/actions/storage';
import { toast } from 'sonner';
import { Loader2, Star, Trash2 } from 'lucide-react';

type Img = { id: string; url: string; orden: number; es_portada: boolean | null };

export function GaleriaSection({ productoId, imagenes }: { productoId: string; imagenes: Img[] }) {
  const [pending, start] = useTransition();
  const [list, setList] = useState(imagenes);

  function add(url: string | null) {
    if (!url) return;
    // Evitar duplicar in-memory si la URL ya está en la lista (ej. doble-click).
    if (list.some((i) => i.url === url)) {
      toast.info('Esta imagen ya está en la galería');
      return;
    }
    start(async () => {
      const esPortada = list.length === 0;
      const r = await agregarImagenProducto(productoId, url, esPortada);
      if (r.ok && r.data) {
        toast.success('Imagen agregada');
        setList((arr) => [
          ...arr,
          { id: r.data!.id, url, orden: r.data!.orden, es_portada: esPortada },
        ]);
      } else {
        toast.error(r.error ?? 'Error');
      }
    });
  }

  function remove(id: string) {
    if (!confirm('¿Eliminar esta foto?')) return;
    start(async () => {
      const r = await eliminarImagenProducto(id);
      if (r.ok) {
        setList((arr) => arr.filter((i) => i.id !== id));
        toast.success('Eliminada');
      } else {
        toast.error(r.error ?? 'Error');
      }
    });
  }

  return (
    <Card className="p-6">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h2 className="font-display text-base font-semibold text-corp-900">Galería de fotos</h2>
          <p className="text-sm text-slate-500">Estas fotos aparecen en la página del producto en la web.</p>
        </div>
        <Badge variant="secondary">{list.length} foto(s)</Badge>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {list.map((img) => (
          <div key={img.id} className="group relative aspect-square overflow-hidden rounded-lg border bg-slate-50">
            <Image src={img.url} alt="" fill className="object-cover" sizes="200px" />
            {img.es_portada && (
              <Badge className="absolute left-1 top-1 gap-1 text-[9px]">
                <Star className="h-2.5 w-2.5 fill-white" /> Portada
              </Badge>
            )}
            <button
              type="button"
              onClick={() => remove(img.id)}
              className="absolute right-1 top-1 rounded-full bg-danger p-1 text-white opacity-0 shadow-lg transition group-hover:opacity-100"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
        {/* Slot para agregar */}
        <div className="aspect-square">
          <ImageUploader
            value={null}
            onChange={add}
            label={pending ? 'Subiendo…' : 'Agregar foto'}
            prefix={`productos/${productoId}`}
          />
        </div>
      </div>

      {pending && (
        <p className="mt-3 flex items-center gap-2 text-xs text-slate-500">
          <Loader2 className="h-3 w-3 animate-spin" /> Procesando…
        </p>
      )}
    </Card>
  );
}
