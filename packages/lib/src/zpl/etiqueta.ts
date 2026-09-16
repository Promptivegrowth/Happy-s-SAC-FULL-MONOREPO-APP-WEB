/**
 * Etiquetas de código de barras para la Zebra ZD421, en ZPL.
 *
 * Antes se generaba un PDF y se imprimía por el navegador, o sea a través del
 * controlador de Windows. Con el rollo de DOS etiquetas a lo ancho eso sale
 * mal siempre: el PDF declara una página del tamaño de UNA etiqueta, el
 * controlador ve un papel del doble de ancho y estira el diseño para que entre.
 * Resultado: un solo código repartido sobre los dos stickers. Pasó en el
 * almacén el 16/09/2026.
 *
 * ZPL es el idioma propio de la Zebra: se le dice el ancho del papel en puntos
 * y la posición exacta de cada cosa. No hay controlador que escale nada.
 *
 * Y el código de barras lo dibuja la impresora con su propio motor (^BC), no
 * nosotros. A 203 puntos por pulgada una barra rasterizada se redondea al
 * punto más cercano y ensancha o adelgaza módulos; dibujada por la máquina
 * sale exacta, que es lo que decide si la pistola engancha a la primera.
 */

/** Puntos por milímetro de una ZD421 de 203 dpi. */
export const PUNTOS_MM = 203 / 25.4;

/** Milímetros a puntos, redondeado: ZPL no admite decimales. */
export const aPuntos = (mm: number) => Math.round(mm * PUNTOS_MM);

export type EtiquetaDato = {
  /** Lo que va arriba, ej. "GUARDAPOLVO #14". */
  titulo: string;
  /** Lo que se codifica y se imprime debajo, ej. "PF176". */
  codigo: string;
  /** Cuántas etiquetas iguales de esta prenda. */
  cantidad: number;
};

export type FormatoRollo = {
  /** Ancho de UNA etiqueta, en milímetros. */
  anchoEtiquetaMm: number;
  /** Alto de una etiqueta (= alto de la fila), en milímetros. */
  altoEtiquetaMm: number;
  /** Cuántas etiquetas hay a lo ancho del rollo. */
  columnas: number;
  /** Separación horizontal entre columnas, en milímetros. */
  separacionMm: number;
  /** Margen a la izquierda del papel antes de la primera etiqueta. */
  margenIzquierdoMm: number;
};

/**
 * El rollo que usa el almacén: 2" × 1", dos a lo ancho.
 *
 * La separación entre columnas es la medida que hay que ajustar mirando una
 * tira impresa: 3 mm es lo habitual en este tipo de rollo, pero cada
 * fabricante troquela distinto y un milímetro de más corre todo el texto de la
 * segunda columna.
 */
export const ROLLO_2X1_DOBLE: FormatoRollo = {
  anchoEtiquetaMm: 50.8,   // 2 pulgadas
  altoEtiquetaMm: 25.4,    // 1 pulgada
  columnas: 2,
  separacionMm: 3,
  margenIzquierdoMm: 2,
};

export type OpcionesEtiqueta = {
  formato?: FormatoRollo;
  /** Margen interno de cada etiqueta, para que nada quede pegado al borde. */
  margenInternoMm?: number;
  /**
   * Oscurecimiento del cabezal (0 a 30). Con transferencia térmica y cinta,
   * demasiado poco deja las barras grises y la pistola falla.
   */
  oscuridad?: number;
  /** Velocidad en pulgadas por segundo. Más lento = barras más definidas. */
  velocidad?: number;
};

/**
 * Escapa lo que ZPL se tomaría como comando.
 *
 * `^` y `~` abren instrucciones: un nombre de producto que los contenga
 * partiría la etiqueta al medio. `\` es el escape del propio ZPL.
 */
export function escaparZpl(texto: string): string {
  return (texto ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\^/g, '\\5E')
    .replace(/~/g, '\\7E');
}

/**
 * Quita lo que la Zebra no imprime con su fuente interna.
 *
 * La fuente A de fábrica no tiene acentos ni Ñ: donde va una "Ñ" imprime un
 * cuadrado o nada. Antes que un nombre ilegible, conviene el nombre sin
 * tildes; se entiende igual y es lo que la tienda ya rotula a mano.
 */
export function aFuenteZebra(texto: string): string {
  return (texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7E]/g, '')
    .toUpperCase();
}

/**
 * Corta el título para que entre a lo ancho de la etiqueta.
 *
 * Es mejor cortar que dejar que la impresora lo desborde sobre la etiqueta de
 * al lado, que es lo que hace si no se le pone límite.
 */
function recortar(texto: string, maximo: number): string {
  const t = texto.trim();
  return t.length <= maximo ? t : t.slice(0, maximo);
}

/** El bloque ZPL de UNA etiqueta, ubicada en su columna. */
function bloqueEtiqueta(
  dato: EtiquetaDato,
  xMm: number,
  formato: FormatoRollo,
  margenMm: number,
): string {
  const x = aPuntos(xMm + margenMm);
  const anchoUtilMm = formato.anchoEtiquetaMm - margenMm * 2;
  const anchoUtil = aPuntos(anchoUtilMm);

  /*
   * El reparto vertical, de arriba a abajo: nombre, barras, código legible.
   *
   * El código legible no es decorativo: si la pistola falla, la cajera lo
   * tipea y el POS igual encuentra la prenda, porque busca por código de
   * barras y por SKU.
   */
  const altoTexto = aPuntos(3);                      // ~3 mm de altura de letra
  const yTitulo = aPuntos(margenMm);
  const yBarras = aPuntos(margenMm + 4);
  const altoBarras = aPuntos(formato.altoEtiquetaMm - margenMm * 2 - 9);
  const yCodigo = aPuntos(formato.altoEtiquetaMm - margenMm - 3.2);

  // A razón de ~1,6 mm por carácter con esta altura de fuente.
  const maxCaracteres = Math.max(8, Math.floor(anchoUtilMm / 1.6));
  const titulo = escaparZpl(recortar(aFuenteZebra(dato.titulo), maxCaracteres));
  const codigo = escaparZpl(aFuenteZebra(dato.codigo));

  return [
    // Título centrado en el ancho de la etiqueta (^FB centra y limita).
    `^FO${x},${yTitulo}^A0N,${altoTexto},${altoTexto}^FB${anchoUtil},1,0,C,0^FD${titulo}^FS`,
    /*
     * CODE 128: admite letras y números —los códigos son del tipo PF176— no
     * exige comprar un rango a GS1 y lo lee cualquier pistola.
     * ^BY2 = módulo de 2 puntos (0,25 mm), que es lo mínimo cómodo a 203 dpi.
     * La "N" final apaga el texto de la propia Zebra: lo ponemos nosotros
     * debajo, centrado y con el tamaño que queremos.
     */
    `^BY2,3,${altoBarras}`,
    `^FO${x},${yBarras}^FB${anchoUtil},1,0,C,0^BCN,${altoBarras},N,N,N^FD${codigo}^FS`,
    // El código legible, centrado.
    `^FO${x},${yCodigo}^A0N,${altoTexto},${altoTexto}^FB${anchoUtil},1,0,C,0^FD${codigo}^FS`,
  ].join('\n');
}

/**
 * Arma el ZPL de una tanda de etiquetas.
 *
 * Las etiquetas se reparten en filas: con un rollo de dos columnas, cada envío
 * a la impresora lleva DOS etiquetas, que es como avanza el papel. Si sobra
 * una al final, esa fila va con una sola y la otra mitad sale en blanco — es
 * preferible a arrastrar una etiqueta ajena a la tanda siguiente.
 */
export function construirEtiquetasZpl(
  datos: EtiquetaDato[],
  opciones: OpcionesEtiqueta = {},
): string {
  const formato = opciones.formato ?? ROLLO_2X1_DOBLE;
  const margen = opciones.margenInternoMm ?? 1.5;
  const oscuridad = opciones.oscuridad ?? 15;
  const velocidad = opciones.velocidad ?? 3;

  // Una entrada por etiqueta física: así se reparten en columnas sin pensar.
  const sueltas: EtiquetaDato[] = [];
  for (const d of datos) {
    const n = Math.max(0, Math.floor(Number(d.cantidad ?? 0)));
    for (let i = 0; i < n; i++) sueltas.push(d);
  }
  if (sueltas.length === 0) return '';

  const anchoTotalMm =
    formato.margenIzquierdoMm +
    formato.columnas * formato.anchoEtiquetaMm +
    (formato.columnas - 1) * formato.separacionMm;

  const partes: string[] = [];

  /*
   * La configuración va una sola vez, al principio y fuera de las etiquetas.
   *
   * ^XA...^XZ sin ^FO es una etiqueta vacía: si esto fuera dentro, la
   * impresora sacaría una fila en blanco antes de empezar.
   */
  partes.push(
    '^XA',
    `~SD${oscuridad}`,            // oscurecimiento del cabezal
    `^PR${velocidad}`,            // velocidad de impresión
    '^MNY',                       // papel con separación entre etiquetas
    '^MMT',                       // corta/para en la posición de despegue
    `^PW${aPuntos(anchoTotalMm)}`,
    `^LL${aPuntos(formato.altoEtiquetaMm)}`,
    '^LH0,0',
    '^CI28',                      // texto en UTF-8
    '^JUS',                       // guarda la configuración en la impresora
    '^XZ',
  );

  for (let i = 0; i < sueltas.length; i += formato.columnas) {
    const fila = sueltas.slice(i, i + formato.columnas);
    const bloques = fila.map((d, col) =>
      bloqueEtiqueta(
        d,
        formato.margenIzquierdoMm + col * (formato.anchoEtiquetaMm + formato.separacionMm),
        formato,
        margen,
      ),
    );
    partes.push(
      '^XA',
      `^PW${aPuntos(anchoTotalMm)}`,
      `^LL${aPuntos(formato.altoEtiquetaMm)}`,
      '^LH0,0',
      ...bloques,
      '^XZ',
    );
  }

  return partes.join('\n');
}

/** El ZPL listo para viajar por la cola de impresión. */
export function etiquetasABase64(zpl: string): string {
  const bytes = new TextEncoder().encode(zpl);
  let binario = '';
  for (const b of bytes) binario += String.fromCharCode(b);
  return typeof btoa === 'function'
    ? btoa(binario)
    : Buffer.from(bytes).toString('base64');
}
