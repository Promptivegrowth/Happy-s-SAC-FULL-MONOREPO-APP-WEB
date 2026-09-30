'use server';

import { createClient } from '@happy/db/server';
import { armarReporteComprobantes, type ReporteComprobantes, type Sb } from '../reporte-comprobantes-core';

export type { FilaComprobante, TipoDoc, ResumenTipo, ReporteComprobantes } from '../reporte-comprobantes-core';

/** Reporte mensual de comprobantes (ver reporte-comprobantes-core.ts). */
export async function reporteComprobantesMes(mes: string): Promise<ReporteComprobantes> {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error('Tu sesión venció.');
  return armarReporteComprobantes(sb as unknown as Sb, mes);
}
