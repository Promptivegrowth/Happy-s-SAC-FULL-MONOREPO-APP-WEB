import { Card, CardContent, CardHeader, CardTitle } from '@happy/ui/card';

export const metadata = { title: 'Cierre de caja' };

export default function CierrePage() {
  return (
    <div className="container max-w-2xl px-4 py-10">
      <Card>
        <CardHeader><CardTitle className="font-display">Cierre de caja</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm text-slate-600">
          <p>El cierre de caja consolida todas las ventas del turno por método de pago y genera la diferencia con el efectivo contado.</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Total efectivo, Yape, Plin, tarjetas, transferencias</li>
            <li>Movimientos de caja chica (egresos/ingresos)</li>
            <li>Ingreso del monto físico contado</li>
            <li>Cálculo automático de diferencia</li>
            <li>PDF de cuadre imprimible</li>
          </ul>
          <p className="rounded-lg border bg-amber-50 p-3 text-xs text-amber-800">
            ⚠️ Implementación pendiente — el endpoint server action consultará <code>cajas_sesiones</code>, sumará <code>ventas_pagos</code> de la sesión y registrará el cierre.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
