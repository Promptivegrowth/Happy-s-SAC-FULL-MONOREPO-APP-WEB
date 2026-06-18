'use client';

/**
 * Helper para enviar comprobantes por WhatsApp.
 *
 * Limitación honesta de WhatsApp deep links (wa.me): NO se puede adjuntar
 * el PDF directamente desde el navegador. El cajero descarga el PDF aparte
 * y lo arrastra al chat de WhatsApp manualmente. El deep link solo lleva
 * el texto formateado y abre el chat directo del cliente.
 *
 * Para envío de archivos automático se necesitaría WhatsApp Business API
 * (paga, requiere número aprobado por Meta).
 */

const TIPO_LABEL: Record<string, string> = {
  BOLETA: 'Boleta de Venta',
  FACTURA: 'Factura',
  NOTA_VENTA: 'Nota de Venta',
  NOTA_CREDITO: 'Nota de Crédito',
  NOTA_DEBITO: 'Nota de Débito',
};

export function construirMensajeWhatsApp(opts: {
  nombre_cliente: string;
  numero_comprobante: string;
  tipo_comprobante: string;
  total: number;
  fecha: string | Date;
  empresa_nombre: string;
}): string {
  const fecha = typeof opts.fecha === 'string' ? new Date(opts.fecha) : opts.fecha;
  const fechaTxt = fecha.toLocaleDateString('es-PE', { day: '2-digit', month: 'long', year: 'numeric' });
  const tipoTxt = TIPO_LABEL[opts.tipo_comprobante] ?? opts.tipo_comprobante;
  const totalTxt = `S/ ${opts.total.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const primerNombre = opts.nombre_cliente.split(' ')[0] || opts.nombre_cliente;

  return [
    `¡Hola ${primerNombre}! 👋`,
    '',
    `Gracias por tu compra en *${opts.empresa_nombre}*.`,
    '',
    `📄 ${tipoTxt}: *${opts.numero_comprobante}*`,
    `💰 Total: *${totalTxt}*`,
    `📅 ${fechaTxt}`,
    '',
    `Adjuntamos el comprobante. Cualquier consulta estamos a tu disposición.`,
  ].join('\n');
}

/**
 * Normaliza un teléfono peruano para wa.me:
 *  - Quita espacios, guiones, paréntesis
 *  - Si empieza con +, lo deja
 *  - Si son 9 dígitos (móvil PE), antepone 51
 *  - Si son 8 dígitos (fijo Lima), antepone 511
 *  - Otros casos: lo deja tal cual (asumimos ya tiene country code)
 */
export function normalizarTelefonoPE(tel: string): string {
  const limpio = tel.replace(/[^\d+]/g, '');
  if (limpio.startsWith('+')) return limpio.slice(1); // wa.me no quiere el +
  if (limpio.startsWith('51') && (limpio.length === 11 || limpio.length === 12)) return limpio;
  if (limpio.length === 9 && limpio.startsWith('9')) return `51${limpio}`;
  if (limpio.length === 8) return `511${limpio}`;
  return limpio;
}

export function abrirWhatsApp(telefono: string, mensaje: string) {
  const num = normalizarTelefonoPE(telefono);
  if (!num) return;
  const url = `https://wa.me/${num}?text=${encodeURIComponent(mensaje)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}
