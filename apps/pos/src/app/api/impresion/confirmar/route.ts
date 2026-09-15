import { NextResponse } from 'next/server';
import { createAdminClient } from '@/server/supabase-admin';

/**
 * El agente avisa cómo salió cada ticket.
 *
 * Importa para poder decirle a la cajera "impreso" y no solo "enviado": si la
 * ticketera está apagada, sin papel o con la tapa abierta, tiene que enterarse
 * en el momento y no cuando el cliente ya se fue.
 */

export const dynamic = 'force-dynamic';

/**
 * Cuántas veces se reintenta un ticket que falló.
 *
 * La falla típica es transitoria —sin papel, tapa abierta— y se resuelve sola
 * en cuanto alguien la atiende: el ticket vuelve a la cola y sale. Pero no
 * puede reintentarse para siempre, porque un ticket que nunca va a poder
 * imprimirse mantendría a la cola trabada delante de los que sí pueden.
 */
const INTENTOS_MAXIMOS = 5;

export async function POST(request: Request) {
  let cuerpo: { token?: string; id?: string; ok?: boolean; error?: string };
  try {
    cuerpo = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'cuerpo ilegible' }, { status: 400 });
  }

  const token = cuerpo.token?.trim();
  const id = cuerpo.id?.trim();
  if (!token || !id) {
    return NextResponse.json({ ok: false, error: 'faltan token o id' }, { status: 400 });
  }

  const sb = createAdminClient();

  const { data: equipo } = await sb
    .from('equipos_impresion')
    .select('id')
    .eq('token', token)
    .maybeSingle();

  if (!equipo) {
    return NextResponse.json({ ok: false, error: 'equipo no reconocido' }, { status: 401 });
  }

  // El trabajo tiene que ser de ESE equipo: un token no puede tocar la cola de
  // otra caja.
  const { data: trabajo } = await sb
    .from('cola_impresion')
    .select('id, intentos')
    .eq('id', id)
    .eq('equipo_id', equipo.id)
    .maybeSingle();

  if (!trabajo) {
    return NextResponse.json({ ok: false, error: 'ese ticket no es de este equipo' }, { status: 404 });
  }

  if (cuerpo.ok) {
    await sb
      .from('cola_impresion')
      .update({ estado: 'impreso', impreso_at: new Date().toISOString(), error: null })
      .eq('id', id);
    return NextResponse.json({ ok: true });
  }

  const intentos = (trabajo.intentos ?? 0) + 1;
  const error = (cuerpo.error ?? 'sin detalle').slice(0, 500);

  await sb
    .from('cola_impresion')
    .update({
      // Vuelve a 'pendiente' mientras queden intentos: la ticketera sin papel
      // se resuelve sola en cuanto alguien le pone papel.
      estado: intentos >= INTENTOS_MAXIMOS ? 'error' : 'pendiente',
      intentos,
      error,
    })
    .eq('id', id);

  return NextResponse.json({ ok: true, intentos, reintentara: intentos < INTENTOS_MAXIMOS });
}
