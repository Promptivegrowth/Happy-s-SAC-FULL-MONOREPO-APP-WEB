/**
 * NÚCLEO DE LA GUÍA DE REMISIÓN ELECTRÓNICA — sin 'use server'.
 *
 * Arma, firma, envía y consulta guías contra la API REST de SUNAT. Lo usan la
 * pantalla (al emitir) y el envío automático (cron), siempre con el cliente de
 * servicio: la configuración SUNAT —certificado, clave SOL, credenciales de la
 * API— solo la lee gerencia, y una guía la emite también quien atiende en
 * tienda. Quién puede emitir se controla antes, en la server action.
 *
 * El envío es asíncrono: SUNAT devuelve un ticket y la respuesta se recoge
 * después. Al emitir se espera unos segundos por si responde enseguida (lo
 * normal); si no, el cron la recoge en la corrida siguiente.
 */

import {
  generarUBLDespatch, firmarUBL, empaquetarZip, digestSHA1,
  obtenerTokenGRE, enviarGRE, consultarTicketGRE, formatearNumeroComprobante,
  type GuiaRemisionInput, type MotivoTraslado, type GreCredenciales,
} from '@happy/lib/sunat-ubl';
import { fechaLima, horaLima } from '@happy/lib/format';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ClienteSb = any;

/** Espera entre reintentos de envío: 5 min, 15 min, 1 h, 4 h. Después se deja de insistir. */
export const ESPERA_REINTENTO_MIN = [5, 15, 60, 240];

const TIPO_DOC: Record<string, string> = { DNI: '1', RUC: '6', CE: '4', PASAPORTE: '7' };
export function tipoDocSunat(t: string | null | undefined): string {
  return TIPO_DOC[t ?? ''] ?? (t && /^[0-9A-Z]$/.test(t) ? t : '1');
}

type Config = {
  usuario_sol: string; clave_sol: string;
  certificado_pfx_base64: string | null; certificado_password: string | null;
  gre_client_id: string | null; gre_client_secret: string | null;
  gre_token: string | null; gre_token_expira: string | null;
};

async function cargarEmpresaYConfig(sb: ClienteSb) {
  const { data: empresa } = await sb.from('empresa').select('id, ruc, razon_social').single();
  if (!empresa) throw new Error('Empresa no configurada');
  const { data: cfg } = await sb.from('sunat_config').select('*').eq('empresa_id', empresa.id).maybeSingle();
  const config = cfg as Config | null;
  if (!config?.certificado_pfx_base64 || !config.certificado_password) {
    throw new Error('Falta el certificado digital en Configuración → SUNAT.');
  }
  return { empresa: empresa as { id: string; ruc: string; razon_social: string }, config };
}

/** Si ya están cargadas las credenciales de la API (en Configuración o en Vercel). */
export async function hayCredencialesGRE(sb: ClienteSb): Promise<boolean> {
  if (process.env.SUNAT_GRE_CLIENT_ID && process.env.SUNAT_GRE_CLIENT_SECRET) return true;
  const { data } = await sb.from('sunat_config').select('gre_client_id, gre_client_secret').limit(1).maybeSingle();
  return Boolean(data?.gre_client_id && data?.gre_client_secret);
}

/**
 * Token de la API, reutilizado mientras le quede vida.
 *
 * Las credenciales salen de Configuración → SUNAT o, si ahí no están, de las
 * variables SUNAT_GRE_CLIENT_ID / SUNAT_GRE_CLIENT_SECRET de Vercel.
 */
async function tokenVigente(sb: ClienteSb, empresaId: string, ruc: string, config: Config): Promise<string> {
  if (config.gre_token && config.gre_token_expira && new Date(config.gre_token_expira).getTime() - Date.now() > 120_000) {
    return config.gre_token;
  }
  const clientId = config.gre_client_id || process.env.SUNAT_GRE_CLIENT_ID || '';
  const clientSecret = config.gre_client_secret || process.env.SUNAT_GRE_CLIENT_SECRET || '';
  if (!clientId || !clientSecret) {
    throw new Error(
      'Faltan las credenciales de la API de SUNAT para guías (client_id y client_secret). '
      + 'Se generan en SOL → Credenciales de API SUNAT y se cargan en Configuración → SUNAT.',
    );
  }
  const cred: GreCredenciales = { clientId, clientSecret, ruc, usuarioSol: config.usuario_sol, claveSol: config.clave_sol };
  const t = await obtenerTokenGRE(cred);
  if (!t.ok) throw new Error(t.error);
  await sb.from('sunat_config').update({
    gre_token: t.token,
    gre_token_expira: new Date(Date.now() + t.expiraEnSeg * 1000).toISOString(),
  }).eq('empresa_id', empresaId);
  return t.token;
}

type GuiaFila = {
  id: string; serie: string; numero: number; numero_completo: string | null; estado: string;
  fecha_emision: string; fecha_traslado: string; fecha_entrega_transportista: string | null;
  motivo_traslado: string; motivo_descripcion: string | null; modalidad: 'PUBLICO' | 'PRIVADO';
  destinatario_tipo_doc: string; destinatario_num_doc: string; destinatario_nombre: string;
  transportista_ruc: string | null; transportista_razon_social: string | null; transportista_mtc: string | null;
  placa_vehiculo: string | null; conductor_dni: string | null; conductor_nombre: string | null;
  conductor_apellidos: string | null; conductor_licencia: string | null; vehiculo_m1l: boolean;
  direccion_partida: string; ubigeo_partida: string; cod_establecimiento_partida: string | null;
  direccion_llegada: string; ubigeo_llegada: string; cod_establecimiento_llegada: string | null;
  peso_bruto_kg: number; num_bultos: number | null; observacion: string | null;
  comprobante_id: string | null; sunat_ticket: string | null; sunat_intentos: number;
};

/** De la fila guardada al formato que entiende el generador. */
export async function armarInput(sb: ClienteSb, g: GuiaFila, emisor: { ruc: string; razonSocial: string }): Promise<GuiaRemisionInput> {
  const { data: items } = await sb.from('guias_remision_items')
    .select('codigo, descripcion, cantidad, unidad').eq('guia_id', g.id).order('id');

  let documentoRelacionado: GuiaRemisionInput['documentoRelacionado'];
  if (g.comprobante_id) {
    const { data: c } = await sb.from('comprobantes').select('tipo, serie, numero').eq('id', g.comprobante_id).maybeSingle();
    if (c?.serie && (c.tipo === 'FACTURA' || c.tipo === 'BOLETA')) {
      // El número tal como se le mandó a SUNAT (7 dígitos), no el de la base
      // (8): tiene que coincidir con el comprobante que SUNAT tiene registrado.
      documentoRelacionado = { tipo: c.tipo === 'FACTURA' ? '01' : '03', serieNumero: formatearNumeroComprobante(c.serie, Number(c.numero)) };
    }
  }

  const publico = g.modalidad === 'PUBLICO';
  return {
    serie: g.serie,
    numero: Number(g.numero),
    fechaEmision: fechaLima(g.fecha_emision),
    horaEmision: horaLima(g.fecha_emision) || '12:00:00',
    observacion: g.observacion ?? undefined,
    emisor,
    destinatario: { tipoDoc: g.destinatario_tipo_doc, numDoc: g.destinatario_num_doc, nombre: g.destinatario_nombre },
    documentoRelacionado,
    motivo: g.motivo_traslado as MotivoTraslado,
    motivoDescripcion: g.motivo_descripcion ?? undefined,
    modalidad: publico ? '01' : '02',
    fechaTraslado: String(g.fecha_traslado).slice(0, 10),
    fechaEntregaTransportista: g.fecha_entrega_transportista ? String(g.fecha_entrega_transportista).slice(0, 10) : undefined,
    pesoBrutoKg: Number(g.peso_bruto_kg),
    numBultos: g.num_bultos ?? undefined,
    transportista: publico ? {
      ruc: g.transportista_ruc ?? '', razonSocial: g.transportista_razon_social ?? '',
      registroMtc: g.transportista_mtc ?? undefined,
    } : undefined,
    vehiculoPlaca: publico ? undefined : (g.placa_vehiculo ?? undefined),
    vehiculoM1L: !publico && g.vehiculo_m1l,
    conductor: !publico && !g.vehiculo_m1l ? {
      tipoDoc: '1', numDoc: g.conductor_dni ?? '', nombres: g.conductor_nombre ?? '',
      apellidos: g.conductor_apellidos ?? '', licencia: g.conductor_licencia ?? '',
    } : undefined,
    partida: { ubigeo: g.ubigeo_partida, direccion: g.direccion_partida, codigoEstablecimiento: g.cod_establecimiento_partida ?? undefined },
    llegada: { ubigeo: g.ubigeo_llegada, direccion: g.direccion_llegada, codigoEstablecimiento: g.cod_establecimiento_llegada ?? undefined },
    items: ((items ?? []) as Array<{ codigo: string | null; descripcion: string; cantidad: number; unidad: string | null }>).map((i) => ({
      codigo: i.codigo ?? undefined, descripcion: i.descripcion, cantidad: Number(i.cantidad), unidad: i.unidad ?? 'NIU',
    })),
  };
}

export type ResultadoGuia = { estado: string; mensaje: string };

/**
 * Consulta el ticket y, si SUNAT ya respondió, archiva el CDR y cierra la guía.
 * No lanza por un "todavía procesando": eso es normal y se vuelve a mirar luego.
 */
export async function consultarGuiaConCliente(sb: ClienteSb, guiaId: string): Promise<ResultadoGuia> {
  const { empresa, config } = await cargarEmpresaYConfig(sb);
  const { data: g } = await sb.from('guias_remision')
    .select('id, numero_completo, estado, sunat_ticket').eq('id', guiaId).single();
  if (!g) throw new Error('Guía no encontrada');
  if (!g.sunat_ticket) throw new Error('La guía todavía no se envió a SUNAT.');
  if (g.estado === 'ACEPTADO' || g.estado === 'RECHAZADO') return { estado: g.estado, mensaje: 'Ya tenía respuesta de SUNAT.' };

  const token = await tokenVigente(sb, empresa.id, empresa.ruc, config);
  const st = await consultarTicketGRE({ token, ticket: g.sunat_ticket });
  if (!st.ok) throw new Error(st.error);
  if (st.estado === 'EN_PROCESO') return { estado: 'EMITIDO', mensaje: 'SUNAT todavía la está procesando.' };

  let cdrPath: string | null = null;
  if (st.cdrZipBase64) {
    cdrPath = `comprobantes/${empresa.ruc}/GUIA/R-${empresa.ruc}-09-${g.numero_completo}.zip`;
    await sb.storage.from('comprobantes').upload(cdrPath, new Blob([Buffer.from(st.cdrZipBase64, 'base64')], { type: 'application/zip' }), {
      upsert: true, contentType: 'application/zip',
    });
  }
  const obs = st.cdr?.observaciones?.length ? ` · Obs.: ${st.cdr.observaciones.join(' / ')}` : '';
  const mensaje = `${st.descripcion}${obs}`.slice(0, 1000);
  await sb.from('guias_remision').update({
    estado: st.estado,
    sunat_codigo: st.codigo,
    sunat_mensaje: mensaje,
    cdr_url: cdrPath,
    qr_url: st.cdr?.qrUrl ?? null,
    sunat_aceptado_en: st.estado === 'ACEPTADO' ? new Date().toISOString() : null,
    sunat_proximo_intento: null,
    updated_at: new Date().toISOString(),
  }).eq('id', guiaId);
  return { estado: st.estado, mensaje };
}

/**
 * Envía una guía a SUNAT y espera unos segundos la respuesta.
 *
 * Si algo falla ANTES de que SUNAT dé ticket (sin conexión, token, SUNAT
 * saturado), la guía queda en BORRADOR con el motivo y el cron la reintenta: el
 * número no se pierde porque SUNAT nunca la registró. Con ticket, en cambio, el
 * número ya es de SUNAT y solo queda consultar.
 */
export async function enviarGuiaConCliente(sb: ClienteSb, guiaId: string, esperarSeg = 10): Promise<ResultadoGuia> {
  const { data: fila } = await sb.from('guias_remision').select('*').eq('id', guiaId).single();
  const g = fila as GuiaFila | null;
  if (!g) throw new Error('Guía no encontrada');
  if (g.estado === 'ACEPTADO') return { estado: 'ACEPTADO', mensaje: 'Ya estaba aceptada por SUNAT.' };
  if (g.estado === 'RECHAZADO' || g.estado === 'ANULADO') throw new Error('Una guía rechazada o anulada no se reenvía: hay que emitir otra.');
  if (g.sunat_ticket) return consultarGuiaConCliente(sb, guiaId);

  const registrarFallo = async (mensaje: string) => {
    const intentos = (g.sunat_intentos ?? 0) + 1;
    const espera = ESPERA_REINTENTO_MIN[intentos - 1];
    await sb.from('guias_remision').update({
      estado: 'BORRADOR',
      sunat_mensaje: mensaje.slice(0, 1000),
      sunat_intentos: intentos,
      // Pasados los reintentos se deja de insistir: algo hay que corregir a mano.
      sunat_proximo_intento: espera ? new Date(Date.now() + espera * 60_000).toISOString() : null,
      updated_at: new Date().toISOString(),
    }).eq('id', guiaId);
  };

  try {
    const { empresa, config } = await cargarEmpresaYConfig(sb);
    const input = await armarInput(sb, g, { ruc: empresa.ruc, razonSocial: empresa.razon_social });
    const { xml, nombreArchivo } = generarUBLDespatch(input);
    const firmado = firmarUBL(xml, { pfxBase64: config.certificado_pfx_base64!, password: config.certificado_password! });
    const zip = await empaquetarZip(firmado, nombreArchivo);

    const xmlPath = `comprobantes/${empresa.ruc}/GUIA/${nombreArchivo}.xml`;
    await sb.storage.from('comprobantes').upload(xmlPath, new Blob([firmado], { type: 'application/xml' }), {
      upsert: true, contentType: 'application/xml',
    });

    const token = await tokenVigente(sb, empresa.id, empresa.ruc, config);
    const env = await enviarGRE({ token, nombreArchivo, zipBytes: zip });
    if (!env.ok) {
      // Token vencido o revocado: se descarta para que el próximo intento pida otro.
      if (env.httpStatus === 401) {
        await sb.from('sunat_config').update({ gre_token: null, gre_token_expira: null }).eq('empresa_id', empresa.id);
      }
      throw new Error(env.error);
    }

    await sb.from('guias_remision').update({
      estado: 'EMITIDO',
      xml_firmado_url: xmlPath,
      hash_firma: digestSHA1(firmado),
      sunat_ticket: env.ticket,
      sunat_enviado_en: new Date().toISOString(),
      sunat_mensaje: 'Enviada. Esperando respuesta de SUNAT.',
      sunat_intentos: (g.sunat_intentos ?? 0) + 1,
      sunat_proximo_intento: null,
      updated_at: new Date().toISOString(),
    }).eq('id', guiaId);
  } catch (e) {
    const msg = (e as Error).message;
    await registrarFallo(msg);
    return { estado: 'BORRADOR', mensaje: msg };
  }

  // SUNAT suele contestar en 2 a 5 segundos.
  const hasta = Date.now() + esperarSeg * 1000;
  let r: ResultadoGuia = { estado: 'EMITIDO', mensaje: 'Enviada. SUNAT todavía la está procesando.' };
  while (Date.now() < hasta) {
    await new Promise((x) => setTimeout(x, 2500));
    try {
      r = await consultarGuiaConCliente(sb, guiaId);
    } catch (e) {
      r = { estado: 'EMITIDO', mensaje: `Enviada; la respuesta se consulta de nuevo en unos minutos (${(e as Error).message}).` };
    }
    if (r.estado !== 'EMITIDO') break;
  }
  return r;
}
