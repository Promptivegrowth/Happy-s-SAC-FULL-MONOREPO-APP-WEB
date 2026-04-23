/**
 * Firma XMLDSig enveloped del XML UBL para SUNAT.
 *
 * Implementación basada en xml-crypto o reimplementada con node-forge.
 * Aquí usamos xml-crypto por ser el estándar en el ecosistema Node.
 *
 * Flujo:
 *  1. Recibe el XML UBL con un placeholder <!-- SIGNATURE_PLACEHOLDER -->
 *  2. Reemplaza el placeholder con el bloque <ds:Signature> firmado
 *  3. La firma se hace sobre todo el documento usando enveloped-signature transform
 */

import * as forge from 'node-forge';
import { SignedXml } from 'xml-crypto';

export type CertificadoData = {
  /** PFX en base64 */
  pfxBase64: string;
  /** Password del PFX */
  password: string;
};

/** Extrae certificado PEM y clave privada PEM desde un .pfx codificado en base64. */
export function extraerPemFromPfx(pfxBase64: string, password: string): { certPem: string; keyPem: string; subject: string } {
  const der = forge.util.decode64(pfxBase64);
  const asn1 = forge.asn1.fromDer(der);
  const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, password);

  // Buscar certificado y clave (oids son strings garantizados por la librería)
  const oidCert = forge.pki.oids.certBag as string;
  const oidPkcs8 = forge.pki.oids.pkcs8ShroudedKeyBag as string;
  const oidKey = forge.pki.oids.keyBag as string;

  const certBags = p12.getBags({ bagType: oidCert });
  const cert = certBags[oidCert]?.[0]?.cert;
  if (!cert) throw new Error('Certificado no encontrado en el PFX');

  const keyBagsPkcs8 = p12.getBags({ bagType: oidPkcs8 });
  const keyBagsKey = p12.getBags({ bagType: oidKey });
  const keyObj =
    keyBagsPkcs8[oidPkcs8]?.[0]?.key ??
    keyBagsKey[oidKey]?.[0]?.key;
  if (!keyObj) throw new Error('Clave privada no encontrada en el PFX');

  const certPem = forge.pki.certificateToPem(cert);
  const keyPem = forge.pki.privateKeyToPem(keyObj);
  const subject = cert.subject.attributes
    .map((a: { shortName?: string; value?: unknown }) => `${a.shortName ?? ''}=${a.value ?? ''}`)
    .join(', ');

  return { certPem, keyPem, subject };
}

/** Devuelve el .cer (DER → base64 sin headers PEM) para incrustar en KeyInfo. */
function pemToBase64(pem: string): string {
  return pem
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '');
}

/**
 * Firma el XML UBL reemplazando el placeholder SIGNATURE_PLACEHOLDER.
 * Devuelve el XML firmado listo para empaquetar en .zip y enviar a SUNAT.
 */
export function firmarUBL(xml: string, cert: CertificadoData): string {
  const { certPem, keyPem } = extraerPemFromPfx(cert.pfxBase64, cert.password);

  const sig = new SignedXml({
    privateKey: keyPem,
    publicCert: certPem,
    signatureAlgorithm: 'http://www.w3.org/2000/09/xmldsig#rsa-sha1',
    canonicalizationAlgorithm: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
  });

  // Referencia: el documento entero (URI vacío) con transformación enveloped + c14n
  sig.addReference({
    xpath: "/*",
    transforms: [
      'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
      'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
    ],
    digestAlgorithm: 'http://www.w3.org/2000/09/xmldsig#sha1',
  });

  sig.computeSignature(xml, {
    prefix: 'ds',
    location: { reference: "//*[local-name(.)='ExtensionContent']", action: 'append' },
    attrs: { Id: 'SignatureHAPPYSAC' },
  });

  // Quita el placeholder comentado (ya no es necesario)
  let signedXml = sig.getSignedXml();
  signedXml = signedXml.replace('<!-- SIGNATURE_PLACEHOLDER -->', '');
  return signedXml;
}

/** Devuelve solo el digest SHA-1 (base64) del XML — útil para guardar en BD. */
export function digestSHA1(xml: string): string {
  const md = forge.md.sha1.create();
  md.update(xml, 'utf8');
  return forge.util.encode64(md.digest().getBytes());
}

/** Helper: convierte el XML firmado en un .zip con el archivo nombrado según SUNAT. */
export async function empaquetarZip(xml: string, nombreArchivo: string): Promise<Uint8Array> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  zip.file(`${nombreArchivo}.xml`, xml);
  const buf = await zip.generateAsync({ type: 'uint8array' });
  return buf;
}
