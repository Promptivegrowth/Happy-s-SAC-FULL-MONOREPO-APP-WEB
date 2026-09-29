/**
 * API REST de SUNAT para la Guía de Remisión electrónica (plataforma nueva GRE).
 *
 * Tres pasos, todos con el mismo token:
 *
 *   1. Token: POST a api-seguridad con el client_id / client_secret que se
 *      generan en SOL ("Credenciales de API SUNAT") más el usuario SOL
 *      secundario. Dura una hora.
 *   2. Envío: POST del ZIP firmado en base64 con su SHA-256. SUNAT no contesta
 *      si la acepta: devuelve un número de ticket.
 *   3. Consulta del ticket: 98 = todavía procesando, 0 = aceptada (con CDR),
 *      99 = rechazada (con CDR si llegó a generarse).
 *
 * Ref: "Manual de Servicios Web Plataforma Nueva GRE" (cpe.sunat.gob.pe).
 */

import { createHash } from 'node:crypto';

export const GRE_API_PRODUCCION = {
  seguridad: 'https://api-seguridad.sunat.gob.pe/v1',
  cpe: 'https://api-cpe.sunat.gob.pe/v1',
};

export type GreEndpoints = { seguridad: string; cpe: string };

export type GreCredenciales = {
  clientId: string;
  clientSecret: string;
  ruc: string;
  usuarioSol: string;   // sin el RUC delante: 'FAC3TURS'
  claveSol: string;
};

/**
 * Lo que dice SUNAT cuando algo falla, en una línea legible.
 *
 * Los errores vienen en dos formas —generales `{cod, msg}` y de validación
 * `{cod: 422, errors: [{codError, desError}]}`— y el de token es OAuth
 * `{error, error_description}`. Se juntan acá para que la pantalla muestre el
 * motivo real y no "Error 422".
 */
function motivoError(status: number, cuerpo: string): string {
  try {
    const j = JSON.parse(cuerpo) as {
      cod?: string; msg?: string; error?: string | { numError?: string; desError?: string };
      error_description?: string; errors?: Array<{ codError?: string; desError?: string }>;
    };
    if (j.errors?.length) return j.errors.map((e) => `[${e.codError ?? '?'}] ${e.desError ?? ''}`.trim()).join(' · ');
    if (typeof j.error === 'string') return `${j.error}${j.error_description ? `: ${j.error_description}` : ''}`;
    if (j.msg) return `[${j.cod ?? status}] ${j.msg}`;
  } catch { /* no era JSON */ }
  return `HTTP ${status}${cuerpo ? `: ${cuerpo.slice(0, 200)}` : ''}`;
}

/** fetch con un reintento si SUNAT está saturado (429 / 5xx), que pasa seguido en temporada. */
async function fetchConReintento(url: string, init: RequestInit): Promise<{ status: number; text: string }> {
  let ultimo = { status: 0, text: '' };
  for (let intento = 1; intento <= 2; intento++) {
    const r = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
    ultimo = { status: r.status, text: await r.text() };
    if (!(r.status === 429 || r.status >= 500) || intento === 2) return ultimo;
    await new Promise((x) => setTimeout(x, 3000));
  }
  return ultimo;
}

export async function obtenerTokenGRE(
  c: GreCredenciales,
  ep: GreEndpoints = GRE_API_PRODUCCION,
): Promise<{ ok: true; token: string; expiraEnSeg: number } | { ok: false; error: string }> {
  const body = new URLSearchParams({
    grant_type: 'password',
    scope: 'https://api-cpe.sunat.gob.pe',
    client_id: c.clientId,
    client_secret: c.clientSecret,
    username: `${c.ruc}${c.usuarioSol}`,
    password: c.claveSol,
  });
  let r: { status: number; text: string };
  try {
    r = await fetchConReintento(`${ep.seguridad}/clientessol/${encodeURIComponent(c.clientId)}/oauth2/token/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: body.toString(),
    });
  } catch (e) {
    return { ok: false, error: `Sin conexión con SUNAT: ${(e as Error).message}` };
  }
  if (r.status !== 200) return { ok: false, error: `SUNAT no dio acceso: ${motivoError(r.status, r.text)}` };
  try {
    const j = JSON.parse(r.text) as { access_token?: string; expires_in?: number };
    if (!j.access_token) return { ok: false, error: 'SUNAT no devolvió el token.' };
    return { ok: true, token: j.access_token, expiraEnSeg: Number(j.expires_in ?? 3600) };
  } catch {
    return { ok: false, error: `Respuesta de token ilegible: ${r.text.slice(0, 200)}` };
  }
}

/** SHA-256 en hexadecimal, que es lo que SUNAT compara contra el ZIP recibido. */
export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export type EnvioGreResult =
  | { ok: true; ticket: string; recibidoEn: string | null }
  | { ok: false; error: string; httpStatus?: number };

export async function enviarGRE(args: {
  token: string;
  nombreArchivo: string;   // RUC-09-T001-0000001, sin extensión
  zipBytes: Uint8Array;
  ep?: GreEndpoints;
}): Promise<EnvioGreResult> {
  const ep = args.ep ?? GRE_API_PRODUCCION;
  const payload = {
    archivo: {
      nomArchivo: `${args.nombreArchivo}.zip`,
      arcGreZip: Buffer.from(args.zipBytes).toString('base64'),
      hashZip: sha256Hex(args.zipBytes),
    },
  };
  let r: { status: number; text: string };
  try {
    r = await fetchConReintento(`${ep.cpe}/contribuyente/gem/comprobantes/${encodeURIComponent(args.nombreArchivo)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${args.token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    return { ok: false, error: `Sin conexión con SUNAT: ${(e as Error).message}` };
  }
  if (r.status !== 200) return { ok: false, error: motivoError(r.status, r.text), httpStatus: r.status };
  try {
    const j = JSON.parse(r.text) as { numTicket?: string; fecRecepcion?: string };
    if (!j.numTicket) return { ok: false, error: `SUNAT no devolvió ticket: ${r.text.slice(0, 200)}`, httpStatus: r.status };
    return { ok: true, ticket: j.numTicket, recibidoEn: j.fecRecepcion ?? null };
  } catch {
    return { ok: false, error: `Respuesta ilegible: ${r.text.slice(0, 200)}`, httpStatus: r.status };
  }
}

export type CdrGre = { codigo: string; descripcion: string; observaciones: string[]; qrUrl: string | null };

/**
 * Lee el CDR de una guía.
 *
 * Además del código de respuesta trae el enlace del QR: la representación
 * impresa de la GRE tiene que llevar ESE código QR, el que da SUNAT, para que la
 * agencia o la policía verifiquen la guía escaneándolo.
 */
export async function leerCdrGRE(cdrZipBase64: string): Promise<CdrGre> {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(cdrZipBase64, { base64: true });
  const nombre = Object.keys(zip.files).find((n) => n.toLowerCase().endsWith('.xml'));
  if (!nombre) throw new Error('CDR sin archivo XML');
  const xml = await zip.files[nombre]!.async('string');
  const codigo = xml.match(/<cbc:ResponseCode[^>]*>([^<]+)<\/cbc:ResponseCode>/)?.[1]?.trim() ?? '';
  const descripciones = [...xml.matchAll(/<cbc:Description[^>]*>([^<]+)<\/cbc:Description>/g)].map((m) => m[1]!.trim());
  const notas = [...xml.matchAll(/<cbc:Note[^>]*>([^<]+)<\/cbc:Note>/g)].map((m) => m[1]!.trim());
  const qr = xml.match(/https?:\/\/[^<\s"]*descargaqr[^<\s"]*/i)?.[0] ?? null;
  return {
    codigo,
    descripcion: descripciones[0] ?? '',
    observaciones: [...descripciones.slice(1), ...notas],
    qrUrl: qr ? qr.replace(/&amp;/g, '&') : null,
  };
}

export type TicketGreResult =
  | { ok: true; estado: 'EN_PROCESO' }
  | { ok: true; estado: 'ACEPTADO' | 'RECHAZADO'; codigo: string; descripcion: string; cdrZipBase64: string | null; cdr: CdrGre | null }
  | { ok: false; error: string; httpStatus?: number };

export async function consultarTicketGRE(args: { token: string; ticket: string; ep?: GreEndpoints }): Promise<TicketGreResult> {
  const ep = args.ep ?? GRE_API_PRODUCCION;
  let r: { status: number; text: string };
  try {
    r = await fetchConReintento(`${ep.cpe}/contribuyente/gem/comprobantes/envios/${encodeURIComponent(args.ticket)}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${args.token}`, Accept: 'application/json' },
    });
  } catch (e) {
    return { ok: false, error: `Sin conexión con SUNAT: ${(e as Error).message}` };
  }
  if (r.status !== 200) return { ok: false, error: motivoError(r.status, r.text), httpStatus: r.status };

  let j: { codRespuesta?: string; arcCdr?: string; indCdrGenerado?: string; error?: { numError?: string; desError?: string } };
  try {
    j = JSON.parse(r.text);
  } catch {
    return { ok: false, error: `Respuesta ilegible: ${r.text.slice(0, 200)}` };
  }
  const cod = String(j.codRespuesta ?? '');
  if (cod === '98') return { ok: true, estado: 'EN_PROCESO' };

  let cdr: CdrGre | null = null;
  if (j.arcCdr) {
    try { cdr = await leerCdrGRE(j.arcCdr); } catch { cdr = null; }
  }
  if (cod === '0') {
    // Aceptada. El CDR puede traer observaciones (código 4000+), que no la invalidan.
    return {
      ok: true, estado: 'ACEPTADO',
      codigo: cdr?.codigo || '0',
      descripcion: cdr?.descripcion || 'La guía fue aceptada',
      cdrZipBase64: j.arcCdr ?? null, cdr,
    };
  }
  if (cod === '99') {
    return {
      ok: true, estado: 'RECHAZADO',
      codigo: cdr?.codigo || j.error?.numError || '99',
      descripcion: cdr?.descripcion || j.error?.desError || 'SUNAT rechazó la guía',
      cdrZipBase64: j.arcCdr ?? null, cdr,
    };
  }
  return { ok: false, error: `Respuesta inesperada de SUNAT (codRespuesta ${cod || 'vacío'}): ${r.text.slice(0, 200)}` };
}

/** El QR del CDR como imagen, para la representación impresa. */
export async function qrComoImagen(texto: string): Promise<string> {
  const { default: QRCode } = await import('qrcode');
  return QRCode.toDataURL(texto, { errorCorrectionLevel: 'M', margin: 1, scale: 5 });
}
