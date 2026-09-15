/**
 * Lo que se le manda a la ticketera, en su propio idioma.
 *
 * El navegador solo sabe imprimir por el driver de Windows: convierte el
 * ticket en una imagen, decide el corte según el tamaño de papel configurado y
 * agrega su propio margen final. De ahí salen el papel desperdiciado, el corte
 * en el lugar equivocado y que el mismo ticket salga distinto en cada
 * computadora. Nada de eso se puede arreglar desde el navegador: no existe
 * forma de decirle "corta acá".
 *
 * Acá el ticket viaja como comandos ESC/POS —el idioma nativo de la
 * impresora—, el agente local se los pasa en crudo y el corte lo ordena el
 * comando GS V, no el driver.
 *
 * TEXTO NATIVO, NO IMAGEN. Mandar el ticket como imagen (dibujar el HTML y
 * rasterizarlo) también funciona y es lo que hace el ERP de Agrocar, pero son
 * ~100 KB por ticket contra ~600 bytes, tarda más en salir y el texto queda
 * con los bordes suavizados de la pantalla en vez de la letra limpia del
 * cabezal. Acá solo van como imagen el logo y el QR, que la impresora no sabe
 * componer sola.
 *
 * Referencia: ESC/POS de Epson, que las POS-80 replican.
 */

// ── Comandos ─────────────────────────────────────────────────────────────────
const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

/**
 * Columnas de texto en fuente A.
 *
 * Una térmica de 80 mm imprime sobre 72 mm a 203 ppp: 576 puntos, y la fuente A
 * mide 12 puntos de ancho, o sea 48 columnas. PERO muchas POS-80 genéricas
 * tienen el área de impresión en 512 puntos, donde solo entran 42.
 *
 * Se usa 42 a propósito: en una impresora de 576 puntos deja un margen derecho
 * de 6 mm, que no molesta; al revés —formatear a 48 e imprimir en una de 42—
 * cada línea de totales se parte en dos y el ticket queda ilegible. Se elige el
 * número que funciona en las dos.
 */
export const COLUMNAS = 42;

/**
 * Ancho de las imágenes (logo, QR de respaldo) en puntos.
 *
 * Mismo criterio que las columnas: 512 entra en las dos familias de impresora.
 */
export const ANCHO_IMAGEN = 512;

/** Un punto de la impresora, en milímetros. */
export const PUNTO_MM = 25.4 / 203;

/**
 * Papel que se adelanta antes de cortar, en milímetros.
 *
 * La cuchilla está por encima del cabezal, así que sin ese avance el corte cae
 * sobre el texto y se pierde el pie del comprobante. Cuánto exactamente depende
 * del modelo, por eso cada computadora guarda el suyo y este valor es solo el
 * punto de partida.
 */
export const CORTE_MM_POR_DEFECTO = 15;

/** Filas por bloque al mandar una imagen. */
const BANDA_MAXIMA = 255;

export type Alineacion = 'izq' | 'centro' | 'der';

/**
 * Tabla de la página de códigos 850 (multilingüe) para lo que usa un ticket
 * peruano: vocales con tilde, eñe, apertura de interrogación y admiración,
 * grados y el símbolo de grado.
 *
 * Sin esto la impresora escribe basura donde va una "ñ" o una "ó", porque
 * recibe UTF-8 (dos bytes) y ella espera un byte por carácter. La CP850 es la
 * que traen de fábrica prácticamente todas las POS-80.
 */
const CP850: Record<string, number> = {
  'Ç': 0x80, 'ü': 0x81, 'é': 0x82, 'â': 0x83, 'ä': 0x84, 'à': 0x85, 'å': 0x86, 'ç': 0x87,
  'ê': 0x88, 'ë': 0x89, 'è': 0x8a, 'ï': 0x8b, 'î': 0x8c, 'ì': 0x8d, 'Ä': 0x8e, 'Å': 0x8f,
  'É': 0x90, 'æ': 0x91, 'Æ': 0x92, 'ô': 0x93, 'ö': 0x94, 'ò': 0x95, 'û': 0x96, 'ù': 0x97,
  'ÿ': 0x98, 'Ö': 0x99, 'Ü': 0x9a, 'ø': 0x9b, '£': 0x9c, 'Ø': 0x9d, '×': 0x9e,
  'á': 0xa0, 'í': 0xa1, 'ó': 0xa2, 'ú': 0xa3, 'ñ': 0xa4, 'Ñ': 0xa5, 'ª': 0xa6, 'º': 0xa7,
  '¿': 0xa8, '®': 0xa9, '¬': 0xaa, '½': 0xab, '¼': 0xac, '¡': 0xad, '«': 0xae, '»': 0xaf,
  'Á': 0xb5, 'Â': 0xb6, 'À': 0xb7, '©': 0xb8,
  'ã': 0xc6, 'Ã': 0xc7,
  'ð': 0xd0, 'Ð': 0xd1, 'Ê': 0xd2, 'Ë': 0xd3, 'È': 0xd4, 'Í': 0xd6, 'Î': 0xd7, 'Ï': 0xd8,
  'Ó': 0xe0, 'ß': 0xe1, 'Ô': 0xe2, 'Ò': 0xe3, 'õ': 0xe4, 'Õ': 0xe5, 'µ': 0xe6,
  'Ú': 0xe9, 'Û': 0xea, 'Ù': 0xeb, 'ý': 0xec, 'Ý': 0xed, '¯': 0xee, '´': 0xef,
  '°': 0xf8, '¨': 0xf9, '·': 0xfa, '¹': 0xfb, '³': 0xfc, '²': 0xfd,
  // Bloques de relleno: con estos se imprime la barra negra del ticket de
  // prueba, que sirve para ver si al cabezal le falta densidad.
  '░': 0xb0, '▒': 0xb1, '▓': 0xb2,
  '█': 0xdb, '▄': 0xdc, '▀': 0xdf,
};

/** Reemplazo sin acento, para cuando un carácter no está en la CP850. */
const SIN_ACENTO: Record<string, string> = {
  'ā': 'a', 'ē': 'e', 'ī': 'i', 'ō': 'o', 'ū': 'u',
  '–': '-', '—': '-', '−': '-', '‑': '-',
  '“': '"', '”': '"', '„': '"', '‘': "'", '’': "'", '′': "'",
  '…': '...', '€': 'EUR', '™': 'TM', ' ': ' ',
};

/**
 * Pasa el texto a bytes de la página de códigos 850.
 *
 * Lo que no esté en la tabla se degrada a su equivalente sin acento antes de
 * rendirse: es preferible que diga "ANIO" a que imprima un símbolo raro.
 */
export function aCP850(texto: string): number[] {
  const salida: number[] = [];
  for (const car of texto ?? '') {
    const codigo = car.charCodeAt(0);
    if (codigo < 0x80) { salida.push(codigo); continue; }

    const enTabla = CP850[car];
    if (enTabla !== undefined) { salida.push(enTabla); continue; }

    const reemplazo = SIN_ACENTO[car]
      ?? car.normalize('NFD').replace(/[̀-ͯ]/g, '');
    for (const c of reemplazo) {
      const n = c.charCodeAt(0);
      salida.push(n < 0x80 ? n : (CP850[c] ?? 0x3f));   // '?' como último recurso
    }
  }
  return salida;
}

/** Corta el texto a `ancho` columnas, sin partir palabras cuando se puede. */
export function envolver(texto: string, ancho: number): string[] {
  const palabras = (texto ?? '').split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return [''];
  const lineas: string[] = [];
  let actual = '';
  for (const p of palabras) {
    if (p.length > ancho) {
      // Una palabra más larga que el renglón (un código, una URL): se parte.
      if (actual) { lineas.push(actual); actual = ''; }
      for (let i = 0; i < p.length; i += ancho) lineas.push(p.slice(i, i + ancho));
      continue;
    }
    if (!actual) actual = p;
    else if (actual.length + 1 + p.length <= ancho) actual += ` ${p}`;
    else { lineas.push(actual); actual = p; }
  }
  if (actual) lineas.push(actual);
  return lineas;
}

export class TicketEscPos {
  private partes: number[] = [];

  constructor() {
    // Inicializa (ESC @) y fija la página de códigos: si no, los acentos salen
    // como símbolos sueltos.
    this.bytes(ESC, 0x40);
    this.bytes(ESC, 0x74, 0x02);   // ESC t 2 = CP850
  }

  bytes(...b: number[]): this {
    for (const x of b) this.partes.push(x & 0xff);
    return this;
  }

  alinear(donde: Alineacion): this {
    return this.bytes(ESC, 0x61, donde === 'centro' ? 1 : donde === 'der' ? 2 : 0);
  }

  negrita(activa: boolean): this {
    return this.bytes(ESC, 0x45, activa ? 1 : 0);
  }

  /** Tamaño: 1 = normal, 2 = doble. Se usa para el total y el número. */
  tamano(ancho: 1 | 2, alto: 1 | 2): this {
    return this.bytes(GS, 0x21, ((ancho - 1) << 4) | (alto - 1));
  }

  /**
   * Escribe una línea tal cual, sin tocar los espacios.
   *
   * Hace falta separada de `linea` porque `envolver` normaliza los espacios
   * para poder repartir las palabras, y eso destruye el relleno de las líneas
   * ya formateadas: la columna de importes se despegaba del borde derecho y
   * quedaba pegada al rótulo.
   */
  lineaCruda(texto = '', ancho = COLUMNAS): this {
    this.bytes(...aCP850(texto.slice(0, ancho)));
    this.bytes(LF);
    return this;
  }

  /** Escribe una línea, partiéndola en varias si no entra a lo ancho. */
  linea(texto = '', ancho = COLUMNAS): this {
    for (const l of envolver(texto, ancho)) this.lineaCruda(l, ancho);
    return this;
  }

  /** Renglones en blanco. */
  salto(n = 1): this {
    for (let i = 0; i < n; i++) this.bytes(LF);
    return this;
  }

  /**
   * Rótulo a la izquierda, importe pegado a la derecha, en el mismo renglón.
   * Es lo que hace legible la zona de totales en un papel angosto.
   */
  lineaDoble(izquierda: string, derecha: string, ancho = COLUMNAS): this {
    const der = derecha ?? '';
    const espacio = Math.max(0, ancho - der.length);
    let izq = izquierda ?? '';
    if (izq.length > espacio - 1 && espacio > 1) izq = izq.slice(0, espacio - 1);
    const relleno = ' '.repeat(Math.max(1, ancho - izq.length - der.length));
    return this.lineaCruda(`${izq}${relleno}${der}`, ancho);
  }

  /** Línea separadora de guiones, del ancho del papel. */
  separador(caracter = '-', ancho = COLUMNAS): this {
    return this.lineaCruda(caracter.repeat(ancho), ancho);
  }

  /**
   * Código QR con el comando nativo (GS ( k).
   *
   * Nativo y no imagen porque la impresora lo dibuja con sus propios puntos:
   * sale cuadrado y perfectamente legible, ocupa 30 bytes en vez de varios
   * kilobytes, y no depende de que el navegador pueda rasterizar.
   */
  qr(texto: string, tamanoModulo = 6): this {
    const datos = aCP850(texto);
    const largo = datos.length + 3;

    // Modelo 2
    this.bytes(GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00);
    // Tamaño del módulo (1..16)
    this.bytes(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, Math.max(1, Math.min(16, tamanoModulo)));
    // Corrección de errores M (el mínimo que SUNAT tolera con el papel térmico)
    this.bytes(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31);
    // Guardar los datos
    this.bytes(GS, 0x28, 0x6b, largo & 0xff, (largo >> 8) & 0xff, 0x31, 0x50, 0x30);
    this.bytes(...datos);
    // Imprimir
    this.bytes(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30);
    return this;
  }

  /**
   * Código de barras CODE 128 con el comando nativo (GS k 73).
   *
   * Nativo y no imagen por lo mismo que el QR: lo dibuja la impresora con sus
   * propios puntos, así que sale con las barras exactas y a la pistola no le
   * cuesta engancharlo. Rasterizado desde el navegador pesa cien veces más y
   * los módulos se redondean al píxel.
   *
   * `alto` va en puntos (a 203 ppp, 80 puntos son unos 10 mm).
   */
  codigoBarras(texto: string, alto = 80, mostrarTexto = true): this {
    const datos = aCP850(texto);
    this.bytes(GS, 0x68, Math.max(1, Math.min(255, alto)));   // GS h: alto
    this.bytes(GS, 0x77, 0x02);                                // GS w: ancho del módulo
    this.bytes(GS, 0x48, mostrarTexto ? 0x02 : 0x00);          // GS H: texto debajo
    // GS k 73 n d1...dn — la variante con longitud explícita, que es la que
    // admite el juego completo de caracteres.
    this.bytes(GS, 0x6b, 73, datos.length);
    this.bytes(...datos);
    return this;
  }

  /**
   * Imagen en blanco y negro (GS v 0).
   *
   * `puntos` es una matriz de filas; cada true es un punto negro. Va de a
   * bloques porque algunas ticketeras se atragantan con una imagen entera y no
   * imprimen nada, sin avisar.
   */
  imagen(puntos: boolean[][]): this {
    for (let inicio = 0; inicio < puntos.length; inicio += BANDA_MAXIMA) {
      this.banda(puntos.slice(inicio, inicio + BANDA_MAXIMA));
    }
    return this;
  }

  private banda(puntos: boolean[][]): this {
    const alto = puntos.length;
    if (alto === 0) return this;
    const anchoPx = puntos[0]!.length;
    const anchoBytes = Math.ceil(anchoPx / 8);

    this.bytes(GS, 0x76, 0x30, 0x00,
      anchoBytes & 0xff, (anchoBytes >> 8) & 0xff,
      alto & 0xff, (alto >> 8) & 0xff);

    for (let y = 0; y < alto; y++) {
      const fila = puntos[y]!;
      for (let bx = 0; bx < anchoBytes; bx++) {
        let byte = 0;
        for (let bit = 0; bit < 8; bit++) {
          const x = bx * 8 + bit;
          if (x < anchoPx && fila[x]) byte |= 0x80 >> bit;
        }
        this.partes.push(byte);
      }
    }
    return this;
  }

  /**
   * Corta el papel.
   *
   * El avance previo va en puntos y no en renglones a propósito: la distancia a
   * la cuchilla es física y no cambia, mientras que un renglón mide lo que diga
   * el interlineado.
   *
   * El avance se manda DENTRO de la orden de corte. Mandarlo aparte (ESC J y
   * después cortar) funciona en unas ticketeras y en otras no: hay modelos que
   * ignoran el avance suelto y cortan siempre en el mismo lugar, justo donde
   * más falta hace el ajuste. `GS V B n` dice "avanza n puntos y corta" en un
   * solo comando y es el que los clones implementan de verdad. Igual se manda
   * el sobrante suelto para las que solo entienden ese: la que entiende las dos
   * reparte el avance entre ambas y el total sale igual.
   */
  cortar(avanceMm = CORTE_MM_POR_DEFECTO): this {
    const puntos = Math.round(Math.max(5, Math.min(40, avanceMm)) / PUNTO_MM);
    const enElCorte = Math.min(puntos, 255);
    const suelto = puntos - enElCorte;
    if (suelto > 0) this.bytes(ESC, 0x4a, Math.min(255, suelto));
    return this.bytes(GS, 0x56, 0x42, enElCorte);
  }

  /** Abre el cajón de dinero, si hay uno conectado a la ticketera. */
  abrirCajon(): this {
    return this.bytes(ESC, 0x70, 0x00, 0x19, 0xfa);
  }

  aBytes(): Uint8Array {
    return new Uint8Array(this.partes);
  }

  /** En base64, que es como viaja hasta el agente. */
  aBase64(): string {
    const b = this.aBytes();
    let s = '';
    for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]!);
    return typeof btoa === 'function' ? btoa(s) : Buffer.from(b).toString('base64');
  }
}
