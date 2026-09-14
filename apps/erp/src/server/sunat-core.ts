/**
 * NÚCLEO DE EMISIÓN SUNAT — sin 'use server'.
 *
 * Acá vive la lógica de armar, firmar y enviar comprobantes. Está fuera de las
 * server actions a propósito: el envío automático (cron) no tiene sesión de
 * usuario y necesita correr con el cliente de servicio. Tener una sola copia
 * evita que el camino manual y el automático se separen con el tiempo.
 */

import {
  generarUBLInvoice, generarUBLCreditNote, generarUBLDebitNote, generarUBLResumenBoletas, MOTIVO_ND,
  firmarUBL, empaquetarZip, enviarSendBill, enviarSendSummary, consultarGetStatus, digestSHA1,
  formatearNumeroComprobante,
  type ComprobanteInput, type ResumenBoletaLinea,
} from '@happy/lib/sunat-ubl';
import { numeroALetras, fechaLima, horaLima } from '@happy/lib/format';

/** Cliente de Supabase: sirve el de sesión y el de servicio. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ClienteSb = any;

/** Fecha actual en Perú (UTC-5) en formato YYYY-MM-DD. SUNAT valida el resumen
 *  contra la fecha de recepción (Perú); una fecha futura (UTC adelantado) da error 2236. */
function fechaPeru(): string {
  return fechaLima();
}

/**
 * Ventana UTC que corresponde a un día calendario peruano.
 *
 * `fecha_emision` es timestamptz y la base compara en UTC: si se filtra con
 * 'YYYY-MM-DDT00:00:00' se toma el día UTC, y las boletas emitidas entre las
 * 19:00 y la medianoche de Lima quedan fuera del resumen de su día y entran en
 * el del día siguiente. Perú es UTC-5, así que el día local va de las 05:00Z
 * de ese día a las 05:00Z del siguiente.
 */
function ventanaDiaPeru(fecha: string): { desde: string; hasta: string } {
  const inicio = new Date(`${fecha}T05:00:00.000Z`);
  const fin = new Date(inicio.getTime() + 24 * 3600 * 1000);
  return { desde: inicio.toISOString(), hasta: fin.toISOString() };
}

function tipoDocClienteSunat(t: string | null | undefined): ResumenBoletaLinea['clienteTipoDoc'] {
  return t === 'RUC' ? '6' : t === 'DNI' ? '1' : t === 'CE' ? '4' : t === 'PASAPORTE' ? '7' : '0';
}

// Catálogo 09 SUNAT — motivos de Nota de Crédito (descripción por código).
const MOTIVO_NC: Record<string, string> = {
  '01': 'Anulación de la operación', '02': 'Anulación por error en el RUC',
  '03': 'Corrección por error en la descripción', '04': 'Descuento global',
  '05': 'Descuento por ítem', '06': 'Devolución total', '07': 'Devolución por ítem',
  '08': 'Bonificación', '09': 'Disminución en el valor', '10': 'Otros conceptos',
};

const TIPO_MAP: Record<string, '01' | '03' | '07' | '08'> = {
  FACTURA: '01',
  BOLETA: '03',
  NOTA_CREDITO: '07',
  NOTA_DEBITO: '08',
};

/** Arma, firma y envía un comprobante a SUNAT. Lanza si SUNAT no responde bien. */
export async function emitirComprobanteConCliente(
  sb: ClienteSb,
  comprobanteId: string,
): Promise<{ codigo: string; descripcion: string; estado: string }> {

    const inicio = Date.now();

    // 1. Cargar config SUNAT
    const { data: empresa } = await sb.from('empresa').select('id, ruc, razon_social, nombre_comercial, direccion_fiscal, ubigeo').single();
    if (!empresa) throw new Error('Empresa no configurada');

    const { data: config } = await sb.from('sunat_config').select('*').eq('empresa_id', empresa.id).maybeSingle();
    if (!config) throw new Error('Falta configurar SUNAT en /configuracion/sunat');
    if (!config.certificado_pfx_base64 || !config.certificado_password) {
      throw new Error('Falta el certificado digital en la configuración SUNAT');
    }

    // 2. Cargar comprobante + líneas + cliente
    const { data: comp } = await sb.from('comprobantes')
      .select('*, comprobantes_lineas(*)')
      .eq('id', comprobanteId).single();
    if (!comp) throw new Error('Comprobante no encontrado');
    if (comp.estado === 'ACEPTADO') throw new Error('Comprobante ya aceptado por SUNAT');
    if (!['BOLETA', 'FACTURA', 'NOTA_CREDITO', 'NOTA_DEBITO'].includes(comp.tipo)) {
      throw new Error(`Tipo no soportado: ${comp.tipo}`);
    }

    const lineas = (comp as unknown as { comprobantes_lineas: { codigo: string | null; descripcion: string; cantidad: number; unidad_sunat: string | null; precio_unitario: number; descuento: number | null; afectacion_igv: string | null }[] }).comprobantes_lineas;
    if (!lineas || lineas.length === 0) throw new Error('Comprobante sin líneas');

    // 3. Construir input UBL
    const tipoSunat = TIPO_MAP[comp.tipo as keyof typeof TIPO_MAP];
    if (!tipoSunat) throw new Error(`Tipo de comprobante no soportado: ${comp.tipo}`);

    // Nota de crédito/débito: referencia al comprobante afectado + motivo.
    let documentoReferencia: ComprobanteInput['documentoReferencia'];
    if (tipoSunat === '07' || tipoSunat === '08') {
      const refId = (comp as unknown as { documento_referencia_id?: string | null }).documento_referencia_id;
      if (!refId) throw new Error('La nota de crédito/débito requiere un comprobante de referencia.');
      const { data: refComp } = await sb.from('comprobantes')
        .select('tipo, serie, numero, numero_completo').eq('id', refId).single();
      if (!refComp) throw new Error('Comprobante de referencia no encontrado.');
      const motivoCod = (comp as unknown as { motivo_nc_nd?: string | null }).motivo_nc_nd || '01';
      documentoReferencia = {
        tipo: (TIPO_MAP[refComp.tipo as keyof typeof TIPO_MAP] ?? '01'),
        serieNumero: refComp.numero_completo ?? formatearNumeroComprobante(refComp.serie as string, refComp.numero as number),
        tipoMotivo: motivoCod,
        descripcionMotivo: (tipoSunat === '08' ? MOTIVO_ND[motivoCod] : MOTIVO_NC[motivoCod]) ?? 'Ajuste',
      };
    }

    const input: ComprobanteInput = {
      tipo: tipoSunat,
      serie: comp.serie,
      numero: Number(comp.numero),
      // Hora de Perú: el servidor corre en UTC y una venta de la noche caería
      // al día siguiente, con lo que SUNAT rechazaría el comprobante por fecha
      // futura o lo registraría en el día equivocado.
      fechaEmision: fechaLima(comp.fecha_emision as string),
      horaEmision: horaLima(comp.fecha_emision as string) || '12:00:00',
      moneda: (comp.moneda ?? 'PEN') as 'PEN' | 'USD',
      emisor: {
        ruc: empresa.ruc,
        razonSocial: empresa.razon_social,
        nombreComercial: empresa.nombre_comercial ?? undefined,
        direccionFiscal: empresa.direccion_fiscal ?? '',
        ubigeo: empresa.ubigeo ?? '150101',
      },
      cliente: {
        tipoDoc: (comp.tipo_documento_cliente === 'RUC' ? '6' : comp.tipo_documento_cliente === 'DNI' ? '1' : comp.tipo_documento_cliente === 'CE' ? '4' : comp.tipo_documento_cliente === 'PASAPORTE' ? '7' : '0'),
        numeroDoc: comp.numero_documento_cliente ?? '00000000',
        razonSocial: comp.razon_social_cliente ?? 'CLIENTE VARIOS',
        direccion: comp.direccion_cliente ?? undefined,
      },
      items: lineas.map((l) => ({
        codigo: l.codigo ?? '',
        descripcion: l.descripcion,
        cantidad: Number(l.cantidad),
        unidadSunat: l.unidad_sunat ?? 'NIU',
        precioUnitarioConIgv: Number(l.precio_unitario),
        descuento: Number(l.descuento ?? 0),
      })),
      formaPago: comp.forma_pago === 'CREDITO' ? 'Credito' : 'Contado',
      totalLetras: numeroALetras(Number(comp.total)),
      documentoReferencia,
    };

    // 4. Generar UBL XML según el tipo. Cada uno tiene su raíz propia: usar el
    // generador equivocado hace que SUNAT registre otro tipo de documento.
    const { xml, nombreArchivo } =
      tipoSunat === '07' ? generarUBLCreditNote(input)
      : tipoSunat === '08' ? generarUBLDebitNote(input)
      : generarUBLInvoice(input);

    // 5. Firmar
    const xmlFirmado = firmarUBL(xml, {
      pfxBase64: config.certificado_pfx_base64,
      password: config.certificado_password,
    });

    // Hash del documento firmado (para trazabilidad / consulta SUNAT).
    const hashFirma = digestSHA1(xmlFirmado);

    // 6. Empaquetar zip
    const zipBytes = await empaquetarZip(xmlFirmado, nombreArchivo);

    // 7. Subir XML a Storage para auditoría
    const xmlPath = `comprobantes/${empresa.ruc}/${comp.tipo}/${nombreArchivo}.xml`;
    await sb.storage.from('comprobantes').upload(xmlPath, new Blob([xmlFirmado], { type: 'application/xml' }), {
      cacheControl: 'no-cache', upsert: true, contentType: 'application/xml',
    });
    const zipPath = `comprobantes/${empresa.ruc}/${comp.tipo}/${nombreArchivo}.zip`;
    await sb.storage.from('comprobantes').upload(zipPath, new Blob([new Uint8Array(zipBytes)], { type: 'application/zip' }), {
      cacheControl: 'no-cache', upsert: true, contentType: 'application/zip',
    });

    // 8. Enviar SOAP
    const endpointUrl = config.endpoint_factura;
    const r = await enviarSendBill({
      endpointUrl,
      rucEmisor: empresa.ruc,
      usuarioSol: config.usuario_sol,
      claveSol: config.clave_sol,
      zipBytes,
      nombreArchivoZip: nombreArchivo,
    });

    const duracion = Date.now() - inicio;

    // 9. Registrar envío
    let cdrPath: string | null = null;
    if (r.ok) {
      cdrPath = `comprobantes/${empresa.ruc}/${comp.tipo}/R-${nombreArchivo}.zip`;
      await sb.storage.from('comprobantes').upload(cdrPath, new Blob([Uint8Array.from(atob(r.cdrZipBase64), (c) => c.charCodeAt(0))], { type: 'application/zip' }), {
        cacheControl: 'no-cache', upsert: true, contentType: 'application/zip',
      });
    }

    await sb.from('sunat_envios').insert({
      comprobante_id: comprobanteId,
      xml_zip_path: zipPath,
      cdr_path: cdrPath,
      cdr_xml: r.ok ? null : null,
      endpoint_url: endpointUrl,
      http_status: r.ok ? 200 : (r.httpStatus ?? null),
      soap_fault: r.ok ? null : (r.soapFault ?? null),
      sunat_codigo: r.ok ? r.cdr.codigo : null,
      sunat_descripcion: r.ok ? r.cdr.descripcion : r.error,
      duracion_ms: duracion,
      exitoso: r.ok && r.cdr.codigo === '0',
      observaciones: r.ok ? r.cdr.observaciones : null,
    });

    // 10. Actualizar estado del comprobante
    let nuevoEstado: 'ACEPTADO' | 'OBSERVADO' | 'RECHAZADO' | 'BORRADOR' | 'EMITIDO' | 'ANULADO' = comp.estado;
    if (r.ok) {
      if (r.cdr.codigo === '0') nuevoEstado = 'ACEPTADO';
      else if (r.cdr.observaciones?.length) nuevoEstado = 'OBSERVADO';
      else nuevoEstado = 'RECHAZADO';
    }
    await sb.from('comprobantes').update({
      estado: nuevoEstado,
      xml_firmado_url: xmlPath,
      cdr_url: cdrPath,
      hash_firma: hashFirma,
      sunat_codigo_respuesta: r.ok ? r.cdr.codigo : null,
      sunat_mensaje: r.ok ? r.cdr.descripcion : r.error,
      sunat_enviado_en: new Date().toISOString(),
      sunat_aceptado_en: r.ok && r.cdr.codigo === '0' ? new Date().toISOString() : null,
    }).eq('id', comprobanteId);


    if (!r.ok) throw new Error(r.error);

    return {
      codigo: r.cdr.codigo,
      descripcion: r.cdr.descripcion,
      estado: nuevoEstado,
    };
  
}

/** Genera y envía el Resumen Diario de boletas de una fecha. */
export async function generarResumenDiarioConCliente(
  sb: ClienteSb,
  fechaReferencia?: string,
): Promise<{ rowId: string; resumenId: string; ticket: string; cantidad: number }> {

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sbAny = sb as unknown as { from: (t: string) => any };

    const { data: empresa } = await sb.from('empresa')
      .select('id, ruc, razon_social, nombre_comercial, direccion_fiscal, ubigeo').single();
    if (!empresa) throw new Error('Empresa no configurada');
    const { data: config } = await sb.from('sunat_config').select('*').eq('empresa_id', empresa.id).maybeSingle();
    if (!config?.certificado_pfx_base64 || !config.certificado_password) {
      throw new Error('Falta configurar SUNAT (certificado) en /configuracion/sunat');
    }

    const fechaRef = fechaReferencia || fechaPeru();

    const { data: boletas } = await sb.from('comprobantes')
      .select('id, serie, numero, numero_completo, tipo_documento_cliente, numero_documento_cliente, sub_total, igv, total, estado')
      .eq('tipo', 'BOLETA')
      .gte('fecha_emision', ventanaDiaPeru(fechaRef).desde)
      .lt('fecha_emision', ventanaDiaPeru(fechaRef).hasta)
      .neq('estado', 'ACEPTADO')
      .neq('estado', 'ANULADO');
    const lista = (boletas ?? []) as Array<{
      id: string; serie: string; numero: number; numero_completo: string | null;
      tipo_documento_cliente: string | null; numero_documento_cliente: string | null;
      sub_total: number | null; igv: number | null; total: number | null; estado: string;
    }>;
    if (lista.length === 0) throw new Error(`No hay boletas por informar en ${fechaRef}.`);

    const lineas: ResumenBoletaLinea[] = lista.map((b) => ({
      tipoDoc: '03',
      serieNumero: b.numero_completo ?? formatearNumeroComprobante(b.serie, b.numero),
      clienteTipoDoc: tipoDocClienteSunat(b.tipo_documento_cliente),
      clienteNumeroDoc: b.numero_documento_cliente || '0',
      condicion: '1',
      total: Number(b.total ?? 0),
      gravado: Number(b.sub_total ?? 0),
      igv: Number(b.igv ?? 0),
    }));

    // El identificador del resumen es RC-{fechaGeneracion}-{correlativo}, así que
    // el correlativo tiene que ser único por DÍA DE ENVÍO, no por día informado.
    // Contándolo por fecha_referencia, informar tres días distintos en la misma
    // jornada generaba tres veces "RC-AAAAMMDD-1": beta los acepta, pero
    // producción los rechaza por duplicado.
    const fechaGen = fechaPeru();
    const { count } = await sbAny.from('sunat_resumenes')
      .select('id', { count: 'exact', head: true })
      .eq('empresa_id', empresa.id).eq('fecha_generacion', fechaGen);
    const correlativo = (count ?? 0) + 1;

    const { xml, id: resumenId, nombreArchivo } = generarUBLResumenBoletas({
      correlativo, fechaReferencia: fechaRef, fechaGeneracion: fechaGen,
      emisor: {
        ruc: empresa.ruc, razonSocial: empresa.razon_social,
        direccionFiscal: empresa.direccion_fiscal ?? '', ubigeo: empresa.ubigeo ?? '150101',
      },
      lineas,
    });

    const xmlFirmado = firmarUBL(xml, { pfxBase64: config.certificado_pfx_base64, password: config.certificado_password });
    const zipBytes = await empaquetarZip(xmlFirmado, nombreArchivo);
    const zipPath = `comprobantes/${empresa.ruc}/RC/${nombreArchivo}.zip`;
    await sb.storage.from('comprobantes').upload(zipPath, new Blob([new Uint8Array(zipBytes)], { type: 'application/zip' }), { upsert: true, contentType: 'application/zip' });

    const snd = await enviarSendSummary({
      endpointUrl: config.endpoint_factura, rucEmisor: empresa.ruc,
      usuarioSol: config.usuario_sol, claveSol: config.clave_sol,
      zipBytes, nombreArchivoZip: nombreArchivo,
    });
    if (!snd.ok) throw new Error(`SUNAT rechazó el resumen: ${snd.error}`);

    const { data: insRow } = await sbAny.from('sunat_resumenes').insert({
      empresa_id: empresa.id, resumen_id: resumenId, fecha_referencia: fechaRef,
      fecha_generacion: fechaGen, correlativo, ticket: snd.ticket, estado: 'EN_PROCESO',
      cantidad_boletas: lineas.length, xml_zip_path: zipPath,
    }).select('id').single();

    return { rowId: insRow?.id as string, resumenId, ticket: snd.ticket, cantidad: lineas.length };
  
}


/**
 * Consulta el ticket de un resumen diario y, si SUNAT ya respondió, archiva el
 * CDR y cierra las boletas informadas.
 *
 * Sin este paso el resumen queda "enviado" pero las boletas nunca pasan a
 * aceptadas: el envío automático lo llama en cada corrida.
 */
export async function consultarResumenConCliente(
  sb: ClienteSb,
  resumenRowId: string,
): Promise<{ estado: string; codigo: string | null; descripcion: string | null }> {

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sbAny = sb as unknown as { from: (t: string) => any };

    const { data: empresa } = await sb.from('empresa').select('id, ruc').single();
    if (!empresa) throw new Error('Empresa no configurada');
    const { data: config } = await sb.from('sunat_config').select('*').eq('empresa_id', empresa.id).maybeSingle();
    if (!config) throw new Error('Falta configurar SUNAT');

    const { data: res } = await sbAny.from('sunat_resumenes').select('*').eq('id', resumenRowId).maybeSingle();
    if (!res) throw new Error('Resumen no encontrado');
    if (!res.ticket) throw new Error('El resumen no tiene ticket');

    const st = await consultarGetStatus({
      endpointUrl: config.endpoint_factura, rucEmisor: empresa.ruc,
      usuarioSol: config.usuario_sol, claveSol: config.clave_sol, ticket: res.ticket,
    });
    if (!st.ok) throw new Error(`Error consultando SUNAT: ${st.error}`);

    let estado = 'EN_PROCESO';
    let cdrPath: string | null = null;
    if (!st.enProceso) {
      const aceptado = st.cdr?.codigo === '0';
      estado = aceptado ? 'ACEPTADO' : 'RECHAZADO';
      if (st.cdrZipBase64) {
        cdrPath = `comprobantes/${empresa.ruc}/RC/R-${res.resumen_id}.zip`;
        await sb.storage.from('comprobantes').upload(cdrPath, new Blob([Uint8Array.from(atob(st.cdrZipBase64), (c) => c.charCodeAt(0))], { type: 'application/zip' }), { upsert: true, contentType: 'application/zip' });
      }
      if (aceptado) {
        await sb.from('comprobantes').update({
          estado: 'ACEPTADO', sunat_codigo_respuesta: '0',
          sunat_mensaje: `Aceptada por Resumen Diario ${res.resumen_id}`,
          sunat_aceptado_en: new Date().toISOString(),
        }).eq('tipo', 'BOLETA')
          // Misma ventana que se usó para armar el resumen: si acá se filtrara
          // por día UTC, las boletas de la noche quedarían sin marcar aunque
          // SUNAT sí las haya aceptado.
          .gte('fecha_emision', ventanaDiaPeru(res.fecha_referencia as string).desde)
          .lt('fecha_emision', ventanaDiaPeru(res.fecha_referencia as string).hasta)
          .neq('estado', 'ANULADO');
      }
    }

    await sbAny.from('sunat_resumenes').update({
      estado, sunat_codigo: st.cdr?.codigo ?? st.statusCode,
      sunat_descripcion: st.cdr?.descripcion ?? null, cdr_path: cdrPath,
      observaciones: st.cdr?.observaciones?.length ? st.cdr.observaciones : null,
      updated_at: new Date().toISOString(),
    }).eq('id', resumenRowId);

    return { estado, codigo: st.cdr?.codigo ?? st.statusCode, descripcion: st.cdr?.descripcion ?? null };
  
}
