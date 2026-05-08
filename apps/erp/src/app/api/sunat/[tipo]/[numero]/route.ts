import { NextResponse } from 'next/server';
import { consultaDNI, consultaRUC } from '@happy/lib/sunat';
import { createClient } from '@happy/db/server';

export const runtime = 'nodejs';

/**
 * GET /api/sunat/dni/12345678
 * GET /api/sunat/ruc/20123456789
 *
 * Requiere usuario autenticado staff para proteger el token.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ tipo: string; numero: string }> }) {
  const { tipo, numero } = await params;
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  try {
    if (tipo === 'dni') {
      const data = await consultaDNI(numero);
      return NextResponse.json(data);
    }
    if (tipo === 'ruc') {
      const data = await consultaRUC(numero);
      return NextResponse.json(data);
    }
    return NextResponse.json({ error: 'tipo inválido' }, { status: 400 });
  } catch (e) {
    const msg = (e as Error).message;
    // Mapear el mensaje a un código HTTP adecuado para que la consola no
    // muestre todo como 500 (que sugiere bug del server).
    let status = 500;
    if (msg.includes('inválido') || msg.includes('Documento inválido')) status = 422;
    else if (msg.includes('no encontrado')) status = 404;
    else if (msg.includes('Token inválido')) status = 401;
    else if (msg.includes('Cuota')) status = 429;
    return NextResponse.json({ error: msg }, { status });
  }
}
