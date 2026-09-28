import { NextResponse } from 'next/server';
import { createClient } from '@happy/db/server';
import { createServiceClient } from '@happy/db/service';
import { consultarDocumento } from '@happy/lib/sunat/consulta-guardada';

export const runtime = 'nodejs';

/**
 * GET /api/sunat/dni/12345678 · GET /api/sunat/ruc/20123456789
 *
 * Solo para personal con sesión. Busca primero en lo ya consultado y en los
 * clientes registrados, y recién después gasta una consulta de RENIEC/SUNAT
 * (ver `consultarDocumento`). La respuesta dice de dónde salió en `fuente`.
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
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  if (tipo !== 'dni' && tipo !== 'ruc') return NextResponse.json({ error: 'tipo inválido (usar dni o ruc)' }, { status: 400 });
  const n = String(numero).replace(/\D/g, '');
  if ((tipo === 'dni' && n.length !== 8) || (tipo === 'ruc' && n.length !== 11)) {
    return NextResponse.json({ error: `${tipo.toUpperCase()} inválido` }, { status: 422 });
  }

  try {
    // Cliente de servicio: la tabla de consultas guardadas no la lee nadie más.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { datos, fuente } = await consultarDocumento(createServiceClient() as any, tipo, n);
    return NextResponse.json({ ...datos, fuente });
  } catch (e) {
    const msg = (e as Error).message;
    return NextResponse.json({ error: msg }, { status: estadoPorError(msg) });
  }
}
