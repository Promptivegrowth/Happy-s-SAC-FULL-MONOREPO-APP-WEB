'use server';

/**
 * Descarga de los archivos SUNAT de un comprobante: XML firmado y CDR.
 *
 * El bucket `comprobantes` es privado: el enlace se firma acá y dura 5 minutos.
 * Antes el detalle armaba la URL /object/sign a mano, sin token, y el enlace
 * del CDR respondía 400 (auditoría del 11/10/2026).
 *
 * Las boletas no viajan sueltas: SUNAT las conoce por el Resumen Diario, así
 * que su constancia es el XML y el CDR de ese resumen.
 */

import { createServiceClient } from '@happy/db/service';
import { fechaLima } from '@happy/lib/format';
import { runAction, type ActionResult } from './_helpers';
import { getSession } from '../session';
import { puedeVer } from '../permisos';

export type ArchivoComprobante = 'xml' | 'cdr' | 'xml_resumen' | 'cdr_resumen';

export async function enlaceArchivoComprobante(
  id: string,
  archivo: ArchivoComprobante,
  envioId?: string,
): Promise<ActionResult<{ url: string; nombre: string }>> {
  return runAction(async () => {
    const s = await getSession();
    if (!puedeVer(s.roles, '/comprobantes')) throw new Error('Tu usuario no tiene acceso a Comprobantes.');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = createServiceClient() as any;

    let path: string | null = null;
    if (envioId) {
      // CDR de un envío puntual (tabla "Envíos SUNAT").
      const { data: e } = await sb.from('sunat_envios').select('cdr_path, comprobante_id').eq('id', envioId).maybeSingle();
      if (e?.comprobante_id !== id) throw new Error('Envío no encontrado.');
      path = e?.cdr_path ?? null;
    } else if (archivo === 'xml' || archivo === 'cdr') {
      const { data: c } = await sb.from('comprobantes').select('xml_firmado_url, cdr_url').eq('id', id).single();
      path = archivo === 'xml' ? c?.xml_firmado_url : c?.cdr_url;
    } else {
      const res = await resumenDeBoleta(sb, id);
      if (!res) throw new Error('Esta boleta todavía no fue informada a SUNAT en un resumen diario aceptado.');
      path = archivo === 'xml_resumen' ? res.xml_zip_path : res.cdr_path;
    }
    if (!path) {
      throw new Error(archivo.startsWith('cdr') ? 'SUNAT todavía no devolvió el CDR.' : 'Todavía no hay XML generado.');
    }
    const nombre = String(path).split('/').pop() || 'archivo-sunat';
    const { data, error } = await sb.storage.from('comprobantes').createSignedUrl(path, 300, { download: nombre });
    if (error || !data?.signedUrl) throw new Error(error?.message ?? 'No se pudo generar el enlace.');
    return { url: data.signedUrl as string, nombre };
  });
}

/**
 * Resumen diario ACEPTADO en que SUNAT recibió la boleta. Si la boleta se
 * anuló, el último (el de la baja).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resumenDeBoleta(sb: any, id: string): Promise<{ resumen_id: string; xml_zip_path: string | null; cdr_path: string | null } | null> {
  const { data: b } = await sb.from('comprobantes').select('tipo, fecha_emision').eq('id', id).single();
  if (!b || b.tipo !== 'BOLETA') return null;
  const { data: resumenes } = await sb.from('sunat_resumenes')
    .select('resumen_id, xml_zip_path, cdr_path, observaciones')
    .eq('fecha_referencia', fechaLima(b.fecha_emision as string))
    .eq('estado', 'ACEPTADO')
    .order('created_at', { ascending: false });
  const lista = (resumenes ?? []) as Array<{ resumen_id: string; xml_zip_path: string | null; cdr_path: string | null; observaciones: unknown }>;
  // Desde el 11/10/2026 cada resumen guarda qué boletas llevó; los anteriores no.
  const lleva = (o: unknown) => {
    const obs = o as { enviadas?: string[]; bajas?: string[]; adiciones_anuladas?: string[] } | null;
    if (!obs || Array.isArray(obs) || !Array.isArray(obs.enviadas)) return null;
    return [...obs.enviadas, ...(obs.bajas ?? []), ...(obs.adiciones_anuladas ?? [])].includes(id);
  };
  return lista.find((r) => lleva(r.observaciones) === true)
    ?? lista.find((r) => lleva(r.observaciones) === null)
    ?? null;
}
