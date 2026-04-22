'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@happy/ui/button';
import { Badge } from '@happy/ui/badge';
import { ShoppingBag, MessageCircle, Plus, Minus } from 'lucide-react';
import { useCart, type CartItem } from '@/store/cart';
import { toast } from 'sonner';

type Variante = { id: string; sku: string; talla: string; precio: number; precioMayorista: number };

export function ProductoDetalleClient({
  productoId,
  nombre,
  imagen,
  variantes,
}: {
  productoId: string;
  nombre: string;
  imagen: string | null;
  variantes: Variante[];
}) {
  const router = useRouter();
  const add = useCart((s) => s.add);
  const [seleccionada, setSeleccionada] = useState<Variante | null>(variantes[0] ?? null);
  const [cantidad, setCantidad] = useState(1);

  const tallasUnicas = Array.from(new Set(variantes.map((v) => v.talla)));

  function agregarAlCarrito() {
    if (!seleccionada) return toast.error('Selecciona una talla');
    const item: CartItem = {
      varianteId: seleccionada.id,
      productoId,
      sku: seleccionada.sku,
      nombre,
      talla: seleccionada.talla,
      imagenUrl: imagen,
      precio: seleccionada.precio,
      cantidad,
    };
    add(item);
    toast.success(`${cantidad} × ${nombre} (${seleccionada.talla}) agregado`);
  }

  function comprarPorWhatsapp() {
    if (!seleccionada) return toast.error('Selecciona una talla');
    const total = seleccionada.precio * cantidad;
    const msg =
`🎭 *DISFRACES HAPPYS — Consulta de pedido*

Producto: *${nombre}*
SKU: ${seleccionada.sku}
Talla: ${seleccionada.talla}
Cantidad: ${cantidad}
Precio: S/ ${seleccionada.precio.toFixed(2)}
Total: *S/ ${total.toFixed(2)}*

¿Cómo procedo con la compra?`;
    window.open(`https://wa.me/51916856842?text=${encodeURIComponent(msg)}`, '_blank');
  }

  function irAlCheckout() {
    agregarAlCarrito();
    router.push('/checkout');
  }

  return (
    <div className="mt-6 space-y-5">
      {seleccionada && (
        <div>
          <p className="font-display text-4xl font-semibold text-happy-600">
            S/ {seleccionada.precio.toFixed(2)}
          </p>
          {seleccionada.precioMayorista > 0 && (
            <p className="mt-0.5 text-sm text-slate-500">
              Mayorista (desde 6 unid.): <span className="font-medium text-slate-900">S/ {seleccionada.precioMayorista.toFixed(2)}</span>
            </p>
          )}
        </div>
      )}

      <div>
        <p className="mb-2 text-sm font-medium">Talla</p>
        <div className="flex flex-wrap gap-2">
          {tallasUnicas.map((t) => {
            const v = variantes.find((x) => x.talla === t)!;
            const active = seleccionada?.id === v.id;
            return (
              <button
                key={t}
                onClick={() => setSeleccionada(v)}
                className={`min-w-[44px] rounded-md border px-3 py-2 text-sm font-medium transition ${active ? 'border-happy-500 bg-happy-50 text-happy-700' : 'hover:border-slate-400'}`}
              >
                {t.replace('T','')}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <p className="text-sm font-medium">Cantidad</p>
        <div className="flex items-center rounded-md border">
          <button onClick={() => setCantidad(Math.max(1, cantidad - 1))} className="px-2.5 py-2 hover:bg-slate-50"><Minus className="h-3 w-3" /></button>
          <span className="min-w-8 text-center text-sm">{cantidad}</span>
          <button onClick={() => setCantidad(cantidad + 1)} className="px-2.5 py-2 hover:bg-slate-50"><Plus className="h-3 w-3" /></button>
        </div>
        {cantidad >= 6 && <Badge variant="success" className="text-[10px]">¡Precio mayorista!</Badge>}
      </div>

      <div className="flex flex-wrap gap-2 pt-2">
        <Button onClick={irAlCheckout} variant="premium" size="lg" className="flex-1 min-w-[180px]">
          <ShoppingBag className="h-4 w-4" /> Comprar ahora
        </Button>
        <Button onClick={agregarAlCarrito} variant="outline" size="lg">
          Agregar al carrito
        </Button>
      </div>

      <button onClick={comprarPorWhatsapp} className="flex w-full items-center justify-center gap-2 rounded-md border border-emerald-300 bg-emerald-50 py-3 text-sm font-medium text-emerald-700 transition hover:bg-emerald-100">
        <MessageCircle className="h-4 w-4" />
        Pedir por WhatsApp · +51 916 856 842
      </button>
    </div>
  );
}
