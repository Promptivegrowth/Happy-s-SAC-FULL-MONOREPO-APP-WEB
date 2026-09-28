import { NextResponse } from 'next/server';
import { createServiceClient } from '@happy/db/service';
import { consultarDocumento } from '@happy/lib/sunat/consulta-guardada';

export const runtime = 'nodejs';

/**
 * GET /api/sunat/dni/12345678 · GET /api/sunat/ruc/20123456789
 *
 * PÚBLICO: lo usa el checkout, donde el comprador no tiene sesión.
 *
 * Por eso NO busca en los clientes registrados (`usarClientes: false`): si lo
 * hiciera, cualquiera podría averiguar los datos de un cliente de Happy's
 * escribiendo su DNI. Sí usa lo ya consultado a RENIEC/SUNAT, que es lo mismo
 * que devolvería la consulta y le ahorra cupo a todas las cajas.
 */
function estadoPorError(msg: string): number {
  if (msg.includes('Se agotaron las consultas')) return 429;
  if (msg.includes('inválido') || msg.includes('Documento inválido')) return 422;
  if (msg.includes('no encontrado')) return 404;
  if (msg.includes('Token inválido')) return 401;
  return 500;
}

export async function GET(_req: Request, { params }: { params: Promise<{ tipo: string; numero: string }> }) {
  const { tipo, numero } = await params;
  const tipoLow = String(tipo).toLowerCase();
  const n = String(numero).replace(/\D/g, '');

  // Validaciones estrictas antes de gastar cupo
  if (tipoLow !== 'dni' && tipoLow !== 'ruc') {
    return NextResponse.json({ error: 'Tipo inválido (usar dni o ruc)' }, { status: 400 });
  }
  if (tipoLow === 'dni' && n.length !== 8) return NextResponse.json({ error: 'DNI debe tener 8 dígitos' }, { status: 422 });
  if (tipoLow === 'ruc' && n.length !== 11) return NextResponse.json({ error: 'RUC debe tener 11 dígitos' }, { status: 422 });

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { datos } = await consultarDocumento(createServiceClient() as any, tipoLow, n, { usarClientes: false });
    return NextResponse.json(datos);
  } catch (e) {
    const msg = (e as Error).message ?? 'Error consultando';
    const status = estadoPorError(msg);
    // El detalle del token no se le muestra a un comprador.
    return NextResponse.json({ error: status === 401 ? 'No se pudo consultar' : msg }, { status: status === 401 ? 500 : status });
  }
}
