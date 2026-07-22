'use server';

/**
 * Precios vigentes de variantes — para refrescar el carrito.
 *
 * El carrito se persiste en localStorage CON los precios del momento en que
 * se agregó cada producto. Si después cambian los precios en el ERP (o se
 * corrige un bug de mapeo, como el de precio de fábrica del 20/07/2026),
 * el carrito viejo seguía cobrando los precios guardados. La página del
 * carrito llama esta action al montar y pisa los precios guardados con los
 * vigentes.
 */

import { createClient } from '@happy/db/server';

export type PrecioVariante = {
  id: string;
  precio: number;
  precioMayorista: number;
  precioFabrica: number;
};

export async function obtenerPreciosVariantes(ids: string[]): Promise<PrecioVariante[]> {
  if (ids.length === 0) return [];
  try {
    const sb = await createClient();
    const { data } = await sb
      .from('productos_variantes')
      .select('id, precio_publico, precio_mayorista_a, precio_mayorista_b, precio_industrial')
      .in('id', ids.slice(0, 300));
    type Row = {
      id: string;
      precio_publico: number | null;
      precio_mayorista_a: number | null;
      precio_mayorista_b: number | null;
      precio_industrial: number | null;
    };
    return ((data ?? []) as Row[]).map((v) => ({
      id: v.id,
      precio: Number(v.precio_publico ?? 0),
      precioMayorista: Number(v.precio_mayorista_a ?? 0),
      // Fábrica = precio_industrial (mismo campo que el POS, escalón >=100).
      // precio_mayorista_b queda de fallback para productos viejos.
      precioFabrica:
        Number(v.precio_industrial ?? 0) > 0
          ? Number(v.precio_industrial)
          : Number(v.precio_mayorista_b ?? 0),
    }));
  } catch {
    return []; // si falla, el carrito sigue con los precios guardados
  }
}
