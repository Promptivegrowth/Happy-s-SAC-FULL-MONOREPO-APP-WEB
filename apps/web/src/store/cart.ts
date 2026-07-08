'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Escalones de precio para clientes web (post-2026-07-08):
//  - < 6 unidades totales → precio público
//  - >= 6 unidades totales → precio mayorista (o público si no hay mayorista)
//  - >= 100 unidades totales → precio de fábrica (o mayorista si no hay fábrica)
// Los escalones se aplican a TODAS las líneas del carrito una vez que el
// total de items supera el umbral (no por variante individual).
export const UMBRAL_MAYORISTA = 6;
export const UMBRAL_FABRICA = 100;

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

export type EscalonAplicado = 'PUBLICO' | 'MAYORISTA' | 'FABRICA';

/**
 * Escalón activo según el total de items del carrito.
 * Devuelve el nombre del escalón — el precio efectivo por línea se calcula
 * con `precioEfectivoLinea` de más abajo (respeta el fallback si esa línea
 * no tiene ese precio cargado).
 */
export function escalonPorTotalItems(totalItems: number): EscalonAplicado {
  if (totalItems >= UMBRAL_FABRICA) return 'FABRICA';
  if (totalItems >= UMBRAL_MAYORISTA) return 'MAYORISTA';
  return 'PUBLICO';
}

/**
 * Precio unitario efectivo de una línea según el escalón activo.
 * Cae en cascada si no está cargado el precio del escalón:
 *   FABRICA → MAYORISTA → PUBLICO
 *   MAYORISTA → PUBLICO
 */
export function precioEfectivoLinea(item: CartItem, escalon: EscalonAplicado): number {
  const publico = Number(item.precio ?? 0);
  const mayor = Number(item.precioMayorista ?? 0);
  const fab = Number(item.precioFabrica ?? 0);
  if (escalon === 'FABRICA') return fab > 0 ? fab : mayor > 0 ? mayor : publico;
  if (escalon === 'MAYORISTA') return mayor > 0 ? mayor : publico;
  return publico;
}

type CartState = {
  items: CartItem[];
  add: (item: CartItem) => void;
  remove: (varianteId: string) => void;
  setQty: (varianteId: string, qty: number) => void;
  clear: () => void;
  total: () => number;
  totalItems: () => number;
  escalonActivo: () => EscalonAplicado;
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
