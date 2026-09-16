/**
 * Generador del PDF de ETIQUETAS DE CÓDIGO DE BARRAS.
 *
 * Reproduce la etiqueta que la tienda ya usa: el nombre del producto con su
 * talla arriba, el código de barras al centro y el código legible debajo. Ese
 * código legible no es decorativo: si el lector falla, la cajera lo tipea y el
 * POS igual encuentra la prenda, porque busca por código de barras y por SKU.
 *
 * Simbología CODE 128: admite letras y números (los códigos del cliente son del
 * tipo PR113, DT695), no exige comprar un rango a GS1 y lo lee cualquier
 * pistola. EAN-13 solo valdría la pena si vendieran en retail de terceros.
 *
 * Las barras se dibujan como RECTÁNGULOS VECTORIALES, no como imagen. En una
 * térmica de 203 dpi una barra rasterizada se redondea al píxel más cercano y
 * ensancha o adelgaza módulos; el vector lo resuelve la impresora a su propia
 * resolución y sale limpio. De paso permite verificar el resultado sin navegador.
 *
 * Dos formatos de salida:
 *   · ROLLO  -> una etiqueta por página, del tamaño exacto del rollo. Es lo que
 *              espera la Zebra ZD421 cuando se imprime por el driver de Windows.
 *   · HOJA A4 -> varias etiquetas por hoja, para papel adhesivo en impresora
 *              común mientras la Zebra no esté configurada.
 */

import {
  codificarCode128,
  dibujarBarrasPDF,
  anchoModuloMm,
  MODULO_MIN_MM,
} from '@happy/lib/barcode';

export type EtiquetaItem = {
  /** Lo que se imprime arriba, ej. "Abejita". */
  nombre: string;
  /** Talla ya formateada para mostrar, ej. "6" o "Única". */
  talla: string;
  /** Lo que se codifica y se imprime debajo, ej. "PR113". */
  codigo: string;
  /** Cuántas etiquetas de esta prenda. */
  cantidad: number;
};

export type Formato = {
  id: string;
  nombre: string;
  /** Milímetros de la etiqueta física. */
  ancho: number;
  alto: number;
  /** 'rollo' = una por página; 'a4' = varias por hoja. */
  soporte: 'rollo' | 'a4';
  /**
   * Cuántas etiquetas hay a lo ancho del rollo.
   *
   * Casi todos los rollos son de una sola columna, pero el del almacén viene
   * troquelado de a dos. Es el dato que decide si la Zebra pone un código por
   * avance de papel o dos, uno al lado del otro; medirlo mal es exactamente el
   * error que hacía salir un código estirado sobre los dos stickers.
   */
  columnas: number;
};

/** Medidas de rollo habituales, más la variante en hoja A4. */
export const FORMATOS: Formato[] = [
  { id: 'r50x25d', nombre: 'Rollo 50 × 25 mm · DOS por fila (Zebra)', ancho: 50, alto: 25, soporte: 'rollo', columnas: 2 },
  { id: 'r50x25', nombre: 'Rollo 50 × 25 mm (Zebra)', ancho: 50, alto: 25, soporte: 'rollo', columnas: 1 },
  { id: 'r50x30', nombre: 'Rollo 50 × 30 mm (Zebra)', ancho: 50, alto: 30, soporte: 'rollo', columnas: 1 },
  { id: 'r40x25', nombre: 'Rollo 40 × 25 mm (Zebra)', ancho: 40, alto: 25, soporte: 'rollo', columnas: 1 },
  { id: 'r60x40', nombre: 'Rollo 60 × 40 mm (Zebra)', ancho: 60, alto: 40, soporte: 'rollo', columnas: 1 },
  { id: 'r100x50', nombre: 'Rollo 100 × 50 mm (Zebra)', ancho: 100, alto: 50, soporte: 'rollo', columnas: 1 },
  { id: 'a4_50x30', nombre: 'Hoja A4 · etiquetas de 50 × 30 mm', ancho: 50, alto: 30, soporte: 'a4', columnas: 1 },
];

/** Altura mínima de barras para que la pistola enganche cómodamente. */
const BARRAS_MIN_MM = 7;

/** 1 punto tipográfico en milímetros; sirve para calcular alturas de texto. */
const PT_MM = 0.352778;

/**
 * Nombre corto para la etiqueta. El cliente rotula "ABEJITA #6", no
 * "DISFRAZ DE ABEJITA #6": el prefijo se repite en todo el catálogo y solo roba
 * ancho, que en 50 mm es lo único escaso.
 */
export function nombreCorto(nombre: string): string {
  return (nombre ?? '')
    .replace(/^\s*(disfraz|disfras|traje|conjunto)\s+(de\s+(la\s+|el\s+|los\s+|las\s+)?)?/i, '')
    .trim() || (nombre ?? '').trim();
}

/**
 * Lo que va rotulado arriba de la etiqueta.
 *
 * Vive acá y no en cada generador para que el PDF y la impresión directa a la
 * Zebra rotulen exactamente igual: una misma prenda no puede llamarse distinto
 * según por dónde se imprimió.
 */
export function tituloEtiqueta(nombre: string, talla: string): string {
  return `${nombreCorto(nombre)}${sufijoTalla(talla)}`;
}

/**
 * Cómo se escribe la talla junto al nombre.
 *   6, 10   -> "ABEJITA #6"       (es como rotula la tienda)
 *   S, AD   -> "ABEJITA T-S"      (el "#" delante de una letra se lee raro)
 *   Única   -> se omite            (un accesorio tiene una sola talla: no aporta)
 */
export function sufijoTalla(talla: string): string {
  const t = (talla ?? '').trim();
  if (!t || /^(única|unica)$/i.test(t)) return '';
  if (/^\d+$/.test(t)) return ` #${t}`;
  return ` T-${t.toUpperCase()}`;
}

export type Aviso = { codigo: string; motivo: string };

export type ResultadoEtiquetas = {
  blob: Blob;
  /** Cuántas etiquetas entraron al PDF. */
  impresas: number;
  /** Códigos que no se pudieron imprimir o que salen al límite de lo legible. */
  avisos: Aviso[];
};

/** Cuántas etiquetas saldrían, para avisar antes de mandar a imprimir. */
export function contarEtiquetas(items: EtiquetaItem[]): number {
  return items.reduce((s, i) => s + Math.max(0, Math.floor(i.cantidad)), 0);
}

/**
 * Ancho que tendría el módulo más fino con este código en esta etiqueta.
 * Devuelve null si el código no es codificable.
 */
export function anchoModulo(codigo: string, formato: Formato): number | null {
  try {
    const margen = margenDe(formato.ancho);
    return anchoModuloMm(codigo, formato.ancho - margen * 2);
  } catch {
    return null;
  }
}

function margenDe(ancho: number): number {
  return Math.max(1.5, ancho * 0.04);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Doc = any;

/**
 * Elige el cuerpo de letra más grande con el que el texto entra en el ancho
 * disponible usando como máximo `maxLineas` renglones. Devuelve las líneas ya
 * partidas.
 */
function ajustarTexto(
  doc: Doc,
  texto: string,
  anchoMm: number,
  maxPt: number,
  minPt: number,
  maxLineas: number,
): { lineas: string[]; pt: number } {
  for (let pt = maxPt; pt >= minPt; pt -= 0.25) {
    doc.setFontSize(pt);
    const lineas = doc.splitTextToSize(texto, anchoMm) as string[];
    if (lineas.length <= maxLineas) return { lineas, pt };
  }
  // Ni al mínimo entra: se recorta la última línea con puntos suspensivos.
  doc.setFontSize(minPt);
  const lineas = (doc.splitTextToSize(texto, anchoMm) as string[]).slice(0, maxLineas);
  let ultima = lineas[maxLineas - 1];
  if (ultima !== undefined) {
    while (ultima.length > 1 && doc.getTextWidth(`${ultima}…`) > anchoMm) ultima = ultima.slice(0, -1);
    lineas[maxLineas - 1] = `${ultima}…`;
  }
  return { lineas, pt: minPt };
}

/** Dibuja UNA etiqueta con su esquina superior izquierda en (x, y). */
function dibujarEtiqueta(
  doc: Doc,
  item: { nombre: string; talla: string; codigo: string },
  x: number,
  y: number,
  ancho: number,
  alto: number,
): void {
  const margen = margenDe(ancho);
  const anchoUtil = ancho - margen * 2;

  // ---- Bloque de texto superior: nombre + talla ----
  const titulo = `${nombreCorto(item.nombre)}${sufijoTalla(item.talla)}`.toUpperCase();
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  const maxPt = Math.max(5.5, Math.min(9, alto * 0.34));
  const { lineas, pt } = ajustarTexto(doc, titulo, anchoUtil, maxPt, 4.5, alto >= 28 ? 2 : 1);
  const altoLinea = pt * PT_MM * 1.12;
  const altoTitulo = lineas.length * altoLinea;

  doc.setFontSize(pt);
  lineas.forEach((l, i) => {
    doc.text(l, x + ancho / 2, y + margen + altoLinea * (i + 0.82), { align: 'center' });
  });

  // ---- Código legible, abajo ----
  const ptCodigo = Math.max(5, Math.min(8, alto * 0.3));
  const altoCodigo = ptCodigo * PT_MM * 1.12;

  // ---- Barras, en el espacio que queda ----
  const separacion = 0.7;
  const yBarras = y + margen + altoTitulo + separacion;
  const altoBarras = alto - margen * 2 - altoTitulo - altoCodigo - separacion * 2;

  if (altoBarras > 2) {
    dibujarBarrasPDF(doc, item.codigo, x + margen, yBarras, anchoUtil, altoBarras);
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(ptCodigo);
  doc.text(item.codigo, x + ancho / 2, y + alto - margen, { align: 'center' });
}

/**
 * Arma el PDF de etiquetas. Devuelve el Blob listo para abrir o imprimir, más
 * los avisos de códigos que quedaron fuera o al límite de lo legible.
 *
 * Los códigos no codificables NO abortan el lote: se saltan con aviso, para que
 * un dato mal cargado no obligue a rehacer la selección entera.
 */
export async function generarEtiquetasPDF(items: EtiquetaItem[], formato: Formato): Promise<ResultadoEtiquetas> {
  const { ancho, alto, soporte } = formato;
  const avisos: Aviso[] = [];
  const vistos = new Set<string>();

  // jsPDF se carga aquí y no al importar el módulo: así no entra al bundle
  // inicial de la página, que solo necesita la lista de productos.
  const { jsPDF } = await import('jspdf');
  const doc: Doc = soporte === 'rollo'
    ? new jsPDF({ unit: 'mm', format: [ancho, alto], orientation: ancho >= alto ? 'landscape' : 'portrait' })
    : new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });

  // Cola expandida: cada etiqueta física, una entrada.
  const cola: { nombre: string; talla: string; codigo: string }[] = [];
  for (const item of items) {
    const codigo = (item.codigo ?? '').trim();
    const veces = Math.max(0, Math.floor(item.cantidad));
    if (veces === 0) continue;

    if (!codigo) {
      if (!vistos.has(`vacio:${item.nombre}|${item.talla}`)) {
        vistos.add(`vacio:${item.nombre}|${item.talla}`);
        avisos.push({ codigo: `${nombreCorto(item.nombre)} #${item.talla}`, motivo: 'No tiene código de barras ni SKU' });
      }
      continue;
    }
    try {
      codificarCode128(codigo);
    } catch (e) {
      if (!vistos.has(codigo)) {
        vistos.add(codigo);
        avisos.push({ codigo, motivo: (e as Error).message });
      }
      continue;
    }
    const w = anchoModulo(codigo, formato);
    if (w !== null && w < MODULO_MIN_MM && !vistos.has(`fino:${codigo}`)) {
      vistos.add(`fino:${codigo}`);
      avisos.push({
        codigo,
        motivo: `Las barras quedan de ${w.toFixed(2)} mm; para leer sin problemas conviene una etiqueta más ancha`,
      });
    }
    for (let n = 0; n < veces; n++) cola.push({ nombre: item.nombre, talla: item.talla, codigo });
  }

  if (soporte === 'rollo') {
    if (alto - margenDe(ancho) * 2 < BARRAS_MIN_MM + 4) {
      avisos.push({ codigo: '—', motivo: 'La etiqueta elegida es muy baja; las barras podrían quedar cortas' });
    }
    cola.forEach((e, i) => {
      if (i > 0) doc.addPage([ancho, alto], ancho >= alto ? 'landscape' : 'portrait');
      dibujarEtiqueta(doc, e, 0, 0, ancho, alto);
    });
  } else {
    // Grilla en A4 con marcas de corte suaves.
    const MARGEN_HOJA = 8;
    const SEP = 2;
    const hojaW = 210;
    const hojaH = 297;
    const cols = Math.max(1, Math.floor((hojaW - MARGEN_HOJA * 2 + SEP) / (ancho + SEP)));
    const filas = Math.max(1, Math.floor((hojaH - MARGEN_HOJA * 2 + SEP) / (alto + SEP)));
    const porHoja = cols * filas;
    // Centra la grilla en la hoja: sobra menos papel a un lado que al otro.
    const sobraX = hojaW - (cols * ancho + (cols - 1) * SEP);
    const sobraY = hojaH - (filas * alto + (filas - 1) * SEP);

    cola.forEach((e, i) => {
      if (i > 0 && i % porHoja === 0) doc.addPage('a4', 'portrait');
      const pos = i % porHoja;
      const col = pos % cols;
      const fila = Math.floor(pos / cols);
      const x = sobraX / 2 + col * (ancho + SEP);
      const y = sobraY / 2 + fila * (alto + SEP);
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.1);
      doc.rect(x, y, ancho, alto, 'S');
      dibujarEtiqueta(doc, e, x, y, ancho, alto);
    });
  }

  return { blob: doc.output('blob'), impresas: cola.length, avisos };
}

