import { NextResponse } from 'next/server';
import { createAdminClient } from '@/server/supabase-admin';

/**
 * Lo que el agente de impresión viene a buscar.
 *
 * El agente pregunta cada segundo si hay tickets para su computadora. Se
 * identifica con su token, que solo da acceso a su propia cola.
 *
 * Es al revés de lo obvio —el navegador llamando al agente— porque Chrome y
 * Edge están cerrando esa puerta (Local Network Access) y la restricción se
 * endurece con cada versión. Acá el que llama es el agente, que es un programa
 * local y no tiene ninguna restricción. De paso se puede cobrar desde el ERP o
 * desde el celular y que el ticket salga en la ticketera de la tienda.
 */

export const dynamic = 'force-dynamic';

/**
 * Cuántos tickets se entregan por vez.
 *
 * De a pocos a propósito: si la ticketera se queda sin papel a mitad de la
 * tanda, se reintenta solo lo que falta y no toda la cola.
 */
const MAXIMO_POR_VEZ = 3;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token')?.trim();
  const version = url.searchParams.get('version')?.trim() || null;

  /**
   * Por qué ticketera está imprimiendo esa computadora, según el propio agente.
   * Sirve para ver desde el ERP cuál está conectada pero sin encontrar
   * impresora: sin esto, esa se ve igual que una que funciona y nadie lo nota
   * hasta que la cajera intenta cobrar.
   */
  const detectada = url.searchParams.get('impresora')?.trim() || null;

  /**
   * Todas las impresoras instaladas en esa computadora. Cuando la detección
   * automática elige la equivocada —hay máquinas con dos entradas parecidas—
   * Windows acepta el trabajo igual y no sale papel. Teniendo la lista acá se
   * puede forzar la correcta desde el ERP sin ir hasta la tienda.
   */
  const disponibles = url.searchParams.get('impresoras')?.trim() || null;

  /**
   * En qué computadora corre el agente.
   *
   * El código identifica a UNA computadora; si se pega el mismo en dos, las dos
   * preguntan por esta cola y se reparten los tickets al azar, o el mismo
   * ticket sale impreso en las dos. Guardando el nombre de la máquina el ERP lo
   * detecta solo, que antes era invisible.
   */
  const maquina = url.searchParams.get('maquina')?.trim().slice(0, 100) || null;

  if (!token) {
    return NextResponse.json({ ok: false, error: 'falta el token del equipo' }, { status: 400 });
  }

  const sb = createAdminClient();

  const { data: equipo } = await sb
    .from('equipos_impresion')
    .select('id, nombre, impresora, avance_corte_mm, activo, maquinas_vistas')
    .eq('token', token)
    .maybeSingle();

  if (!equipo) {
    return NextResponse.json({ ok: false, error: 'equipo no reconocido' }, { status: 401 });
  }

  // Deja constancia de que está vivo aunque esté desactivado: así en el ERP se
  // distingue "dado de baja" de "apagado".
  // Se acumulan las computadoras distintas que usaron este código. Más de una
  // es la señal de que el código se instaló en varias máquinas.
  const vistas = String(equipo.maquinas_vistas ?? '').split('|').map((m) => m.trim()).filter(Boolean);
  if (maquina && !vistas.includes(maquina)) vistas.push(maquina);

  await sb
    .from('equipos_impresion')
    .update({
      ultima_conexion: new Date().toISOString(),
      version_agente: version,
      impresora_detectada: detectada,
      ...(maquina ? { maquina, maquinas_vistas: vistas.join('|') } : {}),
      ...(disponibles ? { impresoras_disponibles: disponibles } : {}),
    })
    .eq('id', equipo.id);

  if (!equipo.activo) {
    return NextResponse.json({ ok: true, equipo: equipo.nombre, trabajos: [] });
  }

  const { data: trabajos, error } = await sb
    .from('cola_impresion')
    .select('id, contenido, descripcion')
    .eq('equipo_id', equipo.id)
    .eq('estado', 'pendiente')
    .order('created_at', { ascending: true })
    .limit(MAXIMO_POR_VEZ);

  // Un fallo al leer la cola tiene que verse. Si se devolviera una lista vacía,
  // el agente entendería "no hay nada que imprimir" y el ticket se perdería en
  // silencio con el cliente esperando en el mostrador.
  if (error) {
    return NextResponse.json(
      { ok: false, error: `no se pudo leer la cola: ${error.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    equipo: equipo.nombre,
    impresora: equipo.impresora ?? null,
    trabajos: trabajos ?? [],
  });
}
