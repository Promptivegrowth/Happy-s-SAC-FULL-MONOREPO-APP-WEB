'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useActionForm } from './use-action-form';
import { SubmitButton } from './submit-button';
import { Input } from '@happy/ui/input';
import { Textarea } from '@happy/ui/textarea';
import { Switch } from '@happy/ui/switch';
import { FormGrid, FormRow, FormSection } from '@happy/ui/form-row';
import { Button } from '@happy/ui/button';
import { Sparkles } from 'lucide-react';
import { ImageUploader } from './image-uploader';
import { crearMaterial, actualizarMaterial, sugerirFactorConversion } from '@/server/actions/materiales';

type Material = {
  id?: string;
  codigo?: string;
  nombre?: string;
  descripcion?: string | null;
  categoria?: 'TELA' | 'AVIO' | 'INSUMO' | 'EMPAQUE';
  sub_categoria?: string | null;
  color_nombre?: string | null;
  unidad_compra_id?: string | null;
  unidad_consumo_id?: string | null;
  factor_conversion?: number | null;
  precio_unitario?: number | null;
  precio_incluye_igv?: boolean;
  stock_minimo?: number | null;
  es_importado?: boolean;
  requiere_lote?: boolean;
  proveedor_preferido_id?: string | null;
  notas?: string | null;
  imagen_url?: string | null;
  activo?: boolean;
};

type Lookup = { id: string; codigo?: string; nombre?: string; razon_social?: string };

type Props = {
  initial?: Material;
  unidades: Lookup[];
  proveedores: Lookup[];
};

export function MaterialForm({ initial, unidades, proveedores }: Props) {
  const isEdit = Boolean(initial?.id);
  const action = isEdit ? actualizarMaterial.bind(null, initial!.id!) : crearMaterial;
  const { formAction, state } = useActionForm(action, isEdit ? 'Material actualizado' : 'Material creado');

  const [igv, setIgv] = useState(initial?.precio_incluye_igv ?? true);
  const [imp, setImp] = useState(initial?.es_importado ?? false);
  const [lote, setLote] = useState(initial?.requiere_lote ?? false);
  const [activo, setActivo] = useState(initial?.activo ?? true);
  const [imagenUrl, setImagenUrl] = useState<string | null>(initial?.imagen_url ?? null);

  // Auto-completar factor cuando cambian las unidades
  const [unidadCompraId, setUnidadCompraId] = useState(initial?.unidad_compra_id ?? '');
  const [unidadConsumoId, setUnidadConsumoId] = useState(initial?.unidad_consumo_id ?? '');
  const [factor, setFactor] = useState<string>(String(initial?.factor_conversion ?? 1));
  const [sugerencia, setSugerencia] = useState<{ factor: number; coincidencias: number } | null>(null);
  const [pendingSug, startSug] = useTransition();
  const usuarioTocoFactor = useRef(false);

  useEffect(() => {
    // No pisar lo que el usuario escribió manualmente
    if (usuarioTocoFactor.current) return;
    if (!unidadCompraId || !unidadConsumoId) {
      setSugerencia(null);
      return;
    }
    if (unidadCompraId === unidadConsumoId) {
      setFactor('1');
      setSugerencia(null);
      return;
    }
    startSug(async () => {
      const sug = await sugerirFactorConversion(unidadCompraId, unidadConsumoId);
      setSugerencia(sug);
      if (sug && sug.factor > 0) {
        setFactor(String(sug.factor));
      }
    });
  }, [unidadCompraId, unidadConsumoId]);

  function aplicarSugerencia() {
    if (sugerencia) {
      setFactor(String(sugerencia.factor));
      usuarioTocoFactor.current = false;
    }
  }

  return (
    <form action={formAction} className="space-y-6">
      <FormSection title="Identificación">
        <FormGrid cols={3}>
          <FormRow
            label="Código"
            error={state.fields?.codigo}
            hint={
              isEdit
                ? 'Ya asignado.'
                : 'Opcional. Si lo dejas vacío, se autogenera como TEL0001 / AVI0001 / INS0001 / EMP0001 según categoría.'
            }
          >
            <Input
              name="codigo"
              defaultValue={initial?.codigo ?? ''}
              maxLength={40}
              placeholder={isEdit ? '' : 'Auto desde categoría'}
              readOnly={isEdit}
              className={isEdit ? 'bg-slate-50 text-slate-600' : undefined}
            />
          </FormRow>
          <FormRow label="Categoría" required>
            <select name="categoria" defaultValue={initial?.categoria ?? 'INSUMO'} required className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="TELA">TELA</option>
              <option value="AVIO">AVIO</option>
              <option value="INSUMO">INSUMO</option>
              <option value="EMPAQUE">EMPAQUE</option>
            </select>
          </FormRow>
          <FormRow label="Sub-categoría">
            <Input name="sub_categoria" defaultValue={initial?.sub_categoria ?? ''} placeholder="SERMAT, BOTÓN, GRECA..." />
          </FormRow>
        </FormGrid>
        <FormRow label="Nombre" required error={state.fields?.nombre}>
          <Input name="nombre" defaultValue={initial?.nombre} required maxLength={200} />
        </FormRow>
        <FormRow label="Color">
          <Input name="color_nombre" defaultValue={initial?.color_nombre ?? ''} placeholder="DORADO, AZULINO..." />
        </FormRow>
      </FormSection>

      <FormSection title="Unidades y precio">
        <FormGrid cols={3}>
          <FormRow label="Unidad de compra">
            <select
              name="unidad_compra_id"
              value={unidadCompraId}
              onChange={(e) => {
                setUnidadCompraId(e.target.value);
                usuarioTocoFactor.current = false;
              }}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">—</option>
              {unidades.map((u) => <option key={u.id} value={u.id}>{u.codigo} · {u.nombre}</option>)}
            </select>
          </FormRow>
          <FormRow label="Unidad de consumo" hint="Si difiere de la compra (ej. Rollo → m)">
            <select
              name="unidad_consumo_id"
              value={unidadConsumoId}
              onChange={(e) => {
                setUnidadConsumoId(e.target.value);
                usuarioTocoFactor.current = false;
              }}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">— Igual a la de compra —</option>
              {unidades.map((u) => <option key={u.id} value={u.id}>{u.codigo} · {u.nombre}</option>)}
            </select>
          </FormRow>
          <FormRow
            label="Factor conversión"
            hint={
              pendingSug
                ? 'Buscando sugerencia…'
                : sugerencia
                  ? `Sugerido por ${sugerencia.coincidencias} material${sugerencia.coincidencias === 1 ? '' : 'es'} similar${sugerencia.coincidencias === 1 ? '' : 'es'}`
                  : 'Cuántas unidades de consumo entran en 1 de compra'
            }
          >
            <div className="relative">
              <Input
                name="factor_conversion"
                type="number"
                step="0.0001"
                value={factor}
                onChange={(e) => {
                  usuarioTocoFactor.current = true;
                  setFactor(e.target.value);
                }}
                min={0}
              />
              {sugerencia && Number(factor) !== sugerencia.factor && (
                <button
                  type="button"
                  onClick={aplicarSugerencia}
                  className="absolute right-2 top-1/2 inline-flex -translate-y-1/2 items-center gap-1 rounded-md bg-happy-100 px-2 py-1 text-[10px] font-medium text-happy-700 hover:bg-happy-200"
                  title={`Aplicar sugerencia: ${sugerencia.factor}`}
                >
                  <Sparkles className="h-3 w-3" /> Usar {sugerencia.factor}
                </button>
              )}
            </div>
          </FormRow>
          <FormRow
            label="Precio unitario (S/)"
            required
            hint="Precio de COMPRA por unidad de COMPRA (ej: precio del rollo entero, no por metro)"
          >
            <Input name="precio_unitario" type="number" step="0.0001" defaultValue={initial?.precio_unitario ?? 0} min={0} required />
          </FormRow>
          <FormRow label="Stock mínimo">
            <Input name="stock_minimo" type="number" step="0.01" defaultValue={initial?.stock_minimo ?? 0} min={0} />
          </FormRow>
          <FormRow label="Proveedor preferido">
            <select name="proveedor_preferido_id" defaultValue={initial?.proveedor_preferido_id ?? ''} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="">—</option>
              {proveedores.map((p) => <option key={p.id} value={p.id}>{p.razon_social}</option>)}
            </select>
          </FormRow>
        </FormGrid>
      </FormSection>

      <FormSection title="Imagen del material" description="Foto de referencia para identificar el material visualmente.">
        <FormRow label="Foto" hint="PNG, JPG o WebP · max 10MB">
          <ImageUploader
            value={imagenUrl}
            onChange={setImagenUrl}
            name="imagen_url"
            prefix={`materiales/${initial?.id ?? 'tmp'}`}
            aspect="square"
            className="max-w-[200px]"
          />
        </FormRow>
      </FormSection>

      <FormSection title="Otras opciones">
        <div className="grid gap-4 sm:grid-cols-2">
          <Toggle label="El precio incluye IGV" checked={igv} onChange={setIgv} name="precio_incluye_igv" />
          <Toggle label="Es importado" checked={imp} onChange={setImp} name="es_importado" />
          <Toggle label="Requiere control de lote" checked={lote} onChange={setLote} name="requiere_lote" />
          <Toggle label="Activo" checked={activo} onChange={setActivo} name="activo" />
        </div>
        <FormRow label="Notas">
          <Textarea name="notas" defaultValue={initial?.notas ?? ''} rows={2} />
        </FormRow>
      </FormSection>

      <div className="flex flex-wrap items-center justify-end gap-3">
        <Link href="/materiales"><Button variant="outline" type="button">Cancelar</Button></Link>
        <SubmitButton variant="premium" size="lg">{isEdit ? 'Guardar cambios' : 'Crear material'}</SubmitButton>
      </div>
    </form>
  );
}

function Toggle({ label, checked, onChange, name }: { label: string; checked: boolean; onChange: (v: boolean) => void; name: string }) {
  return (
    <label className="flex items-center gap-3 text-sm">
      <Switch checked={checked} onCheckedChange={onChange} />
      <input type="hidden" name={name} value={checked ? 'on' : 'off'} />
      <span>{label}</span>
    </label>
  );
}
