/**
 * Generador de XML UBL 2.1 para NOTA DE DÉBITO (08) SUNAT.
 *
 * Antes las notas de débito se armaban con el generador de nota de CRÉDITO.
 * El XML salía como <CreditNote> y con el nombre de archivo `...-07-...`, así
 * que SUNAT las aceptaba pero las registraba como nota de crédito: el efecto
 * tributario quedaba invertido sin que nadie se enterara (verificado en beta el
 * 2026-09-14: respondió "La Nota de Credito numero FD01-... ha sido aceptada").
 *
 * Diferencias reales frente a la nota de crédito:
 *   · raíz <DebitNote> y su namespace propio,
 *   · líneas <cac:DebitNoteLine> con <cbc:DebitedQuantity>,
 *   · motivo del catálogo 10 (no el 09),
 *   · totales en <cac:RequestedMonetaryTotal> (no <cac:LegalMonetaryTotal>),
 *   · nombre de archivo con el tipo 08.
 *
 * Ref: SUNAT Guía UBL 2.1 — Nota de Débito.
 */

import { type ComprobanteInput, calcularTotales, IGV_RATE, formatearNumeroComprobante } from './types';

function esc(s: string | number | undefined | null): string {
  if (s === undefined || s === null) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

const NS = `xmlns="urn:oasis:names:specification:ubl:schema:xsd:DebitNote-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
  xmlns:ds="http://www.w3.org/2000/09/xmldsig#"
  xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"`;

/** Catálogo 10 — tipo de nota de débito. */
export const MOTIVO_ND: Record<string, string> = {
  '01': 'Intereses por mora',
  '02': 'Aumento en el valor',
  '03': 'Penalidades / otros conceptos',
  '10': 'Ajustes de operaciones de exportación',
  '11': 'Ajustes afectos al IVAP',
};

/** Genera el XML UBL 2.1 de la Nota de Débito, listo para firmar. */
export function generarUBLDebitNote(input: ComprobanteInput): { xml: string; numeroCompleto: string; nombreArchivo: string } {
  if (!input.documentoReferencia) {
    throw new Error('La nota de débito requiere documentoReferencia (comprobante afectado).');
  }
  const tot = calcularTotales(input);
  const numeroCompleto = formatearNumeroComprobante(input.serie, input.numero);
  const fecha = input.fechaEmision;
  const hora = input.horaEmision ?? '12:00:00';
  const moneda = input.moneda;
  const ref = input.documentoReferencia;
  const motivoCodigo = ref.tipoMotivo ?? '01';
  const motivoDesc = ref.descripcionMotivo ?? MOTIVO_ND[motivoCodigo] ?? 'Intereses por mora';

  const lineas = tot.items.map((i, idx) => {
    const id = idx + 1;
    const valorUnitarioSinIgv = +(i.precioUnitarioConIgv / (1 + IGV_RATE / 100)).toFixed(6);
    return `
    <cac:DebitNoteLine>
      <cbc:ID>${id}</cbc:ID>
      <cbc:DebitedQuantity unitCode="${esc(i.unidadSunat ?? 'NIU')}">${i.cantidad}</cbc:DebitedQuantity>
      <cbc:LineExtensionAmount currencyID="${moneda}">${i.valorVenta.toFixed(2)}</cbc:LineExtensionAmount>
      <cac:PricingReference>
        <cac:AlternativeConditionPrice>
          <cbc:PriceAmount currencyID="${moneda}">${i.precioUnitarioConIgv.toFixed(2)}</cbc:PriceAmount>
          <cbc:PriceTypeCode listName="Tipo de Precio" listAgencyName="PE:SUNAT" listURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo16">01</cbc:PriceTypeCode>
        </cac:AlternativeConditionPrice>
      </cac:PricingReference>
      <cac:TaxTotal>
        <cbc:TaxAmount currencyID="${moneda}">${i.igv.toFixed(2)}</cbc:TaxAmount>
        <cac:TaxSubtotal>
          <cbc:TaxableAmount currencyID="${moneda}">${i.valorVenta.toFixed(2)}</cbc:TaxableAmount>
          <cbc:TaxAmount currencyID="${moneda}">${i.igv.toFixed(2)}</cbc:TaxAmount>
          <cac:TaxCategory>
            <cbc:Percent>${IGV_RATE}.00</cbc:Percent>
            <cbc:TaxExemptionReasonCode listAgencyName="PE:SUNAT" listName="Afectacion del IGV" listURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo07">${esc(i.afectacionIgv ?? '10')}</cbc:TaxExemptionReasonCode>
            <cac:TaxScheme>
              <cbc:ID schemeName="Codigo de tributos" schemeAgencyName="PE:SUNAT" schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo05">1000</cbc:ID>
              <cbc:Name>IGV</cbc:Name>
              <cbc:TaxTypeCode>VAT</cbc:TaxTypeCode>
            </cac:TaxScheme>
          </cac:TaxCategory>
        </cac:TaxSubtotal>
      </cac:TaxTotal>
      <cac:Item>
        <cbc:Description><![CDATA[${i.descripcion}]]></cbc:Description>
        <cac:SellersItemIdentification>
          <cbc:ID>${esc(i.codigo)}</cbc:ID>
        </cac:SellersItemIdentification>
      </cac:Item>
      <cac:Price>
        <cbc:PriceAmount currencyID="${moneda}">${valorUnitarioSinIgv.toFixed(6)}</cbc:PriceAmount>
      </cac:Price>
    </cac:DebitNoteLine>`;
  }).join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<DebitNote ${NS}>
  <ext:UBLExtensions>
    <ext:UBLExtension>
      <ext:ExtensionContent>
        <!-- SIGNATURE_PLACEHOLDER -->
      </ext:ExtensionContent>
    </ext:UBLExtension>
  </ext:UBLExtensions>
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>2.0</cbc:CustomizationID>
  <cbc:ID>${numeroCompleto}</cbc:ID>
  <cbc:IssueDate>${fecha}</cbc:IssueDate>
  <cbc:IssueTime>${hora}</cbc:IssueTime>
  <cbc:Note languageLocaleID="1000"><![CDATA[${esc(input.totalLetras ?? '')}]]></cbc:Note>
  <cbc:DocumentCurrencyCode listID="ISO 4217 Alpha" listAgencyName="United Nations Economic Commission for Europe" listName="Currency">${moneda}</cbc:DocumentCurrencyCode>

  <cac:DiscrepancyResponse>
    <cbc:ReferenceID>${esc(ref.serieNumero)}</cbc:ReferenceID>
    <cbc:ResponseCode listAgencyName="PE:SUNAT" listName="Tipo de Nota de Debito" listURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo10">${esc(motivoCodigo)}</cbc:ResponseCode>
    <cbc:Description><![CDATA[${esc(motivoDesc)}]]></cbc:Description>
  </cac:DiscrepancyResponse>

  <cac:BillingReference>
    <cac:InvoiceDocumentReference>
      <cbc:ID>${esc(ref.serieNumero)}</cbc:ID>
      <cbc:DocumentTypeCode listAgencyName="PE:SUNAT" listName="Tipo de Documento" listURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo01">${esc(ref.tipo)}</cbc:DocumentTypeCode>
    </cac:InvoiceDocumentReference>
  </cac:BillingReference>

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
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="6" schemeName="Documento de Identidad" schemeAgencyName="PE:SUNAT" schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo06">${esc(input.emisor.ruc)}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name><![CDATA[${esc(input.emisor.nombreComercial ?? input.emisor.razonSocial)}]]></cbc:Name>
      </cac:PartyName>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName><![CDATA[${esc(input.emisor.razonSocial)}]]></cbc:RegistrationName>
        <cac:RegistrationAddress>
          <cbc:ID>${esc(input.emisor.ubigeo ?? '150101')}</cbc:ID>
          <cbc:AddressTypeCode>${esc(input.emisor.codigoEstablecimiento ?? '0000')}</cbc:AddressTypeCode>
          <cac:AddressLine>
            <cbc:Line><![CDATA[${esc(input.emisor.direccionFiscal)}]]></cbc:Line>
          </cac:AddressLine>
          <cac:Country>
            <cbc:IdentificationCode>${esc(input.emisor.codigoPais ?? 'PE')}</cbc:IdentificationCode>
          </cac:Country>
        </cac:RegistrationAddress>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>

  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="${esc(input.cliente.tipoDoc)}" schemeName="Documento de Identidad" schemeAgencyName="PE:SUNAT" schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo06">${esc(input.cliente.numeroDoc)}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName><![CDATA[${esc(input.cliente.razonSocial)}]]></cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>

  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${moneda}">${tot.totalIgv.toFixed(2)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="${moneda}">${tot.totalGravado.toFixed(2)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="${moneda}">${tot.totalIgv.toFixed(2)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cac:TaxScheme>
          <cbc:ID schemeName="Codigo de tributos" schemeAgencyName="PE:SUNAT" schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo05">1000</cbc:ID>
          <cbc:Name>IGV</cbc:Name>
          <cbc:TaxTypeCode>VAT</cbc:TaxTypeCode>
        </cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>

  <cac:RequestedMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${moneda}">${tot.totalGravado.toFixed(2)}</cbc:LineExtensionAmount>
    <cbc:TaxInclusiveAmount currencyID="${moneda}">${tot.total.toFixed(2)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="${moneda}">${tot.total.toFixed(2)}</cbc:PayableAmount>
  </cac:RequestedMonetaryTotal>
  ${lineas}
</DebitNote>`;

  const nombreArchivo = `${input.emisor.ruc}-08-${numeroCompleto}`;
  return { xml, numeroCompleto, nombreArchivo };
}
