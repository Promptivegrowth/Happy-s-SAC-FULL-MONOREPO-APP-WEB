'use client';

import { useState, useTransition } from 'react';
import { Star, Loader2, CheckCircle2 } from 'lucide-react';
import { Button } from '@happy/ui/button';
import { Input } from '@happy/ui/input';
import { Textarea } from '@happy/ui/textarea';
import { Label } from '@happy/ui/label';
import { toast } from 'sonner';
import { crearResena } from '@/server/actions/resena';

export type ResenaItem = {
  id: string;
  autor: string;
  rating: number;
  titulo: string | null;
  comentario: string | null;
  verificado: boolean;
  fecha: string;
};

export function ResenasSection({
  productoId,
  resenas,
  promedio,
  total,
}: {
  productoId: string;
  resenas: ResenaItem[];
  promedio: number;
  total: number;
}) {
  const [showForm, setShowForm] = useState(false);
  const [pending, start] = useTransition();
  const [enviado, setEnviado] = useState(false);
  const [rating, setRating] = useState(5);
  const [hover, setHover] = useState(0);
  const [autor, setAutor] = useState('');
  const [email, setEmail] = useState('');
  const [titulo, setTitulo] = useState('');
  const [comentario, setComentario] = useState('');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (autor.trim().length < 2) return toast.error('Ingresa tu nombre');
    if (comentario.trim().length < 10) return toast.error('Comentario muy corto (mín. 10 caracteres)');
    start(async () => {
      const r = await crearResena({
        productoId,
        autorNombre: autor.trim(),
        autorEmail: email.trim() || undefined,
        rating,
        titulo: titulo.trim() || undefined,
        comentario: comentario.trim(),
      });
      if (r.ok) {
        setEnviado(true);
        toast.success('¡Gracias! Tu reseña será publicada tras revisión.');
      } else {
        toast.error(r.error ?? 'Error al enviar reseña');
      }
    });
  }

  return (
    <section className="mt-16 border-t pt-12">
      <h2 className="mb-6 text-center font-display text-2xl font-semibold text-corp-900">
        Reseñas de Clientes
      </h2>

      <div className="mx-auto flex max-w-2xl items-center justify-center gap-6">
        <div className="text-center">
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((i) => (
              <Star
                key={i}
                className={`h-5 w-5 ${i <= Math.round(promedio) && total > 0 ? 'fill-happy-500 text-happy-500' : 'text-slate-300'}`}
              />
            ))}
          </div>
          <p className="mt-1 text-sm text-slate-600">
            {total === 0 ? 'Sé el primero en escribir una reseña' : `${promedio.toFixed(1)} de 5 · ${total} reseña${total === 1 ? '' : 's'}`}
          </p>
        </div>
        {!showForm && !enviado && (
          <Button variant="premium" size="lg" onClick={() => setShowForm(true)}>
            Escribir una reseña
          </Button>
        )}
      </div>

      {/* Form */}
      {showForm && !enviado && (
        <form onSubmit={submit} className="mx-auto mt-8 max-w-2xl space-y-4 rounded-xl border bg-slate-50 p-6">
          <div>
            <Label>Tu calificación</Label>
            <div className="mt-1 flex gap-1">
              {[1, 2, 3, 4, 5].map((i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setRating(i)}
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(0)}
                  className="p-1"
                  aria-label={`${i} estrellas`}
                >
                  <Star className={`h-7 w-7 transition ${i <= (hover || rating) ? 'fill-happy-500 text-happy-500' : 'text-slate-300'}`} />
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="r-nombre">Tu nombre *</Label>
              <Input id="r-nombre" value={autor} onChange={(e) => setAutor(e.target.value)} required maxLength={60} />
            </div>
            <div>
              <Label htmlFor="r-email">Email (opcional)</Label>
              <Input id="r-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={120} />
            </div>
          </div>
          <div>
            <Label htmlFor="r-titulo">Título (opcional)</Label>
            <Input id="r-titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={120} placeholder="Resumen de tu experiencia" />
          </div>
          <div>
            <Label htmlFor="r-coment">Tu reseña *</Label>
            <Textarea id="r-coment" value={comentario} onChange={(e) => setComentario(e.target.value)} required maxLength={1000} rows={4} placeholder="¿Qué te pareció el producto?" />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setShowForm(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" variant="premium" disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Enviar reseña
            </Button>
          </div>
        </form>
      )}

      {enviado && (
        <div className="mx-auto mt-8 flex max-w-2xl items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-800">
          <CheckCircle2 className="h-6 w-6" />
          <div>
            <p className="font-semibold">¡Reseña enviada!</p>
            <p className="text-sm">La revisaremos y publicaremos en las próximas 24 hs.</p>
          </div>
        </div>
      )}

      {/* Lista de reseñas existentes */}
      {resenas.length > 0 && (
        <div className="mx-auto mt-10 max-w-2xl space-y-4">
          {resenas.map((r) => (
            <div key={r.id} className="rounded-lg border bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-corp-900">{r.autor}</p>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Star key={i} className={`h-3.5 w-3.5 ${i <= r.rating ? 'fill-happy-500 text-happy-500' : 'text-slate-300'}`} />
                    ))}
                  </div>
                </div>
                <span className="text-xs text-slate-400">{r.fecha}</span>
              </div>
              {r.titulo && <p className="mt-2 font-medium text-corp-900">{r.titulo}</p>}
              {r.comentario && <p className="mt-1 text-sm text-slate-700">{r.comentario}</p>}
              {r.verificado && <p className="mt-2 text-[11px] font-medium text-emerald-700">✓ Compra verificada</p>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
