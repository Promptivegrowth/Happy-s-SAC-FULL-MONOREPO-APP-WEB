'use client';

import { useActionForm } from './use-action-form';
import { SubmitButton } from './submit-button';
import { Input } from '@happy/ui/input';
import { Textarea } from '@happy/ui/textarea';
import { Switch } from '@happy/ui/switch';
import { FormGrid, FormRow, FormSection } from '@happy/ui/form-row';
import { Button } from '@happy/ui/button';
import Link from 'next/link';
import { crearCategoria, actualizarCategoria } from '@/server/actions/categorias';
import { ImageUploader } from './image-uploader';
import { useState } from 'react';

type Categoria = {
  id?: string;
  codigo?: string | null;
  nombre?: string | null;
  descripcion?: string | null;
  slug?: string | null;
  icono?: string | null;
  imagen_url?: string | null;
  publicar_en_web?: boolean | null;
  orden_web?: number | null;
  activo?: boolean | null;
};

// Emojis sugeridos por temática del catálogo (fáciles de elegir con un click).
const EMOJIS_SUGERIDOS = [
  '🎃', '👻', '🧙', '🧛', '🧟', '💀', // Halloween
  '🎄', '🎅', '🤶', '⛄', '🦌',       // Navidad
  '👸', '🦸', '🧚', '🧜', '🦹',      // Personajes
  '🇵🇪', '💃', '🕺', '👯',           // Danzas / Patrias
  '🐝', '🦋', '🐰', '🐱', '🦁', '🐻', // Animales
  '👨‍⚕️', '👮', '👨‍🍳', '👨‍🚀', '👨‍🎤', // Profesiones
  '🌸', '🌺', '🌻', '☀️', '⭐', '✨',  // Genéricos
  '🎭', '🎪', '🎨', '🪄', '👑',       // Disfraz / accesorios
];

export function CategoriaForm({ initial }: { initial?: Categoria }) {
  const isEdit = Boolean(initial?.id);
  const action = isEdit
    ? actualizarCategoria.bind(null, initial!.id!)
    : crearCategoria;
  const { formAction, state } = useActionForm(action, isEdit ? 'Categoría actualizada' : 'Categoría creada');

  const [pubWeb, setPubWeb] = useState(initial?.publicar_en_web ?? true);
  const [activo, setActivo] = useState(initial?.activo ?? true);
  const [icono, setIcono] = useState(initial?.icono ?? '');
  const [imagenUrl, setImagenUrl] = useState<string | null>(initial?.imagen_url ?? null);

  return (
    <form action={formAction} className="space-y-6">
      <FormSection title="Datos de la categoría" description="Las categorías agrupan los disfraces y se muestran en la web.">
        <FormGrid cols={2}>
          <FormRow label="Código" required error={state.fields?.codigo} hint="Ej: HALLOWEEN">
            <Input name="codigo" defaultValue={initial?.codigo ?? ''} required maxLength={20} />
          </FormRow>
          <FormRow label="Nombre" required error={state.fields?.nombre}>
            <Input name="nombre" defaultValue={initial?.nombre ?? ''} required />
          </FormRow>
          <FormRow label="Slug (URL)" error={state.fields?.slug} hint="Solo minúsculas, números y guiones. Se autogenera del nombre.">
            <Input name="slug" defaultValue={initial?.slug ?? ''} placeholder="halloween" />
          </FormRow>
          <FormRow label="Orden en web" hint="Menor número = aparece primero">
            <Input name="orden_web" type="number" defaultValue={initial?.orden_web ?? 100} min={0} />
          </FormRow>
        </FormGrid>

        <FormRow label="Descripción">
          <Textarea name="descripcion" defaultValue={initial?.descripcion ?? ''} rows={2} placeholder="Descripción corta para SEO y banners" />
        </FormRow>
      </FormSection>

      <FormSection
        title="Identidad visual"
        description="Elegí un emoji y/o subí una imagen. La imagen tiene precedencia sobre el emoji en la web cuando ambos están definidos."
      >
        <FormRow label="Ícono / Emoji" hint="Click en uno para elegirlo, o escribí cualquier otro">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <input type="hidden" name="icono" value={icono} />
              <Input
                value={icono}
                onChange={(e) => setIcono(e.target.value)}
                placeholder="🎃"
                maxLength={8}
                className="w-32 text-center text-2xl"
              />
              {icono && (
                <button
                  type="button"
                  onClick={() => setIcono('')}
                  className="text-xs text-slate-500 hover:text-red-600"
                >
                  Quitar
                </button>
              )}
              <span className="text-xs text-slate-500">
                {icono ? 'Click "Quitar" para sacarlo' : 'Sin emoji asignado'}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5 rounded-md border border-dashed border-slate-200 p-3">
              {EMOJIS_SUGERIDOS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setIcono(e)}
                  className={`rounded-md border px-2 py-1 text-xl transition hover:scale-110 hover:bg-happy-50 ${
                    icono === e ? 'border-happy-500 bg-happy-50 ring-2 ring-happy-200' : 'border-slate-200'
                  }`}
                  title={`Elegir ${e}`}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        </FormRow>

        <FormRow
          label="Imagen de portada (opcional)"
          hint="Aparece como banner de la categoría en la web. Si no subís imagen, se usa el emoji."
        >
          <ImageUploader
            value={imagenUrl}
            onChange={setImagenUrl}
            name="imagen_url"
            prefix="categorias"
            aspect="video"
            label="Subir imagen de la categoría"
            className="max-w-md"
          />
        </FormRow>
      </FormSection>

      <FormSection title="Visibilidad">
        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-3 text-sm">
            <Switch name="publicar_en_web" checked={pubWeb} onCheckedChange={setPubWeb} />
            <input type="hidden" name="publicar_en_web" value={pubWeb ? 'on' : 'off'} />
            <span>Publicar en la tienda web</span>
          </label>
          <label className="flex items-center gap-3 text-sm">
            <Switch name="activo" checked={activo} onCheckedChange={setActivo} />
            <input type="hidden" name="activo" value={activo ? 'on' : 'off'} />
            <span>Activo</span>
          </label>
        </div>
      </FormSection>

      <div className="flex flex-wrap items-center justify-end gap-3">
        <Link href="/categorias"><Button variant="outline" type="button">Cancelar</Button></Link>
        <SubmitButton variant="premium" size="lg">{isEdit ? 'Guardar cambios' : 'Crear categoría'}</SubmitButton>
      </div>
    </form>
  );
}
