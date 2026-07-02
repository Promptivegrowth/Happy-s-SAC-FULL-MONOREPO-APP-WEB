'use client';

import { useState, useTransition } from 'react';
import { Button } from '@happy/ui/button';
import { Input } from '@happy/ui/input';
import { FormGrid, FormRow } from '@happy/ui/form-row';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@happy/ui/dialog';
import { Pencil, Plus } from 'lucide-react';
import {
  guardarPaisExportacion,
  togglePaisActivo,
} from '@/server/actions/paises-exportacion';

type Pais = {
  codigo_iso: string;
  codigo_sunat: string;
  nombre: string;
  moneda_sugerida: string;
  activo: boolean;
  orden: number;
};

export function PaisEditor({ pais }: { pais: Pais | null }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const isNew = !pais;

  function submit(fd: FormData) {
    setErr(null);
    start(async () => {
      try {
        await guardarPaisExportacion(
          {
            codigo_iso: (fd.get('codigo_iso') as string).toUpperCase().trim(),
            codigo_sunat: (fd.get('codigo_sunat') as string).trim(),
            nombre: (fd.get('nombre') as string).trim(),
            moneda_sugerida: fd.get('moneda_sugerida') as never,
            activo: fd.get('activo') === 'on',
            orden: Number(fd.get('orden') ?? 100),
          },
          isNew,
        );
        setOpen(false);
      } catch (e) {
        setErr((e as Error).message);
      }
    });
  }

  async function toggle() {
    if (!pais) return;
    start(async () => {
      try {
        await togglePaisActivo(pais.codigo_iso, !pais.activo);
      } catch (e) {
        setErr((e as Error).message);
      }
    });
  }

  return (
    <div className="flex items-center justify-end gap-2">
      {!isNew && (
        <Button size="sm" variant="outline" onClick={toggle} disabled={pending} className="h-7 text-xs">
          {pais!.activo ? 'Desactivar' : 'Activar'}
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button size="sm" variant={isNew ? 'default' : 'ghost'} className={isNew ? '' : 'h-7 w-7 p-0'}>
            {isNew ? (<><Plus className="mr-1 h-3.5 w-3.5" /> Nuevo país</>) : (<Pencil className="h-3.5 w-3.5" />)}
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{isNew ? 'Nuevo país destino' : `Editar ${pais!.nombre}`}</DialogTitle>
          </DialogHeader>
          <form action={submit} className="space-y-4">
            <FormGrid cols={2}>
              <FormRow label="Código ISO alpha-2" required hint="2 letras — Ej: EC">
                <Input name="codigo_iso" defaultValue={pais?.codigo_iso ?? ''} required maxLength={2} minLength={2} placeholder="EC" disabled={!isNew} />
              </FormRow>
              <FormRow label="Código SUNAT" required hint="Catálogo 04 — Ej: 218">
                <Input name="codigo_sunat" defaultValue={pais?.codigo_sunat ?? ''} required maxLength={4} placeholder="218" />
              </FormRow>
              <FormRow label="Nombre del país" required>
                <Input name="nombre" defaultValue={pais?.nombre ?? ''} required placeholder="Ecuador" />
              </FormRow>
              <FormRow label="Moneda sugerida" required>
                <select name="moneda_sugerida" defaultValue={pais?.moneda_sugerida ?? 'USD'} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="USD">USD (Dólar americano)</option>
                  <option value="EUR">EUR (Euro)</option>
                  <option value="PEN">PEN (Sol peruano)</option>
                </select>
              </FormRow>
              <FormRow label="Orden en la lista">
                <Input name="orden" type="number" defaultValue={pais?.orden ?? 100} />
              </FormRow>
            </FormGrid>

            <div className="flex items-center gap-2 rounded-md bg-slate-50 p-3">
              <input type="checkbox" name="activo" defaultChecked={pais?.activo ?? true} id="activo-chk" className="h-4 w-4" />
              <label htmlFor="activo-chk" className="text-sm">País activo (disponible para nuevas ventas)</label>
            </div>

            {err && <p className="rounded bg-red-50 p-2 text-xs text-red-600">{err}</p>}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={pending}>{pending ? 'Guardando...' : 'Guardar'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
