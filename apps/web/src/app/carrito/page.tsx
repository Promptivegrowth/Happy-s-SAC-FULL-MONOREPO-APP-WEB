'use client';

import Image from 'next/image';
import Link from 'next/link';
import {
  useCart,
  precioEfectivoLinea,
  escalonPorTotalItems,
  UMBRAL_MAYORISTA,
  UMBRAL_FABRICA,
} from '@/store/cart';
import { Button } from '@happy/ui/button';
import { Card } from '@happy/ui/card';
import { Badge } from '@happy/ui/badge';
import { Trash2, Plus, Minus, ArrowRight, ShoppingBag, TrendingDown } from 'lucide-react';

export default function CarritoPage() {
  const items = useCart((s) => s.items);
  const remove = useCart((s) => s.remove);
  const setQty = useCart((s) => s.setQty);
  const total = useCart((s) => s.total());
  const totalDisfraces = useCart((s) => s.totalItems());
  const escalon = escalonPorTotalItems(totalDisfraces);

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

  // Mensaje de "cuánto falta para el siguiente escalón" — motiva a subir la
  // cantidad para acceder a mejor precio.
  let mensajeEscalon: React.ReactNode = null;
  if (escalon === 'PUBLICO') {
    const faltan = UMBRAL_MAYORISTA - totalDisfraces;
    if (faltan > 0) {
      mensajeEscalon = (
        <p className="rounded-md bg-emerald-50 p-2 text-center text-xs text-emerald-800">
          🎯 Agregá <strong>{faltan}</strong> disfraz{faltan === 1 ? '' : 'es'} más y todos los precios cambian a <strong>mayorista</strong>.
        </p>
      );
    }
  } else if (escalon === 'MAYORISTA') {
    const faltan = UMBRAL_FABRICA - totalDisfraces;
    if (faltan > 0 && faltan <= 30) {
      mensajeEscalon = (
        <p className="rounded-md bg-blue-50 p-2 text-center text-xs text-blue-800">
          🏭 ¡Sos mayorista! Agregá <strong>{faltan}</strong> más para pasar a <strong>precio de fábrica</strong>.
        </p>
      );
    }
  }

  return (
    <div className="container px-4 py-10">
      <h1 className="mb-1 font-display text-3xl font-semibold">
        Tu carrito · {items.length} {items.length === 1 ? 'producto' : 'productos'}
      </h1>
      <p className="mb-6 text-sm text-slate-600">
        Total de disfraces a comprar:{' '}
        <strong className="text-corp-900">{totalDisfraces}</strong>
        {escalon === 'MAYORISTA' && (
          <Badge className="ml-2 bg-emerald-500 text-[10px]">Precio mayorista aplicado</Badge>
        )}
        {escalon === 'FABRICA' && (
          <Badge className="ml-2 bg-blue-600 text-[10px] hover:bg-blue-600">Precio de fábrica aplicado</Badge>
        )}
      </p>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-3">
          {items.map((it) => {
            const precioEfectivo = precioEfectivoLinea(it, escalon);
            const publico = Number(it.precio ?? 0);
            const conDescuento = precioEfectivo < publico;
            return (
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
                  <p className="text-xs text-slate-500">Talla {it.talla.replace('T', '')} · SKU {it.sku}</p>
                  <div className="mt-1 flex items-baseline gap-2">
                    <p className="font-semibold text-happy-600">S/ {precioEfectivo.toFixed(2)}</p>
                    {conDescuento && (
                      <>
                        <span className="text-xs text-slate-400 line-through">S/ {publico.toFixed(2)}</span>
                        <TrendingDown className="h-3 w-3 text-emerald-600" />
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center rounded-md border">
                  <button
                    onClick={() => setQty(it.varianteId, it.cantidad - 1)}
                    className="px-2 py-2 hover:bg-slate-50"
                    aria-label="Restar"
                  >
                    <Minus className="h-3 w-3" />
                  </button>
                  {/* Input editable — cliente pidió también acá */}
                  <input
                    type="number"
                    min={1}
                    value={it.cantidad}
                    onChange={(e) => {
                      const raw = Number(e.target.value.replace(/[^\d]/g, ''));
                      if (raw >= 1) setQty(it.varianteId, raw);
                    }}
                    className="w-12 border-x border-slate-200 bg-transparent px-1 py-2 text-center text-sm font-medium focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <button
                    onClick={() => setQty(it.varianteId, it.cantidad + 1)}
                    className="px-2 py-2 hover:bg-slate-50"
                    aria-label="Sumar"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
                <button
                  onClick={() => remove(it.varianteId)}
                  className="rounded p-2 text-red-500 hover:bg-red-50"
                  aria-label="Eliminar"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </Card>
            );
          })}
        </div>

        <Card className="h-fit p-5">
          <h3 className="mb-4 font-display text-lg font-semibold">Resumen</h3>
          <div className="space-y-2 text-sm">
            <Row label={`Total de disfraces`} value={String(totalDisfraces)} />
            <Row label="Subtotal" value={`S/ ${total.toFixed(2)}`} />
            <Row label="Envío" value="Calculado en el checkout" />
            <hr className="my-2" />
            <Row label="Total estimado" value={`S/ ${total.toFixed(2)}`} bold />
          </div>
          {mensajeEscalon && <div className="mt-3">{mensajeEscalon}</div>}
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
