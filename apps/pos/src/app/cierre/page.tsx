import { redirect } from 'next/navigation';
import { createClient } from '@happy/db/server';
import { Card, CardContent, CardHeader, CardTitle } from '@happy/ui/card';
import { Badge } from '@happy/ui/badge';
import { CierreCajaForm } from './client';
import { formatPEN, formatDateTime } from '@happy/lib';
import { Banknote, Smartphone, CreditCard, Building2 } from 'lucide-react';

export const metadata = { title: 'Cierre de caja' };
export const dynamic = 'force-dynamic';

export default async function CierrePage() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');

  // Buscar caja default del perfil del usuario
  const { data: perfil } = await sb.from('perfiles').select('caja_default').eq('id', user.id).single();
  const cajaId = perfil?.caja_default;

  if (!cajaId) {
    return (
      <main className="container max-w-2xl px-4 py-10">
        <Card className="p-10 text-center">
          <p className="text-sm text-slate-600">Tu usuario no tiene caja asignada. Contacta a un administrador.</p>
          <a href="/venta" className="mt-4 inline-block text-sm font-medium text-happy-600 hover:underline">← Volver al POS</a>
        </Card>
      </main>
    );
  }

  // Sesión abierta
  const { data: sesion } = await sb.from('cajas_sesiones')
    .select('*, cajas(nombre)').eq('caja_id', cajaId).is('cerrada_en', null).maybeSingle();

  if (!sesion) {
    return (
      <main className="container max-w-2xl px-4 py-10">
        <Card className="p-10 text-center">
          <h1 className="font-display text-xl font-semibold text-corp-900">No hay caja abierta</h1>
          <p className="mt-2 text-sm text-slate-600">La caja se abre automáticamente al registrar la primera venta del día.</p>
          <a href="/venta" className="mt-4 inline-block text-sm font-medium text-happy-600 hover:underline">← Volver al POS</a>
        </Card>
      </main>
    );
  }

  // Sumar pagos de la sesión
  const { data: ventas } = await sb.from('ventas').select('id, total').eq('caja_sesion_id', sesion.id).eq('estado', 'COMPLETADA');
  const ventaIds = (ventas ?? []).map((v) => v.id);
  const totalVentas = (ventas ?? []).reduce((a, v) => a + Number(v.total ?? 0), 0);

  const totales = { EFECTIVO: 0, YAPE: 0, PLIN: 0, TARJETA: 0, TRANSFERENCIA: 0, OTROS: 0 };
  if (ventaIds.length > 0) {
    const { data: pagos } = await sb.from('ventas_pagos').select('metodo, monto').in('venta_id', ventaIds);
    for (const p of (pagos ?? [])) {
      const m = String(p.metodo);
      const monto = Number(p.monto);
      if (m === 'EFECTIVO') totales.EFECTIVO += monto;
      else if (m === 'YAPE') totales.YAPE += monto;
      else if (m === 'PLIN') totales.PLIN += monto;
      else if (m.startsWith('TARJETA')) totales.TARJETA += monto;
      else if (m === 'TRANSFERENCIA') totales.TRANSFERENCIA += monto;
      else totales.OTROS += monto;
    }
  }
  const esperado = Number(sesion.monto_apertura ?? 0) + totales.EFECTIVO;
  const cajaNombre = (sesion as unknown as { cajas?: { nombre: string } }).cajas?.nombre ?? 'Caja';

  return (
    <main className="container max-w-3xl px-4 py-10">
      <div className="mb-6">
        <h1 className="font-display text-3xl font-semibold text-corp-900">Cierre de caja</h1>
        <p className="text-sm text-slate-500">{cajaNombre} · Abierta {formatDateTime(sesion.abierta_en)}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Apertura" value={formatPEN(Number(sesion.monto_apertura ?? 0))} />
        <Stat label="Ventas" value={`${(ventas ?? []).length}`} sub={formatPEN(totalVentas)} />
        <Stat label="Efectivo esperado" value={formatPEN(esperado)} highlight />
      </div>

      <Card className="mt-6">
        <CardHeader><CardTitle className="text-base">Totales por método</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Row icon={<Banknote className="h-4 w-4" />} label="Efectivo" value={totales.EFECTIVO} />
          <Row icon={<Smartphone className="h-4 w-4 text-purple-600" />} label="Yape" value={totales.YAPE} />
          <Row icon={<Smartphone className="h-4 w-4 text-blue-600" />} label="Plin" value={totales.PLIN} />
          <Row icon={<CreditCard className="h-4 w-4" />} label="Tarjeta" value={totales.TARJETA} />
          <Row icon={<Building2 className="h-4 w-4" />} label="Transferencia" value={totales.TRANSFERENCIA} />
          {totales.OTROS > 0 && <Row icon={<Badge variant="secondary" className="text-[9px]">Otros</Badge>} label="Otros métodos" value={totales.OTROS} />}
        </CardContent>
      </Card>

      <CierreCajaForm sesionId={sesion.id} esperado={esperado} />
    </main>
  );
}

function Stat({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <Card className={`p-4 ${highlight ? 'border-happy-400 bg-happy-50/50' : ''}`}>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="font-display text-xl font-semibold text-corp-900">{value}</p>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </Card>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="flex items-center gap-3 border-b py-2 last:border-0">
      <span className="text-slate-400">{icon}</span>
      <span className="flex-1 text-sm">{label}</span>
      <span className="font-mono font-semibold text-corp-900">{formatPEN(value)}</span>
    </div>
  );
}
