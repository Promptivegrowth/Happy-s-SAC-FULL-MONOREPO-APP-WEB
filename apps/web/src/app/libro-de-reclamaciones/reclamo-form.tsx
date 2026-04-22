'use client';

import { useState } from 'react';
import { Button } from '@happy/ui/button';
import { Input } from '@happy/ui/input';
import { Label } from '@happy/ui/label';
import { Card } from '@happy/ui/card';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

export function ReclamoForm() {
  const [tipo, setTipo] = useState<'RECLAMO' | 'QUEJA'>('RECLAMO');
  const [tipoBien, setTipoBien] = useState<'PRODUCTO' | 'SERVICIO'>('PRODUCTO');
  const [submitting, setSubmitting] = useState(false);
  const [exito, setExito] = useState<{ numero: string } | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const fd = new FormData(e.currentTarget);
      const body = {
        tipo,
        tipo_bien: tipoBien,
        cliente_nombre: fd.get('nombre') as string,
        cliente_documento_tipo: fd.get('docTipo') as 'DNI' | 'RUC' | 'CE' | 'PASAPORTE',
        cliente_documento_numero: fd.get('docNum') as string,
        cliente_telefono: fd.get('telefono') as string,
        cliente_email: fd.get('email') as string,
        cliente_direccion: fd.get('direccion') as string,
        cliente_ubigeo: fd.get('ubigeo') as string || undefined,
        es_menor_edad: fd.get('menor') === 'on',
        apoderado_nombre: fd.get('apoderado') as string || undefined,
        monto_reclamado: fd.get('monto') ? Number(fd.get('monto')) : undefined,
        descripcion: fd.get('descripcion') as string,
        pedido_consumidor: fd.get('pedido') as string,
        acepta_terminos: true as const,
      };
      const res = await fetch('/api/reclamos', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? 'Error');
      setExito({ numero: j.numero });
      toast.success(`Reclamo registrado: ${j.numero}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (exito) {
    return (
      <Card className="p-10 text-center">
        <div className="text-5xl">✓</div>
        <h2 className="mt-4 font-display text-2xl font-semibold">Reclamo registrado</h2>
        <p className="mt-2 text-slate-600">Tu número de reclamo es:</p>
        <p className="mt-3 inline-block rounded-md bg-amber-100 px-4 py-2 font-mono text-lg font-semibold text-amber-900">{exito.numero}</p>
        <p className="mt-4 max-w-lg mx-auto text-sm text-slate-500">
          Recibirás respuesta en un plazo máximo de 30 días calendario al correo y teléfono indicados.
          Conserva este número.
        </p>
      </Card>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {/* Tipo */}
      <Card className="p-6">
        <h2 className="mb-4 font-display text-lg font-semibold">1. Tipo de registro</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {(['RECLAMO','QUEJA'] as const).map((t) => (
            <button key={t} type="button" onClick={() => setTipo(t)}
              className={`rounded-lg border p-4 text-left ${tipo === t ? 'border-happy-500 bg-happy-50' : 'hover:border-slate-400'}`}>
              <p className="font-medium">{t === 'RECLAMO' ? '📕 Reclamo' : '📒 Queja'}</p>
              <p className="text-xs text-slate-500">{t === 'RECLAMO' ? 'Disconformidad con producto/servicio' : 'Disconformidad no relacionada con producto'}</p>
            </button>
          ))}
        </div>
      </Card>

      {/* Datos consumidor */}
      <Card className="p-6">
        <h2 className="mb-4 font-display text-lg font-semibold">2. Datos del consumidor</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><Label>Nombre completo *</Label><Input name="nombre" required /></div>
          <div>
            <Label>Tipo de documento *</Label>
            <select name="docTipo" required defaultValue="DNI" className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm">
              <option>DNI</option><option>RUC</option><option>CE</option><option>PASAPORTE</option>
            </select>
          </div>
          <div><Label>Número documento *</Label><Input name="docNum" required /></div>
          <div><Label>Celular *</Label><Input name="telefono" type="tel" required /></div>
          <div><Label>Correo *</Label><Input name="email" type="email" required /></div>
          <div className="sm:col-span-2"><Label>Dirección *</Label><Input name="direccion" required /></div>
          <div className="sm:col-span-2"><Label>Ubigeo (Departamento / Provincia / Distrito)</Label><Input name="ubigeo" placeholder="Ej. Lima / Lima / Miraflores" /></div>
          <label className="sm:col-span-2 inline-flex items-center gap-2 text-sm">
            <input type="checkbox" name="menor" /> Soy menor de edad (apoderado debe firmar)
          </label>
          <div className="sm:col-span-2"><Label>Nombre del apoderado (si aplica)</Label><Input name="apoderado" /></div>
        </div>
      </Card>

      {/* Bien */}
      <Card className="p-6">
        <h2 className="mb-4 font-display text-lg font-semibold">3. Identificación del bien</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Tipo *</Label>
            <select value={tipoBien} onChange={(e) => setTipoBien(e.target.value as 'PRODUCTO' | 'SERVICIO')} className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm">
              <option value="PRODUCTO">Producto</option>
              <option value="SERVICIO">Servicio</option>
            </select>
          </div>
          <div><Label>Monto reclamado (S/)</Label><Input name="monto" type="number" step="0.01" /></div>
        </div>
      </Card>

      {/* Detalle */}
      <Card className="p-6">
        <h2 className="mb-4 font-display text-lg font-semibold">4. Detalle del reclamo</h2>
        <div className="space-y-3">
          <div>
            <Label>Descripción *</Label>
            <textarea name="descripcion" required rows={4} className="mt-1 w-full rounded-md border bg-background p-3 text-sm" />
          </div>
          <div>
            <Label>Pedido del consumidor *</Label>
            <textarea name="pedido" required rows={3} className="mt-1 w-full rounded-md border bg-background p-3 text-sm" placeholder="Qué solución espera obtener" />
          </div>
        </div>
      </Card>

      <Button type="submit" variant="premium" size="lg" className="w-full" disabled={submitting}>
        {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Enviando…</> : 'Enviar reclamo / queja'}
      </Button>
    </form>
  );
}
