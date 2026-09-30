/**
 * ENVÍO AUTOMÁTICO A SUNAT — corre solo, cada pocos minutos.
 *
 * Por qué existe: el POS emite el comprobante y NO llama a SUNAT en el momento,
 * para que una caída de SUNAT jamás frene una venta. Pero el plazo legal de
 * envío corre desde la emisión, así que el comprobante tiene que salir sí o sí,
 * aunque nadie entre al ERP. Esta ruta es la que se encarga:
 *
 *   1. Envía las FACTURAS y notas pendientes, al instante (con reintentos
 *      espaciados). Van una por una porque SUNAT responde en el momento si las
 *      acepta, y así un rechazo se corrige con el cliente todavía presente.
 *   2. Genera el Resumen Diario de las BOLETAS, que no se pueden mandar sueltas.
 *      Sale a las 23:00 hora de Perú, cuando la tienda ya cerró.
 *   3. Deja constancia de la corrida en sunat_envios_log.
 *
 * Seguridad: solo responde con el header `Authorization: Bearer <CRON_SECRET>`,
 * que es lo que manda Vercel Cron. Sin el secreto, 401.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { fechaLima, horaLima } from '@happy/lib/format';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Espera entre reintentos: 5 min, 15 min, 1 h, 4 h, 12 h. */
const ESPERA_POR_INTENTO_MIN = [5, 15, 60, 240, 720];
/** Cuántos comprobantes se envían por corrida (SUNAT limita la frecuencia). */
const LOTE = 15;
/** Pausa entre envíos, para no gatillar el control de frecuencia de SUNAT. */
const PAUSA_MS = 2500;

/**
 * Hora de Perú a partir de la cual se informan las boletas del día.
 *
 * Las boletas no se pueden mandar sueltas: van agrupadas en un resumen diario,
 * y ese resumen tiene sentido con el día terminado. Las 23:00 es cuando la
 * tienda ya cerró (acordado con el cliente el 15/09/2026); antes se esperaba a
 * la medianoche, lo que empujaba las boletas al día siguiente.
 */
const HORA_CIERRE_LIMA = 23;

/**
 * Hasta qué fecha se pueden informar boletas en este momento.
 *
 * Devuelve HOY solo si ya pasaron las 23:00 en Perú; si no, hasta ayer. Los días
 * anteriores siempre entran: si una corrida falló o el sistema estuvo caído,
 * esas boletas no pueden quedar sin informar.
 */
export function fechaMaximaInformable(
  // La fecha y la hora entran por parámetro para poder comprobar la regla a
  // cualquier hora del día sin esperar a que den las 23:00.
  hoy: string = fechaLima(),
  hora: number = Number(horaLima().slice(0, 2)),
): { hasta: string; motivo: string } {
  if (hora >= HORA_CIERRE_LIMA) {
    return { hasta: hoy, motivo: `pasadas las ${HORA_CIERRE_LIMA}:00, entra el día de hoy` };
  }
  const ayer = new Date(new Date(`${hoy}T12:00:00.000Z`).getTime() - 86_400_000)
    .toISOString().slice(0, 10);
  return { hasta: ayer, motivo: `el día en curso se informa a las ${HORA_CIERRE_LIMA}:00` };
}

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
  let cola = (pendientes ?? []) as Pendiente[];

  /*
   * Una nota de crédito o débito sale recién cuando SUNAT ya aceptó el
   * comprobante que corrige.
   *
   * Las boletas llegan a SUNAT en el resumen de las 23:00: la nota de crédito
   * de un cambio hecho en la mañana sobre una boleta del mismo día llegaría
   * antes que la boleta, y SUNAT la rechazaría por no encontrarla. Se la deja
   * esperando, sin contar intento, hasta la corrida siguiente al resumen.
   */
  const notas = cola.filter((c) => c.tipo === 'NOTA_CREDITO' || c.tipo === 'NOTA_DEBITO');
  if (notas.length > 0) {
    const { data: refs } = await sb.from('comprobantes')
      .select('id, documento_referencia_id').in('id', notas.map((n) => n.id));
    const refIds = ((refs ?? []) as { id: string; documento_referencia_id: string | null }[])
      .map((r) => r.documento_referencia_id).filter(Boolean) as string[];
    const { data: estados } = refIds.length
      ? await sb.from('comprobantes').select('id, numero_completo, estado').in('id', refIds)
      : { data: [] };
    const estadoDe = new Map(((estados ?? []) as { id: string; numero_completo: string; estado: string }[]).map((e) => [e.id, e]));
    const refDe = new Map(((refs ?? []) as { id: string; documento_referencia_id: string | null }[]).map((r) => [r.id, r.documento_referencia_id]));
    cola = cola.filter((c) => {
      if (c.tipo !== 'NOTA_CREDITO' && c.tipo !== 'NOTA_DEBITO') return true;
      const ref = estadoDe.get(refDe.get(c.id) ?? '');
      const listo = ref && (ref.estado === 'ACEPTADO' || ref.estado === 'OBSERVADO');
      if (!listo) detalle.push(`${c.numero_completo}: espera que SUNAT acepte ${ref?.numero_completo ?? 'su comprobante'}`);
      return Boolean(listo);
    });
  }

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
  // Se informan todos los días que ya cerraron y tengan boletas pendientes, no
  // solo el último: si una corrida falló o el sistema estuvo caído, esas
  // boletas no pueden quedar huérfanas.
  const resumenesEnviados: string[] = [];
  try {
    const { hasta, motivo } = fechaMaximaInformable();

    /*
     * Hay dos motivos para armar un resumen de un día: boletas nuevas sin
     * informar, y boletas anuladas cuya baja SUNAT todavía no conoce.
     *
     * El segundo caso es fácil de olvidar: una boleta de anteayer que se anula
     * hoy obliga a mandar un resumen de anteayer. Si solo se miraran las
     * pendientes de informar, esa baja no saldría nunca.
     */
    const { data: boletasPendientes } = await sb
      .from('comprobantes')
      .select('fecha_emision')
      .eq('tipo', 'BOLETA')
      .in('estado', ['BORRADOR', 'EMITIDO', 'RECHAZADO'])
      .order('fecha_emision', { ascending: true })
      .limit(500);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sbBajas = sb as unknown as { from: (t: string) => any };
    const { data: bajasPendientes } = await sbBajas
      .from('comprobantes')
      .select('fecha_emision')
      .eq('tipo', 'BOLETA')
      .eq('estado', 'ANULADO')
      .is('anulacion_informada_en', null)
      .order('fecha_emision', { ascending: true })
      .limit(500);

    /*
     * No se arma un resumen de una fecha que ya tiene otro esperando respuesta.
     *
     * El resumen es asíncrono: SUNAT devuelve un ticket y el CDR llega después.
     * Hasta que llega, las boletas que viajaron en él siguen figurando como
     * pendientes acá, y la corrida siguiente las metería en un resumen nuevo:
     * SUNAT lo rechaza por duplicado. Pasa sobre todo con las boletas que se
     * emiten después de las 23:00, que generan un segundo resumen del mismo día.
     */
    const { data: enCurso } = await sb
      .from('sunat_resumenes')
      .select('fecha_referencia')
      .eq('estado', 'EN_PROCESO');
    const esperandoCDR = new Set(
      ((enCurso ?? []) as Array<{ fecha_referencia: string }>)
        .map((r) => String(r.fecha_referencia).slice(0, 10)),
    );

    const fechas = [...new Set([
      ...((boletasPendientes ?? []) as Array<{ fecha_emision: string }>),
      ...((bajasPendientes ?? []) as Array<{ fecha_emision: string }>),
    ].map((b) => fechaLima(b.fecha_emision)))]
      .filter((f) => f <= hasta)
      .filter((f) => !esperandoCDR.has(f))
      .slice(0, 3); // máximo 3 días por corrida

    if (esperandoCDR.size > 0) {
      detalle.push(`esperando CDR de: ${[...esperandoCDR].join(', ')}`);
    }
    if ((bajasPendientes ?? []).length > 0) {
      detalle.push(`${(bajasPendientes ?? []).length} anulación(es) por comunicar`);
    }
    if (fechas.length === 0) detalle.push(`sin boletas por informar (${motivo})`);

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

  // ------------------------------------ 3b. guías de remisión (GRE) -------
  // Aparte y con su propio try: una guía que falla no puede frenar ni ensuciar
  // el envío de boletas y facturas, que es lo que corre arriba.
  //   - Las que quedaron sin llegar a SUNAT (sin conexión, SUNAT caído) se
  //     reintentan con espera creciente.
  //   - Las enviadas esperan respuesta: se consulta su ticket.
  let guiasCerradas = 0;
  try {
    const hace2min = new Date(Date.now() - 2 * 60_000).toISOString();
    const [{ data: porEnviar }, { data: porConsultar }] = await Promise.all([
      sb.from('guias_remision')
        .select('id, numero_completo')
        .eq('estado', 'BORRADOR')
        .is('sunat_ticket', null)
        // Con reintento vencido, o recién creadas que nunca llegaron a intentarse.
        .or(`sunat_proximo_intento.lte.${ahora},and(sunat_intentos.eq.0,created_at.lt.${hace2min})`)
        .order('created_at', { ascending: true })
        .limit(5),
      sb.from('guias_remision')
        .select('id, numero_completo')
        .eq('estado', 'EMITIDO')
        .not('sunat_ticket', 'is', null)
        .order('sunat_enviado_en', { ascending: true })
        .limit(10),
    ]);
    const pendientesGre = [
      ...((porEnviar ?? []) as Array<{ id: string; numero_completo: string }>).map((g) => ({ ...g, enviar: true })),
      ...((porConsultar ?? []) as Array<{ id: string; numero_completo: string }>).map((g) => ({ ...g, enviar: false })),
    ];
    if (pendientesGre.length > 0) {
      const { enviarGuiaConCliente, consultarGuiaConCliente } = await import('@/server/gre-core');
      for (const g of pendientesGre) {
        try {
          const r = g.enviar ? await enviarGuiaConCliente(sb, g.id, 0) : await consultarGuiaConCliente(sb, g.id);
          if (r.estado === 'ACEPTADO' || r.estado === 'RECHAZADO') guiasCerradas++;
          detalle.push(`guía ${g.numero_completo}: ${r.estado}${r.estado === 'ACEPTADO' ? '' : ` ${r.mensaje.slice(0, 100)}`}`);
        } catch (e) {
          detalle.push(`guía ${g.numero_completo}: error ${(e as Error).message.slice(0, 120)}`);
        }
        await new Promise((x) => setTimeout(x, 1000));
      }
    }
  } catch (e) {
    detalle.push(`guías: error ${(e as Error).message.slice(0, 140)}`);
  }

  // ------------------------------- 4. alerta de plazo (norma peruana) ------
  // El plazo legal de envío corre desde la emisión. Si un comprobante lleva más
  // de 24 horas sin ser aceptado, alguien tiene que enterarse antes de que se
  // venza: se avisa a gerencia una vez al día.
  const hace24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count: vencidos } = await sb
    .from('comprobantes')
    .select('id', { count: 'exact', head: true })
    /*
     * Solo los que SÍ van a SUNAT.
     *
     * Desde que la nota de venta se guarda como documento —para poder buscarla
     * por el número que sale impreso— hay filas que nunca se declaran. Sin este
     * filtro, cada nota emitida haría sonar la alerta de "comprobante vencido
     * sin enviar" al día siguiente, y gerencia terminaría ignorando el aviso
     * justo el día que sea de verdad.
     */
    .in('tipo', ['BOLETA', 'FACTURA', 'NOTA_CREDITO', 'NOTA_DEBITO'])
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
    guias_cerradas: guiasCerradas,
    duracion_ms: Date.now() - inicio,
    detalle,
  });
}
