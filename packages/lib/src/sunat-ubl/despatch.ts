/**
 * Guía de Remisión Remitente electrónica (GRE) — UBL 2.1 DespatchAdvice, versión 2.0.
 *
 * Es el documento que acompaña la mercadería en el camino: la agencia de
 * transporte (Shalom, Olva, Marvisur…) lo pide para recibir un envío a
 * provincia, y la policía de carreteras lo puede exigir.
 *
 * A diferencia de la factura, la GRE NO va por el servicio SOAP de siempre: desde
 * 2022 SUNAT la recibe solo por su API REST (ver `gre-api.ts`), con un token
 * propio. El XML sí se firma igual que el resto de comprobantes.
 *
 * La serie electrónica empieza con T (T001) y arranca en 1: la numeración de la
 * guía de papel (0001-002406) no se continúa, es otro talonario.
 *
 * Ref: guía de elaboración GRE Remitente 2.0 (cpe.sunat.gob.pe) y catálogos 18,
 * 20 y 61 del Anexo 8.
 */

/**
 * La guía se numera con 8 dígitos (T001-00000001), que es como la guarda la base
 * (`numero_completo` es una columna calculada con 8). Así el número del PDF, el
 * de la pantalla y el que registra SUNAT son idénticos. SUNAT admite 1 a 8.
 */
export function numeroGuia(serie: string, numero: number): string {
  return `${serie}-${String(numero).padStart(8, '0')}`;
}

function esc(s: string | number | undefined | null): string {
  if (s === undefined || s === null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Texto libre dentro de CDATA: lo único que lo rompe es la secuencia de cierre. */
function cdata(s: string | undefined | null): string {
  return `<![CDATA[${String(s ?? '').replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;
}

/** Catálogo 20 — motivo del traslado. */
export const MOTIVOS_TRASLADO = {
  '01': 'Venta',
  '14': 'Venta sujeta a confirmación del comprador',
  '03': 'Venta con entrega a terceros',
  '05': 'Consignación',
  '06': 'Devolución',
  '04': 'Traslado entre establecimientos de la misma empresa',
  '02': 'Compra',
  '17': 'Traslado de bienes para transformación',
  '07': 'Recojo de bienes transformados',
  '13': 'Otros',
} as const;
export type MotivoTraslado = keyof typeof MOTIVOS_TRASLADO;

/** Catálogo 18 — modalidad. Público = una agencia lleva la carga; privado = vehículo propio. */
export type ModalidadTraslado = '01' | '02';

/** Catálogo 61 — documentos relacionados que se usan acá. */
export const DOCS_RELACIONADOS = {
  '01': 'Factura',
  '03': 'Boleta de Venta',
} as const;

export type DireccionGuia = {
  ubigeo: string;          // INEI, 6 dígitos
  direccion: string;
  /** Código de establecimiento anexo en el RUC ('0000' = domicilio fiscal). Solo si se conoce. */
  codigoEstablecimiento?: string;
};

export type GuiaRemisionInput = {
  serie: string;            // 'T001'
  numero: number;
  fechaEmision: string;     // YYYY-MM-DD (hora de Perú)
  horaEmision: string;      // HH:mm:ss
  observacion?: string;
  emisor: { ruc: string; razonSocial: string };
  destinatario: { tipoDoc: string; numDoc: string; nombre: string };
  documentoRelacionado?: { tipo: keyof typeof DOCS_RELACIONADOS; serieNumero: string };
  motivo: MotivoTraslado;
  /** Obligatoria con motivo 13 (Otros). */
  motivoDescripcion?: string;
  modalidad: ModalidadTraslado;
  fechaTraslado: string;    // YYYY-MM-DD
  /**
   * Transporte público: el día en que la mercadería se entrega a la agencia.
   * Obligatoria desde el 01/06/2026 (R.S. 000108-2026/SUNAT, error 3617) y no
   * puede ser anterior a la emisión (error 3618). Si no viene, se usa la fecha
   * de inicio del traslado.
   */
  fechaEntregaTransportista?: string;
  pesoBrutoKg: number;
  numBultos?: number;
  /** Transporte público. */
  transportista?: { ruc: string; razonSocial: string; registroMtc?: string };
  /** Transporte privado. */
  vehiculoPlaca?: string;
  conductor?: { tipoDoc: string; numDoc: string; nombres: string; apellidos: string; licencia: string };
  /** Transporte privado en vehículo categoría M1 o L (auto, moto): no pide placa ni conductor. */
  vehiculoM1L?: boolean;
  partida: DireccionGuia;
  llegada: DireccionGuia;
  items: Array<{ codigo?: string; descripcion: string; cantidad: number; unidad?: string }>;
};

/**
 * Lo que SUNAT rechazaría, dicho antes de gastar un número.
 *
 * Un rechazo de SUNAT quema el correlativo: la guía rechazada no se puede
 * corregir y reenviar, hay que emitir otra. Por eso se valida acá todo lo que se
 * pueda saber de antemano. La usan el formulario (para avisar mientras se llena)
 * y el servidor (para no confiar en el navegador).
 */
export function validarGuia(g: Omit<GuiaRemisionInput, 'serie' | 'numero' | 'fechaEmision' | 'horaEmision'>, hoy?: string): string[] {
  const err: string[] = [];
  const d = g.destinatario;
  if (!d.nombre?.trim()) err.push('Falta el nombre o razón social del destinatario.');
  if (d.tipoDoc === '6' && !/^\d{11}$/.test(d.numDoc)) err.push('El RUC del destinatario debe tener 11 dígitos.');
  else if (d.tipoDoc === '1' && !/^\d{8}$/.test(d.numDoc)) err.push('El DNI del destinatario debe tener 8 dígitos.');
  else if (!d.numDoc?.trim()) err.push('Falta el documento del destinatario.');

  if (g.motivo === '04') {
    if (d.numDoc !== g.emisor.ruc) err.push('En un traslado entre establecimientos propios el destinatario es la misma empresa.');
    // Probado en el ambiente de pruebas: sin los dos códigos SUNAT rechaza con
    // 3365 (falta el de llegada) o 3369 (falta el de partida).
    if (!/^\d{4}$/.test(g.partida.codigoEstablecimiento ?? '') || !/^\d{4}$/.test(g.llegada.codigoEstablecimiento ?? '')) {
      err.push('En un traslado entre establecimientos propios van los códigos de establecimiento SUNAT (4 dígitos, el domicilio fiscal es 0000) de la partida y de la llegada.');
    }
  } else if (d.numDoc === g.emisor.ruc) {
    err.push('El destinatario no puede ser la misma empresa salvo en un traslado entre establecimientos propios.');
  }
  if (g.motivo === '13' && !g.motivoDescripcion?.trim()) err.push('Con motivo "Otros" hay que describir el motivo.');

  if (!(g.pesoBrutoKg > 0)) err.push('Falta el peso bruto total (en kg).');
  if (g.numBultos !== undefined && g.numBultos !== null && !(g.numBultos > 0)) err.push('La cantidad de bultos debe ser mayor a cero.');
  if (hoy && g.fechaTraslado < hoy) err.push('La fecha de inicio del traslado no puede ser anterior a hoy.');
  if (g.modalidad === '01' && hoy && g.fechaEntregaTransportista && g.fechaEntregaTransportista < hoy) {
    err.push('La fecha de entrega a la agencia no puede ser anterior a hoy.');
  }

  for (const [nombre, dir] of [['partida', g.partida], ['llegada', g.llegada]] as const) {
    if (!/^\d{6}$/.test(dir.ubigeo ?? '')) err.push(`Falta el distrito (ubigeo) del punto de ${nombre}.`);
    if ((dir.direccion ?? '').trim().length < 3) err.push(`Falta la dirección del punto de ${nombre}.`);
  }
  if (g.partida.ubigeo === g.llegada.ubigeo
    && g.partida.direccion.trim().toUpperCase() === g.llegada.direccion.trim().toUpperCase()) {
    err.push('El punto de partida y el de llegada son la misma dirección.');
  }

  if (g.modalidad === '01') {
    if (!/^\d{11}$/.test(g.transportista?.ruc ?? '')) err.push('Falta el RUC de la empresa de transporte (11 dígitos).');
    if (!g.transportista?.razonSocial?.trim()) err.push('Falta la razón social de la empresa de transporte.');
    if (g.transportista?.ruc && g.transportista.ruc === g.emisor.ruc) {
      err.push('Con transporte público el transportista es otra empresa; si lo lleva Happy\'s, es transporte privado.');
    }
  } else if (!g.vehiculoM1L) {
    if (!/^[A-Z0-9]{6,8}$/.test((g.vehiculoPlaca ?? '').replace(/-/g, '').toUpperCase())) err.push('Falta la placa del vehículo.');
    const c = g.conductor;
    if (!c?.numDoc?.trim() || !c.nombres?.trim() || !c.apellidos?.trim()) err.push('Faltan los datos del conductor (documento, nombres y apellidos).');
    if (!c?.licencia?.trim()) err.push('Falta la licencia de conducir del conductor.');
  }

  if (g.items.length === 0) err.push('La guía no tiene productos.');
  for (const [i, it] of g.items.entries()) {
    if (!it.descripcion?.trim()) err.push(`La línea ${i + 1} no tiene descripción.`);
    if (!(it.cantidad > 0)) err.push(`La línea ${i + 1} tiene cantidad cero.`);
  }
  if (g.observacion && g.observacion.length > 250) err.push('La observación no puede pasar de 250 caracteres.');
  return err;
}

function direccionXml(tag: 'DeliveryAddress' | 'DespatchAddress', dir: DireccionGuia, ruc: string): string {
  return `<cac:${tag}>
        <cbc:ID schemeAgencyName="PE:INEI" schemeName="Ubigeos">${esc(dir.ubigeo)}</cbc:ID>${dir.codigoEstablecimiento ? `
        <cbc:AddressTypeCode listAgencyName="PE:SUNAT" listName="Establecimientos anexos" listID="${esc(ruc)}">${esc(dir.codigoEstablecimiento)}</cbc:AddressTypeCode>` : ''}
        <cac:AddressLine>
          <cbc:Line>${cdata(dir.direccion.trim().toUpperCase())}</cbc:Line>
        </cac:AddressLine>
      </cac:${tag}>`;
}

/** Genera el XML sin firmar, con el lugar de la firma marcado como en el resto de comprobantes. */
export function generarUBLDespatch(g: GuiaRemisionInput): { xml: string; numeroCompleto: string; nombreArchivo: string } {
  const numeroCompleto = numeroGuia(g.serie, g.numero);
  const ruc = g.emisor.ruc;
  const privado = g.modalidad === '02';

  const docRel = g.documentoRelacionado ? `
  <cac:AdditionalDocumentReference>
    <cbc:ID>${esc(g.documentoRelacionado.serieNumero)}</cbc:ID>
    <cbc:DocumentTypeCode listAgencyName="PE:SUNAT" listName="Documento relacionado al transporte" listURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo61">${esc(g.documentoRelacionado.tipo)}</cbc:DocumentTypeCode>
    <cbc:DocumentType>${esc(DOCS_RELACIONADOS[g.documentoRelacionado.tipo])}</cbc:DocumentType>
    <cac:IssuerParty>
      <cac:PartyIdentification>
        <cbc:ID schemeID="6" schemeName="Documento de Identidad" schemeAgencyName="PE:SUNAT" schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo06">${esc(ruc)}</cbc:ID>
      </cac:PartyIdentification>
    </cac:IssuerParty>
  </cac:AdditionalDocumentReference>` : '';

  const transportista = !privado && g.transportista ? `
        <cac:CarrierParty>
          <cac:PartyIdentification>
            <cbc:ID schemeID="6">${esc(g.transportista.ruc)}</cbc:ID>
          </cac:PartyIdentification>
          <cac:PartyLegalEntity>
            <cbc:RegistrationName>${cdata(g.transportista.razonSocial.trim())}</cbc:RegistrationName>${g.transportista.registroMtc?.trim() ? `
            <cbc:CompanyID>${esc(g.transportista.registroMtc.trim())}</cbc:CompanyID>` : ''}
          </cac:PartyLegalEntity>
        </cac:CarrierParty>
        <cac:LoadingTransportEvent>
          <cbc:OccurrenceDate>${g.fechaEntregaTransportista || g.fechaTraslado}</cbc:OccurrenceDate>
        </cac:LoadingTransportEvent>` : '';

  const conductor = privado && !g.vehiculoM1L && g.conductor ? `
        <cac:DriverPerson>
          <cbc:ID schemeID="${esc(g.conductor.tipoDoc)}" schemeName="Documento de Identidad" schemeAgencyName="PE:SUNAT" schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo06">${esc(g.conductor.numDoc)}</cbc:ID>
          <cbc:FirstName>${cdata(g.conductor.nombres.trim())}</cbc:FirstName>
          <cbc:FamilyName>${cdata(g.conductor.apellidos.trim())}</cbc:FamilyName>
          <cbc:JobTitle>Principal</cbc:JobTitle>
          <cac:IdentityDocumentReference>
            <cbc:ID>${esc(g.conductor.licencia.trim().toUpperCase())}</cbc:ID>
          </cac:IdentityDocumentReference>
        </cac:DriverPerson>` : '';

  const vehiculo = privado && !g.vehiculoM1L && g.vehiculoPlaca ? `
    <cac:TransportHandlingUnit>
      <cac:TransportEquipment>
        <cbc:ID>${esc(g.vehiculoPlaca.replace(/-/g, '').toUpperCase())}</cbc:ID>
      </cac:TransportEquipment>
    </cac:TransportHandlingUnit>` : '';

  const indicadores = privado && g.vehiculoM1L ? `
    <cbc:SpecialInstructions>SUNAT_Envio_IndicadorTrasladoVehiculoM1L</cbc:SpecialInstructions>` : '';

  const lineas = g.items.map((it, i) => `
  <cac:DespatchLine>
    <cbc:ID>${i + 1}</cbc:ID>
    <cbc:DeliveredQuantity unitCode="${esc(it.unidad ?? 'NIU')}" unitCodeListID="UN/ECE rec 20" unitCodeListAgencyName="United Nations Economic Commission for Europe">${Number(it.cantidad)}</cbc:DeliveredQuantity>
    <cac:OrderLineReference>
      <cbc:LineID>${i + 1}</cbc:LineID>
    </cac:OrderLineReference>
    <cac:Item>
      <cbc:Description>${cdata(it.descripcion.trim())}</cbc:Description>${it.codigo ? `
      <cac:SellersItemIdentification>
        <cbc:ID>${esc(it.codigo)}</cbc:ID>
      </cac:SellersItemIdentification>` : ''}
    </cac:Item>
  </cac:DespatchLine>`).join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<DespatchAdvice xmlns="urn:oasis:names:specification:ubl:schema:xsd:DespatchAdvice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
  xmlns:ds="http://www.w3.org/2000/09/xmldsig#"
  xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">
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
  <cbc:IssueDate>${g.fechaEmision}</cbc:IssueDate>
  <cbc:IssueTime>${g.horaEmision}</cbc:IssueTime>
  <cbc:DespatchAdviceTypeCode listAgencyName="PE:SUNAT" listName="Tipo de Documento" listURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo01">09</cbc:DespatchAdviceTypeCode>${g.observacion?.trim() ? `
  <cbc:Note>${cdata(g.observacion.trim())}</cbc:Note>` : ''}${docRel}
  <cac:Signature>
    <cbc:ID>${esc(ruc)}</cbc:ID>
    <cac:SignatoryParty>
      <cac:PartyIdentification>
        <cbc:ID>${esc(ruc)}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name>${cdata(g.emisor.razonSocial)}</cbc:Name>
      </cac:PartyName>
    </cac:SignatoryParty>
    <cac:DigitalSignatureAttachment>
      <cac:ExternalReference>
        <cbc:URI>#SignatureHAPPYSAC</cbc:URI>
      </cac:ExternalReference>
    </cac:DigitalSignatureAttachment>
  </cac:Signature>
  <cac:DespatchSupplierParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="6" schemeName="Documento de Identidad" schemeAgencyName="PE:SUNAT" schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo06">${esc(ruc)}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${cdata(g.emisor.razonSocial)}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:DespatchSupplierParty>
  <cac:DeliveryCustomerParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="${esc(g.destinatario.tipoDoc)}" schemeName="Documento de Identidad" schemeAgencyName="PE:SUNAT" schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo06">${esc(g.destinatario.numDoc)}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${cdata(g.destinatario.nombre.trim())}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:DeliveryCustomerParty>
  <cac:Shipment>
    <cbc:ID>SUNAT_Envio</cbc:ID>
    <cbc:HandlingCode listAgencyName="PE:SUNAT" listName="Motivo de traslado" listURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo20">${esc(g.motivo)}</cbc:HandlingCode>${g.motivoDescripcion?.trim() ? `
    <cbc:HandlingInstructions>${cdata(g.motivoDescripcion.trim())}</cbc:HandlingInstructions>` : ''}
    <cbc:GrossWeightMeasure unitCode="KGM">${g.pesoBrutoKg.toFixed(3)}</cbc:GrossWeightMeasure>${g.numBultos ? `
    <cbc:TotalTransportHandlingUnitQuantity>${Math.round(g.numBultos)}</cbc:TotalTransportHandlingUnitQuantity>` : ''}${indicadores}
    <cac:ShipmentStage>
      <cbc:TransportModeCode listName="Modalidad de traslado" listAgencyName="PE:SUNAT" listURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo18">${g.modalidad}</cbc:TransportModeCode>
      <cac:TransitPeriod>
        <cbc:StartDate>${g.fechaTraslado}</cbc:StartDate>
      </cac:TransitPeriod>${transportista}${conductor}
    </cac:ShipmentStage>
    <cac:Delivery>
      ${direccionXml('DeliveryAddress', g.llegada, g.motivo === '04' ? ruc : g.destinatario.numDoc)}
      <cac:Despatch>
        ${direccionXml('DespatchAddress', g.partida, ruc)}
      </cac:Despatch>
    </cac:Delivery>${vehiculo}
  </cac:Shipment>${lineas}
</DespatchAdvice>`;

  return { xml, numeroCompleto, nombreArchivo: `${ruc}-09-${numeroCompleto}` };
}
