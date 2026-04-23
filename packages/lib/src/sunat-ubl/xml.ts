/**
 * Generador de XML UBL 2.1 para SUNAT (Boleta y Factura).
 * Implementación minimalista — pasa validación SUNAT en BETA con cargos básicos.
 *
 * Para casos avanzados (detracciones, percepciones, exportación, anticipos)
 * agregar bloques específicos siguiendo la guía de SUNAT.
 *
 * Ref: https://cpe.sunat.gob.pe/sites/default/files/inline-files/Anexo_1_2.0.pdf
 */

import { type ComprobanteInput, calcularTotales, IGV_RATE } from './types';

function esc(s: string | number | undefined | null): string {
  if (s === undefined || s === null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const NS = `xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
  xmlns:ds="http://www.w3.org/2000/09/xmldsig#"
  xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2"
  xmlns:sac="urn:sunat:names:specification:ubl:peru:schema:xsd:SunatAggregateComponents-1"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"`;

/**
 * Genera el XML UBL 2.1 listo para firmar.
 * El bloque <ext:UBLExtensions> queda con un placeholder donde se insertará la firma.
 */
export function generarUBLInvoice(input: ComprobanteInput): { xml: string; numeroCompleto: string; nombreArchivo: string } {
  const tot = calcularTotales(input);
  const numeroCompleto = `${input.serie}-${String(input.numero).padStart(8, '0')}`;
  const isFactura = input.tipo === '01';
  const tipoDoc = input.tipo;
  const fecha = input.fechaEmision; // YYYY-MM-DD
  const hora = input.horaEmision ?? '12:00:00';
  const moneda = input.moneda;

  const items = tot.items.map((i, idx) => {
    const id = idx + 1;
    const valorUnitarioSinIgv = +(i.precioUnitarioConIgv / (1 + IGV_RATE / 100)).toFixed(6);
    return `
    <cac:InvoiceLine>
      <cbc:ID>${id}</cbc:ID>
      <cbc:InvoicedQuantity unitCode="${esc(i.unidadSunat ?? 'NIU')}">${i.cantidad}</cbc:InvoicedQuantity>
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
    </cac:InvoiceLine>`;
  }).join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice ${NS}>
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
  <cbc:DueDate>${fecha}</cbc:DueDate>
  <cbc:InvoiceTypeCode listID="0101" listAgencyName="PE:SUNAT" listName="Tipo de Documento" listURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo01" name="${isFactura ? 'Tipo de Operacion' : 'Tipo de Comprobante'}">${tipoDoc}</cbc:InvoiceTypeCode>
  <cbc:Note languageLocaleID="1000"><![CDATA[${esc(input.totalLetras ?? '')}]]></cbc:Note>
  <cbc:DocumentCurrencyCode listID="ISO 4217 Alpha" listAgencyName="United Nations Economic Commission for Europe" listName="Currency">${moneda}</cbc:DocumentCurrencyCode>
  <cbc:LineCountNumeric>${tot.items.length}</cbc:LineCountNumeric>

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
        ${input.cliente.direccion ? `<cac:RegistrationAddress>
          <cac:AddressLine><cbc:Line><![CDATA[${esc(input.cliente.direccion)}]]></cbc:Line></cac:AddressLine>
        </cac:RegistrationAddress>` : ''}
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>

  <cac:PaymentTerms>
    <cbc:ID>FormaPago</cbc:ID>
    <cbc:PaymentMeansID>${input.formaPago === 'Credito' ? 'Credito' : 'Contado'}</cbc:PaymentMeansID>
  </cac:PaymentTerms>

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

  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${moneda}">${tot.totalGravado.toFixed(2)}</cbc:LineExtensionAmount>
    <cbc:TaxInclusiveAmount currencyID="${moneda}">${tot.total.toFixed(2)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="${moneda}">${tot.total.toFixed(2)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>

  ${items}
</Invoice>`;

  const nombreArchivo = `${input.emisor.ruc}-${tipoDoc}-${numeroCompleto}`;
  return { xml, numeroCompleto, nombreArchivo };
}
