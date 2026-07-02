'use client';

import { useState, useTransition } from 'react';
import { Button } from '@happy/ui/button';
import { Input } from '@happy/ui/input';
import { FormGrid, FormRow, FormSection } from '@happy/ui/form-row';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@happy/ui/dialog';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import {
  guardarSerieComprobante,
  eliminarSerieComprobante,
  toggleSerieActiva,
} from '@/server/actions/series-comprobantes';

type Serie = {
  id: string;
  tipo: string;
  serie: string;
  canal: string | null;
  ultimo_correlativo: number | null;
  activa: boolean | null;
  observacion: string | null;
};

export function SeriesEditor({ serie }: { serie: Serie | null }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const isNew = !serie;

  function submit(fd: FormData) {
    setErr(null);
    start(async () => {
      try {
        await guardarSerieComprobante({
          id: serie?.id ?? null,
          tipo: fd.get('tipo') as never,
          serie: (fd.get('serie') as string).trim(),
          canal: ((fd.get('canal') as string) || null) as never,
          ultimo_correlativo: Number(fd.get('ultimo_correlativo') ?? 0),
          activa: fd.get('activa') === 'on',
          observacion: (fd.get('observacion') as string) || null,
        });
        setOpen(false);
      } catch (e) {
        setErr((e as Error).message);
      }
    });
  }

  async function toggle() {
    if (!serie) return;
    setErr(null);
    start(async () => {
      try {
        await toggleSerieActiva(serie.id, !serie.activa);
      } catch (e) {
        setErr((e as Error).message);
      }
    });
  }

  async function borrar() {
    if (!serie) return;
    if (!confirm(`¿Eliminar la serie ${serie.serie}? Esta acción no se puede deshacer.`)) return;
    setErr(null);
    start(async () => {
      try {
        await eliminarSerieComprobante(serie.id);
      } catch (e) {
        setErr((e as Error).message);
        alert((e as Error).message);
      }
    });
  }

  return (
    <div className="flex items-center justify-end gap-2">
      {!isNew && (
        <>
          <Button size="sm" variant="outline" onClick={toggle} disabled={pending} className="h-7 text-xs">
            {serie!.activa ?? false ? 'Desactivar' : 'Activar'}
          </Button>
          <Button size="sm" variant="ghost" onClick={borrar} disabled={pending} className="h-7 w-7 p-0">
            <Trash2 className="h-3.5 w-3.5 text-red-500" />
          </Button>
        </>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button size="sm" variant={isNew ? 'default' : 'ghost'} className={isNew ? '' : 'h-7 w-7 p-0'}>
            {isNew ? (<><Plus className="mr-1 h-3.5 w-3.5" /> Nueva serie</>) : (<Pencil className="h-3.5 w-3.5" />)}
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{isNew ? 'Nueva serie' : `Editar serie ${serie!.serie}`}</DialogTitle>
          </DialogHeader>
          <form action={submit} className="space-y-4">
            <FormSection title="Datos SUNAT">
              <FormGrid cols={2}>
                <FormRow label="Tipo comprobante" required>
                  <select name="tipo" defaultValue={serie?.tipo ?? 'FACTURA'} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" required>
                    <option value="FACTURA">FACTURA</option>
                    <option value="BOLETA">BOLETA</option>
                    <option value="NOTA_CREDITO">NOTA_CREDITO</option>
                    <option value="NOTA_DEBITO">NOTA_DEBITO</option>
                    <option value="GUIA_REMISION">GUIA_REMISION</option>
                  </select>
                </FormRow>
                <FormRow label="Canal" hint="EXPORTACION = venta al exterior (IGV 0%)">
                  <select name="canal" defaultValue={serie?.canal ?? ''} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                    <option value="">Todos (nacional)</option>
                    <option value="POS">POS</option>
                    <option value="WEB">WEB</option>
                    <option value="B2B">B2B</option>
                    <option value="EXPORTACION">EXPORTACION</option>
                  </select>
                </FormRow>
                <FormRow label="Serie" required hint="La que asignó SUNAT (ej: F001, FE01)">
                  <Input name="serie" defaultValue={serie?.serie ?? ''} required maxLength={10} placeholder="F001" />
                </FormRow>
                <FormRow label="Último correlativo" hint="0 si es serie nueva">
                  <Input name="ultimo_correlativo" type="number" min={0} defaultValue={serie?.ultimo_correlativo ?? 0} />
                </FormRow>
              </FormGrid>
            </FormSection>

            <FormRow label="Observación">
              <textarea name="observacion" defaultValue={serie?.observacion ?? ''} rows={2} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="Notas internas (opcional)" />
            </FormRow>

            <div className="flex items-center gap-2 rounded-md bg-slate-50 p-3">
              <input type="checkbox" name="activa" defaultChecked={serie?.activa ?? false} id="activa-chk" className="h-4 w-4" />
              <label htmlFor="activa-chk" className="text-sm">
                Serie activa (habilitada para emitir comprobantes)
              </label>
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
