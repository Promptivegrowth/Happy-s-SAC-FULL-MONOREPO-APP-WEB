/**
 * Generador de RESUMEN DIARIO DE BOLETAS (SummaryDocuments / RC) para SUNAT.
 * Las boletas (03) se informan a SUNAT de forma agrupada por día. Se envía por
 * la operación SOAP `sendSummary` (devuelve un TICKET) y luego se consulta con
 * `getStatus(ticket)` para obtener el CDR.
 *
 * Ref: SUNAT Guía UBL 2.1 — Resumen Diario de Boletas y notas asociadas.
 */

import type { Emisor } from './types';

function esc(s: string | number | undefined | null): string {
  if (s === undefined || s === null) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

export type ResumenBoletaLinea = {
  /** Tipo de documento informado: 03 boleta, 07 NC de boleta, 08 ND de boleta. */
  tipoDoc: '03' | '07' | '08';
  serieNumero: string;          // 'B001-00000001'
  clienteTipoDoc: '0' | '1' | '4' | '6' | '7';
  clienteNumeroDoc: string;     // '-' o '0' si no aplica
  condicion: '1' | '2' | '3';   // 1 adicionar, 2 modificar, 3 anular
  total: number;                // importe total del documento (con IGV)
  gravado?: number;             // base gravada
  exonerado?: number;
  inafecto?: number;
  gratuito?: number;
  igv: number;
  // Para NC/ND informadas en el resumen: documento que modifican.
  docRefTipo?: '03';
  docRefSerieNumero?: string;
};

export type ResumenBoletasInput = {
  correlativo: number;          // N del resumen del día (RC-YYYYMMDD-N)
  fechaReferencia: string;      // YYYY-MM-DD (día de emisión de las boletas)
  fechaGeneracion: string;      // YYYY-MM-DD (día de generación/envío del resumen)
  moneda?: 'PEN' | 'USD';
  emisor: Emisor;
  lineas: ResumenBoletaLinea[];
};

const NS = `xmlns="urn:sunat:names:specification:ubl:peru:schema:xsd:SummaryDocuments-1"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
  xmlns:ds="http://www.w3.org/2000/09/xmldsig#"
  xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2"
  xmlns:sac="urn:sunat:names:specification:ubl:peru:schema:xsd:SunatAggregateComponents-1"`;

/** Genera el XML del Resumen Diario, listo para firmar. */
export function generarUBLResumenBoletas(input: ResumenBoletasInput): { xml: string; id: string; nombreArchivo: string } {
  const moneda = input.moneda ?? 'PEN';
  const fechaGenCompacta = input.fechaGeneracion.replace(/-/g, '');
  const id = `RC-${fechaGenCompacta}-${input.correlativo}`;

  const lineas = input.lineas.map((l, idx) => {
    const pagos: string[] = [];
    if (l.gravado && l.gravado > 0) pagos.push(billingPayment(moneda, l.gravado, '01'));
    if (l.exonerado && l.exonerado > 0) pagos.push(billingPayment(moneda, l.exonerado, '02'));
    if (l.inafecto && l.inafecto > 0) pagos.push(billingPayment(moneda, l.inafecto, '03'));
    if (l.gratuito && l.gratuito > 0) pagos.push(billingPayment(moneda, l.gratuito, '05'));
    const ref = l.docRefSerieNumero
      ? `
      <cac:BillingReference>
        <cac:InvoiceDocumentReference>
          <cbc:ID>${esc(l.docRefSerieNumero)}</cbc:ID>
          <cbc:DocumentTypeCode>${esc(l.docRefTipo ?? '03')}</cbc:DocumentTypeCode>
        </cac:InvoiceDocumentReference>
      </cac:BillingReference>`
      : '';
    return `
  <sac:SummaryDocumentsLine>
    <cbc:LineID>${idx + 1}</cbc:LineID>
    <cbc:DocumentTypeCode>${esc(l.tipoDoc)}</cbc:DocumentTypeCode>
    <cbc:ID>${esc(l.serieNumero)}</cbc:ID>${ref}
    <cac:AccountingCustomerParty>
      <cbc:CustomerAssignedAccountID>${esc(l.clienteNumeroDoc || '0')}</cbc:CustomerAssignedAccountID>
      <cbc:AdditionalAccountID>${esc(l.clienteTipoDoc)}</cbc:AdditionalAccountID>
    </cac:AccountingCustomerParty>
    <cac:Status>
      <cbc:ConditionCode>${esc(l.condicion)}</cbc:ConditionCode>
    </cac:Status>
    <sac:TotalAmount currencyID="${moneda}">${l.total.toFixed(2)}</sac:TotalAmount>${pagos.join('')}
    <cac:TaxTotal>
      <cbc:TaxAmount currencyID="${moneda}">${l.igv.toFixed(2)}</cbc:TaxAmount>
      <cac:TaxSubtotal>
        <cbc:TaxAmount currencyID="${moneda}">${l.igv.toFixed(2)}</cbc:TaxAmount>
        <cac:TaxCategory>
          <cac:TaxScheme>
            <cbc:ID schemeName="Codigo de tributos" schemeAgencyName="PE:SUNAT" schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo05">1000</cbc:ID>
            <cbc:Name>IGV</cbc:Name>
            <cbc:TaxTypeCode>VAT</cbc:TaxTypeCode>
          </cac:TaxScheme>
        </cac:TaxCategory>
      </cac:TaxSubtotal>
    </cac:TaxTotal>
  </sac:SummaryDocumentsLine>`;
  }).join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<SummaryDocuments ${NS}>
  <ext:UBLExtensions>
    <ext:UBLExtension>
      <ext:ExtensionContent>
        <!-- SIGNATURE_PLACEHOLDER -->
      </ext:ExtensionContent>
    </ext:UBLExtension>
  </ext:UBLExtensions>
  <cbc:UBLVersionID>2.0</cbc:UBLVersionID>
  <cbc:CustomizationID>1.1</cbc:CustomizationID>
  <cbc:ID>${id}</cbc:ID>
  <cbc:ReferenceDate>${input.fechaReferencia}</cbc:ReferenceDate>
  <cbc:IssueDate>${input.fechaGeneracion}</cbc:IssueDate>
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
  </cac:AccountingSupplierParty>${lineas}
</SummaryDocuments>`;

  const nombreArchivo = `${input.emisor.ruc}-${id}`;
  return { xml, id, nombreArchivo };
}

function billingPayment(moneda: string, monto: number, instructionId: string): string {
  return `
    <sac:BillingPayment>
      <cbc:PaidAmount currencyID="${moneda}">${monto.toFixed(2)}</cbc:PaidAmount>
      <cbc:InstructionID>${instructionId}</cbc:InstructionID>
    </sac:BillingPayment>`;
}
