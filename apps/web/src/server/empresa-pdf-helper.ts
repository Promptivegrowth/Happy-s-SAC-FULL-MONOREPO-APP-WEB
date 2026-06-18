'use server';

/**
 * Helper común para cargar datos de la empresa (incluido el logo como data URL
 * base64) listos para inyectar en cualquier PDF generado con jsPDF.
 *
 * Versión paralela a `apps/erp/src/server/empresa-pdf-helper.ts`. Se mantienen
 * copias por app (en vez de extraer a @happy/lib) para simplificar deploys —
 * cada Next.js compila su propio bundle server.
 *
 * Usado en:
 *  - Libro de reclamaciones público (apps/web/src/app/libro-de-reclamaciones/pdf.ts)
 */

import { createServiceClient } from '@happy/db/service';

export type EmpresaPDFData = {
  razon_social: string;
  nombre_comercial: string | null;
  ruc: string;
  direccion_fiscal: string | null;
  telefono: string | null;
  email: string | null;
  /** Data URL listo para jsPDF.addImage. Null si no se pudo cargar. */
  logo_dataurl: string | null;
  /** Formato de imagen detectado (PNG / JPEG). Útil al pasar a addImage. */
  logo_formato: 'PNG' | 'JPEG' | null;
};

export async function cargarEmpresaPDF(): Promise<EmpresaPDFData | null> {
  try {
    // SERVICE CLIENT: la tabla `empresa` tiene RLS solo para staff autenticado,
    // así que el rol anon (consumidor del libro de reclamaciones) no podría
    // leerla. Usamos service role aquí porque los datos NO son sensibles
    // (razón social, RUC, dirección, teléfono, email son datos públicos en
    // cualquier factura/boleta del país) y son OBLIGATORIOS por INDECOPI.
    const sb = createServiceClient();
    const { data: empresa } = await sb
      .from('empresa')
      .select(
        'razon_social, nombre_comercial, ruc, direccion_fiscal, telefono, email, logo_url',
      )
      .single();
    if (!empresa) return null;

    let logo_dataurl: string | null = null;
    let logo_formato: 'PNG' | 'JPEG' | null = null;
    const logoUrl = empresa.logo_url as string | null;
    if (logoUrl) {
      try {
        const resp = await fetch(logoUrl, { cache: 'no-store' });
        if (resp.ok) {
          const buf = Buffer.from(await resp.arrayBuffer());
          const ext = (logoUrl.split('.').pop() ?? 'png').toLowerCase();
          const isJpg = ext === 'jpg' || ext === 'jpeg';
          logo_formato = isJpg ? 'JPEG' : 'PNG';
          const mime = isJpg ? 'image/jpeg' : 'image/png';
          logo_dataurl = `data:${mime};base64,${buf.toString('base64')}`;
        }
      } catch {
        /* logo opcional — si falla el fetch, seguimos sin él */
      }
    }

    return {
      razon_social: empresa.razon_social as string,
      nombre_comercial: (empresa.nombre_comercial as string | null) ?? null,
      ruc: empresa.ruc as string,
      direccion_fiscal: (empresa.direccion_fiscal as string | null) ?? null,
      telefono: (empresa.telefono as string | null) ?? null,
      email: (empresa.email as string | null) ?? null,
      logo_dataurl,
      logo_formato,
    };
  } catch {
    return null;
  }
}
