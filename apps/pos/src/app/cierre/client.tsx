'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@happy/ui/card';
import { Input } from '@happy/ui/input';
import { Label } from '@happy/ui/label';
import { Button } from '@happy/ui/button';
import { Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { formatPEN } from '@happy/lib';
import { cerrarCaja } from '@/server/actions/venta';

export function CierreCajaForm({ sesionId, esperado }: { sesionId: string; esperado: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [contado, setContado] = useState<string>(esperado.toFixed(2));

  const contadoNum = Number(contado);
  const diferencia = isNaN(contadoNum) ? 0 : contadoNum - esperado;

  function submit() {
    if (isNaN(contadoNum) || contadoNum < 0) return toast.error('Ingresa un monto válido');
    if (Math.abs(diferencia) > 5 && !confirm(`Diferencia ${formatPEN(diferencia)}. ¿Confirmar cierre?`)) return;

    start(async () => {
      const r = await cerrarCaja(sesionId, contadoNum);
      if (r.ok) {
        toast.success('Caja cerrada correctamente');
        router.push('/venta');
      } else {
        toast.error(r.error ?? 'Error al cerrar');
      }
    });
  }

  const tone = diferencia > 0 ? 'positive' : diferencia < 0 ? 'negative' : 'zero';

  return (
    <Card className="mt-6 p-6">
      <h2 className="font-display text-base font-semibold text-corp-900">Conteo físico de efectivo</h2>
      <p className="mt-1 text-sm text-slate-500">Cuenta el efectivo en la caja e ingrésalo aquí.</p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <Label>Efectivo contado (S/)</Label>
          <Input
            type="number"
            step="0.01"
            min={0}
            value={contado}
            onChange={(e) => setContado(e.target.value)}
            className="mt-1 h-12 text-2xl font-display"
            autoFocus
          />
        </div>
        <div>
          <Label>Diferencia</Label>
          <div className={`mt-1 flex h-12 items-center rounded-md border px-3 font-display text-2xl font-semibold ${
            tone === 'positive' ? 'border-emerald-300 bg-emerald-50 text-emerald-700' :
            tone === 'negative' ? 'border-red-300 bg-red-50 text-red-700' :
            'border-slate-200 bg-slate-50 text-slate-700'
          }`}>
            {diferencia > 0 ? '+' : ''}{formatPEN(diferencia)}
          </div>
          {Math.abs(diferencia) > 0 && (
            <p className="mt-1 text-xs text-slate-500 flex items-center gap-1">
              {tone === 'positive' ? '✓ Sobrante' : <><AlertTriangle className="h-3 w-3 text-amber-500" /> Faltante</>}
            </p>
          )}
        </div>
      </div>

      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={() => router.push('/venta')} disabled={pending}>Cancelar</Button>
        <Button variant="premium" size="lg" onClick={submit} disabled={pending || isNaN(contadoNum)}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          Confirmar cierre de caja
        </Button>
      </div>
    </Card>
  );
}
