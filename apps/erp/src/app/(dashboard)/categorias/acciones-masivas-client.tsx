'use client';

import { useState, useTransition } from 'react';
import { Button } from '@happy/ui/button';
import { Loader2, Globe, EyeOff, MoreVertical } from 'lucide-react';
import { toast } from 'sonner';
import { publicarTodosCategoria, despublicarTodosCategoria } from '@/server/actions/categorias';

export function AccionesMasivasCategoria({
  categoriaId,
  total,
  publicados,
}: {
  categoriaId: string;
  total: number;
  publicados: number;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  function publicarTodos() {
    if (total === 0) return toast.error('Esta categoría no tiene productos');
    if (!confirm(`Publicar los ${total} productos de esta categoría en la web. ¿Continuar?`)) return;
    start(async () => {
      const r = await publicarTodosCategoria(categoriaId);
      if (r.ok && r.data) {
        toast.success(`✨ ${r.data.afectados} productos publicados en la web`);
        setOpen(false);
      } else {
        toast.error(r.error ?? 'Error');
      }
    });
  }

  function despublicarTodos() {
    if (publicados === 0) return toast.error('No hay productos publicados en esta categoría');
    if (!confirm(`Ocultar los ${publicados} productos publicados de esta categoría. ¿Continuar?`)) return;
    start(async () => {
      const r = await despublicarTodosCategoria(categoriaId);
      if (r.ok && r.data) {
        toast.success(`Productos ocultados de la web`);
        setOpen(false);
      } else {
        toast.error(r.error ?? 'Error');
      }
    });
  }

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(!open)}
        disabled={pending}
        title="Acciones masivas"
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MoreVertical className="h-3.5 w-3.5" />}
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-20 mt-1 w-64 overflow-hidden rounded-md border bg-white shadow-lg">
            <button
              type="button"
              onClick={publicarTodos}
              disabled={pending || total === 0}
              className="flex w-full items-center gap-2 border-b px-4 py-2.5 text-left text-sm text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Globe className="h-4 w-4" />
              <div>
                <div className="font-medium">Publicar todos</div>
                <div className="text-[10px] text-slate-500">
                  {total} producto{total === 1 ? '' : 's'} → web
                </div>
              </div>
            </button>
            <button
              type="button"
              onClick={despublicarTodos}
              disabled={pending || publicados === 0}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <EyeOff className="h-4 w-4" />
              <div>
                <div className="font-medium">Despublicar todos</div>
                <div className="text-[10px] text-slate-500">
                  {publicados} publicado{publicados === 1 ? '' : 's'} → ocultar
                </div>
              </div>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
