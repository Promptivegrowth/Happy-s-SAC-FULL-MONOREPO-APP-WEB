'use client';

import { useRef, useState, useTransition } from 'react';
import { Button } from '@happy/ui/button';
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
import { Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { crearArea } from '@/server/actions/areas-produccion';

export type AreaCreada = {
  id: string;
  codigo: string;
  nombre: string;
  valor_minuto: number | null;
};

/** Slugifica un nombre a código corto de área: MAYÚSCULAS, sin acentos,
 *  reemplaza espacios por guion bajo, solo A-Z y números.
 *  Ej: "Acabado Especial" → "ACABADO_ESPECIAL". */
function slugifyCodigoArea(nombre: string): string {
  return nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 20);
}

/**
 * Modal mínimo para crear un área de producción sin salir del form actual.
 * Solo expone los campos esenciales (código, nombre, valor por minuto). Para
 * gestionar histórico, eliminar, etc., el usuario va al CRUD completo en
 * /configuracion/areas.
 *
 * El código se autocompleta del nombre mientras se tipea. Si el usuario lo
 * edita manualmente, deja de pisarse.
 */
export function NuevaAreaInlineModal({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (area: AreaCreada) => void;
}) {
  const [pending, start] = useTransition();
  const [codigo, setCodigo] = useState('');
  const [nombre, setNombre] = useState('');
  const [valorMin, setValorMin] = useState('');
  const codigoEditadoManual = useRef(false);

  function reset() {
    setCodigo('');
    setNombre('');
    setValorMin('');
    codigoEditadoManual.current = false;
  }

  function handleOpenChange(v: boolean) {
    if (!v) reset();
    onOpenChange(v);
  }

  function onNombreChange(v: string) {
    setNombre(v);
    if (!codigoEditadoManual.current) {
      setCodigo(slugifyCodigoArea(v));
    }
  }

  function onCodigoChange(v: string) {
    const limpio = v.toUpperCase().replace(/[^A-Z0-9_]/g, '');
    setCodigo(limpio);
    codigoEditadoManual.current = true;
  }

  function submit() {
    if (!codigo.trim() || !nombre.trim()) {
      toast.error('Código y nombre son obligatorios');
      return;
    }
    const valorN = valorMin.trim() ? Number(valorMin) : NaN;
    start(async () => {
      const r = await crearArea({
        codigo: codigo.trim().toUpperCase(),
        nombre: nombre.trim(),
        valor_minuto: Number.isNaN(valorN) ? NaN : valorN,
        activa: true,
      });
      if (r.ok && r.data) {
        toast.success(`Área "${r.data.nombre}" creada`);
        onCreated(r.data);
        reset();
        onOpenChange(false);
      } else {
        toast.error(r.error ?? 'No se pudo crear el área');
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nueva área de producción</DialogTitle>
          <DialogDescription>
            Solo lo esencial. Para gestión completa (histórico, eliminar, desactivar) andá a{' '}
            <a
              href="/configuracion/areas"
              target="_blank"
              className="font-medium text-happy-600 hover:underline"
            >
              Configuración → Áreas
            </a>.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="a-nombre">Nombre *</Label>
            <Input
              id="a-nombre"
              value={nombre}
              onChange={(e) => onNombreChange(e.target.value)}
              placeholder="Ej. Acabado especial, Tintorería…"
              maxLength={60}
              disabled={pending}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="a-codigo">
              Código *{' '}
              {!codigoEditadoManual.current && nombre.length > 0 && (
                <span className="text-[10px] font-normal text-slate-400">(auto, editable)</span>
              )}
            </Label>
            <Input
              id="a-codigo"
              value={codigo}
              onChange={(e) => onCodigoChange(e.target.value)}
              placeholder="se autocompleta del nombre"
              maxLength={20}
              disabled={pending}
              className="font-mono uppercase"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="a-valor">
            Valor por minuto (S/) <span className="text-[10px] font-normal text-slate-400">(opcional, podés cargarlo después)</span>
          </Label>
          <Input
            id="a-valor"
            type="number"
            step="0.001"
            min="0"
            value={valorMin}
            onChange={(e) => setValorMin(e.target.value)}
            placeholder="0.211"
            disabled={pending}
          />
          <p className="text-[10px] text-slate-500">
            Lo que cuesta 1 minuto de trabajo en esta área. Se usa para calcular el costo MO de cada operación.
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => handleOpenChange(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button variant="premium" onClick={submit} disabled={pending}>
            {pending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Creando…
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" /> Crear y seleccionar
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
