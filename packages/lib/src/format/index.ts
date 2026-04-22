/**
 * Helpers de formato para Perú (es-PE, PEN, fechas).
 */

const NF_PEN = new Intl.NumberFormat('es-PE', {
  style: 'currency',
  currency: 'PEN',
  minimumFractionDigits: 2,
});

const NF_NUMBER = new Intl.NumberFormat('es-PE');

const DF_DATE = new Intl.DateTimeFormat('es-PE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const DF_DATETIME = new Intl.DateTimeFormat('es-PE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export function formatPEN(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const num = typeof value === 'string' ? Number(value) : value;
  if (Number.isNaN(num)) return '—';
  return NF_PEN.format(num);
}

export function formatNumber(value: number | null | undefined, decimals = 0): string {
  if (value === null || value === undefined) return '—';
  return value.toLocaleString('es-PE', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  return DF_DATE.format(d);
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  return DF_DATETIME.format(d);
}

/** Convierte número a letras (importes para boletas/facturas). Versión compacta. */
export function numeroALetras(num: number): string {
  if (num === 0) return 'CERO CON 00/100 SOLES';
  const entero = Math.floor(num);
  const decimal = Math.round((num - entero) * 100);
  const letras = enteroALetras(entero);
  const cents = String(decimal).padStart(2, '0');
  return `${letras} CON ${cents}/100 SOLES`;
}

const UNIDADES = ['', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
const DECENAS = ['', 'DIEZ', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
const ESPECIALES_10_19 = ['DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE'];
const CENTENAS = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

function enteroALetras(num: number): string {
  if (num === 0) return 'CERO';
  if (num < 10) return UNIDADES[num]!;
  if (num >= 10 && num < 20) return ESPECIALES_10_19[num - 10]!;
  if (num < 30) return num === 20 ? 'VEINTE' : `VEINTI${UNIDADES[num - 20]!.toLowerCase().toUpperCase()}`;
  if (num < 100) {
    const d = Math.floor(num / 10);
    const u = num % 10;
    return u === 0 ? DECENAS[d]! : `${DECENAS[d]!} Y ${UNIDADES[u]}`;
  }
  if (num === 100) return 'CIEN';
  if (num < 1000) {
    const c = Math.floor(num / 100);
    const r = num % 100;
    return r === 0 ? CENTENAS[c]! : `${CENTENAS[c]!} ${enteroALetras(r)}`;
  }
  if (num < 1_000_000) {
    const miles = Math.floor(num / 1000);
    const r = num % 1000;
    const milesStr = miles === 1 ? 'MIL' : `${enteroALetras(miles)} MIL`;
    return r === 0 ? milesStr : `${milesStr} ${enteroALetras(r)}`;
  }
  const millones = Math.floor(num / 1_000_000);
  const r = num % 1_000_000;
  const millStr = millones === 1 ? 'UN MILLÓN' : `${enteroALetras(millones)} MILLONES`;
  return r === 0 ? millStr : `${millStr} ${enteroALetras(r)}`;
}

export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

export { NF_NUMBER };
