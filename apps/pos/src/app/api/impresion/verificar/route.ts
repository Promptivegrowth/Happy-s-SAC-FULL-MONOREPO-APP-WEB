import { NextResponse } from 'next/server';
import { createAdminClient } from '@/server/supabase-admin';

/**
 * Comprueba un código de instalación antes de instalar.
 *
 * La ventana del agente consulta acá apenas se pega el código y muestra a qué
 * computadora corresponde. Sin esto, pegar un código equivocado se descubre
 * recién cuando los tickets salen en la caja de la otra tienda.
 *
 * Devuelve solo el nombre del equipo: nada del resto del sistema.
 */

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token')?.trim();
  if (!token) {
    return NextResponse.json({ ok: false, error: 'falta el código' }, { status: 400 });
  }

  const sb = createAdminClient();
  const { data } = await sb
    .from('equipos_impresion')
    .select('nombre, activo')
    .eq('token', token)
    .maybeSingle();

  if (!data) {
    return NextResponse.json({ ok: false, error: 'código no reconocido' }, { status: 404 });
  }
  if (!data.activo) {
    return NextResponse.json({ ok: false, equipo: data.nombre, error: 'ese equipo está desactivado' }, { status: 409 });
  }

  return NextResponse.json({ ok: true, equipo: data.nombre });
}
