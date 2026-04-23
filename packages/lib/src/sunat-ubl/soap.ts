/**
 * Cliente SOAP para SUNAT — sendBill (envío directo de comprobante).
 * Endpoints:
 *  BETA:        https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService
 *  PRODUCCIÓN:  https://e-factura.sunat.gob.pe/ol-ti-itcpfegem/billService
 *
 * Ref: https://cpe.sunat.gob.pe (manual del programador)
 */

import * as forge from 'node-forge';

export type SoapResult =
  | { ok: true; cdrZipBase64: string; cdr: { codigo: string; descripcion: string; observaciones: string[] } }
  | { ok: false; error: string; soapFault?: string; httpStatus?: number };

function buildSendBillEnvelope(args: {
  rucEmisor: string;
  usuarioSol: string;     // RUC + USERNAME
  claveSol: string;
  nombreArchivoZip: string;
  zipBase64: string;
}): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ser="http://service.sunat.gob.pe" xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
  <soapenv:Header>
    <wsse:Security>
      <wsse:UsernameToken>
        <wsse:Username>${args.rucEmisor}${args.usuarioSol}</wsse:Username>
        <wsse:Password>${args.claveSol}</wsse:Password>
      </wsse:UsernameToken>
    </wsse:Security>
  </soapenv:Header>
  <soapenv:Body>
    <ser:sendBill>
      <fileName>${args.nombreArchivoZip}.zip</fileName>
      <contentFile>${args.zipBase64}</contentFile>
    </ser:sendBill>
  </soapenv:Body>
</soapenv:Envelope>`;
}

/** Envía el zip firmado a SUNAT y devuelve el CDR (zip base64) + parseo. */
export async function enviarSendBill(args: {
  endpointUrl: string;
  rucEmisor: string;
  usuarioSol: string;
  claveSol: string;
  zipBytes: Uint8Array;
  nombreArchivoZip: string;  // sin .zip
}): Promise<SoapResult> {
  const zipBase64 = forge.util.encode64(String.fromCharCode(...args.zipBytes));
  const envelope = buildSendBillEnvelope({ ...args, zipBase64 });

  let response: Response;
  try {
    response = await fetch(args.endpointUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': '',
        'Accept': 'text/xml',
      },
      body: envelope,
      // SUNAT puede tardar 15-30s. Sin timeout estricto.
    });
  } catch (e) {
    return { ok: false, error: `Fallo de red: ${(e as Error).message}` };
  }

  const text = await response.text();

  // Detectar SOAP Fault
  const faultMatch = text.match(/<faultstring[^>]*>([\s\S]*?)<\/faultstring>/i);
  if (faultMatch) {
    return { ok: false, error: faultMatch[1]!.trim(), soapFault: text, httpStatus: response.status };
  }

  // Extraer applicationResponse base64 del response
  const arMatch = text.match(/<applicationResponse[^>]*>([\s\S]*?)<\/applicationResponse>/i);
  if (!arMatch) {
    return { ok: false, error: 'CDR no encontrado en respuesta', soapFault: text, httpStatus: response.status };
  }
  const cdrZipBase64 = arMatch[1]!.trim();

  // Parsear CDR (descomprimir y leer cabecera)
  try {
    const cdr = await parsearCDR(cdrZipBase64);
    return { ok: true, cdrZipBase64, cdr };
  } catch (e) {
    return { ok: false, error: `No se pudo parsear el CDR: ${(e as Error).message}`, httpStatus: response.status };
  }
}

/** Parsea el ZIP del CDR y extrae el código de respuesta de SUNAT. */
async function parsearCDR(cdrZipBase64: string): Promise<{ codigo: string; descripcion: string; observaciones: string[] }> {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(cdrZipBase64, { base64: true });
  const xmlFile = Object.keys(zip.files).find((n) => n.endsWith('.xml'));
  if (!xmlFile) throw new Error('CDR sin archivo XML');
  const xml = await zip.files[xmlFile]!.async('string');

  const codigo = xml.match(/<cbc:ResponseCode[^>]*>([^<]+)<\/cbc:ResponseCode>/)?.[1] ?? '';
  const descripcion = xml.match(/<cbc:Description[^>]*>([^<]+)<\/cbc:Description>/)?.[1] ?? '';
  const observaciones: string[] = [];
  const obsRegex = /<cbc:Description[^>]*>([^<]+)<\/cbc:Description>/g;
  let m;
  let i = 0;
  while ((m = obsRegex.exec(xml)) !== null) {
    if (i > 0) observaciones.push(m[1]!);
    i++;
  }
  return { codigo, descripcion, observaciones };
}
