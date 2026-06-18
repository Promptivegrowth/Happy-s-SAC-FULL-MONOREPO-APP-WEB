import { NextResponse } from 'next/server';
import { consultaDNI, consultaRUC } from '@happy/lib/sunat';
import { createClient } from '@happy/db/server';

export const runtime = 'nodejs';

/**
 * Espejo del endpoint del ERP — usa la misma librería @happy/lib/sunat
 * (Decolecta API) con el mismo token DECOLECTA_TOKEN.
 *
 * Protegido por sesión: solo cajeros logueados pueden consultar.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ tipo: string; numero: string }> },
) {
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
    return NextResponse.json({ error: 'tipo inválido (usar dni o ruc)' }, { status: 400 });
  } catch (e) {
    const msg = (e as Error).message;
    let status = 500;
    if (msg.includes('inválido') || msg.includes('Documento inválido')) status = 422;
    else if (msg.includes('no encontrado')) status = 404;
    else if (msg.includes('Token inválido')) status = 401;
    else if (msg.includes('Cuota')) status = 429;
    return NextResponse.json({ error: msg }, { status });
  }
}
