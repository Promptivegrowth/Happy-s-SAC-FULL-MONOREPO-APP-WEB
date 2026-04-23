'use server';

import { z } from 'zod';
import { runAction, requireUser, bumpPaths, type ActionResult } from './_helpers';
import {
  generarUBLInvoice, firmarUBL, empaquetarZip, enviarSendBill,
  type ComprobanteInput,
} from '@happy/lib/sunat-ubl';
import { numeroALetras } from '@happy/lib/format';

const TIPO_MAP: Record<string, '01' | '03' | '07' | '08'> = {
  FACTURA: '01',
  BOLETA: '03',
  NOTA_CREDITO: '07',
  NOTA_DEBITO: '08',
};

/**
 * Emite (envía a SUNAT) un comprobante existente en estado BORRADOR.
 * Pasa por: cargar config + cert → cargar comprobante + líneas → generar XML →
 * firmar → empaquetar zip → enviar SOAP → procesar CDR → actualizar estado.
 */
export async function emitirComprobanteSunat(comprobanteId: string): Promise<ActionResult<{ codigo: string; descripcion: string; estado: string }>> {
  return runAction(async () => {
    const { sb } = await requireUser();
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
    const input: ComprobanteInput = {
      tipo: tipoSunat,
      serie: comp.serie,
      numero: Number(comp.numero),
      fechaEmision: String(comp.fecha_emision).slice(0, 10),
      horaEmision: String(comp.fecha_emision).slice(11, 19) || '12:00:00',
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
    };

    // 4. Generar UBL XML
    const { xml, nombreArchivo } = generarUBLInvoice(input);

    // 5. Firmar
    const xmlFirmado = firmarUBL(xml, {
      pfxBase64: config.certificado_pfx_base64,
      password: config.certificado_password,
    });

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
      sunat_codigo_respuesta: r.ok ? r.cdr.codigo : null,
      sunat_mensaje: r.ok ? r.cdr.descripcion : r.error,
      sunat_enviado_en: new Date().toISOString(),
      sunat_aceptado_en: r.ok && r.cdr.codigo === '0' ? new Date().toISOString() : null,
    }).eq('id', comprobanteId);

    await bumpPaths('/comprobantes', `/comprobantes/${comprobanteId}`);

    if (!r.ok) throw new Error(r.error);

    return {
      codigo: r.cdr.codigo,
      descripcion: r.cdr.descripcion,
      estado: nuevoEstado,
    };
  });
}

const configSchema = z.object({
  ambiente: z.enum(['BETA', 'PRODUCCION']).default('BETA'),
  usuario_sol: z.string().min(3),
  clave_sol: z.string().min(3),
  endpoint_factura: z.string().url(),
  certificado_password: z.string().optional().or(z.literal('')),
  firmante_nombre: z.string().optional().or(z.literal('')),
});

export async function actualizarSunatConfig(_prev: unknown, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const data = configSchema.parse({
      ambiente: fd.get('ambiente') ?? 'BETA',
      usuario_sol: fd.get('usuario_sol'),
      clave_sol: fd.get('clave_sol'),
      endpoint_factura: fd.get('endpoint_factura'),
      certificado_password: fd.get('certificado_password') ?? '',
      firmante_nombre: fd.get('firmante_nombre') ?? '',
    });
    const { sb } = await requireUser();
    const { data: empresa } = await sb.from('empresa').select('id').single();
    if (!empresa) throw new Error('Empresa no configurada');

    const certFile = fd.get('certificado_pfx');
    let certPfxBase64: string | undefined;
    if (certFile instanceof File && certFile.size > 0) {
      const buf = await certFile.arrayBuffer();
      certPfxBase64 = Buffer.from(buf).toString('base64');
    }

    const updates = {
      empresa_id: empresa.id,
      ambiente: data.ambiente,
      usuario_sol: data.usuario_sol,
      clave_sol: data.clave_sol,
      endpoint_factura: data.endpoint_factura,
      firmante_nombre: data.firmante_nombre || null,
      ...(certPfxBase64 ? { certificado_pfx_base64: certPfxBase64 } : {}),
      ...(data.certificado_password ? { certificado_password: data.certificado_password } : {}),
    };

    const { error } = await sb.from('sunat_config').upsert(updates, { onConflict: 'empresa_id' });
    if (error) throw new Error(error.message);
    await bumpPaths('/configuracion/sunat');
    return null;
  });
}
