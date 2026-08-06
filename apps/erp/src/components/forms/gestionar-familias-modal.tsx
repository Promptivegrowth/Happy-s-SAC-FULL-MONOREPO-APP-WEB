'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@happy/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@happy/ui/dialog';
import { Badge } from '@happy/ui/badge';
import { Loader2, Trash2, Users, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import { listarFamiliasConConteo, eliminarFamilia } from '@/server/actions/productos';

type Fam = { id: string; nombre: string; productos: number };

/**
 * Modal para gestionar (eliminar) familias de color. Solo se pueden eliminar
 * las que están VACÍAS (0 productos). Para las que tienen productos, primero
 * hay que quitar cada producto de la familia (en su ficha, "— Sin familia —").
 * Pedido del cliente 22/07/2026.
 */
export function GestionarFamiliasModal() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pending, start] = useTransition();
  const [fams, setFams] = useState<Fam[]>([]);

  async function cargar() {
    setLoading(true);
    const r = await listarFamiliasConConteo();
    setLoading(false);
    if (r.ok && r.data) setFams(r.data);
    else toast.error(r.error ?? 'No se pudieron cargar las familias');
  }

  function onOpenChange(v: boolean) {
    setOpen(v);
    if (v) cargar();
  }

  function borrar(f: Fam) {
    if (f.productos > 0) return;
    if (!confirm(`¿Eliminar la familia "${f.nombre}"? Está vacía, no afecta a ningún producto.`)) return;
    start(async () => {
      const r = await eliminarFamilia(f.id);
      if (r.ok) {
        toast.success('Familia eliminada');
        setFams((arr) => arr.filter((x) => x.id !== f.id));
        router.refresh(); // refresca el selector de familias del form
      } else {
        toast.error(r.error ?? 'Error al eliminar');
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onOpenChange(true)}
        className="gap-1.5"
      >
        <Settings2 className="h-3.5 w-3.5" /> Gestionar familias
      </Button>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Familias de color</DialogTitle>
          <DialogDescription>
            Podés eliminar las familias vacías (sin productos). Para eliminar una que tiene productos,
            primero quitá cada producto de la familia (en su ficha, elegí «— Sin familia —»).
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8 text-sm text-slate-500">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cargando…
          </div>
        ) : fams.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">No hay familias creadas.</p>
        ) : (
          <div className="max-h-[50vh] space-y-1.5 overflow-y-auto">
            {fams.map((f) => (
              <div
                key={f.id}
                className="flex items-center justify-between gap-2 rounded-md border px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-corp-900">{f.nombre}</p>
                  <p className="flex items-center gap-1 text-[11px] text-slate-500">
                    <Users className="h-3 w-3" />
                    {f.productos === 0 ? 'Vacía' : `${f.productos} producto${f.productos === 1 ? '' : 's'}`}
                  </p>
                </div>
                {f.productos === 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => borrar(f)}
                    disabled={pending}
                    className="h-8 gap-1 text-danger hover:bg-red-50"
                  >
                    {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    Eliminar
                  </Button>
                ) : (
                  <Badge variant="secondary" className="text-[10px]" title="Quitá los productos antes de eliminar">
                    En uso
                  </Badge>
                )}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
