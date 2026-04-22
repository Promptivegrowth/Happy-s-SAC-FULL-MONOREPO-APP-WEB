'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCart } from '@/store/cart';
import { Button } from '@happy/ui/button';
import { Card } from '@happy/ui/card';
import { Trash2, Plus, Minus, ArrowRight, ShoppingBag } from 'lucide-react';

export default function CarritoPage() {
  const items = useCart((s) => s.items);
  const remove = useCart((s) => s.remove);
  const setQty = useCart((s) => s.setQty);
  const total = useCart((s) => s.total());

  if (items.length === 0) {
    return (
      <div className="container px-4 py-20 text-center">
        <ShoppingBag className="mx-auto h-16 w-16 text-slate-300" />
        <h1 className="mt-4 font-display text-2xl font-semibold">Tu carrito está vacío</h1>
        <p className="mt-2 text-slate-500">Empieza explorando nuestro catálogo de disfraces 🎭</p>
        <Link href="/productos" className="mt-6 inline-block">
          <Button variant="premium" size="lg">Ver catálogo</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="container px-4 py-10">
      <h1 className="mb-6 font-display text-3xl font-semibold">Tu carrito · {items.length} {items.length === 1 ? 'producto' : 'productos'}</h1>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-3">
          {items.map((it) => (
            <Card key={it.varianteId} className="flex items-center gap-4 p-3">
              <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-md bg-slate-100">
                {it.imagenUrl ? (
                  <Image src={it.imagenUrl} alt={it.nombre} fill className="object-cover" sizes="80px" />
                ) : (
                  <div className="flex h-full items-center justify-center text-2xl">🎭</div>
                )}
              </div>
              <div className="flex-1">
                <p className="font-medium leading-tight">{it.nombre}</p>
                <p className="text-xs text-slate-500">Talla {it.talla.replace('T','')} · SKU {it.sku}</p>
                <p className="mt-1 font-semibold text-happy-600">S/ {it.precio.toFixed(2)}</p>
              </div>
              <div className="flex items-center rounded-md border">
                <button onClick={() => setQty(it.varianteId, it.cantidad - 1)} className="px-2 py-2 hover:bg-slate-50"><Minus className="h-3 w-3" /></button>
                <span className="min-w-8 text-center text-sm">{it.cantidad}</span>
                <button onClick={() => setQty(it.varianteId, it.cantidad + 1)} className="px-2 py-2 hover:bg-slate-50"><Plus className="h-3 w-3" /></button>
              </div>
              <button onClick={() => remove(it.varianteId)} className="rounded p-2 text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
            </Card>
          ))}
        </div>

        <Card className="h-fit p-5">
          <h3 className="mb-4 font-display text-lg font-semibold">Resumen</h3>
          <div className="space-y-2 text-sm">
            <Row label="Subtotal" value={`S/ ${total.toFixed(2)}`} />
            <Row label="Envío" value="Calculado en el checkout" />
            <hr className="my-2" />
            <Row label="Total estimado" value={`S/ ${total.toFixed(2)}`} bold />
          </div>
          <Link href="/checkout" className="mt-5 block">
            <Button variant="premium" size="lg" className="w-full">
              Continuar al checkout <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <Link href="/productos" className="mt-2 block text-center text-xs text-happy-600 hover:underline">
            Seguir comprando
          </Link>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className={bold ? 'font-semibold' : 'text-slate-500'}>{label}</span>
      <span className={bold ? 'font-display text-lg text-happy-600' : 'font-medium'}>{value}</span>
    </div>
  );
}
