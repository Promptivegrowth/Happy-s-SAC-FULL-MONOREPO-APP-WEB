'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
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
import { Plus, Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { crearReceta } from '@/server/actions/recetas';

type ProductoOption = {
  id: string;
  codigo: string;
  nombre: string;
  /** Indica si ya tiene receta activa (se deshabilita en la lista) */
  tieneReceta: boolean;
};

export function NuevaRecetaButton({ productos }: { productos: ProductoOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [search, setSearch] = useState('');
  const [productoId, setProductoId] = useState<string>('');

  const filtrados = useMemo(() => {
    const t = search.trim().toLowerCase();
    const base = productos.filter((p) => !p.tieneReceta); // solo los que no tienen receta activa
    if (!t) return base.slice(0, 50);
    return base
      .filter((p) => p.codigo.toLowerCase().includes(t) || p.nombre.toLowerCase().includes(t))
      .slice(0, 50);
  }, [search, productos]);

  const seleccionado = productos.find((p) => p.id === productoId);

  function reset() {
    setSearch('');
    setProductoId('');
  }

  function onOpenChange(v: boolean) {
    setOpen(v);
    if (!v) reset();
  }

  function submit() {
    if (!productoId) {
      toast.error('Seleccioná un producto');
      return;
    }
    start(async () => {
      const r = await crearReceta(productoId);
      if (r.ok && r.data) {
        toast.success('Receta v1.0 creada · agrega líneas BOM');
        setOpen(false);
        router.push(`/recetas/${r.data.id}`);
      } else {
        toast.error(r.error ?? 'Error al crear receta');
      }
    });
  }

  return (
    <>
      <Button variant="premium" className="gap-2" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> Nueva receta
      </Button>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva receta (BOM)</DialogTitle>
            <DialogDescription>
              Crea una receta vacía v1.0 para un producto que aún no tiene receta activa.
              Después agregás las líneas (material × talla × cantidad) en el editor.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="search">Producto (buscá por código o nombre)</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  id="search"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setProductoId('');
                  }}
                  disabled={pending}
                  placeholder="Ej. PRIN, princesa…"
                  className="pl-9"
                />
              </div>

              <div className="max-h-60 overflow-y-auto rounded border bg-white">
                {filtrados.length === 0 ? (
                  <p className="p-3 text-xs text-slate-500">
                    {search ? 'Sin coincidencias entre productos sin receta activa' : 'Todos los productos ya tienen receta activa'}
                  </p>
                ) : (
                  filtrados.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setProductoId(p.id);
                        setSearch(`${p.codigo} · ${p.nombre}`);
                      }}
                      className={`flex w-full items-center justify-between border-b px-3 py-2 text-left text-xs transition hover:bg-happy-50 ${
                        productoId === p.id ? 'bg-happy-100 font-semibold' : ''
                      }`}
                    >
                      <span>
                        <span className="font-mono text-slate-500">{p.codigo}</span> · {p.nombre}
                      </span>
                    </button>
                  ))
                )}
              </div>
              {seleccionado && (
                <p className="text-xs text-emerald-700">
                  ✓ {seleccionado.codigo} · {seleccionado.nombre}
                </p>
              )}
            </div>

            <p className="rounded bg-slate-50 p-3 text-xs text-slate-600">
              <strong>Tip:</strong> Si ya tenés una receta parecida (ej. otro modelo de princesa),
              en el editor podés usar <strong>"Duplicar receta"</strong> para copiar todas las
              líneas y luego ajustar.
            </p>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button onClick={submit} disabled={pending || !productoId}>
              {pending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creando…
                </>
              ) : (
                'Crear receta'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
