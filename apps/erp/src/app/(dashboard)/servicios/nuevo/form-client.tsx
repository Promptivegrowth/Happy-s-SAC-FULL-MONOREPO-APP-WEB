'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@happy/ui/card';
import { Input } from '@happy/ui/input';
import { Textarea } from '@happy/ui/textarea';
import { Badge } from '@happy/ui/badge';
import { Button } from '@happy/ui/button';
import { FormGrid, FormRow } from '@happy/ui/form-row';
import { Loader2, Scissors, Package } from 'lucide-react';
import { toast } from 'sonner';
import { ComboboxBusqueda } from '../../corte/nuevo/form-client';
import { crearOS } from '@/server/actions/corte';

type CorteOption = {
  id: string;
  numero: string;
  ot_id: string;
  ot_numero: string;
  producto_id: string;
  producto_nombre: string;
  estado: string;
  lineas: { talla: string; cantidad_real: number | null; cantidad_teorica: number }[];
};
type OT = { id: string; numero: string };
type Taller = { id: string; nombre: string; codigo: string };

const PROCESOS = [
  'COSTURA',
  'BORDADO',
  'ESTAMPADO',
  'SUBLIMADO',
  'PLISADO',
  'DECORADO',
  'ACABADO',
  'PLANCHADO',
  'OJAL_BOTON',
] as const;

export function NuevaOSForm({
  cortes,
  ots,
  talleres,
}: {
  cortes: CorteOption[];
  ots: OT[];
  talleres: Taller[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [corteId, setCorteId] = useState<string>('');
  const [otId, setOtId] = useState<string>('');
  const [tallerId, setTallerId] = useState<string>('');
  const [proceso, setProceso] = useState<string>('COSTURA');
  const [esCampana, setEsCampana] = useState(false);

  const corteSel = useMemo(() => cortes.find((c) => c.id === corteId) ?? null, [cortes, corteId]);

  // Cuando se elige un corte, auto-completa la OT
  function onCorteChange(id: string) {
    setCorteId(id);
    const c = cortes.find((x) => x.id === id);
    if (c) setOtId(c.ot_id);
  }

  const corteOptions = cortes.map((c) => ({
    id: c.id,
    label: `${c.numero} · ${c.producto_nombre}`,
    sublabel: `OT ${c.ot_numero} · ${c.estado}`,
  }));
  const otOptions = ots.map((o) => ({ id: o.id, label: o.numero }));
  const tallerOptions = talleres.map((t) => ({
    id: t.id,
    label: t.nombre,
    sublabel: t.codigo,
  }));

  // Líneas del corte para el preview (filtra cantidad_real > 0)
  const lineasPreview = (corteSel?.lineas ?? [])
    .filter((l) => Number(l.cantidad_real ?? 0) > 0)
    .sort((a, b) => a.talla.localeCompare(b.talla));
  const totalPrendas = lineasPreview.reduce((s, l) => s + Number(l.cantidad_real ?? 0), 0);

  function submit(formEl: HTMLFormElement) {
    const fd = new FormData(formEl);
    fd.set('corte_id', corteId);
    fd.set('ot_id', otId);
    fd.set('taller_id', tallerId);
    fd.set('proceso', proceso);
    fd.set('es_campana', esCampana ? 'on' : 'off');
    start(async () => {
      const r = await crearOS(null, fd);
      if (r.ok) {
        toast.success(
          `OS creada · ${r.data?.lineas ?? 0} líneas y ${r.data?.avios ?? 0} avíos cargados desde el corte`,
        );
        // crearOS hace redirect al detail
      } else {
        toast.error(r.error ?? 'No se pudo crear la OS');
      }
    });
  }

  return (
    <Card className="max-w-3xl p-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(e.currentTarget);
        }}
        className="space-y-6"
      >
        <FormRow
          label="Corte vinculado (opcional)"
          hint="Si elegís un corte, las líneas (tallas + cantidades) y los avíos del BOM se cargan automáticamente al guardar."
        >
          <ComboboxBusqueda
            options={corteOptions}
            value={corteId}
            onChange={onCorteChange}
            placeholder="Buscar corte por número o modelo…"
          />
        </FormRow>

        {/* Preview cuando hay corte */}
        {corteSel && (
          <div className="rounded-lg border-2 border-happy-200 bg-happy-50/40 p-4">
            <div className="mb-3 flex items-center gap-2">
              <Scissors className="h-4 w-4 text-happy-600" />
              <h3 className="font-display text-sm font-semibold text-corp-900">
                {corteSel.producto_nombre}
              </h3>
              <Badge variant="default" className="text-[10px]">
                {totalPrendas} prendas
              </Badge>
              <Badge variant="secondary" className="text-[10px]">
                OT {corteSel.ot_numero}
              </Badge>
            </div>
            {lineasPreview.length === 0 ? (
              <p className="text-xs text-amber-700">
                ⚠️ Este corte no tiene líneas con cantidad real declarada. La OS se creará vacía.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {lineasPreview.map((l) => (
                  <Badge key={l.talla} variant="outline" className="text-xs">
                    Talla {l.talla.replace('T', '')}: <strong className="ml-1">{l.cantidad_real}</strong>
                  </Badge>
                ))}
              </div>
            )}
            <p className="mt-3 flex items-center gap-1 text-[11px] text-slate-600">
              <Package className="h-3 w-3" />
              Los avíos (tela, hilo, etc. con &quot;va al taller&quot; en el BOM) se calculan automáticamente
              al guardar y se incluyen en la orden.
            </p>
          </div>
        )}

        <FormGrid cols={2}>
          <FormRow label="OT" required hint={corteId ? 'Auto-completada con la del corte' : undefined}>
            <ComboboxBusqueda
              options={otOptions}
              value={otId}
              onChange={setOtId}
              placeholder="Buscar OT…"
            />
          </FormRow>
          <FormRow label="Taller" required>
            <ComboboxBusqueda
              options={tallerOptions}
              value={tallerId}
              onChange={setTallerId}
              placeholder="Buscar taller…"
            />
          </FormRow>
          <FormRow label="Proceso" required>
            <select
              value={proceso}
              onChange={(e) => setProceso(e.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {PROCESOS.map((p) => (
                <option key={p} value={p}>
                  {p.replace('_', ' ')}
                </option>
              ))}
            </select>
          </FormRow>
          <FormRow label="Fecha entrega esperada">
            <Input name="fecha_entrega_esperada" type="date" />
          </FormRow>
          <FormRow label="Monto base (S/)" hint="Pago acordado al taller">
            <Input name="monto_base" type="number" step="0.01" min={0} defaultValue={0} />
          </FormRow>
          <FormRow label="Adicional movilidad (S/)">
            <Input name="adicional_movilidad" type="number" step="0.01" min={0} defaultValue={0} />
          </FormRow>
          <FormRow label="Adicional campaña (S/)">
            <Input name="adicional_campana" type="number" step="0.01" min={0} defaultValue={0} />
          </FormRow>
          <FormRow label="Es campaña">
            <label className="flex h-10 items-center gap-3 rounded-md border border-input bg-background px-3 text-sm">
              <input
                type="checkbox"
                checked={esCampana}
                onChange={(e) => setEsCampana(e.target.checked)}
                className="h-4 w-4 accent-happy-500"
              />
              <span>{esCampana ? 'Sí, es de campaña' : 'No'}</span>
            </label>
          </FormRow>
        </FormGrid>

        <FormRow label="Cuidados especiales" hint="Texto que verá el taller">
          <Textarea name="cuidados" rows={2} />
        </FormRow>
        <FormRow label="Consideraciones técnicas">
          <Textarea name="consideraciones" rows={2} />
        </FormRow>
        <FormRow label="Observaciones generales">
          <Textarea name="observaciones" rows={2} />
        </FormRow>

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push('/servicios')}
            disabled={pending}
          >
            Cancelar
          </Button>
          <Button type="submit" variant="premium" size="lg" disabled={pending || !otId || !tallerId}>
            {pending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Creando…
              </>
            ) : (
              'Crear OS'
            )}
          </Button>
        </div>
      </form>
    </Card>
  );
}
