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
import { useState } from 'react';

type Categoria = {
  id?: string;
  codigo?: string | null;
  nombre?: string | null;
  descripcion?: string | null;
  slug?: string | null;
  icono?: string | null;
  publicar_en_web?: boolean | null;
  orden_web?: number | null;
  activo?: boolean | null;
};

export function CategoriaForm({ initial }: { initial?: Categoria }) {
  const isEdit = Boolean(initial?.id);
  const action = isEdit
    ? actualizarCategoria.bind(null, initial!.id!)
    : crearCategoria;
  const { formAction, state } = useActionForm(action, isEdit ? 'Categoría actualizada' : 'Categoría creada');

  const [pubWeb, setPubWeb] = useState(initial?.publicar_en_web ?? true);
  const [activo, setActivo] = useState(initial?.activo ?? true);

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
          <FormRow label="Ícono / Emoji" hint="Aparece junto al nombre en la web">
            <Input name="icono" defaultValue={initial?.icono ?? ''} placeholder="🎃" maxLength={4} />
          </FormRow>
          <FormRow label="Orden en web" hint="Menor número = aparece primero">
            <Input name="orden_web" type="number" defaultValue={initial?.orden_web ?? 100} min={0} />
          </FormRow>
        </FormGrid>
        <FormRow label="Descripción">
          <Textarea name="descripcion" defaultValue={initial?.descripcion ?? ''} rows={2} placeholder="Descripción corta para SEO y banners" />
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
