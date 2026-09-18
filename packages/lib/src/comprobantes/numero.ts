/**
 * Cómo se escribe —y cómo se busca— el número de un comprobante.
 *
 * El número que manda es el que guarda la base: serie, guion y el correlativo
 * con OCHO dígitos. Es el que viaja a SUNAT y el que se ve en las pantallas.
 *
 * Pero hay papeles circulando con SIETE, impresos hasta el 17/09/2026, cuando
 * el ticket armaba el número por su cuenta en lugar de leer el guardado. Un
 * cliente volvió con uno de esos a cambiar una talla y el documento no
 * aparecía por ningún lado.
 *
 * Quien atiende en el mostrador no tiene por qué saber nada de esto: escribe lo
 * que dice el papel y el sistema lo encuentra.
 */

/** Los dígitos del correlativo, como los guarda la base. */
export const DIGITOS_NUMERO_COMPLETO = 8;

/** Arma el número como queda guardado: B005-00004032. */
export function numeroCompleto(serie: string, numero: number): string {
  return `${serie}-${String(numero).padStart(DIGITOS_NUMERO_COMPLETO, '0')}`;
}

/**
 * Las formas en que puede estar escrito el mismo comprobante.
 *
 * Se devuelven para buscar por todas a la vez. Lo que se escribió va siempre
 * primero: si alguien pega un texto que no tiene forma de número de
 * comprobante, esto no inventa nada y devuelve solo eso.
 *
 * Los ceros de adelante son relleno, así que 4032 y 00004032 son el mismo
 * documento; 40320 no lo es, y por eso se comparan los dígitos significativos
 * y no el texto suelto.
 */
export function variantesDeNumero(escrito: string): string[] {
  const q = (escrito ?? '').trim().toUpperCase();
  const formas = new Set<string>([q]);

  const m = /^([A-Z0-9]+)-0*(\d+)$/.exec(q);
  if (m) {
    const serie = m[1]!;
    const digitos = m[2]!;
    formas.add(`${serie}-${digitos.padStart(8, '0')}`);
    formas.add(`${serie}-${digitos.padStart(7, '0')}`);
    formas.add(`${serie}-${digitos}`);
  }

  return [...formas];
}
