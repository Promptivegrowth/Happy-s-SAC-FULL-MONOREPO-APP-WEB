/**
 * Generador de mensajes pre-formateados para WhatsApp.
 *
 * Fallback cuando el cliente no quiere pagar con Yape/Plin/Tarjeta en la web.
 * Abre https://wa.me/51916856842?text=... con el pedido formateado.
 */

export type PedidoWaItem = {
  sku?: string | null;
  nombre: string;
  talla?: string | null;
  variante?: string | null;
  cantidad: number;
  precioUnit: number;
};

export type PedidoWaData = {
  numero?: string | null;         // nro de pedido interno
  cliente?: { nombre?: string; documento?: string; telefono?: string };
  direccion?: string | null;
  ubigeo?: string | null;         // "Lima / Lima / Miraflores"
  items: PedidoWaItem[];
  envio?: number;
  descuento?: number;
  notas?: string | null;
  canal?: 'WEB' | 'POS';
};

const WA_NUMBER = '51916856842';

function line(v: unknown): string {
  return v === undefined || v === null || v === '' ? '' : String(v);
}

function money(n: number): string {
  return `S/ ${n.toFixed(2)}`;
}

export function buildPedidoWaMessage(data: PedidoWaData): string {
  const total =
    data.items.reduce((a, it) => a + it.cantidad * it.precioUnit, 0) +
    (data.envio ?? 0) -
    (data.descuento ?? 0);

  const lines: string[] = [];
  lines.push('🎭 *NUEVO PEDIDO — DISFRACES HAPPYS*');
  if (data.numero) lines.push(`Pedido: *${data.numero}*`);
  if (data.canal) lines.push(`Canal: ${data.canal === 'WEB' ? '🛒 Web' : '🏬 Tienda'}`);
  lines.push('');

  if (data.cliente?.nombre || data.cliente?.documento || data.cliente?.telefono) {
    lines.push('👤 *Cliente*');
    if (data.cliente?.nombre) lines.push(`• ${line(data.cliente.nombre)}`);
    if (data.cliente?.documento) lines.push(`• Doc: ${data.cliente.documento}`);
    if (data.cliente?.telefono) lines.push(`• Tel: ${data.cliente.telefono}`);
    lines.push('');
  }

  if (data.direccion || data.ubigeo) {
    lines.push('📍 *Dirección de envío*');
    if (data.direccion) lines.push(`• ${data.direccion}`);
    if (data.ubigeo) lines.push(`• ${data.ubigeo}`);
    lines.push('');
  }

  lines.push('🛍️ *Items*');
  for (const it of data.items) {
    const talla = it.talla ? ` · Talla ${it.talla}` : '';
    const variante = it.variante ? ` · ${it.variante}` : '';
    const subtotal = it.cantidad * it.precioUnit;
    lines.push(`• ${it.cantidad} × ${it.nombre}${talla}${variante} — ${money(subtotal)}`);
    if (it.sku) lines.push(`  SKU: ${it.sku}`);
  }
  lines.push('');

  if (data.envio && data.envio > 0) lines.push(`Envío: ${money(data.envio)}`);
  if (data.descuento && data.descuento > 0) lines.push(`Descuento: -${money(data.descuento)}`);
  lines.push(`*TOTAL: ${money(total)}*`);
  lines.push('');

  if (data.notas) {
    lines.push('📝 *Notas*');
    lines.push(data.notas);
    lines.push('');
  }

  lines.push('_Enviado desde disfraceshappys.com_');
  return lines.join('\n');
}

export function buildWhatsappUrl(message: string, phone = WA_NUMBER): string {
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

export const WHATSAPP_NUMBER = WA_NUMBER;
