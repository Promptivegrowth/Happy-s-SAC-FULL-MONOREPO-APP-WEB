'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useActionForm } from './use-action-form';
import { SubmitButton } from './submit-button';
import { Input } from '@happy/ui/input';
import { Textarea } from '@happy/ui/textarea';
import { Switch } from '@happy/ui/switch';
import { FormGrid, FormRow, FormSection } from '@happy/ui/form-row';
import { Button } from '@happy/ui/button';
import { ImageUploader } from './image-uploader';
import { crearProducto, actualizarProducto } from '@/server/actions/productos';

type Producto = {
  id?: string;
  codigo?: string;
  nombre?: string;
  descripcion?: string | null;
  categoria_id?: string | null;
  campana_id?: string | null;
  es_conjunto?: boolean;
  piezas_descripcion?: string | null;
  genero?: string | null;
  destacado?: boolean;
  imagen_principal_url?: string | null;
  version_ficha?: string;
  activo?: boolean;
};

type Lookup = { id: string; nombre: string; codigo?: string | null };

export function ProductoForm({
  initial,
  categorias,
  campanas,
  categoriasExtraIniciales = [],
}: {
  initial?: Producto;
  categorias: Lookup[];
  campanas: Lookup[];
  /** IDs de categorías que ya están como extras del producto (al editar) */
  categoriasExtraIniciales?: string[];
}) {
  const isEdit = Boolean(initial?.id);
  const action = isEdit ? actualizarProducto.bind(null, initial!.id!) : crearProducto;
  const { formAction, state } = useActionForm(action, isEdit ? 'Producto actualizado' : 'Producto creado');

  const [conjunto, setConjunto] = useState(initial?.es_conjunto ?? true);
  const [destacado, setDestacado] = useState(initial?.destacado ?? false);
  const [activo, setActivo] = useState(initial?.activo ?? true);
  const [imagenUrl, setImagenUrl] = useState<string | null>(initial?.imagen_principal_url ?? null);
  const [categoriaPrincipal, setCategoriaPrincipal] = useState<string>(initial?.categoria_id ?? '');
  const [extras, setExtras] = useState<string[]>(categoriasExtraIniciales);

  function toggleExtra(catId: string) {
    setExtras((prev) => {
      if (prev.includes(catId)) return prev.filter((x) => x !== catId);
      if (prev.length >= 2) return prev; // máx 2
      return [...prev, catId];
    });
  }

  return (
    <form action={formAction} className="space-y-6">
      <FormSection
        title="Identificación del modelo"
        description="El modelo agrupa todas las tallas (variantes). Cada variante se identifica con un SKU del tipo HLW0001 que se autogenera desde la categoría."
      >
        <FormRow label="Nombre" required error={state.fields?.nombre}>
          <Input
            name="nombre"
            defaultValue={initial?.nombre}
            required
            maxLength={150}
            placeholder="Ej: Moana, Bolívar, Disfraz de Bombero…"
          />
        </FormRow>

        <FormGrid cols={3}>
          <FormRow label="Categoría principal" hint="Define URL, código y breadcrumb">
            <select
              name="categoria_id"
              value={categoriaPrincipal}
              onChange={(e) => {
                setCategoriaPrincipal(e.target.value);
                // si la nueva principal estaba como extra, sacarla
                setExtras((prev) => prev.filter((x) => x !== e.target.value));
              }}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">— Sin categoría —</option>
              {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </FormRow>
          <FormRow label="Campaña / Temporada">
            <select name="campana_id" defaultValue={initial?.campana_id ?? ''} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="">— Sin campaña —</option>
              {campanas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </FormRow>
          <FormRow label="Género">
            <select name="genero" defaultValue={initial?.genero ?? ''} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="">—</option>
              <option value="UNISEX">Unisex</option>
              <option value="NINO">Niño</option>
              <option value="NINA">Niña</option>
              <option value="MUJER">Mujer</option>
              <option value="HOMBRE">Hombre</option>
            </select>
          </FormRow>
        </FormGrid>

        <FormRow label="Descripción">
          <Textarea name="descripcion" defaultValue={initial?.descripcion ?? ''} rows={3} placeholder="Descripción interna y notas técnicas" />
        </FormRow>

        <FormRow
          label="Categorías extra (opcional, máx 2)"
          hint="El producto aparece también en estas categorías y NO se despublica si se apaga la principal mientras al menos una extra siga activa. No genera código nuevo."
        >
          {/* Hidden inputs para enviar la selección al server */}
          {extras.map((id) => (
            <input key={id} type="hidden" name="categorias_extra" value={id} />
          ))}
          <div className="flex flex-wrap gap-2 rounded-md border border-dashed border-slate-200 p-3">
            {categorias.length === 0 && (
              <p className="text-xs text-slate-400">Sin categorías disponibles.</p>
            )}
            {categorias
              .filter((c) => c.id !== categoriaPrincipal)
              .map((c) => {
                const seleccionada = extras.includes(c.id);
                const llena = !seleccionada && extras.length >= 2;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggleExtra(c.id)}
                    disabled={llena}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                      seleccionada
                        ? 'border-happy-500 bg-happy-500 text-white shadow-sm'
                        : llena
                          ? 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-300'
                          : 'border-slate-300 bg-white text-slate-700 hover:border-happy-400 hover:bg-happy-50'
                    }`}
                    title={llena ? 'Ya elegiste 2 extras (máximo)' : ''}
                  >
                    {seleccionada && '✓ '}{c.nombre}
                  </button>
                );
              })}
          </div>
          {extras.length > 0 && (
            <p className="mt-1 text-[10px] text-slate-500">
              Elegidas: {extras.length} / 2
            </p>
          )}
        </FormRow>
      </FormSection>

      <FormSection title="Composición física">
        <FormRow label="Piezas que incluye" hint='Ej: "Pantalón + Chaqueta + Gorro + Guantes"'>
          <Input name="piezas_descripcion" defaultValue={initial?.piezas_descripcion ?? ''} maxLength={300} />
        </FormRow>
        <label className="flex items-center gap-3 text-sm">
          <Switch checked={conjunto} onCheckedChange={setConjunto} />
          <input type="hidden" name="es_conjunto" value={conjunto ? 'on' : 'off'} />
          <span>Es un conjunto (incluye varias prendas)</span>
        </label>
      </FormSection>

      <FormSection title="Imagen y ficha">
        <FormGrid cols={2}>
          <FormRow label="Imagen principal del modelo" hint="Aparece en cards y como portada">
            <ImageUploader
              value={imagenUrl}
              onChange={setImagenUrl}
              name="imagen_principal_url"
              prefix={`productos/${initial?.id ?? 'tmp'}`}
              aspect="square"
              className="max-w-[240px]"
            />
          </FormRow>
          <FormRow label="Versión de ficha técnica">
            <Input name="version_ficha" defaultValue={initial?.version_ficha ?? 'v1.0'} placeholder="v1.0" />
          </FormRow>
        </FormGrid>
        <div className="flex flex-wrap gap-6">
          <label className="flex items-start gap-3 text-sm">
            <Switch checked={destacado} onCheckedChange={setDestacado} className="mt-0.5" />
            <input type="hidden" name="destacado" value={destacado ? 'on' : 'off'} />
            <div>
              <p>Destacar internamente (ERP)</p>
              <p className="text-[10px] text-slate-500">
                Marca visible solo para el equipo, no afecta web/POS. Para destacar en la home de la
                web, usá la pestaña "Publicación web".
              </p>
            </div>
          </label>
          <label className="flex items-center gap-3 text-sm">
            <Switch checked={activo} onCheckedChange={setActivo} />
            <input type="hidden" name="activo" value={activo ? 'on' : 'off'} />
            <span>Producto activo</span>
          </label>
        </div>
      </FormSection>

      <div className="flex flex-wrap items-center justify-end gap-3">
        <Link href="/productos"><Button variant="outline" type="button">Cancelar</Button></Link>
        <SubmitButton variant="premium" size="lg">
          {isEdit ? 'Guardar cambios' : 'Crear producto'}
        </SubmitButton>
      </div>
    </form>
  );
}
