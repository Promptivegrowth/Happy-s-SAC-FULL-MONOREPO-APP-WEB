'use server';

import { runAction, requireUser } from './_helpers';

/**
 * Devuelve una URL firmada (temporal) para ver/descargar el PDF de un
 * comprobante guardado en el bucket privado `comprobantes`.
 *
 * El PDF se sube desde el POS al emitir (ver apps/pos .../caja.ts
 * `guardarPdfComprobante`) y su ruta queda en `ventas.comprobante_pdf_path`.
 * Así el comprobante (nota, boleta o factura) es accesible desde cualquier PC
 * vía el ERP — pedido cliente 2026-08-30.
 *
 * Si `path` ya es una URL http(s) (caso SUNAT/PSE real), se devuelve tal cual.
 */
export async function firmarUrlComprobante(path: string) {
  return runAction(async () => {
    if (!path) throw new Error('Sin comprobante guardado');
    if (/^https?:\/\//i.test(path)) return { url: path };

    const { sb } = await requireUser();
    const { data, error } = await sb.storage
      .from('comprobantes')
      .createSignedUrl(path, 60 * 30); // 30 min
    if (error || !data?.signedUrl) {
      throw new Error(error?.message ?? 'No se pudo generar el enlace del comprobante');
    }
    return { url: data.signedUrl };
  });
}
