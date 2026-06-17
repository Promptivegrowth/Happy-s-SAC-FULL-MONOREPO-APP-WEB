'use client';

import { useState } from 'react';
import { Button } from '@happy/ui/button';
import { Input } from '@happy/ui/input';
import { Label } from '@happy/ui/label';
import { Card } from '@happy/ui/card';
import { toast } from 'sonner';
import { CheckCircle2, Download, Loader2 } from 'lucide-react';
import {
  crearReclamoPublico,
  obtenerReclamoConfirmacion,
  type CrearReclamoPublicoInput,
} from '@/server/actions/reclamos';
import { generarReclamoPdf } from './pdf';

type Tipo = 'RECLAMO' | 'QUEJA';
type Bien = 'PRODUCTO' | 'SERVICIO';
type TipoDoc = 'DNI' | 'RUC' | 'CE' | 'PASAPORTE';

export function ReclamoForm() {
  const [tipo, setTipo] = useState<Tipo>('RECLAMO');
  const [tipoBien, setTipoBien] = useState<Bien>('PRODUCTO');
  const [esMenor, setEsMenor] = useState(false);
  const [acepta, setAcepta] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [exito, setExito] = useState<{ id: string; numero: string } | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!acepta) {
      toast.error('Debe aceptar los términos para continuar');
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData(e.currentTarget);
      const body: CrearReclamoPublicoInput = {
        tipo,
        tipo_bien: tipoBien,
        cliente_nombre: String(fd.get('nombre') ?? '').trim(),
        cliente_documento_tipo: String(fd.get('docTipo') ?? 'DNI') as TipoDoc,
        cliente_documento_numero: String(fd.get('docNum') ?? '').trim(),
        cliente_telefono: String(fd.get('telefono') ?? '').trim(),
        cliente_email: String(fd.get('email') ?? '').trim(),
        cliente_direccion: String(fd.get('direccion') ?? '').trim(),
        cliente_ubigeo: String(fd.get('ubigeo') ?? '').trim() || undefined,
        es_menor_edad: esMenor,
        apoderado_nombre: esMenor
          ? String(fd.get('apoderado') ?? '').trim() || undefined
          : undefined,
        apoderado_documento: esMenor
          ? String(fd.get('apoderadoDoc') ?? '').trim() || undefined
          : undefined,
        monto_reclamado: fd.get('monto') ? Number(fd.get('monto')) : undefined,
        venta_id: String(fd.get('ventaId') ?? '').trim() || undefined,
        pedido_web_id: String(fd.get('pedidoId') ?? '').trim() || undefined,
        descripcion: String(fd.get('descripcion') ?? '').trim(),
        pedido_consumidor: String(fd.get('pedido') ?? '').trim(),
        acepta_terminos: true,
      };
      const res = await crearReclamoPublico(body);
      if (!res.ok) throw new Error(res.error);
      setExito({ id: res.id, numero: res.numero });
      toast.success(`Reclamo registrado: ${res.numero}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function descargarPdf() {
    if (!exito) return;
    setPdfLoading(true);
    try {
      const res = await obtenerReclamoConfirmacion(exito.id);
      if (!res.ok) throw new Error(res.error);
      await generarReclamoPdf(res.data);
      toast.success('PDF descargado');
    } catch (e) {
      toast.error(`No se pudo generar el PDF: ${(e as Error).message}`);
    } finally {
      setPdfLoading(false);
    }
  }

  if (exito) {
    return (
      <Card className="p-10 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <CheckCircle2 className="h-10 w-10" />
        </div>
        <h2 className="mt-4 font-display text-2xl font-semibold">Reclamo registrado</h2>
        <p className="mt-2 text-slate-600">Tu número de reclamo es:</p>
        <p className="mt-3 inline-block rounded-md bg-amber-100 px-4 py-2 font-mono text-lg font-semibold text-amber-900">
          {exito.numero}
        </p>
        <p className="mx-auto mt-4 max-w-lg text-sm text-slate-500">
          Recibirás respuesta en un plazo máximo de 30 días calendario al correo y teléfono indicados.
          Conserva este número para futuros seguimientos.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button onClick={descargarPdf} disabled={pdfLoading} variant="premium">
            {pdfLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Descargar PDF de comprobante
          </Button>
          <Button variant="outline" onClick={() => location.reload()}>
            Registrar otro reclamo
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {/* 1. Tipo */}
      <Card className="p-6">
        <h2 className="mb-4 font-display text-lg font-semibold">1. Tipo de registro</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {(['RECLAMO', 'QUEJA'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTipo(t)}
              className={`rounded-lg border p-4 text-left transition ${
                tipo === t ? 'border-amber-600 bg-amber-50' : 'hover:border-slate-400'
              }`}
            >
              <p className="font-semibold">{t === 'RECLAMO' ? 'Reclamo' : 'Queja'}</p>
              <p className="mt-1 text-xs text-slate-600">
                {t === 'RECLAMO'
                  ? 'Disconformidad con un producto o servicio adquirido.'
                  : 'Disconformidad no relacionada con productos o servicios (ej: atención al cliente).'}
              </p>
            </button>
          ))}
        </div>
      </Card>

      {/* 2. Datos consumidor */}
      <Card className="p-6">
        <h2 className="mb-4 font-display text-lg font-semibold">2. Datos del consumidor</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>Nombre completo *</Label>
            <Input name="nombre" required minLength={2} maxLength={200} />
          </div>
          <div>
            <Label>Tipo de documento *</Label>
            <select
              name="docTipo"
              required
              defaultValue="DNI"
              className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm"
            >
              <option>DNI</option>
              <option>RUC</option>
              <option>CE</option>
              <option>PASAPORTE</option>
            </select>
          </div>
          <div>
            <Label>Número de documento *</Label>
            <Input name="docNum" required minLength={6} maxLength={20} />
          </div>
          <div>
            <Label>Celular *</Label>
            <Input name="telefono" type="tel" required minLength={6} maxLength={20} />
          </div>
          <div>
            <Label>Correo electrónico *</Label>
            <Input name="email" type="email" required />
          </div>
          <div className="sm:col-span-2">
            <Label>Dirección *</Label>
            <Input name="direccion" required minLength={5} maxLength={300} />
          </div>
          <div className="sm:col-span-2">
            <Label>Ubigeo (Departamento / Provincia / Distrito)</Label>
            <Input name="ubigeo" placeholder="Opcional. Ej: 150122" maxLength={10} />
          </div>
          <label className="sm:col-span-2 inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="menor"
              checked={esMenor}
              onChange={(e) => setEsMenor(e.target.checked)}
            />
            Soy menor de edad (los datos del apoderado son obligatorios)
          </label>
          {esMenor && (
            <>
              <div>
                <Label>Nombre del apoderado *</Label>
                <Input name="apoderado" required={esMenor} maxLength={200} />
              </div>
              <div>
                <Label>Documento del apoderado</Label>
                <Input name="apoderadoDoc" maxLength={20} />
              </div>
            </>
          )}
        </div>
      </Card>

      {/* 3. Bien */}
      <Card className="p-6">
        <h2 className="mb-4 font-display text-lg font-semibold">3. Identificación del bien</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Tipo *</Label>
            <select
              value={tipoBien}
              onChange={(e) => setTipoBien(e.target.value as Bien)}
              className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm"
            >
              <option value="PRODUCTO">Producto</option>
              <option value="SERVICIO">Servicio</option>
            </select>
          </div>
          <div>
            <Label>Monto reclamado (S/)</Label>
            <Input name="monto" type="number" step="0.01" min={0} />
          </div>
          <div>
            <Label>N° de venta (opcional)</Label>
            <Input name="ventaId" placeholder="UUID si lo tiene" />
          </div>
          <div>
            <Label>N° de pedido web (opcional)</Label>
            <Input name="pedidoId" placeholder="UUID si lo tiene" />
          </div>
        </div>
      </Card>

      {/* 4. Detalle */}
      <Card className="p-6">
        <h2 className="mb-4 font-display text-lg font-semibold">4. Detalle del reclamo</h2>
        <div className="space-y-3">
          <div>
            <Label>Descripción *</Label>
            <textarea
              name="descripcion"
              required
              rows={5}
              minLength={10}
              maxLength={4000}
              className="mt-1 w-full rounded-md border bg-background p-3 text-sm"
              placeholder="Explique con claridad qué ocurrió, cuándo y por qué considera que hubo un problema."
            />
          </div>
          <div>
            <Label>Pedido del consumidor *</Label>
            <textarea
              name="pedido"
              required
              rows={3}
              minLength={5}
              maxLength={2000}
              className="mt-1 w-full rounded-md border bg-background p-3 text-sm"
              placeholder="Indique qué solución espera obtener (devolución, cambio, reparación, etc.)."
            />
          </div>
        </div>
      </Card>

      {/* 5. Términos */}
      <Card className="p-6">
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={acepta}
            onChange={(e) => setAcepta(e.target.checked)}
            className="mt-1"
            required
          />
          <span className="text-slate-700">
            Declaro que la información proporcionada es verdadera. Acepto el tratamiento de mis
            datos personales para la gestión del presente reclamo, conforme a la Ley N° 29733 de
            Protección de Datos Personales. *
          </span>
        </label>
      </Card>

      <Button
        type="submit"
        variant="premium"
        size="lg"
        className="w-full"
        disabled={submitting || !acepta}
      >
        {submitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Enviando…
          </>
        ) : (
          'Enviar reclamo / queja'
        )}
      </Button>
    </form>
  );
}
