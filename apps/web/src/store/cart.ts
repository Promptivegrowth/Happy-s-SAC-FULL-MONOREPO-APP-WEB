'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type CartItem = {
  varianteId: string;
  productoId: string;
  sku: string;
  nombre: string;
  talla: string;
  imagenUrl?: string | null;
  precio: number;          // unitario PEN
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
      total: () => get().items.reduce((a, i) => a + i.precio * i.cantidad, 0),
      totalItems: () => get().items.reduce((a, i) => a + i.cantidad, 0),
    }),
    { name: 'happy-cart' },
  ),
);
