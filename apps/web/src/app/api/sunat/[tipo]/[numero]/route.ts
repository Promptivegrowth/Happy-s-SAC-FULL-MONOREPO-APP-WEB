import { NextResponse } from 'next/server';
import { consultaDNI, consultaRUC } from '@happy/lib/sunat';

export const runtime = 'nodejs';

/**
 * GET /api/sunat/dni/12345678
 * GET /api/sunat/ruc/20123456789
 *
 * Endpoint PÚBLICO usado por el checkout de la web (no requiere sesión),
 * a diferencia del endpoint del ERP que sí exige auth.
 *
 * Motivo del split: el checkout de la web es para clientes ANÓNIMOS que
 * quieren autocompletar sus datos por DNI/RUC antes de finalizar la compra.
 * El token Decolecta queda del lado del server — no se expone.
 *
 * Protección básica anti-abuso:
 *  - Validación estricta de tipo (dni|ruc) y formato del número.
 *  - Cache in-memory de 1 hora para evitar quemar cuota en consultas
 *    repetidas del mismo documento.
 *  - Errores mapeados a códigos HTTP claros.
 */

// Cache simple en memoria de módulo (por instancia/deployment de Vercel).
// TTL 1 hora. Si Decolecta agrega firma en respuesta o cambia sus datos,
// esto se refresca solo al pasar 60 min.
type CacheEntry = { data: unknown; expira: number };
const cache = new Map<string, CacheEntry>();
const TTL_MS = 60 * 60 * 1000;

function fromCache(key: string): unknown | null {
  const e = cache.get(key);
  if (!e) return null;
  if (Date.now() > e.expira) {
    cache.delete(key);
    return null;
  }
  return e.data;
}

export async function GET(_req: Request, { params }: { params: Promise<{ tipo: string; numero: string }> }) {
  const { tipo, numero } = await params;
  const tipoLow = String(tipo).toLowerCase();
  const numeroLimpio = String(numero).replace(/\D/g, '');

  // Validaciones estrictas antes de gastar cuota
  if (tipoLow !== 'dni' && tipoLow !== 'ruc') {
    return NextResponse.json({ error: 'Tipo inválido (usar dni o ruc)' }, { status: 400 });
  }
  if (tipoLow === 'dni' && numeroLimpio.length !== 8) {
    return NextResponse.json({ error: 'DNI debe tener 8 dígitos' }, { status: 422 });
  }
  if (tipoLow === 'ruc' && numeroLimpio.length !== 11) {
    return NextResponse.json({ error: 'RUC debe tener 11 dígitos' }, { status: 422 });
  }

  const key = `${tipoLow}:${numeroLimpio}`;
  const cached = fromCache(key);
  if (cached) return NextResponse.json(cached);

  try {
    const data = tipoLow === 'dni'
      ? await consultaDNI(numeroLimpio)
      : await consultaRUC(numeroLimpio);
    cache.set(key, { data, expira: Date.now() + TTL_MS });
    return NextResponse.json(data);
  } catch (e) {
    const msg = (e as Error).message ?? 'Error consultando';
    let status = 500;
    if (msg.includes('inválido')) status = 422;
    else if (msg.includes('no encontrado')) status = 404;
    else if (msg.includes('Token inválido')) status = 500; // no exponer al cliente
    else if (msg.includes('Cuota')) status = 429;
    return NextResponse.json({ error: msg }, { status });
  }
}
