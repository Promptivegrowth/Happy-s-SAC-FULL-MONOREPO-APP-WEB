/**
 * Generador de XML UBL para la COMUNICACIÓN DE BAJA (RA) SUNAT.
 *
 * Es la única forma de anular una FACTURA (01) o una nota (07/08) ya aceptada
 * por SUNAT. Se envía por el mismo canal asíncrono del resumen diario
 * (sendSummary → ticket → getStatus → CDR) y el plazo es hasta el séptimo día
 * calendario del mes siguiente a la emisión.
 *
 * Las BOLETAS no se anulan por acá: se informan en el Resumen Diario con
 * condición 3 (ver summary.ts).
 *
 * Nombre del archivo: RUC-RA-AAAAMMDD-N
 * Ref: SUNAT Guía UBL 2.1 — Comunicación de Baja.
 */

import type { Emisor } from './types';

function esc(s: string | number | undefined | null): string {
  if (s === undefined || s === null) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

export type BajaLinea = {
  /** Tipo del documento que se da de baja: 01 factura, 07 NC, 08 ND. */
  tipoDoc: '01' | '07' | '08';
  /** Serie del documento, ej. 'F001'. */
  serie: string;
  /** Correlativo del documento, ej. 25. */
  numero: number;
  /** Motivo de la anulación (texto libre, obligatorio para SUNAT). */
  motivo: string;
};

export type ComunicacionBajaInput = {
  /** N del envío del día (RA-AAAAMMDD-N). */
  correlativo: number;
  /** Fecha de emisión de los documentos que se anulan (YYYY-MM-DD). */
  fechaReferencia: string;
  /** Fecha en que se comunica la baja (YYYY-MM-DD). */
  fechaGeneracion: string;
  emisor: Emisor;
  lineas: BajaLinea[];
};

const NS = `xmlns="urn:sunat:names:specification:ubl:peru:schema:xsd:VoidedDocuments-1"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
  xmlns:ds="http://www.w3.org/2000/09/xmldsig#"
  xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2"`;

/** Genera el XML de la Comunicación de Baja, listo para firmar. */
export function generarUBLComunicacionBaja(
  input: ComunicacionBajaInput,
): { xml: string; id: string; nombreArchivo: string } {
  if (!input.lineas || input.lineas.length === 0) {
    throw new Error('La comunicación de baja necesita al menos un documento.');
  }
  const compacta = input.fechaGeneracion.replace(/-/g, '');
  const id = `RA-${compacta}-${input.correlativo}`;

  const lineas = input.lineas.map((l, idx) => `
  <sac:VoidedDocumentsLine xmlns:sac="urn:sunat:names:specification:ubl:peru:schema:xsd:SunatAggregateComponents-1">
    <cbc:LineID>${idx + 1}</cbc:LineID>
    <cbc:DocumentTypeCode>${esc(l.tipoDoc)}</cbc:DocumentTypeCode>
    <sac:DocumentSerialID>${esc(l.serie)}</sac:DocumentSerialID>
    <sac:DocumentNumberID>${l.numero}</sac:DocumentNumberID>
    <sac:VoidReasonDescription><![CDATA[${esc(l.motivo)}]]></sac:VoidReasonDescription>
  </sac:VoidedDocumentsLine>`).join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<VoidedDocuments ${NS}>
  <ext:UBLExtensions>
    <ext:UBLExtension>
      <ext:ExtensionContent>
        <!-- SIGNATURE_PLACEHOLDER -->
      </ext:ExtensionContent>
    </ext:UBLExtension>
  </ext:UBLExtensions>
  <cbc:UBLVersionID>2.0</cbc:UBLVersionID>
  <cbc:CustomizationID>1.0</cbc:CustomizationID>
  <cbc:ID>${id}</cbc:ID>
  <cbc:ReferenceDate>${esc(input.fechaReferencia)}</cbc:ReferenceDate>
  <cbc:IssueDate>${esc(input.fechaGeneracion)}</cbc:IssueDate>

  <cac:Signature>
    <cbc:ID>${esc(input.emisor.ruc)}</cbc:ID>
    <cac:SignatoryParty>
      <cac:PartyIdentification>
        <cbc:ID>${esc(input.emisor.ruc)}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name><![CDATA[${esc(input.emisor.razonSocial)}]]></cbc:Name>
      </cac:PartyName>
    </cac:SignatoryParty>
    <cac:DigitalSignatureAttachment>
      <cac:ExternalReference>
        <cbc:URI>#SignatureHAPPYSAC</cbc:URI>
      </cac:ExternalReference>
    </cac:DigitalSignatureAttachment>
  </cac:Signature>

  <cac:AccountingSupplierParty>
    <cbc:CustomerAssignedAccountID>${esc(input.emisor.ruc)}</cbc:CustomerAssignedAccountID>
    <cbc:AdditionalAccountID>6</cbc:AdditionalAccountID>
    <cac:Party>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName><![CDATA[${esc(input.emisor.razonSocial)}]]></cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
${lineas}
</VoidedDocuments>`;

  return { xml, id, nombreArchivo: `${input.emisor.ruc}-${id}` };
}
