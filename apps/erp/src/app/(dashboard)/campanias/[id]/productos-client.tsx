'use client';

import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@happy/ui/button';
import { Input } from '@happy/ui/input';
import { Badge } from '@happy/ui/badge';
import { Card, CardContent } from '@happy/ui/card';
import { Search, Plus, X, Loader2 } from 'lucide-react';
import { asignarProductosACampana } from '@/server/actions/campanas';

export type ProductoFila = {
  id: string;
  codigo: string;
  nombre: string;
  publicado: boolean;
  /** Nombre de la campaña en la que está hoy, si es otra. */
  otraCampana: string | null;
};

/**
 * Armar la campaña eligiendo disfraces de una lista, en vez de ficha por ficha.
 *
 * Un producto pertenece a UNA sola campaña, así que sumar uno que ya está en
 * otra lo MUEVE. Eso no se puede descubrir después: la lista lo dice al lado
 * de cada nombre y el botón lo repite antes de guardar.
 */
export function ProductosDeCampana({
  campanaId,
  dentro,
  fuera,
}: {
  campanaId: string;
  dentro: ProductoFila[];
  fuera: ProductoFila[];
}) {
  const [busqueda, setBusqueda] = useState('');
  const [elegidos, setElegidos] = useState<Set<string>>(new Set());
  const [pendiente, startTransition] = useTransition();

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return fuera.slice(0, 60);
    return fuera
      .filter((p) => p.nombre.toLowerCase().includes(q) || p.codigo.toLowerCase().includes(q))
      .slice(0, 60);
  }, [fuera, busqueda]);

  function alternar(id: string) {
    setElegidos((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  }

  function ejecutar(ids: string[], quitar: boolean) {
    if (ids.length === 0) return;
    startTransition(async () => {
      const r = await asignarProductosACampana(campanaId, ids, quitar);
      if (!r.ok) {
        toast.error(r.error ?? 'No se pudo guardar');
        return;
      }
      setElegidos(new Set());
      if (quitar) {
        toast.success(`${ids.length} producto(s) sacados de la campaña`);
        return;
      }
      const sinPublicar = r.data?.sinPublicar ?? 0;
      if (sinPublicar > 0) {
        toast.warning(
          `${ids.length} agregado(s), pero ${sinPublicar} no está(n) publicado(s) en la web: `
          + 'hasta que los publiques desde Publicación Web no se van a ver en la campaña.',
          { duration: 12000 },
        );
      } else {
        toast.success(`${ids.length} producto(s) agregados y visibles en la web`);
      }
    });
  }

  const moveraOtra = filtrados.filter((p) => elegidos.has(p.id) && p.otraCampana).length;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* En la campaña */}
      <Card>
        <CardContent className="py-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-medium">En esta campaña ({dentro.length})</h3>
          </div>
          {dentro.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">
              Todavía no hay disfraces. Elegilos de la derecha.
            </p>
          ) : (
            <ul className="max-h-72 space-y-1 overflow-y-auto sm:max-h-[26rem]">
              {dentro.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-slate-50">
                  <span className="min-w-0 text-sm">
                    <span className="block truncate">{p.nombre}</span>
                    <span className="text-xs text-slate-500">{p.codigo}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {p.publicado
                      ? <Badge variant="outline" className="text-xs">en la web</Badge>
                      : <Badge variant="destructive" className="text-xs">sin publicar</Badge>}
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pendiente}
                      onClick={() => ejecutar([p.id], true)}
                      title="Sacar de la campaña"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Para agregar */}
      <Card>
        <CardContent className="py-4">
          <h3 className="mb-3 font-medium">Agregar disfraces</h3>
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre o código…"
              className="pl-9"
            />
          </div>

          <ul className="max-h-72 space-y-1 overflow-y-auto sm:max-h-[22rem]">
            {filtrados.map((p) => (
              <li key={p.id}>
                <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={elegidos.has(p.id)}
                    onChange={() => alternar(p.id)}
                    className="h-4 w-4 shrink-0"
                  />
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="block truncate">{p.nombre}</span>
                    <span className="text-xs text-slate-500">
                      {p.codigo}
                      {p.otraCampana && <span className="text-amber-700"> · hoy está en {p.otraCampana}</span>}
                      {!p.publicado && <span className="text-danger"> · sin publicar</span>}
                    </span>
                  </span>
                </label>
              </li>
            ))}
            {filtrados.length === 0 && (
              <li className="py-8 text-center text-sm text-slate-500">
                {busqueda ? 'Ningún disfraz coincide.' : 'No quedan disfraces para agregar.'}
              </li>
            )}
          </ul>

          {!busqueda && fuera.length > 60 && (
            <p className="mt-2 text-xs text-slate-500">
              Se muestran 60 de {fuera.length}. Buscá para encontrar el resto.
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
            <Button
              size="sm"
              disabled={pendiente || elegidos.size === 0}
              onClick={() => ejecutar(Array.from(elegidos), false)}
            >
              {pendiente ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Agregar {elegidos.size > 0 ? `(${elegidos.size})` : ''}
            </Button>
            {moveraOtra > 0 && (
              <span className="text-xs text-amber-700">
                {moveraOtra} ya está(n) en otra campaña y se van a mover a esta.
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
