'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Las reglas de precio viven en @/lib/precios porque el servidor también las
// usa —recalcula el total antes de cobrar con tarjeta— y no puede importar
// este archivo, que es 'use client'. Se reexportan para no tocar a quienes ya
// las importaban desde el carrito.
import {
  escalonPorTotalItems,
  precioEfectivoLinea,
  UMBRAL_MAYORISTA,
  UMBRAL_FABRICA,
  type EscalonAplicado,
} from '@/lib/precios';

export {
  escalonPorTotalItems,
  precioEfectivoLinea,
  UMBRAL_MAYORISTA,
  UMBRAL_FABRICA,
};
export type { EscalonAplicado };

export type CartItem = {
  varianteId: string;
  productoId: string;
  sku: string;
  nombre: string;
  talla: string;
  imagenUrl?: string | null;
  /** Precio público (retail) — usado como fallback si no hay mayorista/fábrica */
  precio: number;
  /** Precio mayorista (>=6). Puede ser 0 si no está cargado en la variante */
  precioMayorista?: number;
  /** Precio de fábrica (>=100). Puede ser 0 si no está cargado */
  precioFabrica?: number;
  cantidad: number;
  stock?: number;
};

type CartState = {
  items: CartItem[];
  add: (item: CartItem) => void;
  remove: (varianteId: string) => void;
  setQty: (varianteId: string, qty: number) => void;
  clear: () => void;
  total: () => number;
  totalItems: () => number;
  escalonActivo: () => EscalonAplicado;
  /** Pisa los precios guardados con los vigentes de la BD (el carrito
   *  persiste en localStorage los precios del momento en que se agregó
   *  cada item — si cambian en el ERP quedaban desactualizados). */
  refrescarPrecios: (
    precios: { id: string; precio: number; precioMayorista: number; precioFabrica: number }[],
  ) => void;
};

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      add: (item) => set((s) => {
        const existing = s.items.find((i) => i.varianteId === item.varianteId);
        if (existing) {
          return {
            items: s.items.map((i) =>
              i.varianteId === item.varianteId
                ? { ...i, cantidad: i.cantidad + item.cantidad }
                : i,
            ),
          };
        }
        return { items: [...s.items, item] };
      }),
      remove: (varianteId) => set((s) => ({ items: s.items.filter((i) => i.varianteId !== varianteId) })),
      setQty: (varianteId, qty) => set((s) => ({
        items: s.items.map((i) => i.varianteId === varianteId ? { ...i, cantidad: Math.max(1, qty) } : i),
      })),
      clear: () => set({ items: [] }),
      refrescarPrecios: (precios) => set((s) => {
        const map = new Map(precios.map((p) => [p.id, p]));
        return {
          items: s.items.map((i) => {
            const p = map.get(i.varianteId);
            if (!p || p.precio <= 0) return i; // sin datos frescos, no tocar
            return { ...i, precio: p.precio, precioMayorista: p.precioMayorista, precioFabrica: p.precioFabrica };
          }),
        };
      }),
      total: () => {
        const state = get();
        const totalItems = state.items.reduce((a, i) => a + i.cantidad, 0);
        const esc = escalonPorTotalItems(totalItems);
        return state.items.reduce((a, i) => a + precioEfectivoLinea(i, esc) * i.cantidad, 0);
      },
      totalItems: () => get().items.reduce((a, i) => a + i.cantidad, 0),
      escalonActivo: () => escalonPorTotalItems(get().items.reduce((a, i) => a + i.cantidad, 0)),
    }),
    { name: 'happy-cart' },
  ),
);
