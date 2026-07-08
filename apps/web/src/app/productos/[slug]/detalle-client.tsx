'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@happy/ui/button';
import { Badge } from '@happy/ui/badge';
import { ShoppingBag, MessageCircle, Plus, Minus, Zap, AlertTriangle } from 'lucide-react';
import { useCart, type CartItem } from '@/store/cart';
import { toast } from 'sonner';
import { WHATSAPP_NUMERO } from '@/lib/contacto';

// Umbrales para escalón de precio en la WEB pública (post-2026-07-08):
//  - Desde 6 unidades → precio mayorista
//  - Desde 100 unidades → precio de fábrica (aún más bajo)
const UMBRAL_MAYORISTA = 6;
const UMBRAL_FABRICA = 100;

type Variante = {
  id: string;
  sku: string;
  talla: string;
  precio: number;
  /** Precio final tras aplicar el descuento %, si la talla NO está excluida.
   *  Igual a `precio` cuando no hay descuento o esta talla está excluida. */
  precioConDescuento: number;
  /** True si esta talla recibe el descuento %. */
  aplicaDescuento: boolean;
  precioMayorista: number;
  /** Precio de fábrica (>= 100 unidades). Puede ser 0 si no está cargado. */
  precioFabrica: number;
  stock: number;
};

export function ProductoDetalleClient({
  productoId,
  nombre,
  imagen,
  variantes,
  precioOferta,
  descuentoPorcentaje = 0,
  stockTotal,
  agotado,
}: {
  productoId: string;
  nombre: string;
  imagen: string | null;
  variantes: Variante[];
  precioOferta?: number | null;
  /** % de descuento aplicado a las tallas no excluidas */
  descuentoPorcentaje?: number;
  stockTotal: number;
  agotado: boolean;
}) {
  const router = useRouter();
  const add = useCart((s) => s.add);

  // Seleccionar la primera variante con stock por defecto (o la primera si todo agotado).
  const primeraConStock = variantes.find((v) => v.stock > 0) ?? variantes[0] ?? null;
  const [seleccionada, setSeleccionada] = useState<Variante | null>(primeraConStock);
  const [cantidad, setCantidad] = useState(1);

  // Cliente pidió (post-2026-07-08) que al cambiar de talla la cantidad
  // vuelva a 1 (se reseteaba antes en el useEffect). Wrapper que setea
  // ambos estados a la vez para evitar mostrar cantidad vieja con talla nueva.
  function cambiarTalla(v: Variante) {
    setSeleccionada(v);
    setCantidad(1);
  }

  // Tallas únicas (por orden de aparición)
  const tallasUnicas = Array.from(new Set(variantes.map((v) => v.talla)));

  const stockSeleccionada = seleccionada?.stock ?? 0;
  const sinStockSeleccionada = stockSeleccionada <= 0;

  // Precio base según ESCALÓN por cantidad. Precio de fábrica (>=100), luego
  // mayorista (>=6), luego público. Descuentos % o precio_oferta absoluto
  // se aplican sobre público (no se combinan con mayorista/fábrica).
  let precioFinal = seleccionada?.precio ?? 0;
  let tieneOferta = false;
  let descuento = 0;
  let escalonActivo: 'PUBLICO' | 'MAYORISTA' | 'FABRICA' = 'PUBLICO';
  if (seleccionada) {
    if (cantidad >= UMBRAL_FABRICA && seleccionada.precioFabrica > 0) {
      precioFinal = seleccionada.precioFabrica;
      escalonActivo = 'FABRICA';
    } else if (cantidad >= UMBRAL_MAYORISTA && seleccionada.precioMayorista > 0) {
      precioFinal = seleccionada.precioMayorista;
      escalonActivo = 'MAYORISTA';
    } else if (seleccionada.aplicaDescuento && seleccionada.precioConDescuento < seleccionada.precio) {
      precioFinal = seleccionada.precioConDescuento;
      tieneOferta = true;
      descuento = descuentoPorcentaje;
    } else if (precioOferta && precioOferta < seleccionada.precio) {
      precioFinal = precioOferta;
      tieneOferta = true;
      descuento = Math.round((1 - precioOferta / seleccionada.precio) * 100);
    }
  }

  function agregarAlCarrito() {
    if (!seleccionada) return toast.error('Selecciona una talla');
    if (sinStockSeleccionada) return toast.error(`Talla ${seleccionada.talla.replace('T', '')} agotada`);
    if (cantidad > stockSeleccionada) {
      return toast.error(`Solo quedan ${stockSeleccionada} unidades de talla ${seleccionada.talla.replace('T', '')}`);
    }
    const item: CartItem = {
      varianteId: seleccionada.id,
      productoId,
      sku: seleccionada.sku,
      nombre,
      talla: seleccionada.talla,
      imagenUrl: imagen,
      // El "precio" es el público (retail) — se guarda como base. El carrito
      // recalcula dinámicamente según total de items del carrito completo:
      // mayorista >=6, fábrica >=100.
      precio: seleccionada.precio,
      precioMayorista: seleccionada.precioMayorista,
      precioFabrica: seleccionada.precioFabrica,
      cantidad,
    };
    add(item);
    toast.success(`${cantidad} × ${nombre} (${seleccionada.talla.replace('T', '')}) agregado`);
    // Reset cantidad a 1 tras agregar — cliente pidió que se limpie para
    // que el siguiente click no repita la misma cantidad.
    setCantidad(1);
  }

  function comprarPorWhatsapp() {
    if (!seleccionada) return toast.error('Selecciona una talla');
    const total = precioFinal * cantidad;
    const mensajeStock = sinStockSeleccionada
      ? '\n*⚠️ Talla actualmente agotada — consulto disponibilidad/reposición*'
      : '';
    const msg = `🎭 *DISFRACES HAPPYS — Consulta de pedido*

Producto: *${nombre}*
SKU: ${seleccionada.sku}
Talla: ${seleccionada.talla.replace('T', '')}
Cantidad: ${cantidad}
Precio: S/ ${precioFinal.toFixed(2)}
Total: *S/ ${total.toFixed(2)}*${mensajeStock}

¿Cómo procedo con la compra?`;
    window.open(`https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent(msg)}`, '_blank');
  }

  function irAlCheckout() {
    if (sinStockSeleccionada) return toast.error('Producto sin stock disponible');
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
          {/* Escalones de precio: mayorista (≥6) y fábrica (≥100).
              Se muestran ambos si existen. El activo se pinta con badge. */}
          {(seleccionada.precioMayorista > 0 || seleccionada.precioFabrica > 0) && (
            <div className="mt-1 space-y-0.5">
              {seleccionada.precioMayorista > 0 && (
                <p className="flex items-center gap-2 text-sm text-slate-500">
                  <span>
                    Mayorista (desde {UMBRAL_MAYORISTA} unid.):{' '}
                    <span className="font-medium text-slate-900">S/ {seleccionada.precioMayorista.toFixed(2)}</span>
                  </span>
                  {escalonActivo === 'MAYORISTA' && (
                    <Badge className="bg-emerald-500 text-[10px]">Aplicado</Badge>
                  )}
                </p>
              )}
              {seleccionada.precioFabrica > 0 && (
                <p className="flex items-center gap-2 text-sm text-slate-500">
                  <span>
                    Fábrica (desde {UMBRAL_FABRICA} unid.):{' '}
                    <span className="font-medium text-slate-900">S/ {seleccionada.precioFabrica.toFixed(2)}</span>
                  </span>
                  {escalonActivo === 'FABRICA' && (
                    <Badge className="bg-blue-600 text-[10px]">Aplicado</Badge>
                  )}
                </p>
              )}
            </div>
          )}

          {/* Estado de stock */}
          {agotado ? (
            <p className="mt-2 flex items-center gap-1 text-sm font-medium text-danger">
              <AlertTriangle className="h-4 w-4" /> Producto agotado · escríbenos por WhatsApp para reposición
            </p>
          ) : sinStockSeleccionada ? (
            <p className="mt-2 flex items-center gap-1 text-sm font-medium text-amber-600">
              <AlertTriangle className="h-4 w-4" /> Talla {seleccionada.talla.replace('T', '')} agotada · elige otra o consulta
            </p>
          ) : stockSeleccionada <= 5 ? (
            <p className="mt-2 flex items-center gap-1 text-xs text-amber-600">
              <AlertTriangle className="h-3 w-3" /> ¡Últimas {stockSeleccionada} unidades de esta talla!
            </p>
          ) : (
            <p className="mt-1 flex items-center gap-1 text-xs text-emerald-700">
              <Zap className="h-3 w-3" /> En stock · {stockSeleccionada} disponibles · listo para enviar
            </p>
          )}
        </div>
      )}

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-medium text-corp-900">
            Talla: <span className="font-normal text-slate-600">{seleccionada?.talla.replace('T', '') ?? '—'}</span>
          </p>
          {descuentoPorcentaje > 0 && (
            <p className="text-[10px] text-slate-500">
              <span className="inline-block h-2 w-2 rounded-full bg-danger" /> con -{descuentoPorcentaje}%
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {tallasUnicas.map((t) => {
            const v = variantes.find((x) => x.talla === t)!;
            const active = seleccionada?.id === v.id;
            const sinStock = v.stock <= 0;
            const tieneDesc = v.aplicaDescuento && descuentoPorcentaje > 0;
            return (
              <button
                key={t}
                onClick={() => cambiarTalla(v)}
                disabled={sinStock}
                title={
                  sinStock
                    ? `Talla ${t.replace('T', '')} agotada`
                    : tieneDesc
                      ? `Stock: ${v.stock} · -${descuentoPorcentaje}% aplicado`
                      : descuentoPorcentaje > 0
                        ? `Stock: ${v.stock} · esta talla NO tiene descuento`
                        : `Stock: ${v.stock}`
                }
                className={`relative min-w-[44px] rounded-md border px-3 py-2 text-sm font-medium transition ${
                  sinStock
                    ? 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400 line-through'
                    : active
                      ? 'border-happy-500 bg-happy-50 text-happy-700 ring-2 ring-happy-200'
                      : 'border-slate-300 hover:border-slate-400'
                }`}
              >
                {t.replace('T', '')}
                {tieneDesc && !sinStock && (
                  <span
                    className="absolute -right-1 -top-1 inline-block h-2.5 w-2.5 rounded-full bg-danger ring-2 ring-white"
                    aria-label="Con descuento"
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm font-medium text-corp-900">Cantidad</p>
        <div className="flex items-center rounded-md border border-slate-300">
          <button
            onClick={() => setCantidad(Math.max(1, cantidad - 1))}
            disabled={sinStockSeleccionada}
            className="px-3 py-2 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Restar"
          >
            <Minus className="h-3 w-3" />
          </button>
          {/* Input editable — cliente pidió (post-2026-07-08) poder tipear
              directo en vez de solo +/-. El valor se clamp a stock disponible. */}
          <input
            type="number"
            min={1}
            max={stockSeleccionada || 1}
            value={cantidad}
            onChange={(e) => {
              const raw = Number(e.target.value.replace(/[^\d]/g, ''));
              if (!Number.isFinite(raw) || raw < 1) { setCantidad(1); return; }
              setCantidad(Math.min(stockSeleccionada || 1, Math.max(1, raw)));
            }}
            onBlur={(e) => {
              const raw = Number(e.target.value);
              if (!Number.isFinite(raw) || raw < 1) setCantidad(1);
            }}
            disabled={sinStockSeleccionada}
            className="w-14 border-x border-slate-200 bg-transparent px-2 py-2 text-center text-sm font-medium focus:outline-none focus:ring-1 focus:ring-happy-400 disabled:cursor-not-allowed disabled:opacity-50 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          <button
            onClick={() => setCantidad(Math.min(stockSeleccionada || 1, cantidad + 1))}
            disabled={sinStockSeleccionada || cantidad >= stockSeleccionada}
            className="px-3 py-2 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Sumar"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>
        {escalonActivo === 'MAYORISTA' && (
          <Badge variant="success" className="text-[10px]">¡Precio mayorista!</Badge>
        )}
        {escalonActivo === 'FABRICA' && (
          <Badge className="bg-blue-600 text-[10px] hover:bg-blue-600">¡Precio de fábrica!</Badge>
        )}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Button
          onClick={agregarAlCarrito}
          variant="premium"
          size="lg"
          disabled={sinStockSeleccionada}
        >
          <ShoppingBag className="h-4 w-4" />
          {sinStockSeleccionada ? 'Talla agotada' : 'Agregar al carrito'}
        </Button>
        <Button
          onClick={irAlCheckout}
          size="lg"
          disabled={sinStockSeleccionada}
          className="bg-gradient-to-r from-happy-500 to-danger text-white shadow-lg hover:from-happy-600 hover:to-danger disabled:from-slate-300 disabled:to-slate-300 disabled:shadow-none"
        >
          {sinStockSeleccionada ? 'Sin stock' : 'Comprar ahora'}
        </Button>
      </div>

      <button
        onClick={comprarPorWhatsapp}
        className="flex w-full flex-col items-center justify-center gap-0.5 rounded-md border border-emerald-300 bg-emerald-50 py-2.5 text-sm font-medium text-emerald-700 transition hover:bg-emerald-100"
      >
        <span className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4" />
          {agotado || sinStockSeleccionada
            ? 'Consultar reposición por WhatsApp'
            : 'Pedidos para el mismo día o urgentes consultar al WhatsApp'}
        </span>
        <span className="text-[11px] font-normal text-emerald-800/80">Escribinos aquí</span>
      </button>

      {!agotado && stockTotal > 0 && stockTotal <= 10 && (
        <p className="text-xs text-amber-600">
          ⚡ Solo quedan <strong>{stockTotal}</strong> unidades en total entre todas las tallas. ¡No te quedes sin el tuyo!
        </p>
      )}
    </div>
  );
}
