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

    const lineas = (comp as unknown as { comprobantes_lineas: { codigo: string | null; descripcion: string; cantidad: number; unidad_sunat: string | null; precio_unitario: number; descuento: number | null; afectacion_igv: string | null; variante_id: string | null }[] }).comprobantes_lineas;
    if (!lineas || lineas.length === 0) throw new Error('Comprobante sin líneas');

    const valorRefPorCodigo = await valoresReferencialesGratis(sb, comp.venta_id as string | null, lineas);

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
        // Prenda regalada (precio 0): va como transferencia gratuita con su precio de lista.
        ...(Number(l.precio_unitario) === 0
          ? { valorReferencialConIgv: valorRefPorCodigo.get(l.variante_id ?? '') ?? valorRefPorCodigo.get(l.codigo ?? '') }
          : {}),
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

    /*
     * En el resumen entran dos cosas distintas.
     *
     *  - Las boletas del día que todavía no se informaron  -> condición 1.
     *  - Las anuladas cuya baja SUNAT todavía no conoce    -> condición 3.
     *
     * Las boletas no se dan de baja de a una: la anulación se comunica dentro
     * de este mismo resumen. Una boleta anulada ANTES de informarse igual
     * tiene que viajar marcada como anulada; si simplemente no se mandara,
     * quedaría un hueco en la numeración que nadie puede explicar.
     */
    const { data: boletas } = await sbAny.from('comprobantes')
      .select('id, serie, numero, numero_completo, tipo_documento_cliente, numero_documento_cliente, sub_total, igv, total, estado, sunat_aceptado_en, anulacion_informada_en')
      .eq('tipo', 'BOLETA')
      .gte('fecha_emision', ventanaDiaPeru(fechaRef).desde)
      .lt('fecha_emision', ventanaDiaPeru(fechaRef).hasta)
      .neq('estado', 'ACEPTADO');
    const todas = (boletas ?? []) as Array<{
      id: string; serie: string; numero: number; numero_completo: string | null;
      tipo_documento_cliente: string | null; numero_documento_cliente: string | null;
      sub_total: number | null; igv: number | null; total: number | null; estado: string;
      sunat_aceptado_en: string | null; anulacion_informada_en: string | null;
    }>;
    // Una anulada que ya se informó no vuelve a mandarse: SUNAT la rechazaría
    // por repetida.
    const lista = todas.filter(
      (b) => b.estado !== 'ANULADO' || b.anulacion_informada_en === null,
    );
    if (lista.length === 0) throw new Error(`No hay boletas por informar en ${fechaRef}.`);

    /*
     * Una anulada que SUNAT nunca conoció se informa en DOS resúmenes.
     *
     * SUNAT no deja dar de baja (condición 3) una boleta que no tiene
     * registrada: responde 2663 "el documento indicado no existe" y rechaza el
     * resumen ENTERO, con todas las boletas del día. Así quedaron sin informar
     * todos los días con una anulada desde el 30/09/2026. Por eso primero va
     * como emitida (condición 1) y, aceptado ese resumen, el siguiente la da de
     * baja (condición 3).
     */
    const esBaja = (b: (typeof lista)[number]) => b.estado === 'ANULADO' && b.sunat_aceptado_en !== null;
    const lineas: ResumenBoletaLinea[] = lista.map((b) => ({
      tipoDoc: '03',
      serieNumero: b.numero_completo ?? formatearNumeroComprobante(b.serie, b.numero),
      clienteTipoDoc: tipoDocClienteSunat(b.tipo_documento_cliente),
      clienteNumeroDoc: b.numero_documento_cliente || '0',
      condicion: esBaja(b) ? '3' : '1',
      total: Number(b.total ?? 0),
      gravado: Number(b.sub_total ?? 0),
      igv: Number(b.igv ?? 0),
    }));

    // Qué viaja en este resumen. Se marca recién cuando SUNAT lo acepte.
    const bajasEnviadas = lista.filter(esBaja).map((b) => b.id);
    const adicionesAnuladas = lista.filter((b) => b.estado === 'ANULADO' && !esBaja(b)).map((b) => b.id);
    const enviadas = lista.filter((b) => b.estado !== 'ANULADO').map((b) => b.id);

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
      // Lo que viaja en este resumen. Se anota acá y no se da por informado
      // hasta que SUNAT responda que aceptó el resumen.
      observaciones: { enviadas, bajas: bajasEnviadas, adiciones_anuladas: adicionesAnuladas },
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

    // Lo que viajó en el resumen (desde el 11/10/2026 se guarda la lista completa).
    const obsRes = (res.observaciones ?? null) as {
      enviadas?: string[]; bajas?: string[]; adiciones_anuladas?: string[]; sunat?: unknown;
    } | null;
    const enviadasRes = Array.isArray(obsRes?.enviadas) ? obsRes!.enviadas! : null;
    const adicionesRes = obsRes?.adiciones_anuladas ?? [];

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
        const marcaAceptada = {
          estado: 'ACEPTADO' as const, sunat_codigo_respuesta: '0',
          sunat_mensaje: `Aceptada por Resumen Diario ${res.resumen_id}`,
          sunat_aceptado_en: new Date().toISOString(),
        };
        if (enviadasRes) {
          // Solo las que viajaron en ESTE resumen: una boleta emitida después
          // de armarlo no puede darse por aceptada sin que SUNAT la conozca.
          for (let i = 0; i < enviadasRes.length; i += 150) {
            await sb.from('comprobantes').update(marcaAceptada)
              .in('id', enviadasRes.slice(i, i + 150)).neq('estado', 'ANULADO');
          }
        } else {
          // Resúmenes anteriores al 11/10/2026, que no guardaban la lista.
          await sb.from('comprobantes').update(marcaAceptada).eq('tipo', 'BOLETA')
            // Misma ventana que se usó para armar el resumen: si acá se filtrara
            // por día UTC, las boletas de la noche quedarían sin marcar aunque
            // SUNAT sí las haya aceptado.
            .gte('fecha_emision', ventanaDiaPeru(res.fecha_referencia as string).desde)
            .lt('fecha_emision', ventanaDiaPeru(res.fecha_referencia as string).hasta)
            .neq('estado', 'ANULADO');
        }

        // Anuladas que viajaron como emitidas: SUNAT ya las conoce y el
        // resumen siguiente las da de baja (siguen en estado ANULADO).
        if (adicionesRes.length > 0) {
          await sbAny.from('comprobantes').update({
            sunat_aceptado_en: new Date().toISOString(),
            sunat_mensaje: `Informada en Resumen Diario ${res.resumen_id}; falta comunicar su anulación`,
          }).in('id', adicionesRes);
        }

        /*
         * Las bajas que viajaron en este resumen quedan informadas.
         *
         * Se marcan SOLO acá, con el resumen ya aceptado. Si se marcaran al
         * enviarlo y SUNAT lo rechazara, la baja quedaría dada por comunicada
         * sin estarlo, y no volvería a intentarse nunca.
         */
        const bajas = obsRes?.bajas ?? [];
        if (bajas.length > 0) {
          await sbAny.from('comprobantes').update({
            anulacion_informada_en: new Date().toISOString(),
            sunat_mensaje: `Anulación comunicada en Resumen Diario ${res.resumen_id}`,
          }).in('id', bajas);
        }
      }
    }

    await sbAny.from('sunat_resumenes').update({
      estado, sunat_codigo: st.cdr?.codigo ?? st.statusCode,
      sunat_descripcion: st.cdr?.descripcion ?? null, cdr_path: cdrPath,
      /*
       * Se conserva lo que viajó y se suman las observaciones de SUNAT. Antes
       * se pisaba: con el ticket todavía en proceso quedaba en null, y al
       * aceptarse ya no se sabía qué bajas marcar como informadas.
       */
      observaciones: obsRes && !Array.isArray(obsRes)
        ? { ...obsRes, sunat: st.cdr?.observaciones?.length ? st.cdr.observaciones : (obsRes.sunat ?? null) }
        : (st.cdr?.observaciones?.length ? st.cdr.observaciones : obsRes),
      updated_at: new Date().toISOString(),
    }).eq('id', resumenRowId);

    return { estado, codigo: st.cdr?.codigo ?? st.statusCode, descripcion: st.cdr?.descripcion ?? null };
  
}

/**
 * Precio de lista (con IGV) de las prendas regaladas de un comprobante, para
 * declararlas como transferencia gratuita. Clave: variante y código.
 *
 * El comprobante no siempre guarda la variante (F006-00000037 no la tenía), así
 * que se toma de la venta: sus líneas en 0 dicen qué prenda se regaló.
 */
async function valoresReferencialesGratis(
  sb: ClienteSb,
  ventaId: string | null,
  lineas: { codigo: string | null; precio_unitario: number; variante_id: string | null }[],
): Promise<Map<string, number>> {
  const mapa = new Map<string, number>();
  if (!lineas.some((l) => Number(l.precio_unitario) === 0)) return mapa;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sbAny = sb as unknown as { from: (t: string) => any };

  const varIds = new Set(lineas.filter((l) => Number(l.precio_unitario) === 0 && l.variante_id).map((l) => l.variante_id as string));
  if (ventaId) {
    const { data: vl } = await sbAny.from('ventas_lineas').select('variante_id, precio_unitario').eq('venta_id', ventaId);
    for (const l of (vl ?? []) as { variante_id: string | null; precio_unitario: number }[]) {
      if (Number(l.precio_unitario) === 0 && l.variante_id) varIds.add(l.variante_id);
    }
  }
  if (varIds.size > 0) {
    const { data: vars } = await sbAny.from('productos_variantes')
      .select('id, precio_publico, producto:producto_id(codigo)').in('id', [...varIds]);
    for (const v of (vars ?? []) as { id: string; precio_publico: number | null; producto: { codigo: string | null } | null }[]) {
      const precio = Number(v.precio_publico ?? 0);
      if (precio <= 0) continue;
      mapa.set(v.id, precio);
      const cod = v.producto?.codigo;
      if (cod) mapa.set(cod, Math.max(mapa.get(cod) ?? 0, precio));
    }
  }
  // Sin venta (o sin variante): el mayor precio de lista del modelo.
  const sinPrecio = [...new Set(lineas
    .filter((l) => Number(l.precio_unitario) === 0 && l.codigo && !mapa.has(l.codigo) && !(l.variante_id && mapa.has(l.variante_id)))
    .map((l) => l.codigo as string))];
  if (sinPrecio.length > 0) {
    const { data: prods } = await sbAny.from('productos')
      .select('codigo, productos_variantes(precio_publico)').in('codigo', sinPrecio);
    for (const p of (prods ?? []) as { codigo: string; productos_variantes: { precio_publico: number | null }[] }[]) {
      const precio = Math.max(0, ...(p.productos_variantes ?? []).map((v) => Number(v.precio_publico ?? 0)));
      if (precio > 0) mapa.set(p.codigo, precio);
    }
  }
  return mapa;
}
