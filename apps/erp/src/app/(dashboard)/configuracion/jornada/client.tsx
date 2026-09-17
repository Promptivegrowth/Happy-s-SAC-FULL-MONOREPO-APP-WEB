'use client';

/**
 * Editor de la jornada de planta.
 *
 * Lo que se edita acá decide dos cosas que antes estaban escritas en el código:
 *
 *   · cuánto se le descuenta a un registro de avance que cruza el almuerzo —de
 *     12:32 a 16:32 hay cuatro horas de reloj pero se trabajaron tres—, y
 *   · cuántos minutos tiene disponibles un área en el mes, que es el divisor
 *     del costo por minuto.
 *
 * Por eso la hora del refrigerio importa tanto como su duración: con los
 * minutos solos no se puede saber si un turno pasó por el almuerzo o no.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@happy/ui/card';
import { Button } from '@happy/ui/button';
import { Input } from '@happy/ui/input';
import { Save, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { guardarJornada, type DiaJornada } from '@/server/actions/jornada';

const NOMBRE: Record<string, string> = {
  LUN: 'Lunes', MAR: 'Martes', MIE: 'Miércoles', JUE: 'Jueves',
  VIE: 'Viernes', SAB: 'Sábado', DOM: 'Domingo',
};
const ORDEN = ['LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB', 'DOM'] as const;

/** Minutos efectivos de un día, ya sin el refrigerio. */
function efectivos(d: DiaJornada): number {
  const min = (h: string) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(h);
    return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
  };
  const total = min(d.fin) - min(d.inicio);
  if (!Number.isFinite(total) || total <= 0) return 0;
  return Math.max(0, total - (d.refrigerio_min || 0));
}

function horas(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export function JornadaClient({ inicial }: { inicial: DiaJornada[] }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [dias, setDias] = useState<DiaJornada[]>(inicial);

  function cambiar(dia: string, campo: keyof DiaJornada, valor: string | boolean | number) {
    setDias((prev) => prev.map((d) => (d.dia === dia ? { ...d, [campo]: valor } : d)));
  }

  function guardar() {
    iniciar(async () => {
      const r = await guardarJornada({ dias });
      if (!r.ok) { toast.error(r.error); return; }
      toast.success('Jornada guardada', {
        description: 'Los nuevos registros de avance descuentan el refrigerio con este horario.',
      });
      router.refresh();
    });
  }

  const semana = dias.filter((d) => d.laborable).reduce((s, d) => s + efectivos(d), 0);

  return (
    <div className="space-y-4">
      <Card className="border-corp-200 bg-corp-50/50">
        <CardContent className="py-4 text-sm text-slate-700">
          <p className="mb-1 font-semibold text-corp-900">Dónde se usa este horario</p>
          <ul className="list-disc space-y-1 pl-5 text-xs">
            <li>
              Al registrar avance de producción con hora de inicio y fin, el sistema
              <b> descuenta el refrigerio</b> si el turno lo cruza. Un trabajo de 12:32 a 16:32
              se cobra como 3 horas, no 4.
            </li>
            <li>
              Los <b>minutos disponibles del mes</b> de cada área, que son el divisor del costo
              por minuto.
            </li>
          </ul>
          <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
            La <b>hora</b> del refrigerio importa tanto como su duración: con los minutos solos no
            se puede saber si un turno pasó por el almuerzo. Un día con 0 minutos de refrigerio
            —como el sábado corto— no descuenta nada.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left">Día</th>
                <th className="px-3 py-2 text-left">Entrada</th>
                <th className="px-3 py-2 text-left">Salida</th>
                <th className="px-3 py-2 text-left">Refrigerio desde</th>
                <th className="px-3 py-2 text-left">Minutos</th>
                <th className="px-3 py-2 text-right">Efectivas</th>
              </tr>
            </thead>
            <tbody>
              {ORDEN.map((clave) => {
                const d = dias.find((x) => x.dia === clave);
                if (!d) return null;
                return (
                  <tr key={clave} className={`border-b last:border-0 ${d.laborable ? '' : 'bg-slate-50/60'}`}>
                    <td className="px-3 py-2">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={d.laborable}
                          onChange={(e) => cambiar(clave, 'laborable', e.target.checked)}
                          disabled={pendiente}
                          className="h-4 w-4"
                        />
                        <span className={d.laborable ? 'font-medium text-corp-900' : 'text-slate-400'}>
                          {NOMBRE[clave]}
                        </span>
                      </label>
                    </td>
                    <td className="px-3 py-2">
                      <Input type="time" value={d.inicio} disabled={!d.laborable || pendiente}
                        onChange={(e) => cambiar(clave, 'inicio', e.target.value)} className="h-8 w-28 text-xs" />
                    </td>
                    <td className="px-3 py-2">
                      <Input type="time" value={d.fin} disabled={!d.laborable || pendiente}
                        onChange={(e) => cambiar(clave, 'fin', e.target.value)} className="h-8 w-28 text-xs" />
                    </td>
                    <td className="px-3 py-2">
                      <Input type="time" value={d.refrigerio_inicio}
                        disabled={!d.laborable || pendiente || d.refrigerio_min === 0}
                        onChange={(e) => cambiar(clave, 'refrigerio_inicio', e.target.value)}
                        className="h-8 w-28 text-xs" />
                    </td>
                    <td className="px-3 py-2">
                      <Input type="number" min={0} step={5} value={d.refrigerio_min}
                        disabled={!d.laborable || pendiente}
                        onChange={(e) => cambiar(clave, 'refrigerio_min', Number(e.target.value))}
                        className="h-8 w-24 text-xs" />
                    </td>
                    <td className="px-3 py-2 text-right text-xs text-slate-600">
                      {d.laborable ? horas(efectivos(d)) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">
          Semana laboral: <b className="text-corp-900">{horas(semana)}</b> efectivas por operario.
        </p>
        <Button variant="premium" onClick={guardar} disabled={pendiente}>
          {pendiente ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Guardar jornada
        </Button>
      </div>
    </div>
  );
}
