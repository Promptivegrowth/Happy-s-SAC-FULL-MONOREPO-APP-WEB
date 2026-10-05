'use client';

/**
 * Piezas de la página del pedido que corren en el navegador.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useCart } from '@/store/cart';

/**
 * Vuelve a leer el pedido cada pocos segundos mientras espera el pago.
 *
 * Si el comprador llega antes que el aviso del banco, ve "Pendiente de pago"
 * aunque ya le cobraron. En vez de pedirle que recargue, la página se pone al
 * día sola durante un minuto y medio.
 */
export function EsperarConfirmacion() {
  const router = useRouter();
  useEffect(() => {
    let vueltas = 0;
    const t = setInterval(() => {
      vueltas++;
      if (vueltas > 22) return clearInterval(t);
      router.refresh();
    }, 4000);
    return () => clearInterval(t);
  }, [router]);
  return null;
}

/** Vacía el carrito al llegar al pedido recién pagado. */
export function VaciarCarrito() {
  const vaciar = useCart((s) => s.clear);
  useEffect(() => {
    vaciar();
  }, [vaciar]);
  return null;
}
