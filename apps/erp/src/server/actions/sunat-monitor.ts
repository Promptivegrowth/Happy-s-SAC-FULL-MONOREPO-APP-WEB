'use server';

/**
 * El estado de la facturación electrónica, en una sola mirada.
 *
 * La pantalla de comprobantes mostraba una lista con el estado de cada
 * documento, y eso contesta "¿esta boleta se aceptó?" pero no "¿está todo en
 * orden?". Para saberlo había que recorrer doscientas filas a ojo.
 *
 * Además, una boleta emitida hoy figura como BORRADOR hasta las 23:00, que es
 * cuando se arma el resumen del día. Visto suelto, ese BORRADOR asusta: parece
 * un comprobante que no se envió, cuando en realidad está esperando su turno.
 * Acá se calcula lo que hace falta para decirlo con todas las letras.
 */

import { createClient } from '@happy/db/server';

import { type EstadoSunat } from './sunat-monitor-tipos';

const TIPOS_SUNAT = ['BOLETA', 'FACTURA', 'NOTA_CREDITO', 'NOTA_DEBITO'];

export async function estadoSunat(): Promise<EstadoSunat> {
  const sb = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sbAny = sb as unknown as { from: (t: string) => any };

  const ahoraLima = new Date(Date.now() - 5 * 3600 * 1000);
  const horaLima = ahoraLima.getUTCHours();
  const hoyLima = ahoraLima.toISOString().slice(0, 10);
  const hace24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  const [comps, log, resumenes, config] = await Promise.all([
    sbAny.from('comprobantes')
      .select('tipo, estado, fecha_emision, anulado_en, venta_id')
      .in('tipo', TIPOS_SUNAT)
      .order('fecha_emision', { ascending: false })
      .limit(1000),
    sbAny.from('sunat_envios_log')
      .select('ejecutado_en, fallidos')
      .order('ejecutado_en', { ascending: false })
      .limit(500),
    sbAny.from('sunat_resumenes')
      .select('resumen_id, fecha_referencia, estado, cantidad_boletas, sunat_codigo, sunat_descripcion, created_at')
      .order('created_at', { ascending: false })
      .limit(200),
    sbAny.from('sunat_config')
      .select('ambiente, certificado_vencimiento')
      .eq('activo', true)
      .maybeSingle(),
  ]);

  type Comp = { tipo: string; estado: string; fecha_emision: string; anulado_en: string | null; venta_id: string | null };
  const filas = (comps.data ?? []) as Comp[];
  // Ventas que ya tienen un comprobante aceptado: si otro de la misma venta
  // quedó rechazado, ya se reemplazó (F006-00000037 → F006-00000039).
  const ventasResueltas = new Set(filas.filter((c) => c.estado === 'ACEPTADO' && c.venta_id).map((c) => c.venta_id as string));

  let aceptados = 0, enEspera = 0, atrasados = 0, conProblema = 0, anulados = 0;
  for (const c of filas) {
    if (c.estado === 'ACEPTADO') { aceptados++; continue; }
    if (c.estado === 'ANULADO') { anulados++; continue; }
    if (c.estado === 'RECHAZADO' && c.venta_id && ventasResueltas.has(c.venta_id)) { anulados++; continue; }
    if (c.estado === 'RECHAZADO' || c.estado === 'OBSERVADO') { conProblema++; continue; }

    /*
     * Lo demás está en camino. Separar "esperando su turno" de "atrasado" es
     * todo el sentido de este panel: lo primero es el funcionamiento normal y
     * lo segundo es lo único que pide una acción.
     */
    if (c.fecha_emision < hace24h) atrasados++;
    else enEspera++;
  }

  const corridas = (log.data ?? []) as Array<{ ejecutado_en: string; fallidos: number | null }>;
  const ultima = corridas[0]?.ejecutado_en ?? null;

  const cfg = (config.data ?? null) as { ambiente: string; certificado_vencimiento: string | null } | null;
  const vence = cfg?.certificado_vencimiento ?? null;
  const dias = vence
    ? Math.round((new Date(`${vence}T00:00:00Z`).getTime() - new Date(`${hoyLima}T00:00:00Z`).getTime()) / 86_400_000)
    : null;

  return {
    aceptados, enEspera, atrasados, conProblema, anulados,
    ultimaCorrida: ultima
      ? new Date(new Date(ultima).getTime() - 5 * 3600 * 1000)
          .toISOString().slice(0, 16).replace('T', ' ')
      : null,
    corridas: corridas.length,
    fallosAcumulados: corridas.reduce((s, c) => s + Number(c.fallidos ?? 0), 0),
    horaLima,
    certificadoVence: vence,
    certificadoDias: dias,
    ambiente: cfg?.ambiente ?? null,
    resumenes: unoPorDia((resumenes.data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      resumen_id: String(r.resumen_id ?? ''),
      fecha_referencia: String(r.fecha_referencia ?? ''),
      estado: String(r.estado ?? ''),
      cantidad_boletas: Number(r.cantidad_boletas ?? 0),
      codigo: (r.sunat_codigo as string | null) ?? null,
      descripcion: (r.sunat_descripcion as string | null) ?? null,
    })),
  };
}

/**
 * Un resumen por día informado, el que cuenta: el aceptado si lo hay, si no el
 * que espera respuesta, si no el último intento. Con SUNAT cortando envíos
 * (11/10/2026) un mismo día junta intentos en ERROR que ya no dicen nada.
 */
function unoPorDia(rows: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const peso = (e: unknown) => (e === 'ACEPTADO' ? 3 : e === 'EN_PROCESO' ? 2 : 1);
  const porDia = new Map<string, Record<string, unknown>>();
  for (const r of rows) { // vienen del más nuevo al más viejo
    const dia = String(r.fecha_referencia ?? '');
    const prev = porDia.get(dia);
    if (!prev || peso(r.estado) > peso(prev.estado)) porDia.set(dia, r);
  }
  return [...porDia.values()]
    .sort((a, b) => String(b.fecha_referencia).localeCompare(String(a.fecha_referencia)))
    .slice(0, 10);
}
