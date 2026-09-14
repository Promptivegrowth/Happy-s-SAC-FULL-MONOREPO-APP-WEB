'use server';

import { z } from 'zod';
import { runAction, requireUser, bumpPaths, type ActionResult } from './_helpers';
import { emitirComprobanteConCliente, generarResumenDiarioConCliente } from '../sunat-core';
import {
  generarUBLInvoice, generarUBLCreditNote, generarUBLDebitNote, generarUBLResumenBoletas, MOTIVO_ND,
  firmarUBL, empaquetarZip, enviarSendBill, enviarSendSummary, consultarGetStatus, digestSHA1,
  type ComprobanteInput, type ResumenBoletaLinea,
} from '@happy/lib/sunat-ubl';

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
import { numeroALetras, fechaLima, horaLima } from '@happy/lib/format';

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
    const r = await emitirComprobanteConCliente(sb, comprobanteId);
    await bumpPaths('/comprobantes', `/comprobantes/${comprobanteId}`);
    return r;
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

// ===========================================================================
// RESUMEN DIARIO DE BOLETAS (RC) — envío asíncrono a SUNAT
// ===========================================================================

/**
 * Genera y envía a SUNAT el Resumen Diario de las BOLETAS de una fecha.
 * Devuelve el ticket; el CDR se obtiene luego con `consultarResumenDiario`.
 */
export async function generarResumenDiarioBoletas(
  fechaReferencia?: string,
): Promise<ActionResult<{ rowId: string; resumenId: string; ticket: string; cantidad: number }>> {
  return runAction(async () => {
    const { sb } = await requireUser();
    const r = await generarResumenDiarioConCliente(sb, fechaReferencia);
    await bumpPaths('/comprobantes');
    return r;
  });
}

/** Consulta el ticket de un resumen y, si SUNAT ya procesó, guarda el CDR y marca las boletas. */
export async function consultarResumenDiario(
  resumenRowId: string,
): Promise<ActionResult<{ estado: string; codigo: string | null; descripcion: string | null }>> {
  return runAction(async () => {
    const { sb } = await requireUser();
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
          .gte('fecha_emision', `${res.fecha_referencia}T00:00:00`)
          .lte('fecha_emision', `${res.fecha_referencia}T23:59:59`)
          .neq('estado', 'ANULADO');
      }
    }

    await sbAny.from('sunat_resumenes').update({
      estado, sunat_codigo: st.cdr?.codigo ?? st.statusCode,
      sunat_descripcion: st.cdr?.descripcion ?? null, cdr_path: cdrPath,
      observaciones: st.cdr?.observaciones?.length ? st.cdr.observaciones : null,
      updated_at: new Date().toISOString(),
    }).eq('id', resumenRowId);

    await bumpPaths('/comprobantes');
    return { estado, codigo: st.cdr?.codigo ?? st.statusCode, descripcion: st.cdr?.descripcion ?? null };
  });
}
