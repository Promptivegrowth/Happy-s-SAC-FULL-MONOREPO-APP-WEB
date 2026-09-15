/**
 * Tipos para el codificador CODE 128 de JsBarcode.
 *
 * Se importa el módulo interno a propósito: la API pública de JsBarcode dibuja
 * sobre un <canvas> o un <svg>, y aquí solo hace falta la secuencia de módulos
 * para pintarla como vectores en el PDF (ver barcode/index.ts). El paquete no
 * declara "exports", así que el import profundo es válido.
 */
declare module 'jsbarcode/bin/barcodes/CODE128/index.js' {
  export class CODE128 {
    constructor(data: string, options?: { ean128?: boolean });
    /** false si el texto tiene caracteres que CODE 128 no representa. */
    valid(): boolean;
    /** OJO: consume el estado interno; llamar UNA sola vez por instancia. */
    encode(): { data: string; text: string };
  }
  export class CODE128A extends CODE128 {}
  export class CODE128B extends CODE128 {}
  export class CODE128C extends CODE128 {}
}
