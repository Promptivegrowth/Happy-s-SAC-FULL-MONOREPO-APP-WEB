'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient as createBrowserClient } from '@happy/db/browser';
import { Button } from '@happy/ui/button';
import { Switch } from '@happy/ui/switch';
import { Badge } from '@happy/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@happy/ui/dialog';
import { Input } from '@happy/ui/input';
import { Label } from '@happy/ui/label';
import { Plus, Pencil, Trash2, Loader2, History } from 'lucide-react';
import { toast } from 'sonner';
import {
  crearArea,
  actualizarArea,
  eliminarArea,
  toggleAreaActiva,
} from '@/server/actions/areas-produccion';

type Area = {
  id: string;
  codigo: string;
  nombre: string;
  valor_minuto: number | null;
  activa: boolean;
};

function FormModal({
  initial,
  open,
  onOpenChange,
}: {
  initial?: Area;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const isEdit = Boolean(initial?.id);
  const [codigo, setCodigo] = useState(initial?.codigo ?? '');
  const [nombre, setNombre] = useState(initial?.nombre ?? '');
  const [valorMin, setValorMin] = useState(initial?.valor_minuto?.toString() ?? '');
  const [activa, setActiva] = useState(initial?.activa ?? true);

  function submit() {
    if (!codigo.trim() || !nombre.trim()) {
      toast.error('Código y nombre son obligatorios');
      return;
    }
    const valorN = valorMin.trim() ? Number(valorMin) : NaN;
    start(async () => {
      const input = {
        codigo: codigo.trim().toUpperCase(),
        nombre: nombre.trim(),
        valor_minuto: Number.isNaN(valorN) ? NaN : valorN,
        activa,
      };
      const r = isEdit ? await actualizarArea(initial!.id, input) : await crearArea(input);
      if (r.ok) {
        toast.success(isEdit ? 'Área actualizada' : 'Área creada');
        onOpenChange(false);
        router.refresh();
      } else {
        toast.error(r.error ?? 'Error');
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar área' : 'Nueva área de producción'}</DialogTitle>
          <DialogDescription>
            Las áreas se asignan a las operaciones de receta para calcular el costo MO. El código debe ser único.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="codigo">Código *</Label>
            <Input
              id="codigo"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.toUpperCase())}
              placeholder="CORTE, COSTURA, BORDADO…"
              maxLength={20}
              disabled={pending}
              className="font-mono uppercase"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nombre">Nombre *</Label>
            <Input
              id="nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Corte"
              maxLength={60}
              disabled={pending}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="valor">Valor por minuto (S/)</Label>
            <Input
              id="valor"
              type="number"
              step="0.001"
              min="0"
              value={valorMin}
              onChange={(e) => setValorMin(e.target.value)}
              placeholder="0.211"
              disabled={pending}
            />
            <p className="text-[10px] text-slate-500">
              Lo que cuesta 1 minuto de trabajo en esta área. Se multiplica por el tiempo estándar
              de cada operación para calcular el costo MO.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-md border bg-slate-50 p-3 text-sm">
          <Switch checked={activa} onCheckedChange={setActiva} />
          <span className={activa ? 'text-emerald-700' : 'text-slate-500'}>
            {activa ? 'Activa (visible en selectores)' : 'Inactiva (oculta del selector)'}
          </span>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button variant="premium" onClick={submit} disabled={pending}>
            {pending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Guardando…
              </>
            ) : isEdit ? (
              'Guardar cambios'
            ) : (
              'Crear área'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="premium" className="gap-2" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> Nueva área
      </Button>
      {open && <FormModal open={open} onOpenChange={setOpen} />}
    </>
  );
}

function EditButton({ area }: { area: Area }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} title="Editar">
        <Pencil className="h-3.5 w-3.5" />
      </Button>
      {open && <FormModal initial={area} open={open} onOpenChange={setOpen} />}
    </>
  );
}

function DeleteButton({ areaId, usos }: { areaId: string; usos: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const deshabilitado = usos > 0;

  function onClick() {
    if (deshabilitado) {
      toast.error(`No se puede eliminar: ${usos} proceso(s) la usan. Desactivala con el toggle.`);
      return;
    }
    if (!confirm('¿Eliminar esta área? No tiene procesos asociados.')) return;
    start(async () => {
      const r = await eliminarArea(areaId);
      if (r.ok) {
        toast.success('Área eliminada');
        router.refresh();
      } else {
        toast.error(r.error ?? 'No se pudo eliminar');
      }
    });
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      disabled={pending || deshabilitado}
      title={deshabilitado ? 'En uso por procesos — desactivá en lugar de eliminar' : 'Eliminar (sin uso)'}
      className={deshabilitado ? 'cursor-not-allowed opacity-30' : ''}
    >
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5 text-danger" />}
    </Button>
  );
}

function ToggleActiva({ areaId, activa }: { areaId: string; activa: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [val, setVal] = useState(activa);

  function onChange(v: boolean) {
    setVal(v);
    start(async () => {
      const r = await toggleAreaActiva(areaId, v);
      if (r.ok) {
        toast.success(v ? 'Área activa' : 'Área oculta del selector');
        router.refresh();
      } else {
        toast.error(r.error ?? 'Error');
        setVal(!v);
      }
    });
  }

  return <Switch checked={val} onCheckedChange={onChange} disabled={pending} />;
}

/**
 * Botón "Histórico": muestra cronología de cambios del valor por minuto.
 * Carga on-demand al abrir el modal (no impacta la página principal).
 */
type HistorialRow = {
  id: string;
  valor_minuto: number;
  notas: string | null;
  created_at: string;
};

function HistoricoButton({ areaId, areaNombre }: { areaId: string; areaNombre: string }) {
  const [open, setOpen] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [filas, setFilas] = useState<HistorialRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelado = false;
    setCargando(true);
    setError(null);
    (async () => {
      const sb = createBrowserClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sbAny = sb as unknown as { from: (t: string) => any };
      const { data, error: err } = await sbAny
        .from('areas_valor_minuto_historial')
        .select('id, valor_minuto, notas, created_at')
        .eq('area_id', areaId)
        .order('created_at', { ascending: false });
      if (cancelado) return;
      if (err) {
        setError(err.message);
        setFilas([]);
      } else {
        setFilas((data ?? []) as HistorialRow[]);
      }
      setCargando(false);
    })();
    return () => { cancelado = true; };
  }, [open, areaId]);

  // Calcular delta vs versión previa para resaltar subidas/bajadas
  const filasConDelta = filas.map((f, i) => {
    const prev = filas[i + 1]; // la siguiente en orden desc = la anterior cronológica
    const delta = prev ? Number(f.valor_minuto) - Number(prev.valor_minuto) : 0;
    return { ...f, delta };
  });

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        title="Ver histórico de valor por minuto"
      >
        <History className="h-3.5 w-3.5" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Histórico de valor por minuto — {areaNombre}</DialogTitle>
            <DialogDescription>
              Cada vez que se actualiza el valor del área, se guarda automáticamente una entrada acá.
              El primero (más arriba) es el valor vigente hoy.
            </DialogDescription>
          </DialogHeader>

          {cargando ? (
            <div className="flex items-center justify-center py-8 text-slate-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cargando…
            </div>
          ) : error ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              No se pudo cargar el histórico: {error}
            </div>
          ) : filasConDelta.length === 0 ? (
            <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
              Aún no hay cambios registrados.
            </div>
          ) : (
            <div className="max-h-96 overflow-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 text-xs text-slate-600">
                  <tr>
                    <th className="px-3 py-2 text-left">Fecha</th>
                    <th className="px-3 py-2 text-right">Valor / min</th>
                    <th className="px-3 py-2 text-right">Δ vs anterior</th>
                    <th className="px-3 py-2 text-left">Notas</th>
                  </tr>
                </thead>
                <tbody>
                  {filasConDelta.map((f, idx) => (
                    <tr key={f.id} className={`border-t ${idx === 0 ? 'bg-emerald-50/40' : ''}`}>
                      <td className="px-3 py-2 text-xs text-slate-600">
                        {new Date(f.created_at).toLocaleString('es-PE', {
                          year: 'numeric', month: '2-digit', day: '2-digit',
                          hour: '2-digit', minute: '2-digit',
                        })}
                        {idx === 0 && <Badge variant="success" className="ml-2 text-[9px]">Vigente</Badge>}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-semibold text-emerald-700">
                        S/ {Number(f.valor_minuto).toFixed(3)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs">
                        {f.delta === 0 ? (
                          <span className="text-slate-400">—</span>
                        ) : f.delta > 0 ? (
                          <span className="text-red-600">+S/ {f.delta.toFixed(3)}</span>
                        ) : (
                          <span className="text-emerald-600">−S/ {Math.abs(f.delta).toFixed(3)}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-500">{f.notas ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export const AreasTable = {
  NewButton,
  EditButton,
  DeleteButton,
  ToggleActiva,
  HistoricoButton,
};
