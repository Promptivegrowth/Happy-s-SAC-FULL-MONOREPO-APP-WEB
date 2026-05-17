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
import { crearUnidad } from '@/server/actions/unidades-medida';

const TIPOS = ['LONGITUD', 'PESO', 'VOLUMEN', 'UNIDAD', 'CONJUNTO'] as const;

export type UnidadCreada = { id: string; codigo: string; nombre: string };

/** Slugifica un nombre a código corto de unidad: minúsculas, sin acentos,
 *  sin espacios ni caracteres especiales. Ej: "Rollo 50m" → "rollo50m". */
function slugifyCodigoUnidad(nombre: string): string {
  return nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // saca acentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '') // solo letras y números
    .slice(0, 20);
}

/**
 * Modal mínimo para crear una unidad de medida sin salir del form actual.
 * Solo expone los campos esenciales (código, nombre, símbolo, tipo). Para
 * configurar SUNAT, factor o unidad base, mandamos al usuario al CRUD
 * completo en /configuracion/unidades.
 *
 * Comportamiento del código (Obs cliente): se autocompleta del nombre
 * mientras se tipea. Si el usuario lo edita manualmente, deja de pisarse.
 */
export function NuevaUnidadInlineModal({
  open,
  onOpenChange,
  defaultTipo = 'UNIDAD',
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultTipo?: (typeof TIPOS)[number];
  onCreated: (unidad: UnidadCreada) => void;
}) {
  const [pending, start] = useTransition();
  const [codigo, setCodigo] = useState('');
  const [nombre, setNombre] = useState('');
  const [simbolo, setSimbolo] = useState('');
  const [tipo, setTipo] = useState<(typeof TIPOS)[number]>(defaultTipo);
  // Si el usuario edita el código a mano, paramos de auto-completarlo.
  const codigoEditadoManual = useRef(false);

  function reset() {
    setCodigo('');
    setNombre('');
    setSimbolo('');
    setTipo(defaultTipo);
    codigoEditadoManual.current = false;
  }

  function onNombreChange(v: string) {
    setNombre(v);
    if (!codigoEditadoManual.current) {
      setCodigo(slugifyCodigoUnidad(v));
    }
  }

  function onCodigoChange(v: string) {
    // Forzar lowercase + alfanumérico mientras tipea (consistente con el schema)
    const limpio = v.toLowerCase().replace(/[^a-z0-9_-]/g, '');
    setCodigo(limpio);
    codigoEditadoManual.current = true;
  }

  function handleOpenChange(v: boolean) {
    if (!v) reset();
    onOpenChange(v);
  }

  function submit() {
    if (!codigo.trim() || !nombre.trim()) {
      toast.error('Código y nombre son obligatorios');
      return;
    }
    start(async () => {
      const r = await crearUnidad({
        codigo: codigo.trim().toLowerCase(),
        nombre: nombre.trim(),
        simbolo: simbolo.trim(),
        tipo,
        sunat_codigo: '',
        factor_conversion: '',
        unidad_base: '',
        activo: true,
      });
      if (r.ok && r.data) {
        toast.success(`Unidad "${r.data.codigo}" creada`);
        onCreated(r.data);
        reset();
        onOpenChange(false);
      } else {
        toast.error(r.error ?? 'No se pudo crear la unidad');
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nueva unidad de medida</DialogTitle>
          <DialogDescription>
            Solo lo esencial. Para SUNAT, factor de conversión o unidad base, gestioná desde{' '}
            <a
              href="/configuracion/unidades"
              target="_blank"
              className="font-medium text-happy-600 hover:underline"
            >
              Configuración → Unidades
            </a>.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          {/* Orden invertido: primero NOMBRE para que el código se autocomplete tipeando. */}
          <div className="space-y-1.5">
            <Label htmlFor="u-nombre">Nombre *</Label>
            <Input
              id="u-nombre"
              value={nombre}
              onChange={(e) => onNombreChange(e.target.value)}
              placeholder="Ej. Kilogramo, Rollo 50m…"
              maxLength={60}
              disabled={pending}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="u-codigo">
              Código *{' '}
              {!codigoEditadoManual.current && nombre.length > 0 && (
                <span className="text-[10px] font-normal text-slate-400">(auto, editable)</span>
              )}
            </Label>
            <Input
              id="u-codigo"
              value={codigo}
              onChange={(e) => onCodigoChange(e.target.value)}
              placeholder="se autocompleta del nombre"
              maxLength={20}
              disabled={pending}
              className="lowercase"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="u-simbolo">Símbolo</Label>
            <Input
              id="u-simbolo"
              value={simbolo}
              onChange={(e) => setSimbolo(e.target.value)}
              placeholder="kg"
              maxLength={10}
              disabled={pending}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="u-tipo">Tipo</Label>
            <select
              id="u-tipo"
              value={tipo}
              onChange={(e) => setTipo(e.target.value as (typeof TIPOS)[number])}
              disabled={pending}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {TIPOS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
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
