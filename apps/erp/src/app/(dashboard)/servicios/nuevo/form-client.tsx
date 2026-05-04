'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@happy/ui/card';
import { Input } from '@happy/ui/input';
import { Textarea } from '@happy/ui/textarea';
import { Badge } from '@happy/ui/badge';
import { Button } from '@happy/ui/button';
import { FormGrid, FormRow } from '@happy/ui/form-row';
import { Loader2, Scissors, Package, Calculator, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { ComboboxBusqueda } from '../../corte/nuevo/form-client';
import { crearOS } from '@/server/actions/corte';
import { calcularMontoSugeridoOS } from '@/server/actions/tarifas-talleres';

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
  const [tallasSel, setTallasSel] = useState<Set<string>>(new Set());
  const [montoBase, setMontoBase] = useState<string>('0');
  const [tarifaInfo, setTarifaInfo] = useState<{ total: number; detalle: { talla: string; cantidad: number; tarifa: number; subtotal: number }[]; faltantes: string[] } | null>(null);
  const [calcPending, setCalcPending] = useState(false);

  const corteSel = useMemo(() => cortes.find((c) => c.id === corteId) ?? null, [cortes, corteId]);

  // Cuando se elige un corte, auto-completa la OT y selecciona TODAS las tallas
  function onCorteChange(id: string) {
    setCorteId(id);
    const c = cortes.find((x) => x.id === id);
    if (c) {
      setOtId(c.ot_id);
      // Default: todas las tallas con cantidad_real > 0 vienen marcadas
      const tallas = c.lineas
        .filter((l) => Number(l.cantidad_real ?? 0) > 0)
        .map((l) => l.talla);
      setTallasSel(new Set(tallas));
    } else {
      setTallasSel(new Set());
    }
    setTarifaInfo(null);
  }

  function toggleTalla(t: string) {
    setTallasSel((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
    setTarifaInfo(null); // invalida tarifa al cambiar selección
  }

  // Cálculo de tarifa sugerida (solo cuando hay corte + taller + producto)
  async function calcularTarifa() {
    if (!corteSel || !tallerId) {
      toast.error('Necesitás corte y taller para sugerir tarifa');
      return;
    }
    setCalcPending(true);
    const cantidades: Record<string, number> = {};
    for (const l of corteSel.lineas) {
      if (tallasSel.has(l.talla) && Number(l.cantidad_real ?? 0) > 0) {
        cantidades[l.talla] = Number(l.cantidad_real);
      }
    }
    if (Object.keys(cantidades).length === 0) {
      toast.error('No hay tallas seleccionadas con cantidad');
      setCalcPending(false);
      return;
    }
    const r = await calcularMontoSugeridoOS(tallerId, corteSel.producto_id, proceso, cantidades);
    setCalcPending(false);
    if (r.ok && r.data) {
      setTarifaInfo(r.data);
      if (r.data.detalle.length === 0) {
        toast.error('No hay tarifas configuradas para este taller. Andá a /talleres/[id]/tarifas para cargarlas.');
      } else {
        setMontoBase(String(r.data.total));
        toast.success(`Tarifa sugerida: S/ ${r.data.total.toFixed(2)}`);
      }
    } else {
      toast.error(r.error ?? 'Error al calcular tarifa');
    }
  }

  // Auto-calcular tarifa cuando cambia taller/proceso/tallas (con debounce simple)
  useEffect(() => {
    if (!corteSel || !tallerId) return;
    const timer = setTimeout(() => {
      calcularTarifa();
    }, 600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tallerId, proceso, corteId, tallasSel.size]);

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
  const totalPrendasSeleccionadas = lineasPreview
    .filter((l) => tallasSel.has(l.talla))
    .reduce((s, l) => s + Number(l.cantidad_real ?? 0), 0);

  function submit(formEl: HTMLFormElement) {
    const fd = new FormData(formEl);
    fd.set('corte_id', corteId);
    fd.set('ot_id', otId);
    fd.set('taller_id', tallerId);
    fd.set('proceso', proceso);
    fd.set('es_campana', esCampana ? 'on' : 'off');
    fd.set('monto_base', montoBase || '0');
    // Si hay corte y se seleccionaron solo algunas tallas, mandarlas como filtro
    if (corteId && tallasSel.size > 0 && tallasSel.size < lineasPreview.length) {
      fd.delete('tallas_seleccionadas');
      for (const t of tallasSel) fd.append('tallas_seleccionadas', t);
    }
    start(async () => {
      const r = await crearOS(null, fd);
      if (r.ok) {
        toast.success(
          `OS creada · ${r.data?.lineas ?? 0} líneas y ${r.data?.avios ?? 0} avíos cargados desde el corte`,
        );
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

        {/* Preview interactiva cuando hay corte */}
        {corteSel && (
          <div className="space-y-3 rounded-lg border-2 border-happy-200 bg-happy-50/40 p-4">
            <div className="flex items-center gap-2">
              <Scissors className="h-4 w-4 text-happy-600" />
              <h3 className="font-display text-sm font-semibold text-corp-900">
                {corteSel.producto_nombre}
              </h3>
              <Badge variant="default" className="text-[10px]">
                {totalPrendasSeleccionadas} de {lineasPreview.reduce((s, l) => s + Number(l.cantidad_real ?? 0), 0)} prendas
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
              <div>
                <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-slate-600">
                  Tallas a enviar al taller (desmarcá las que NO van — útil para dividir orden)
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {lineasPreview.map((l) => {
                    const seleccionada = tallasSel.has(l.talla);
                    return (
                      <button
                        key={l.talla}
                        type="button"
                        onClick={() => toggleTalla(l.talla)}
                        className={`flex items-center gap-1.5 rounded-full border-2 px-3 py-1.5 text-xs transition ${
                          seleccionada
                            ? 'border-happy-500 bg-happy-500 text-white shadow-sm'
                            : 'border-slate-300 bg-white text-slate-500 line-through opacity-60 hover:border-happy-300'
                        }`}
                      >
                        <span className="font-mono">{l.talla.replace('T', '')}</span>
                        <span className="font-bold">{l.cantidad_real}u</span>
                      </button>
                    );
                  })}
                </div>
                {tallasSel.size < lineasPreview.length && (
                  <p className="mt-2 text-[11px] text-amber-700">
                    ⚠️ Estás dividiendo el corte: las tallas desmarcadas quedan disponibles para crear OTRA OS (a otro taller).
                  </p>
                )}
              </div>
            )}

            <p className="flex items-center gap-1 text-[11px] text-slate-600">
              <Package className="h-3 w-3" />
              Los avíos del BOM se calculan automáticamente. Si una línea de receta tiene <strong>cantidad_almacen</strong>,
              esa parte queda en planta y solo se manda al taller la diferencia.
            </p>

            {/* Panel de tarifa sugerida (solo cuando hay taller + tarifa calculada) */}
            {tallerId && tarifaInfo && (
              <div className="rounded-md border border-emerald-200 bg-emerald-50/60 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-800">
                    <Calculator className="h-3.5 w-3.5" />
                    Tarifa calculada · {calcPending && <Loader2 className="h-3 w-3 animate-spin" />}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={calcularTarifa}
                    disabled={calcPending}
                    className="h-7 gap-1 text-[10px]"
                  >
                    <Sparkles className="h-3 w-3" /> Recalcular
                  </Button>
                </div>
                {tarifaInfo.detalle.length === 0 ? (
                  <p className="text-xs text-amber-700">
                    ⚠️ No hay tarifas configuradas para este taller. Andá a{' '}
                    <a
                      href={`/talleres/${tallerId}/tarifas`}
                      className="underline hover:text-amber-900"
                      target="_blank"
                    >
                      /talleres/{tallerId.slice(0, 8)}…/tarifas
                    </a>{' '}
                    para crearlas.
                  </p>
                ) : (
                  <>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-emerald-200 text-left text-[10px] uppercase tracking-wider text-emerald-700">
                          <th className="py-1">Talla</th>
                          <th className="py-1 text-right">Cantidad</th>
                          <th className="py-1 text-right">Tarifa unit.</th>
                          <th className="py-1 text-right">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tarifaInfo.detalle.map((d) => (
                          <tr key={d.talla} className="border-b border-emerald-100 last:border-0">
                            <td className="py-1 font-mono">{d.talla.replace('T', '')}</td>
                            <td className="py-1 text-right">{d.cantidad}</td>
                            <td className="py-1 text-right text-emerald-700">S/ {d.tarifa.toFixed(2)}</td>
                            <td className="py-1 text-right font-semibold text-emerald-800">S/ {d.subtotal.toFixed(2)}</td>
                          </tr>
                        ))}
                        <tr className="font-bold">
                          <td className="py-1 pt-2">Total</td>
                          <td className="py-1 pt-2 text-right">
                            {tarifaInfo.detalle.reduce((s, d) => s + d.cantidad, 0)}
                          </td>
                          <td></td>
                          <td className="py-1 pt-2 text-right font-display text-base text-emerald-700">
                            S/ {tarifaInfo.total.toFixed(2)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                    {tarifaInfo.faltantes.length > 0 && (
                      <p className="mt-2 text-[10px] text-amber-700">
                        ⚠️ Sin tarifa para tallas: {tarifaInfo.faltantes.join(', ')}
                      </p>
                    )}
                    <p className="mt-2 text-[10px] text-slate-500">
                      Este monto ya está pre-cargado en &quot;Monto base&quot; abajo. Podés editarlo si querés override.
                    </p>
                  </>
                )}
              </div>
            )}
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
          <FormRow
            label="Monto base (S/)"
            hint={tarifaInfo && tarifaInfo.detalle.length > 0 ? `Sugerido: S/ ${tarifaInfo.total.toFixed(2)} (calculado por tarifas)` : 'Pago acordado al taller'}
          >
            <Input
              type="number"
              step="0.01"
              min={0}
              value={montoBase}
              onChange={(e) => setMontoBase(e.target.value)}
            />
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
