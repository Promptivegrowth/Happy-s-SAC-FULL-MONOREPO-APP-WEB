import Link from 'next/link';
import Image from 'next/image';
import { Card } from '@happy/ui/card';
import { Badge } from '@happy/ui/badge';
import { Star, ShieldCheck } from 'lucide-react';

export type ProductCardData = {
  slug: string | null;
  titulo: string;
  imagen: string | null;
  precio: number | null;
  precioOferta?: number | null;
  rating?: number | null;
  totalResenas?: number | null;
  etiquetas?: string[] | null;
};

export function ProductCard({ p }: { p: ProductCardData }) {
  const tieneOferta = p.precioOferta && p.precio && p.precioOferta < p.precio;
  const descuento = tieneOferta && p.precio
    ? Math.round((1 - (p.precioOferta as number) / p.precio) * 100)
    : 0;
  const href = p.slug ? `/productos/${p.slug}` : '#';

  return (
    <Link href={href} className="group block">
      <Card className="relative overflow-hidden border-2 border-transparent transition hover:-translate-y-1 hover:border-happy-300 hover:shadow-glow">
        <div className="relative aspect-square overflow-hidden bg-corp-50">
          {p.imagen ? (
            <Image
              src={p.imagen}
              alt={p.titulo}
              fill
              className="object-cover transition group-hover:scale-105"
              sizes="(max-width: 768px) 50vw, 25vw"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-5xl">🎭</div>
          )}

          {/* Badge "Oferta" arriba izquierda */}
          {tieneOferta && (
            <Badge className="absolute left-2 top-2 bg-happy-500 hover:bg-happy-500">
              Oferta
            </Badge>
          )}

          {/* Badge % descuento arriba derecha */}
          {descuento > 0 && (
            <Badge className="absolute right-2 top-2 bg-danger px-1.5 py-0.5 font-mono text-xs hover:bg-danger">
              -{descuento}%
            </Badge>
          )}

          {/* Etiquetas extra */}
          {(p.etiquetas?.length ?? 0) > 0 && !tieneOferta && (
            <div className="absolute left-2 top-2 flex flex-wrap gap-1">
              {p.etiquetas?.slice(0, 2).map((t) => (
                <Badge key={t} variant="default" className="bg-corp-700 text-[10px]">{t}</Badge>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-1.5 p-3">
          {/* Rating */}
          {p.rating != null && p.rating > 0 ? (
            <div className="flex items-center gap-1 text-xs">
              <div className="flex">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Star
                    key={i}
                    className={`h-3 w-3 ${i <= Math.round(p.rating!) ? 'fill-happy-500 text-happy-500' : 'text-slate-300'}`}
                  />
                ))}
              </div>
              <span className="text-slate-500">({p.totalResenas ?? 0})</span>
            </div>
          ) : (
            <div className="text-[11px] text-slate-400">Sin reseñas aún</div>
          )}

          <h3 className="line-clamp-2 min-h-[2.5em] text-sm font-medium leading-tight text-corp-900">
            {p.titulo}
          </h3>

          {/* Precio */}
          <div className="flex items-baseline gap-2">
            {tieneOferta ? (
              <>
                <span className="font-display text-lg font-semibold text-danger">
                  S/ {(p.precioOferta as number).toFixed(2)}
                </span>
                <span className="text-xs text-slate-400 line-through">
                  S/ {(p.precio as number).toFixed(2)}
                </span>
              </>
            ) : (
              <span className="font-display text-lg font-semibold text-corp-900">
                {p.precio ? `S/ ${p.precio.toFixed(2)}` : 'Consultar'}
              </span>
            )}
          </div>

          {/* Trust mini */}
          <div className="flex items-center gap-1 pt-1 text-[10px] text-slate-500">
            <ShieldCheck className="h-3 w-3 text-happy-500" />
            <span>Precio más bajo garantizado</span>
          </div>
        </div>
      </Card>
    </Link>
  );
}
