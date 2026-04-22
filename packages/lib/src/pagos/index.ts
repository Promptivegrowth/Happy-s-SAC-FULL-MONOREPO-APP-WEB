/**
 * Pasarelas de pago (Perú) + generación de QR Yape/Plin estáticos.
 * Integraciones reales deben ejecutarse server-side.
 */

import QRCode from 'qrcode';

export type MetodoPagoWeb = 'yape' | 'plin' | 'culqi_card' | 'izipay_card' | 'transferencia' | 'whatsapp';

export async function generarYapeQr(numero: string, monto: number, referencia: string): Promise<string> {
  // QR estático: número + nota (algunas billeteras solo leen el número, el monto/referencia
  // aparecen como texto al lado del QR).
  const payload = `yape://transferencia?numero=${numero}&monto=${monto.toFixed(2)}&ref=${encodeURIComponent(referencia)}`;
  return QRCode.toDataURL(payload, { errorCorrectionLevel: 'M', margin: 2, scale: 6 });
}

export async function generarPlinQr(numero: string, monto: number, referencia: string): Promise<string> {
  const payload = `plin://pagar?numero=${numero}&monto=${monto.toFixed(2)}&ref=${encodeURIComponent(referencia)}`;
  return QRCode.toDataURL(payload, { errorCorrectionLevel: 'M', margin: 2, scale: 6 });
}

// ===== Culqi (server-side) =====
// Docs: https://docs.culqi.com

export type CulqiCargoInput = {
  amountCents: number;     // céntimos de PEN
  email: string;
  source_id: string;       // token de tarjeta creado en el front con culqi.js
  description?: string;
  metadata?: Record<string, string>;
};

export async function crearCargoCulqi(
  input: CulqiCargoInput,
  opts: { secretKey?: string } = {},
): Promise<{ id: string; outcome: { type: string; code?: string; merchant_message?: string } }> {
  const secret = opts.secretKey ?? process.env.CULQI_SECRET_KEY;
  if (!secret) throw new Error('CULQI_SECRET_KEY no configurado');

  const res = await fetch('https://api.culqi.com/v2/charges', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount: input.amountCents,
      currency_code: 'PEN',
      email: input.email,
      source_id: input.source_id,
      description: input.description,
      metadata: input.metadata,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Culqi error: ${JSON.stringify(err)}`);
  }
  return res.json();
}

// ===== Izipay (placeholder) =====
// Izipay requiere SDK cargado en el front + webhook de confirmación. Configurar
// IZIPAY_MERCHANT_ID, IZIPAY_PUBLIC_KEY, IZIPAY_HMAC_KEY y validar la firma HMAC
// en el webhook.

export function validarFirmaIzipay(rawBody: string, signature: string, hmacKey: string): boolean {
  // Implementación simplificada - validar con `crypto.createHmac('sha256', hmacKey).update(rawBody).digest('hex')`
  // dejado como referencia para el Edge Function.
  void rawBody;
  void signature;
  void hmacKey;
  return false; // implementar en la Edge Function correspondiente
}
