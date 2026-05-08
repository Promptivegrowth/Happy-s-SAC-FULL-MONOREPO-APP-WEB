'use client';

import { useActionForm } from './use-action-form';
import { SubmitButton } from './submit-button';
import { Input } from '@happy/ui/input';
import { Textarea } from '@happy/ui/textarea';
import { Switch } from '@happy/ui/switch';
import { FormGrid, FormRow, FormSection } from '@happy/ui/form-row';
import { Button } from '@happy/ui/button';
import { Badge } from '@happy/ui/badge';
import { Loader2, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { crearCategoria, actualizarCategoria, sugerirCodigoCategoria } from '@/server/actions/categorias';
import { ImageUploader } from './image-uploader';
import { useEffect, useRef, useState } from 'react';

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

  // Estado controlado de nombre + código para el preview/autocompletar.
  const [nombre, setNombre] = useState(initial?.nombre ?? '');
  const [codigo, setCodigo] = useState((initial?.codigo ?? '').toUpperCase());
  const [sugiriendo, setSugiriendo] = useState(false);
  const [codigoEditadoManualmente, setCodigoEditadoManualmente] = useState(isEdit);
  const ultimaSug = useRef('');

  // Autocompletar: cuando cambia el nombre, debounce 400ms y pedir sugerencia
  // al server (que detecta colisiones). Solo si:
  //   - estamos creando (no editando una categoría existente)
  //   - el usuario no tocó manualmente el campo "código"
  useEffect(() => {
    if (isEdit) return;
    if (codigoEditadoManualmente) return;
    if (!nombre || nombre.trim().length < 2) {
      setCodigo('');
      return;
    }
    setSugiriendo(true);
    const t = setTimeout(async () => {
      const r = await sugerirCodigoCategoria(nombre);
      if (r.ok && r.data?.codigo && !codigoEditadoManualmente) {
        setCodigo(r.data.codigo);
        ultimaSug.current = r.data.codigo;
      }
      setSugiriendo(false);
    }, 400);
    return () => { clearTimeout(t); setSugiriendo(false); };
  }, [nombre, isEdit, codigoEditadoManualmente]);

  function onCodigoChange(v: string) {
    const up = v.toUpperCase();
    setCodigo(up);
    // Si el usuario lo cambia respecto a la última sugerencia, dejamos de
    // pisarlo automáticamente al cambiar el nombre.
    if (up !== ultimaSug.current) setCodigoEditadoManualmente(true);
  }

  return (
    <form action={formAction} className="space-y-6">
      <FormSection title="Datos de la categoría" description="Las categorías agrupan los disfraces y se muestran en la web.">
        <FormGrid cols={2}>
          <FormRow label="Nombre" required error={state.fields?.nombre}>
            <Input
              name="nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              required
              placeholder="Ej: Halloween, Día de la Madre…"
            />
          </FormRow>
          <FormRow
            label="Código"
            error={state.fields?.codigo}
            hint={isEdit
              ? 'Cambiar este código rompe los SKUs ya emitidos. Editá solo si sabés lo que hacés.'
              : 'Se autocompleta del nombre. Editable si querés override.'}
          >
            <div className="relative">
              <Input
                name="codigo"
                value={codigo}
                onChange={(e) => onCodigoChange(e.target.value)}
                maxLength={20}
                placeholder={sugiriendo ? 'Buscando código libre…' : 'Ej: HLW'}
                className="font-mono uppercase"
              />
              {sugiriendo && (
                <Loader2 className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" />
              )}
            </div>
          </FormRow>
          <FormRow label="Slug (URL)" error={state.fields?.slug} hint="Solo minúsculas, números y guiones. Se autogenera del nombre.">
            <Input name="slug" defaultValue={initial?.slug ?? ''} placeholder="halloween" />
          </FormRow>
          <FormRow label="Orden en web" hint="Menor número = aparece primero">
            <Input name="orden_web" type="number" defaultValue={initial?.orden_web ?? 100} min={0} />
          </FormRow>
        </FormGrid>

        {!isEdit && codigo && (
          <div className="flex items-start gap-2 rounded-md border border-happy-200 bg-happy-50/50 px-3 py-2 text-xs text-corp-800">
            <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-happy-600" />
            <div className="flex-1 space-y-1">
              <p>
                Los productos creados en esta categoría tendrán códigos como{' '}
                <Badge variant="secondary" className="ml-0.5 font-mono text-[10px]">{codigo}M0001</Badge>
                {' '}(modelo) y SKUs visibles al cliente como{' '}
                <Badge variant="secondary" className="ml-0.5 font-mono text-[10px]">{codigo}0001</Badge>,
                {' '}<span className="font-mono text-[10px]">{codigo}0002</span>…
              </p>
              <p className="text-[11px] text-slate-500">
                El correlativo es independiente por categoría. Podés cambiar el código si preferís otra abreviatura.
              </p>
            </div>
          </div>
        )}

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
