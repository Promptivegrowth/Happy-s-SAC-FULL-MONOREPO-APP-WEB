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
import { Badge } from '@happy/ui/badge';
import { Plus, Loader2, Search, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { crearReceta } from '@/server/actions/recetas';

type ProductoOption = {
  id: string;
  codigo: string;
  nombre: string;
  /** Si tiene receta activa, este es el id de esa receta (para link directo) */
  recetaActivaId: string | null;
};

export function NuevaRecetaButton({ productos }: { productos: ProductoOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [search, setSearch] = useState('');
  const [productoId, setProductoId] = useState<string>('');

  // Mostramos TODOS los productos (con receta y sin), pero los marcamos
  // para que el usuario vea cuáles ya tienen y pueda saltar al editor.
  const filtrados = useMemo(() => {
    const t = search.trim().toLowerCase();
    if (!t) return productos.slice(0, 50);
    return productos
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

  function abrirReceta(recetaId: string) {
    setOpen(false);
    router.push(`/recetas/${recetaId}`);
  }

  function submit() {
    if (!productoId) {
      toast.error('Seleccioná un producto');
      return;
    }
    if (seleccionado?.recetaActivaId) {
      // Ya tiene → ir al editor en vez de crear
      abrirReceta(seleccionado.recetaActivaId);
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
              Si el producto aún no tiene receta, se crea v1.0 vacía. Si ya tiene, te llevamos
              directo al editor.
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
                  <p className="p-3 text-xs text-slate-500">Sin coincidencias</p>
                ) : (
                  filtrados.map((p) => {
                    const tieneReceta = p.recetaActivaId !== null;
                    const isSelected = productoId === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          if (tieneReceta) {
                            abrirReceta(p.recetaActivaId!);
                            return;
                          }
                          setProductoId(p.id);
                          setSearch(`${p.codigo} · ${p.nombre}`);
                        }}
                        className={`flex w-full items-center justify-between gap-2 border-b px-3 py-2 text-left text-xs transition hover:bg-happy-50 ${
                          isSelected ? 'bg-happy-100 font-semibold' : ''
                        }`}
                      >
                        <span className="flex-1 truncate">
                          <span className="font-mono text-slate-500">{p.codigo}</span> · {p.nombre}
                        </span>
                        {tieneReceta ? (
                          <Badge variant="success" className="gap-1 text-[9px]">
                            Ver receta <ArrowRight className="h-3 w-3" />
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[9px] text-slate-500">
                            Sin receta
                          </Badge>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
              {seleccionado && !seleccionado.recetaActivaId && (
                <p className="text-xs text-emerald-700">
                  ✓ Listo para crear receta para {seleccionado.codigo} · {seleccionado.nombre}
                </p>
              )}
            </div>

            <p className="rounded bg-slate-50 p-3 text-xs text-slate-600">
              <strong>Tip:</strong> los productos con badge verde &quot;Ver receta&quot; ya tienen
              una — click directo te lleva al editor. Si querés copiar de otra receta similar,
              andá al editor y usá <strong>&quot;Duplicar receta&quot;</strong>.
            </p>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button
              onClick={submit}
              disabled={pending || !productoId || Boolean(seleccionado?.recetaActivaId)}
              title={
                seleccionado?.recetaActivaId
                  ? 'Este producto ya tiene receta — usá "Ver receta" arriba'
                  : ''
              }
            >
              {pending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Creando…
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
