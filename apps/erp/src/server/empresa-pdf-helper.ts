'use server';

/**
 * Helper común para cargar datos de la empresa (incluido el logo como data URL
 * base64) listos para inyectar en cualquier PDF generado con jsPDF.
 *
 * Se usa en:
 *  - Proforma B2B (apps/erp/src/app/(dashboard)/b2b/[id]/proforma-pdf.ts)
 *  - Libro de reclamaciones (apps/erp/src/app/(dashboard)/reclamos/[id]/pdf.ts)
 *  - Exportaciones brandeadas (apps/erp/src/server/actions/exportar.ts)
 *
 * El logo se descarga server-side y se convierte a data URL para que jsPDF lo
 * pueda incrustar directamente con `doc.addImage(..., 'PNG'|'JPEG', ...)`. Si
 * el fetch falla, devolvemos `logo_dataurl: null` y los renderers siguen.
 */

import { createClient } from '@happy/db/server';

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
    const sb = await createClient();
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
