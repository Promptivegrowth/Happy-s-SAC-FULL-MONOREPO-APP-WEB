'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@happy/ui/button';
import { Switch } from '@happy/ui/switch';
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
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  crearUnidad,
  actualizarUnidad,
  eliminarUnidad,
  toggleUnidadActiva,
} from '@/server/actions/unidades-medida';

const TIPOS = ['LONGITUD', 'PESO', 'VOLUMEN', 'UNIDAD', 'CONJUNTO'] as const;

type Unidad = {
  id: string;
  codigo: string;
  nombre: string;
  simbolo: string | null;
  tipo: string | null;
  sunat_codigo: string | null;
  factor_conversion: number | null;
  unidad_base: string | null;
  activo: boolean;
};

function FormModal({
  initial,
  open,
  onOpenChange,
}: {
  initial?: Unidad;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const isEdit = Boolean(initial?.id);
  const [codigo, setCodigo] = useState(initial?.codigo ?? '');
  const [nombre, setNombre] = useState(initial?.nombre ?? '');
  const [simbolo, setSimbolo] = useState(initial?.simbolo ?? '');
  const [tipo, setTipo] = useState<typeof TIPOS[number]>((initial?.tipo as typeof TIPOS[number]) ?? 'UNIDAD');
  const [sunatCodigo, setSunatCodigo] = useState(initial?.sunat_codigo ?? '');
  const [factor, setFactor] = useState(initial?.factor_conversion?.toString() ?? '');
  const [unidadBase, setUnidadBase] = useState(initial?.unidad_base ?? '');
  const [activo, setActivo] = useState(initial?.activo ?? true);

  function submit() {
    if (!codigo.trim() || !nombre.trim()) {
      toast.error('Código y nombre son obligatorios');
      return;
    }
    const factorN = factor.trim() ? Number(factor) : NaN;
    start(async () => {
      const input = {
        codigo: codigo.trim().toLowerCase(),
        nombre: nombre.trim(),
        simbolo: simbolo.trim(),
        tipo,
        sunat_codigo: sunatCodigo.trim(),
        factor_conversion: Number.isNaN(factorN) ? '' as const : factorN,
        unidad_base: unidadBase.trim(),
        activo,
      };
      const r = isEdit
        ? await actualizarUnidad(initial!.id, input)
        : await crearUnidad(input);
      if (r.ok) {
        toast.success(isEdit ? 'Unidad actualizada' : 'Unidad creada');
        onOpenChange(false);
        router.refresh();
      } else {
        toast.error(r.error ?? 'Error');
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar unidad' : 'Nueva unidad de medida'}</DialogTitle>
          <DialogDescription>
            Las unidades se usan en materiales (compra y consumo). El código debe ser único y en minúsculas.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="codigo">Código *</Label>
            <Input
              id="codigo"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              placeholder="kg, m, cm, rollo50…"
              maxLength={20}
              disabled={pending}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nombre">Nombre *</Label>
            <Input
              id="nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Kilogramo"
              maxLength={60}
              disabled={pending}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="simbolo">Símbolo</Label>
            <Input
              id="simbolo"
              value={simbolo}
              onChange={(e) => setSimbolo(e.target.value)}
              placeholder="kg"
              maxLength={10}
              disabled={pending}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tipo">Tipo</Label>
            <select
              id="tipo"
              value={tipo}
              onChange={(e) => setTipo(e.target.value as typeof TIPOS[number])}
              disabled={pending}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {TIPOS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sunat">Código SUNAT</Label>
            <Input
              id="sunat"
              value={sunatCodigo}
              onChange={(e) => setSunatCodigo(e.target.value)}
              placeholder="MTR, KGM, NIU…"
              maxLength={10}
              disabled={pending}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="factor">Factor de conversión</Label>
            <Input
              id="factor"
              type="number"
              step="0.001"
              value={factor}
              onChange={(e) => setFactor(e.target.value)}
              placeholder="50 (rollo de 50m)"
              disabled={pending}
            />
          </div>
          <div className="space-y-1.5 col-span-2">
            <Label htmlFor="base">Unidad base</Label>
            <Input
              id="base"
              value={unidadBase}
              onChange={(e) => setUnidadBase(e.target.value)}
              placeholder="m (si rollo se descompone en metros)"
              maxLength={20}
              disabled={pending}
            />
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-md border bg-slate-50 p-3 text-sm">
          <Switch checked={activo} onCheckedChange={setActivo} />
          <span className={activo ? 'text-emerald-700' : 'text-slate-500'}>
            {activo ? 'Activa (visible en selectores)' : 'Inactiva (oculta en selectores)'}
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
              'Crear unidad'
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
        <Plus className="h-4 w-4" /> Nueva unidad
      </Button>
      {open && <FormModal open={open} onOpenChange={setOpen} />}
    </>
  );
}

function EditButton({ unidad }: { unidad: Unidad }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} title="Editar">
        <Pencil className="h-3.5 w-3.5" />
      </Button>
      {open && <FormModal initial={unidad} open={open} onOpenChange={setOpen} />}
    </>
  );
}

function DeleteButton({ unidadId, usos }: { unidadId: string; usos: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const deshabilitado = usos > 0;

  function onClick() {
    if (deshabilitado) {
      toast.error(`No se puede eliminar: la usan ${usos} material(es). Desactivala con el toggle.`);
      return;
    }
    if (!confirm('¿Eliminar esta unidad? No tiene materiales asociados, así que es seguro.')) return;
    start(async () => {
      const r = await eliminarUnidad(unidadId);
      if (r.ok) {
        toast.success('Unidad eliminada');
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
      title={deshabilitado ? 'En uso por materiales — desactivá en lugar de eliminar' : 'Eliminar (sin uso)'}
      className={deshabilitado ? 'cursor-not-allowed opacity-30' : ''}
    >
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5 text-danger" />}
    </Button>
  );
}

function ToggleActivo({ unidadId, activo }: { unidadId: string; activo: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [val, setVal] = useState(activo);

  function onChange(v: boolean) {
    setVal(v);
    start(async () => {
      const r = await toggleUnidadActiva(unidadId, v);
      if (r.ok) {
        toast.success(v ? 'Unidad activa' : 'Unidad oculta del selector');
        router.refresh();
      } else {
        toast.error(r.error ?? 'Error');
        setVal(!v); // revertir
      }
    });
  }

  return <Switch checked={val} onCheckedChange={onChange} disabled={pending} />;
}

export const UnidadesTable = {
  NewButton,
  EditButton,
  DeleteButton,
  ToggleActivo,
};
