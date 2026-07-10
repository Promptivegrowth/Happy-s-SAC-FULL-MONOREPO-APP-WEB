'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@happy/ui/button';
import { Switch } from '@happy/ui/switch';
import { Badge } from '@happy/ui/badge';
import { Input } from '@happy/ui/input';
import { Label } from '@happy/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@happy/ui/dialog';
import { Plus, Pencil, Trash2, Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import {
  crearPasoCatalogo,
  actualizarPasoCatalogo,
  eliminarPasoCatalogo,
  togglePasoCatalogoActivo,
} from '@/server/actions/catalogo-pasos';

type Area = { id: string; codigo: string; nombre: string; activa: boolean };
type Paso = {
  id: string;
  area_id: string;
  nombre: string;
  orden: number;
  activo: boolean;
  usos: number;
};

export function CatalogoClient({ areas, pasos }: { areas: Area[]; pasos: Paso[] }) {
  // Todas las áreas colapsadas al inicio: menos ruido, mejor overview.
  const [colapsadas, setColapsadas] = useState<Set<string>>(() => new Set(areas.map((a) => a.id)));
  const [filtro, setFiltro] = useState('');
  const [modal, setModal] = useState<{ areaId: string; paso?: Paso } | null>(null);

  const pasosPorArea = useMemo(() => {
    const map = new Map<string, Paso[]>();
    for (const p of pasos) {
      const arr = map.get(p.area_id) ?? [];
      arr.push(p);
      map.set(p.area_id, arr);
    }
    return map;
  }, [pasos]);

  const filtroLower = filtro.trim().toLowerCase();
  const areasFiltradas = filtroLower
    ? areas.filter((a) => {
        const arr = pasosPorArea.get(a.id) ?? [];
        return (
          a.nombre.toLowerCase().includes(filtroLower) ||
          a.codigo.toLowerCase().includes(filtroLower) ||
          arr.some((p) => p.nombre.toLowerCase().includes(filtroLower))
        );
      })
    : areas;

  function toggleColapsada(id: string) {
    setColapsadas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function expandirTodo() {
    setColapsadas(new Set());
  }
  function colapsarTodo() {
    setColapsadas(new Set(areas.map((a) => a.id)));
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 border-b bg-slate-50/60 px-4 py-3">
        <Input
          placeholder="Buscar área o paso…"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          className="max-w-xs"
        />
        <div className="flex items-center gap-2 text-xs">
          <button
            type="button"
            onClick={expandirTodo}
            className="text-happy-600 hover:underline"
          >
            Expandir todo
          </button>
          <span className="text-slate-300">·</span>
          <button
            type="button"
            onClick={colapsarTodo}
            className="text-happy-600 hover:underline"
          >
            Colapsar todo
          </button>
        </div>
      </div>

      <div className="divide-y">
        {areasFiltradas.map((a) => {
          const pasosDeArea = pasosPorArea.get(a.id) ?? [];
          const activos = pasosDeArea.filter((p) => p.activo).length;
          const total = pasosDeArea.length;
          const colapsada = colapsadas.has(a.id);
          const pasosMostrar = filtroLower
            ? pasosDeArea.filter((p) => p.nombre.toLowerCase().includes(filtroLower))
            : pasosDeArea;
          const forzarExpandida = Boolean(filtroLower) && pasosMostrar.length > 0;
          const mostrarPasos = forzarExpandida || !colapsada;
          return (
            <section key={a.id}>
              <header
                className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-slate-50"
                onClick={() => toggleColapsada(a.id)}
              >
                {mostrarPasos ? (
                  <ChevronDown className="h-4 w-4 text-slate-400" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-slate-400" />
                )}
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-display text-sm font-semibold text-corp-900">
                      {a.nombre}
                    </h3>
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {a.codigo}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    {total === 0 ? (
                      'Sin pasos cargados aún'
                    ) : (
                      <>
                        {activos} paso{activos === 1 ? '' : 's'} activo{activos === 1 ? '' : 's'}
                        {total !== activos && (
                          <span className="text-slate-400"> · {total - activos} inactivo{total - activos === 1 ? '' : 's'}</span>
                        )}
                      </>
                    )}
                  </p>
                </div>
                <Button
                  variant="premium"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    setModal({ areaId: a.id });
                  }}
                  className="gap-1"
                >
                  <Plus className="h-3.5 w-3.5" /> Paso
                </Button>
              </header>

              {mostrarPasos && (
                pasosMostrar.length === 0 ? (
                  <div className="border-t bg-white px-8 py-3 text-xs text-slate-400">
                    {filtroLower ? 'Ningún paso coincide con la búsqueda en esta área.' : 'Sin pasos cargados.'}
                  </div>
                ) : (
                  <div className="border-t bg-white">
                    {pasosMostrar.map((p) => (
                      <FilaPaso
                        key={p.id}
                        paso={p}
                        onEdit={() => setModal({ areaId: a.id, paso: p })}
                      />
                    ))}
                  </div>
                )
              )}
            </section>
          );
        })}
        {areasFiltradas.length === 0 && (
          <div className="p-6 text-center text-sm text-slate-500">
            Nada coincide con la búsqueda.
          </div>
        )}
      </div>

      {modal && (
        <FormModal
          areaId={modal.areaId}
          initial={modal.paso}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

function FilaPaso({ paso, onEdit }: { paso: Paso; onEdit: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [activo, setActivo] = useState(paso.activo);

  function toggle(v: boolean) {
    setActivo(v);
    start(async () => {
      const r = await togglePasoCatalogoActivo(paso.id, v);
      if (r.ok) {
        toast.success(v ? 'Paso activo' : 'Paso oculto del dropdown');
        router.refresh();
      } else {
        setActivo(!v);
        toast.error(r.error ?? 'Error');
      }
    });
  }

  function borrar() {
    if (paso.usos > 0) {
      toast.error(`En uso por ${paso.usos} operación(es). Desactivalo con el toggle.`);
      return;
    }
    if (!confirm(`¿Eliminar el paso "${paso.nombre}"?`)) return;
    start(async () => {
      const r = await eliminarPasoCatalogo(paso.id);
      if (r.ok) {
        toast.success('Paso eliminado');
        router.refresh();
      } else {
        toast.error(r.error ?? 'No se pudo eliminar');
      }
    });
  }

  const noBorrable = paso.usos > 0;

  return (
    <div className={`flex items-center gap-3 border-b px-8 py-2 text-sm last:border-b-0 ${activo ? '' : 'bg-slate-50/40 text-slate-400'}`}>
      <span className="w-10 font-mono text-[10px] text-slate-400">#{paso.orden}</span>
      <span className="flex-1">{paso.nombre}</span>
      {paso.usos > 0 && (
        <Badge variant="secondary" className="text-[10px]">
          {paso.usos} uso{paso.usos === 1 ? '' : 's'}
        </Badge>
      )}
      <Switch checked={activo} onCheckedChange={toggle} disabled={pending} />
      <Button variant="ghost" size="sm" onClick={onEdit} title="Editar">
        <Pencil className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={borrar}
        disabled={pending || noBorrable}
        title={noBorrable ? 'En uso — desactivá en lugar de eliminar' : 'Eliminar'}
        className={noBorrable ? 'cursor-not-allowed opacity-30' : ''}
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5 text-danger" />}
      </Button>
    </div>
  );
}

function FormModal({
  areaId,
  initial,
  onClose,
}: {
  areaId: string;
  initial?: Paso;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const isEdit = Boolean(initial?.id);
  const [nombre, setNombre] = useState(initial?.nombre ?? '');
  const [orden, setOrden] = useState<string>(initial?.orden.toString() ?? '');
  const [activo, setActivo] = useState(initial?.activo ?? true);

  function submit() {
    if (!nombre.trim()) {
      toast.error('El nombre del paso es obligatorio');
      return;
    }
    const ordenN = orden.trim() ? Number(orden) : 0;
    if (Number.isNaN(ordenN) || ordenN < 0) {
      toast.error('Orden debe ser un número ≥ 0');
      return;
    }
    start(async () => {
      const input = { area_id: areaId, nombre: nombre.trim(), orden: ordenN, activo };
      const r = isEdit
        ? await actualizarPasoCatalogo(initial!.id, input)
        : await crearPasoCatalogo(input);
      if (r.ok) {
        toast.success(isEdit ? 'Paso actualizado' : 'Paso creado');
        onClose();
        router.refresh();
      } else {
        toast.error(r.error ?? 'Error');
      }
    });
  }

  return (
    <Dialog open={true} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar paso operativo' : 'Nuevo paso operativo'}</DialogTitle>
          <DialogDescription>
            El paso alimenta el dropdown &quot;Paso operativo&quot; del editor de recetas para el área seleccionada.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="nombre">Nombre *</Label>
            <Input
              id="nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: DESEMBOLSADO DE PAQUETES"
              maxLength={120}
              disabled={pending}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="orden">Orden</Label>
            <Input
              id="orden"
              type="number"
              min="0"
              step="10"
              value={orden}
              onChange={(e) => setOrden(e.target.value)}
              placeholder="Ej: 40"
              disabled={pending}
            />
            <p className="text-[10px] text-slate-500">
              Los pasos se ordenan de menor a mayor en el dropdown. Múltiplos de 10 son cómodos para insertar en el medio después.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-md border bg-slate-50 p-3 text-sm">
          <Switch checked={activo} onCheckedChange={setActivo} />
          <span className={activo ? 'text-emerald-700' : 'text-slate-500'}>
            {activo ? 'Activo (aparece en el dropdown)' : 'Inactivo (oculto del dropdown)'}
          </span>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={pending}>Cancelar</Button>
          <Button variant="premium" onClick={submit} disabled={pending}>
            {pending ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Guardando…</>
            ) : isEdit ? (
              'Guardar cambios'
            ) : (
              'Crear paso'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
