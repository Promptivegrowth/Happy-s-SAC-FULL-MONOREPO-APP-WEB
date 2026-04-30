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
  descuento_porcentaje?: number | null;
  descuento_excluir_tallas?: string[] | null;
};

const TALLAS_OPCIONES = ['T0','T2','T4','T6','T8','T10','T12','T14','T16','TS','TAD'] as const;

export function PublicacionSection({
  productoId,
  pub,
  productoNombre,
  tallasDelProducto = [],
}: {
  productoId: string;
  pub: Pub | null;
  productoNombre: string;
  /** Tallas que tiene el producto (sus variantes). Si está vacío, se muestran todas. */
  tallasDelProducto?: string[];
}) {
  const [publicado, setPublicado] = useState(pub?.publicado ?? false);
  const [destacado, setDestacado] = useState(pub?.destacado_web ?? false);
  const [descPct, setDescPct] = useState<string>(pub?.descuento_porcentaje?.toString() ?? '');
  const [excluidas, setExcluidas] = useState<Set<string>>(
    new Set(pub?.descuento_excluir_tallas ?? []),
  );
  const [pending, start] = useTransition();
  const webUrl = process.env.NEXT_PUBLIC_WEB_URL ?? 'http://localhost:3001';

  // Si el producto tiene variantes, mostrar solo esas tallas. Si no, todas las posibles.
  const tallasMostradas = tallasDelProducto.length > 0 ? tallasDelProducto : TALLAS_OPCIONES;
  const descPctNum = Number(descPct) || 0;
  const tieneDescuento = descPctNum > 0;

  function toggleTalla(t: string) {
    setExcluidas((prev) => {
      const s = new Set(prev);
      if (s.has(t)) s.delete(t);
      else s.add(t);
      return s;
    });
  }

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
    // Tallas excluidas: append cada una con el mismo name (server las junta con getAll).
    fd.delete('descuento_excluir_tallas');
    for (const t of excluidas) fd.append('descuento_excluir_tallas', t);
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
          <FormRow label="Precio oferta fijo (S/)" hint="Opcional. Si pones %, ignora este campo.">
            <Input name="precio_oferta" type="number" step="0.01" defaultValue={pub?.precio_oferta ?? ''} min={0} />
          </FormRow>
          <div className="flex items-end">
            <label className="flex items-center gap-3 rounded-lg border-2 border-happy-200 bg-happy-50/40 p-3 text-sm w-full">
              <Switch checked={destacado} onCheckedChange={setDestacado} />
              <div>
                <p className="font-medium text-corp-900">⭐ Destacado</p>
                <p className="text-[10px] text-slate-500">Aparece en la sección "TOP" del home</p>
              </div>
            </label>
          </div>
        </FormGrid>

        {/* Sección Descuento por % */}
        <div className="rounded-xl border-2 border-dashed border-happy-300 bg-happy-50/40 p-4">
          <h3 className="mb-2 flex items-center gap-2 font-display text-sm font-semibold text-corp-900">
            🏷️ Descuento por porcentaje
          </h3>
          <p className="mb-4 text-xs text-slate-600">
            Aplica un descuento sobre el precio público de cada talla. Se muestra en la web como
            badge <span className="rounded bg-danger px-1 font-mono text-white">-XX%</span> y precio
            tachado. Tiene prioridad sobre el "precio oferta fijo".
          </p>

          <FormGrid cols={2}>
            <FormRow label="% de descuento (0-99)" error={undefined}>
              <div className="relative">
                <Input
                  name="descuento_porcentaje"
                  type="number"
                  min={0}
                  max={99}
                  value={descPct}
                  onChange={(e) => setDescPct(e.target.value)}
                  placeholder="Ej: 20"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
                  %
                </span>
              </div>
            </FormRow>
            {tieneDescuento && (
              <div className="flex items-end">
                <Badge variant="default" className="bg-danger text-base">
                  Badge en la web: -{descPctNum}%
                </Badge>
              </div>
            )}
          </FormGrid>

          {tieneDescuento && (
            <div className="mt-4">
              <p className="mb-2 text-xs font-medium text-slate-700">
                Excluir tallas del descuento
                <span className="ml-1 font-normal text-slate-500">
                  (click en una talla para excluirla — las tachadas no reciben el descuento)
                </span>
              </p>
              <div className="flex flex-wrap gap-2">
                {tallasMostradas.map((t) => {
                  const exc = excluidas.has(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => toggleTalla(t)}
                      className={`min-w-[44px] rounded-md border px-3 py-1.5 text-sm font-medium transition ${
                        exc
                          ? 'border-dashed border-slate-300 bg-slate-100 text-slate-400 line-through'
                          : 'border-happy-400 bg-white text-happy-700 hover:bg-happy-50'
                      }`}
                    >
                      {t.replace('T', '')}
                    </button>
                  );
                })}
              </div>
              {excluidas.size > 0 && (
                <p className="mt-2 text-[11px] text-slate-500">
                  {excluidas.size} talla{excluidas.size === 1 ? '' : 's'} excluida{excluidas.size === 1 ? '' : 's'}: {' '}
                  {Array.from(excluidas).map((t) => t.replace('T', '')).join(', ')}
                </p>
              )}
            </div>
          )}
        </div>
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
