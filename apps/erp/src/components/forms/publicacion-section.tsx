'use client';

import { useState, useTransition } from 'react';
import { Button } from '@happy/ui/button';
import { Input } from '@happy/ui/input';
import { Textarea } from '@happy/ui/textarea';
import { Switch } from '@happy/ui/switch';
import { Card } from '@happy/ui/card';
import { Badge } from '@happy/ui/badge';
import { FormGrid, FormRow } from '@happy/ui/form-row';
import { Globe, Loader2, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { actualizarPublicacion, togglePublicacionWeb } from '@/server/actions/productos';

type Pub = {
  publicado?: boolean;
  slug?: string | null;
  titulo_web?: string | null;
  descripcion_corta?: string | null;
  descripcion_larga?: string | null;
  destacado_web?: boolean | null;
  orden_web?: number | null;
  precio_oferta?: number | null;
  publicado_en?: string | null;
};

export function PublicacionSection({ productoId, pub, productoNombre }: { productoId: string; pub: Pub | null; productoNombre: string }) {
  const [publicado, setPublicado] = useState(pub?.publicado ?? false);
  const [destacado, setDestacado] = useState(pub?.destacado_web ?? false);
  const [pending, start] = useTransition();
  const webUrl = process.env.NEXT_PUBLIC_WEB_URL ?? 'http://localhost:3001';

  function onTogglePub(value: boolean) {
    start(async () => {
      const r = await togglePublicacionWeb(productoId, value);
      if (r.ok) {
        setPublicado(value);
        toast.success(value ? '✨ Publicado en la web' : 'Oculto de la web');
      } else {
        toast.error(r.error);
      }
    });
  }

  function onSubmit(fd: FormData) {
    fd.set('destacado_web', destacado ? 'on' : 'off');
    start(async () => {
      const r = await actualizarPublicacion(productoId, null, fd);
      if (r.ok) toast.success('Publicación actualizada');
      else toast.error(r.error ?? 'Error');
    });
  }

  return (
    <Card className="p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-semibold text-corp-900 flex items-center gap-2">
            <Globe className="h-4 w-4 text-corp-700" />
            Publicación en disfraceshappys.com
          </h2>
          <p className="text-sm text-slate-500">
            Cuando esté publicado aparecerá inmediatamente en la tienda web.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {publicado && pub?.slug && (
            <a href={`${webUrl}/productos/${pub.slug}`} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm">Ver en web <ExternalLink className="h-3 w-3" /></Button>
            </a>
          )}
          <label className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2">
            <Switch checked={publicado} onCheckedChange={onTogglePub} disabled={pending} />
            <span className="text-sm font-medium">{publicado ? 'Publicado' : 'Oculto'}</span>
          </label>
        </div>
      </div>

      {publicado && <Badge variant="success" className="mb-4">✓ Publicado · {pub?.publicado_en ? new Date(pub.publicado_en).toLocaleDateString('es-PE') : '—'}</Badge>}

      <form action={onSubmit} className="space-y-4">
        <FormGrid cols={2}>
          <FormRow label="Título en la web" hint="Si vacío usa el nombre del producto">
            <Input name="titulo_web" defaultValue={pub?.titulo_web ?? productoNombre} />
          </FormRow>
          <FormRow label="Slug (URL)" hint="solo-minusculas-y-guiones">
            <Input name="slug" defaultValue={pub?.slug ?? ''} placeholder={productoNombre.toLowerCase().replace(/[^a-z0-9]+/g, '-')} />
          </FormRow>
        </FormGrid>
        <FormRow label="Descripción corta (aparece en cards)">
          <Textarea name="descripcion_corta" defaultValue={pub?.descripcion_corta ?? ''} rows={2} maxLength={300} />
        </FormRow>
        <FormRow label="Descripción larga (página de producto)" hint="Soporta HTML básico">
          <Textarea name="descripcion_larga" defaultValue={pub?.descripcion_larga ?? ''} rows={5} />
        </FormRow>
        <FormGrid cols={3}>
          <FormRow label="Orden de aparición" hint="Menor = primero">
            <Input name="orden_web" type="number" defaultValue={pub?.orden_web ?? 100} min={0} />
          </FormRow>
          <FormRow label="Precio oferta (S/) opcional">
            <Input name="precio_oferta" type="number" step="0.01" defaultValue={pub?.precio_oferta ?? ''} min={0} />
          </FormRow>
          <div className="flex items-end">
            <label className="flex items-center gap-3 rounded-lg border bg-white p-3 text-sm w-full">
              <Switch checked={destacado} onCheckedChange={setDestacado} />
              <span>Destacado (home web)</span>
            </label>
          </div>
        </FormGrid>
        <div className="flex justify-end">
          <Button type="submit" variant="premium" disabled={pending}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Guardar publicación
          </Button>
        </div>
      </form>
    </Card>
  );
}
