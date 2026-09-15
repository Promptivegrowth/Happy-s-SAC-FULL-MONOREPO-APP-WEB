/**
 * El logo de la empresa, pasado a puntos para la ticketera.
 *
 * Es lo ÚNICO del ticket que viaja como imagen. El resto es texto ESC/POS, que
 * sale con la letra limpia del cabezal y pesa cien veces menos; pero un logo no
 * se puede describir con letras, así que se manda como mapa de puntos.
 *
 * La térmica no tiene grises: cada punto se imprime o no. Un logo a color o con
 * degradados hay que decidirlo punto por punto, y de esa decisión depende que
 * salga reconocible o una mancha.
 *
 * Corre solo en el navegador: necesita canvas para leer los píxeles.
 */

import { ANCHO_IMAGEN } from './index';

/**
 * Ancho del logo en el ticket, en puntos.
 *
 * Menos de la mitad del papel a propósito: un logo a todo lo ancho come 2 cm de
 * rollo en cada venta, que es justamente lo que se venía corrigiendo. A 220
 * puntos son unos 27 mm, suficiente para que se lea la marca.
 */
export const ANCHO_LOGO_POR_DEFECTO = 220;

/**
 * Alto máximo. Un logo muy alto es papel tirado en cada ticket; si la imagen
 * es más alta que ancha se reduce hasta entrar.
 */
export const ALTO_LOGO_MAXIMO = 120;

/**
 * Punto de corte entre negro y blanco.
 *
 * El logo de HAPPY es naranja sobre blanco: en escala de grises el naranja cae
 * cerca de 150, así que un umbral bajo lo borraría entero. Con 200 el naranja
 * se imprime y el fondo blanco no.
 */
const UMBRAL = 200;

export type OpcionesLogo = {
  ancho?: number;
  altoMaximo?: number;
  umbral?: number;
};

/**
 * Descarga la imagen y la devuelve como matriz de puntos negros.
 *
 * Devuelve null ante cualquier problema —logo no configurado, sin red, imagen
 * de otro dominio sin permisos— porque el ticket tiene que salir igual: es
 * preferible un comprobante sin logo que un cliente esperando en el mostrador.
 */
export async function logoAPuntos(
  url: string | null | undefined,
  opciones: OpcionesLogo = {},
): Promise<boolean[][] | null> {
  if (!url) return null;
  if (typeof document === 'undefined') return null;

  const anchoPedido = Math.min(opciones.ancho ?? ANCHO_LOGO_POR_DEFECTO, ANCHO_IMAGEN);
  const altoMaximo = opciones.altoMaximo ?? ALTO_LOGO_MAXIMO;
  const umbral = opciones.umbral ?? UMBRAL;

  try {
    const img = await cargarImagen(url);
    if (!img.naturalWidth || !img.naturalHeight) return null;

    // Se respeta la proporción y se recorta por alto si hace falta.
    let ancho = anchoPedido;
    let alto = Math.round((img.naturalHeight / img.naturalWidth) * ancho);
    if (alto > altoMaximo) {
      alto = altoMaximo;
      ancho = Math.round((img.naturalWidth / img.naturalHeight) * alto);
    }

    // El ancho en puntos tiene que ser múltiplo de 8: GS v 0 manda la imagen
    // por bytes de 8 puntos y un resto suelto desplaza toda la fila.
    ancho = Math.max(8, Math.floor(ancho / 8) * 8);

    const lienzo = document.createElement('canvas');
    lienzo.width = ancho;
    lienzo.height = alto;
    const ctx = lienzo.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;

    // Fondo blanco explícito: un PNG con transparencia se leería como negro.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, ancho, alto);
    ctx.drawImage(img, 0, 0, ancho, alto);

    const datos = ctx.getImageData(0, 0, ancho, alto).data;
    const puntos: boolean[][] = [];
    for (let y = 0; y < alto; y++) {
      const fila: boolean[] = new Array(ancho).fill(false);
      for (let x = 0; x < ancho; x++) {
        const i = (y * ancho + x) * 4;
        if (datos[i + 3]! < 128) continue;   // transparente = papel
        const luz = 0.299 * datos[i]! + 0.587 * datos[i + 1]! + 0.114 * datos[i + 2]!;
        fila[x] = luz < umbral;
      }
      puntos.push(fila);
    }

    return recortarBordes(puntos);
  } catch {
    // Logo no disponible: el ticket sale sin él.
    return null;
  }
}

/**
 * Quita las filas y columnas totalmente blancas del borde.
 *
 * Los logos suelen venir con margen transparente alrededor; sin recortarlo, ese
 * margen se imprime como papel en blanco arriba del ticket y desplaza el logo
 * hacia un costado aunque esté centrado.
 */
function recortarBordes(puntos: boolean[][]): boolean[][] | null {
  let arriba = 0;
  let abajo = puntos.length;
  while (arriba < abajo && !puntos[arriba]!.some(Boolean)) arriba++;
  while (abajo > arriba && !puntos[abajo - 1]!.some(Boolean)) abajo--;
  if (arriba >= abajo) return null;   // imagen en blanco: no vale la pena

  const filas = puntos.slice(arriba, abajo);
  const ancho = filas[0]!.length;

  let izq = 0;
  let der = ancho;
  while (izq < der && filas.every((f) => !f[izq])) izq++;
  while (der > izq && filas.every((f) => !f[der - 1])) der--;

  // El ancho recortado vuelve a ajustarse a múltiplo de 8 por la misma razón
  // que arriba, extendiendo hacia la derecha con blanco.
  const anchoUtil = Math.max(8, Math.ceil((der - izq) / 8) * 8);
  return filas.map((f) => {
    const nueva: boolean[] = new Array(anchoUtil).fill(false);
    for (let x = 0; x < anchoUtil; x++) nueva[x] = f[izq + x] ?? false;
    return nueva;
  });
}

function cargarImagen(url: string): Promise<HTMLImageElement> {
  return new Promise((resolver, rechazar) => {
    const img = new Image();
    // El logo vive en el bucket de Supabase, que es otro dominio: sin esto el
    // canvas queda "sucio" y getImageData lanza una excepción de seguridad.
    img.crossOrigin = 'anonymous';
    img.onload = () => resolver(img);
    img.onerror = () => rechazar(new Error('no se pudo cargar el logo'));
    img.src = url;
  });
}
