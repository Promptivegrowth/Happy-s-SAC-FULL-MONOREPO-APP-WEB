'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@happy/ui/button';
import { Card } from '@happy/ui/card';
import { FormRow, FormGrid, FormSection } from '@happy/ui/form-row';
import { Input } from '@happy/ui/input';
import { Textarea } from '@happy/ui/textarea';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import {
  crearImportacion,
  type ProveedorOption,
} from '@/server/actions/importaciones';

const MONEDAS = ['USD', 'EUR', 'PEN', 'CNY', 'JPY', 'BRL', 'MXN', 'COP', 'CLP'] as const;

export function NuevaImportacionForm({ proveedores }: { proveedores: ProveedorOption[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const [proveedorId, setProveedorId] = useState<string>('');
  const [paisOrigen, setPaisOrigen] = useState('');
  const [moneda, setMoneda] = useState<string>('USD');
  const [tipoCambio, setTipoCambio] = useState<string>('');
  const [fechaEmbarque, setFechaEmbarque] = useState('');
  const [fechaArriboEsperada, setFechaArriboEsperada] = useState('');
  const [flete, setFlete] = useState<string>('0');
  const [seguro, setSeguro] = useState<string>('0');
  const [aduanas, setAduanas] = useState<string>('0');
  const [otros, setOtros] = useState<string>('0');
  const [observacion, setObservacion] = useState('');

  const totalAdicional = useMemo(
    () => (Number(flete) || 0) + (Number(seguro) || 0) + (Number(aduanas) || 0) + (Number(otros) || 0),
    [flete, seguro, aduanas, otros],
  );

  function enviar() {
    if (!proveedorId) return toast.error('Selecciona un proveedor');
    if (moneda !== 'PEN' && (!tipoCambio || Number(tipoCambio) <= 0)) {
      return toast.error('Tipo de cambio requerido y > 0 cuando la moneda no es PEN');
    }

    const payload = {
      proveedor_id: proveedorId,
      pais_origen: paisOrigen,
      moneda,
      tipo_cambio: tipoCambio ? Number(tipoCambio) : undefined,
      fecha_embarque: fechaEmbarque,
      fecha_arribo_esperada: fechaArriboEsperada,
      flete: Number(flete) || 0,
      seguro: Number(seguro) || 0,
      aduanas: Number(aduanas) || 0,
      otros_costos: Number(otros) || 0,
      observacion,
    };

    start(async () => {
      const r = await crearImportacion(payload);
      if (r.ok && r.data) {
        toast.success(`Importación ${r.data.numero} creada`);
        router.push(`/compras/importaciones/${r.data.id}`);
      } else {
        toast.error(r.error ?? 'Error al crear la importación');
      }
    });
  }

  return (
    <div className="space-y-6">
      <FormSection title="Proveedor y origen" description="Proveedor extranjero y país desde donde se embarca.">
        <FormGrid cols={2}>
          <FormRow label="Proveedor" required>
            <select
              value={proveedorId}
              onChange={(e) => setProveedorId(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-white px-2 text-sm"
              disabled={pending}
            >
              <option value="">— Selecciona proveedor —</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.razon_social} · {p.numero_documento}
                  {p.es_importacion ? ' · IMP' : ''}
                </option>
              ))}
            </select>
          </FormRow>
          <FormRow label="País de origen">
            <Input
              type="text"
              value={paisOrigen}
              onChange={(e) => setPaisOrigen(e.target.value)}
              placeholder="Ej: China, USA, Brasil…"
              disabled={pending}
            />
          </FormRow>
        </FormGrid>
      </FormSection>

      <FormSection title="Moneda y tipo de cambio" description="Moneda del embarque y conversión a PEN.">
        <FormGrid cols={2}>
          <FormRow label="Moneda" required>
            <select
              value={moneda}
              onChange={(e) => setMoneda(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-white px-2 text-sm"
              disabled={pending}
            >
              {MONEDAS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </FormRow>
          <FormRow
            label="Tipo de cambio"
            required={moneda !== 'PEN'}
            hint={moneda === 'PEN' ? 'No aplica para soles' : 'Conversión a PEN al momento del embarque'}
          >
            <Input
              type="number"
              step="0.0001"
              min="0"
              value={tipoCambio}
              onChange={(e) => setTipoCambio(e.target.value)}
              placeholder="Ej: 3.7500"
              disabled={pending || moneda === 'PEN'}
            />
          </FormRow>
        </FormGrid>
      </FormSection>

      <FormSection title="Fechas" description="Embarque y arribo esperado. El arribo real se completa al recibir.">
        <FormGrid cols={2}>
          <FormRow label="Fecha de embarque">
            <Input
              type="date"
              value={fechaEmbarque}
              onChange={(e) => setFechaEmbarque(e.target.value)}
              disabled={pending}
            />
          </FormRow>
          <FormRow label="Fecha de arribo esperada">
            <Input
              type="date"
              value={fechaArriboEsperada}
              onChange={(e) => setFechaArriboEsperada(e.target.value)}
              disabled={pending}
            />
          </FormRow>
        </FormGrid>
      </FormSection>

      <FormSection title="Costos adicionales" description="Se sumarán al costo de los materiales en una distribución futura.">
        <FormGrid cols={4}>
          <FormRow label="Flete">
            <Input
              type="number"
              step="0.01"
              min="0"
              value={flete}
              onChange={(e) => setFlete(e.target.value)}
              disabled={pending}
              className="text-right"
            />
          </FormRow>
          <FormRow label="Seguro">
            <Input
              type="number"
              step="0.01"
              min="0"
              value={seguro}
              onChange={(e) => setSeguro(e.target.value)}
              disabled={pending}
              className="text-right"
            />
          </FormRow>
          <FormRow label="Aduanas">
            <Input
              type="number"
              step="0.01"
              min="0"
              value={aduanas}
              onChange={(e) => setAduanas(e.target.value)}
              disabled={pending}
              className="text-right"
            />
          </FormRow>
          <FormRow label="Otros">
            <Input
              type="number"
              step="0.01"
              min="0"
              value={otros}
              onChange={(e) => setOtros(e.target.value)}
              disabled={pending}
              className="text-right"
            />
          </FormRow>
        </FormGrid>
        <Card className="flex items-center justify-between bg-slate-50 p-3 text-sm">
          <span className="font-medium text-slate-600">Total adicional:</span>
          <span className="font-display text-xl font-semibold text-corp-900">
            {totalAdicional.toLocaleString('es-PE', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}{' '}
            <span className="text-xs text-slate-500">{moneda}</span>
          </span>
        </Card>
      </FormSection>

      <FormSection title="Observación" description="Notas internas sobre el embarque.">
        <Textarea
          value={observacion}
          onChange={(e) => setObservacion(e.target.value)}
          placeholder="Detalles del proveedor, agente de aduanas, naviera, etc."
          disabled={pending}
          rows={3}
        />
      </FormSection>

      <div className="flex justify-end gap-3">
        <Button
          onClick={enviar}
          disabled={pending || !proveedorId}
          variant="premium"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Crear importación
        </Button>
      </div>
    </div>
  );
}
