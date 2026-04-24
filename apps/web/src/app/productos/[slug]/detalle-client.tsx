'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@happy/ui/button';
import { Badge } from '@happy/ui/badge';
import { ShoppingBag, MessageCircle, Plus, Minus, Zap } from 'lucide-react';
import { useCart, type CartItem } from '@/store/cart';
import { toast } from 'sonner';

type Variante = { id: string; sku: string; talla: string; precio: number; precioMayorista: number };

export function ProductoDetalleClient({
  productoId,
  nombre,
  imagen,
  variantes,
  precioOferta,
}: {
  productoId: string;
  nombre: string;
  imagen: string | null;
  variantes: Variante[];
  precioOferta?: number | null;
}) {
  const router = useRouter();
  const add = useCart((s) => s.add);
  const [seleccionada, setSeleccionada] = useState<Variante | null>(variantes[0] ?? null);
  const [cantidad, setCantidad] = useState(1);

  const tallasUnicas = Array.from(new Set(variantes.map((v) => v.talla)));

  const precioFinal =
    precioOferta && seleccionada && precioOferta < seleccionada.precio
      ? precioOferta
      : seleccionada?.precio ?? 0;
  const tieneOferta = !!(precioOferta && seleccionada && precioOferta < seleccionada.precio);
  const descuento = tieneOferta && seleccionada
    ? Math.round((1 - precioOferta / seleccionada.precio) * 100)
    : 0;

  function agregarAlCarrito() {
    if (!seleccionada) return toast.error('Selecciona una talla');
    const item: CartItem = {
      varianteId: seleccionada.id,
      productoId,
      sku: seleccionada.sku,
      nombre,
      talla: seleccionada.talla,
      imagenUrl: imagen,
      precio: precioFinal,
      cantidad,
    };
    add(item);
    toast.success(`${cantidad} × ${nombre} (${seleccionada.talla}) agregado`);
  }

  function comprarPorWhatsapp() {
    if (!seleccionada) return toast.error('Selecciona una talla');
    const total = precioFinal * cantidad;
    const msg = `🎭 *DISFRACES HAPPYS — Consulta de pedido*

Producto: *${nombre}*
SKU: ${seleccionada.sku}
Talla: ${seleccionada.talla}
Cantidad: ${cantidad}
Precio: S/ ${precioFinal.toFixed(2)}
Total: *S/ ${total.toFixed(2)}*

¿Cómo procedo con la compra?`;
    window.open(`https://wa.me/51916856842?text=${encodeURIComponent(msg)}`, '_blank');
  }

  function irAlCheckout() {
    agregarAlCarrito();
    router.push('/checkout');
  }

  return (
    <div className="space-y-5">
      {seleccionada && (
        <div>
          <div className="flex items-baseline gap-3">
            <p className="font-display text-4xl font-semibold text-corp-900">
              S/ {precioFinal.toFixed(2)}
            </p>
            {tieneOferta && (
              <>
                <span className="text-lg text-slate-400 line-through">S/ {seleccionada.precio.toFixed(2)}</span>
                <Badge className="bg-danger px-2 py-0.5 text-xs hover:bg-danger">-{descuento}%</Badge>
              </>
            )}
          </div>
          {seleccionada.precioMayorista > 0 && (
            <p className="mt-1 text-sm text-slate-500">
              Mayorista (desde 6 unid.):{' '}
              <span className="font-medium text-slate-900">S/ {seleccionada.precioMayorista.toFixed(2)}</span>
            </p>
          )}
          <p className="mt-1 flex items-center gap-1 text-xs text-emerald-700">
            <Zap className="h-3 w-3" /> En stock · listo para enviar
          </p>
        </div>
      )}

      <div>
        <p className="mb-2 text-sm font-medium text-corp-900">
          Talla: <span className="font-normal text-slate-600">{seleccionada?.talla.replace('T', '') ?? '—'}</span>
        </p>
        <div className="flex flex-wrap gap-2">
          {tallasUnicas.map((t) => {
            const v = variantes.find((x) => x.talla === t)!;
            const active = seleccionada?.id === v.id;
            return (
              <button
                key={t}
                onClick={() => setSeleccionada(v)}
                className={`min-w-[44px] rounded-md border px-3 py-2 text-sm font-medium transition ${
                  active
                    ? 'border-happy-500 bg-happy-50 text-happy-700 ring-2 ring-happy-200'
                    : 'border-slate-300 hover:border-slate-400'
                }`}
              >
                {t.replace('T', '')}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <p className="text-sm font-medium text-corp-900">Cantidad</p>
        <div className="flex items-center rounded-md border border-slate-300">
          <button
            onClick={() => setCantidad(Math.max(1, cantidad - 1))}
            className="px-3 py-2 hover:bg-slate-50"
            aria-label="Restar"
          >
            <Minus className="h-3 w-3" />
          </button>
          <span className="min-w-10 text-center text-sm font-medium">{cantidad}</span>
          <button
            onClick={() => setCantidad(cantidad + 1)}
            className="px-3 py-2 hover:bg-slate-50"
            aria-label="Sumar"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>
        {cantidad >= 6 && <Badge variant="success" className="text-[10px]">¡Precio mayorista!</Badge>}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Button onClick={agregarAlCarrito} variant="premium" size="lg">
          <ShoppingBag className="h-4 w-4" /> Agregar al carrito
        </Button>
        <Button
          onClick={irAlCheckout}
          size="lg"
          className="bg-gradient-to-r from-happy-500 to-danger text-white shadow-lg hover:from-happy-600 hover:to-danger"
        >
          Comprar ahora
        </Button>
      </div>

      <button
        onClick={comprarPorWhatsapp}
        className="flex w-full items-center justify-center gap-2 rounded-md border border-emerald-300 bg-emerald-50 py-3 text-sm font-medium text-emerald-700 transition hover:bg-emerald-100"
      >
        <MessageCircle className="h-4 w-4" />
        Pedir por WhatsApp · +51 916 856 842
      </button>
    </div>
  );
}
