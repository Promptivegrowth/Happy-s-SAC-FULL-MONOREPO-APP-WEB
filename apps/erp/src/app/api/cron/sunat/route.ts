/**
 * ENVÍO AUTOMÁTICO A SUNAT — corre solo, cada pocos minutos.
 *
 * Por qué existe: el POS emite el comprobante y NO llama a SUNAT en el momento,
 * para que una caída de SUNAT jamás frene una venta. Pero el plazo legal de
 * envío corre desde la emisión, así que el comprobante tiene que salir sí o sí,
 * aunque nadie entre al ERP. Esta ruta es la que se encarga:
 *
 *   1. Envía los comprobantes pendientes (con reintentos espaciados).
 *   2. Genera el Resumen Diario de las boletas del día anterior.
 *   3. Deja constancia de la corrida en sunat_envios_log.
 *
 * Seguridad: solo responde con el header `Authorization: Bearer <CRON_SECRET>`,
 * que es lo que manda Vercel Cron. Sin el secreto, 401.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { fechaLima } from '@happy/lib/format';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Espera entre reintentos: 5 min, 15 min, 1 h, 4 h, 12 h. */
const ESPERA_POR_INTENTO_MIN = [5, 15, 60, 240, 720];
/** Cuántos comprobantes se envían por corrida (SUNAT limita la frecuencia). */
const LOTE = 15;
/** Pausa entre envíos, para no gatillar el control de frecuencia de SUNAT. */
const PAUSA_MS = 2500;

function sbAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export async function GET(request: Request) {
  const inicio = Date.now();
  const secreto = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  if (!secreto || auth !== `Bearer ${secreto}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = sbAdmin() as any;
  const detalle: string[] = [];
  let enviados = 0, aceptados = 0, fallidos = 0;

  // ------------------------------------------------- 1. cola de envío ------
  const ahora = new Date().toISOString();
  const { data: pendientes } = await sb
    .from('comprobantes')
    .select('id, tipo, numero_completo, sunat_intentos, fecha_emision')
    .in('estado', ['BORRADOR', 'EMITIDO', 'RECHAZADO'])
    .in('tipo', ['FACTURA', 'NOTA_CREDITO', 'NOTA_DEBITO'])   // las boletas van por resumen diario
    .or(`sunat_proximo_intento.is.null,sunat_proximo_intento.lte.${ahora}`)
    .order('fecha_emision', { ascending: true })
    .limit(LOTE);

  type Pendiente = { id: string; tipo: string; numero_completo: string | null; sunat_intentos: number | null };
  const cola = (pendientes ?? []) as Pendiente[];

  if (cola.length > 0) {
    // Mismo núcleo que usa la emisión manual, pero con el cliente de servicio:
    // el cron no tiene sesión de usuario.
    const { emitirComprobanteConCliente } = await import('@/server/sunat-core');

    for (const comp of cola) {
      enviados++;
      try {
        const r = await emitirComprobanteConCliente(sb, comp.id);
        if (r.codigo === '0') {
          aceptados++;
          detalle.push(`${comp.numero_completo}: aceptado (${r.codigo})`);
        } else {
          fallidos++;
          const intentos = (comp.sunat_intentos ?? 0) + 1;
          const esperaMin = ESPERA_POR_INTENTO_MIN[Math.min(intentos - 1, ESPERA_POR_INTENTO_MIN.length - 1)]!;
          await sb.from('comprobantes').update({
            sunat_intentos: intentos,
            sunat_ultimo_error: `[${r.codigo}] ${r.descripcion}`.slice(0, 500),
            sunat_proximo_intento: new Date(Date.now() + esperaMin * 60_000).toISOString(),
          }).eq('id', comp.id);
          detalle.push(`${comp.numero_completo}: [${r.codigo}] ${r.descripcion.slice(0, 110)} (reintento en ${esperaMin} min)`);
        }
      } catch (e) {
        fallidos++;
        const intentos = (comp.sunat_intentos ?? 0) + 1;
        const esperaMin = ESPERA_POR_INTENTO_MIN[Math.min(intentos - 1, ESPERA_POR_INTENTO_MIN.length - 1)]!;
        await sb.from('comprobantes').update({
          sunat_intentos: intentos,
          sunat_ultimo_error: (e as Error).message.slice(0, 500),
          sunat_proximo_intento: new Date(Date.now() + esperaMin * 60_000).toISOString(),
        }).eq('id', comp.id);
        detalle.push(`${comp.numero_completo}: error ${(e as Error).message.slice(0, 120)}`);
      }
      await new Promise((r) => setTimeout(r, PAUSA_MS));
    }
  }

  // ----------------------------- 2. tickets de resúmenes ya enviados -------
  // El resumen es asíncrono: SUNAT devuelve un ticket y el CDR se recoge
  // después. Hasta que no se recoge, las boletas informadas siguen figurando
  // como pendientes, así que hay que consultarlo en cada corrida.
  let resumenesCerrados = 0;
  try {
    const { consultarResumenConCliente } = await import('@/server/sunat-core');
    const { data: enProceso } = await sb
      .from('sunat_resumenes')
      .select('id, resumen_id')
      .eq('estado', 'EN_PROCESO')
      .not('ticket', 'is', null)
      .limit(10);
    for (const res of (enProceso ?? []) as Array<{ id: string; resumen_id: string }>) {
      const r = await consultarResumenConCliente(sb, res.id);
      if (r.estado !== 'EN_PROCESO') resumenesCerrados++;
      detalle.push(`ticket ${res.resumen_id}: ${r.estado}${r.codigo ? ` (${r.codigo})` : ''}`);
      await new Promise((x) => setTimeout(x, 1500));
    }
  } catch (e) {
    detalle.push(`consulta de tickets: error ${(e as Error).message.slice(0, 140)}`);
  }

  // --------------------------------------- 3. resumen diario de boletas ----
  // Se informan TODOS los días cerrados que tengan boletas pendientes, no solo
  // el de ayer: si una corrida falló o el sistema estuvo caído, esas boletas no
  // pueden quedar huérfanas. Hoy no entra porque el día aún no cierra.
  const resumenesEnviados: string[] = [];
  try {
    const inicioHoyLima = `${fechaLima()}T05:00:00.000Z`;
    const { data: boletasPendientes } = await sb
      .from('comprobantes')
      .select('fecha_emision')
      .eq('tipo', 'BOLETA')
      .in('estado', ['BORRADOR', 'EMITIDO', 'RECHAZADO'])
      .lt('fecha_emision', inicioHoyLima)
      .order('fecha_emision', { ascending: true })
      .limit(500);

    const fechas = [...new Set(((boletasPendientes ?? []) as Array<{ fecha_emision: string }>)
      .map((b) => fechaLima(b.fecha_emision)))].slice(0, 3); // máximo 3 días por corrida

    if (fechas.length > 0) {
      const { generarResumenDiarioConCliente } = await import('@/server/sunat-core');
      for (const fecha of fechas) {
        try {
          const r = await generarResumenDiarioConCliente(sb, fecha);
          resumenesEnviados.push(fecha);
          detalle.push(`resumen ${fecha}: ${r.resumenId} con ${r.cantidad} boleta(s), ticket ${r.ticket}`);
        } catch (e) {
          detalle.push(`resumen ${fecha}: ${(e as Error).message.slice(0, 140)}`);
        }
        await new Promise((x) => setTimeout(x, 2500));
      }
    }
  } catch (e) {
    detalle.push(`resúmenes: error ${(e as Error).message.slice(0, 160)}`);
  }
  const resumenDiario = resumenesEnviados.length > 0 ? resumenesEnviados.join(', ') : 'sin novedad';

  // ------------------------------- 4. alerta de plazo (norma peruana) ------
  // El plazo legal de envío corre desde la emisión. Si un comprobante lleva más
  // de 24 horas sin ser aceptado, alguien tiene que enterarse antes de que se
  // venza: se avisa a gerencia una vez al día.
  const hace24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count: vencidos } = await sb
    .from('comprobantes')
    .select('id', { count: 'exact', head: true })
    .in('estado', ['BORRADOR', 'EMITIDO', 'RECHAZADO'])
    .lt('fecha_emision', hace24h);

  if ((vencidos ?? 0) > 0) {
    const { data: avisoPrevio } = await sb
      .from('notificaciones')
      .select('id')
      .eq('tipo', 'SUNAT_PENDIENTE')
      .gte('created_at', new Date(Date.now() - 20 * 3600 * 1000).toISOString())
      .limit(1);
    if ((avisoPrevio ?? []).length === 0) {
      await sb.from('notificaciones').insert({
        destinatario_rol: 'gerente',
        tipo: 'SUNAT_PENDIENTE',
        titulo: `${vencidos} comprobante(s) sin aceptar por SUNAT`,
        mensaje: 'Llevan más de 24 horas emitidos sin respuesta conforme de SUNAT. Revísalos antes de que venza el plazo de envío.',
        enlace: '/comprobantes?estado=pendientes',
      });
      detalle.push(`alerta: ${vencidos} comprobante(s) con más de 24 h sin aceptar`);
    }
  }

  // ------------------------------------------------------- 5. bitácora ----
  await sb.from('sunat_envios_log').insert({
    enviados, aceptados, fallidos,
    resumen_diario: resumenesEnviados.length > 0 ? resumenesEnviados.join(',').slice(0, 100) : null,
    detalle: detalle.join(' | ').slice(0, 4000),
    duracion_ms: Date.now() - inicio,
  });

  return NextResponse.json({
    ok: true,
    enviados, aceptados, fallidos,
    pendientes_mas_24h: vencidos ?? 0,
    resumen_diario: resumenDiario,
    resumenes_cerrados: resumenesCerrados,
    duracion_ms: Date.now() - inicio,
    detalle,
  });
}
