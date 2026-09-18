import { NextResponse } from 'next/server';

/**
 * Responde que el sistema está en pie. Nada más.
 *
 * La usa el POS para saber si de verdad llega al servidor. Tiene que ser lo más
 * barata posible —sin base de datos, sin sesión— porque se llama cada veinte
 * segundos en cada caja: lo que se está midiendo es la red, no el sistema.
 *
 * `force-dynamic` y el no-store son necesarios: una respuesta servida del caché
 * contestaría que hay internet con el cable desenchufado, que es exactamente el
 * caso que hay que detectar.
 */
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json(
    { ok: true, t: Date.now() },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  );
}
