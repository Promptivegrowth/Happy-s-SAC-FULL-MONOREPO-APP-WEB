/**
 * Pruebas de las etiquetas ZPL.
 *
 * Lo que motivó este módulo: con un rollo de DOS etiquetas a lo ancho, el
 * camino anterior —PDF por el controlador de Windows— imprimía un solo código
 * estirado sobre los dos stickers. Así que lo que más se prueba acá es la
 * geometría: que cada etiqueta caiga en su columna y que nada se desborde
 * sobre la de al lado.
 */

import { describe, it, expect } from 'vitest';
import {
  construirEtiquetasZpl,
  escaparZpl,
  aFuenteZebra,
  aPuntos,
  ROLLO_2X1_DOBLE,
  type EtiquetaDato,
} from './etiqueta';

const UNA: EtiquetaDato = { titulo: 'GUARDAPOLVO #14', codigo: 'PF176', cantidad: 1 };

/** Los bloques ^XA…^XZ que llevan etiquetas (el primero es configuración). */
function filas(zpl: string): string[] {
  return zpl
    .split('^XA')
    .slice(1)
    .map((b) => b.split('^XZ')[0] ?? '')
    .filter((b) => b.includes('^FO'));
}

/** Las coordenadas X de los orígenes de campo de una fila. */
function equis(fila: string): number[] {
  return [...fila.matchAll(/\^FO(\d+),/g)].map((m) => Number(m[1]));
}

describe('las dos columnas del rollo', () => {
  it('una sola etiqueta ocupa la primera columna, no el ancho entero', () => {
    // Este era el error: el diseño se estiraba sobre los dos stickers.
    const f = filas(construirEtiquetasZpl([UNA]));
    expect(f.length).toBe(1);
    const xs = equis(f[0] ?? '');
    const limiteColumna = aPuntos(ROLLO_2X1_DOBLE.anchoEtiquetaMm);
    expect(Math.max(...xs)).toBeLessThan(limiteColumna);
  });

  it('dos etiquetas entran en UNA sola fila, una por columna', () => {
    const f = filas(construirEtiquetasZpl([{ ...UNA, cantidad: 2 }]));
    expect(f.length).toBe(1);
    const xs = [...new Set(equis(f[0] ?? ''))].sort((a, b) => a - b);
    expect(xs.length).toBe(2);
    // La segunda columna arranca después del ancho de la primera.
    expect(xs[1]).toBeGreaterThanOrEqual(aPuntos(ROLLO_2X1_DOBLE.anchoEtiquetaMm));
  });

  it('cuatro etiquetas son dos filas', () => {
    expect(filas(construirEtiquetasZpl([{ ...UNA, cantidad: 4 }])).length).toBe(2);
  });

  it('un número impar deja media fila en blanco, no arrastra la siguiente', () => {
    // Tres etiquetas: dos filas, la última con una sola. Mejor eso que meter
    // en la tanda una etiqueta de otro producto.
    const f = filas(construirEtiquetasZpl([{ ...UNA, cantidad: 3 }]));
    expect(f.length).toBe(2);
    expect([...new Set(equis(f[1] ?? ''))].length).toBe(1);
  });

  it('productos distintos se reparten en orden, sin mezclarse dentro de una etiqueta', () => {
    const zpl = construirEtiquetasZpl([
      { titulo: 'ABEJITA #6', codigo: 'PR113', cantidad: 2 },
      { titulo: 'GUARDAPOLVO #14', codigo: 'PF176', cantidad: 2 },
    ]);
    const f = filas(zpl);
    expect(f.length).toBe(2);
    expect(f[0]).toContain('PR113');
    expect(f[0]).not.toContain('PF176');
    expect(f[1]).toContain('PF176');
    expect(f[1]).not.toContain('PR113');
  });

  it('nada se sale del ancho del papel', () => {
    const zpl = construirEtiquetasZpl([{ ...UNA, cantidad: 6 }]);
    const anchoPapel = Number(/\^PW(\d+)/.exec(zpl)?.[1] ?? 0);
    expect(anchoPapel).toBeGreaterThan(0);
    for (const f of filas(zpl)) {
      for (const x of equis(f)) expect(x).toBeLessThan(anchoPapel);
    }
  });
});

describe('el papel y la máquina', () => {
  it('declara el ancho de las dos etiquetas más su separación', () => {
    const zpl = construirEtiquetasZpl([UNA]);
    const esperado = aPuntos(2 + 50.8 * 2 + 3); // margen + dos etiquetas + hueco
    expect(zpl).toContain(`^PW${esperado}`);
  });

  it('declara el alto de UNA fila, no el del rollo entero', () => {
    expect(construirEtiquetasZpl([UNA])).toContain(`^LL${aPuntos(25.4)}`);
  });

  it('avisa que el papel tiene separación entre etiquetas', () => {
    // Sin ^MNY la Zebra trata el rollo como papel continuo y no sabe dónde
    // termina cada etiqueta: imprime corrido.
    expect(construirEtiquetasZpl([UNA])).toContain('^MNY');
  });

  it('la configuración va aparte y no imprime una etiqueta en blanco', () => {
    const zpl = construirEtiquetasZpl([UNA]);
    const primero = zpl.split('^XA')[1]?.split('^XZ')[0] ?? '';
    expect(primero).toContain('^PW');
    expect(primero).not.toContain('^FO');
  });

  it('se puede ajustar la separación entre columnas sin tocar el código', () => {
    // Cada fabricante troquela distinto; un milímetro corre toda la segunda
    // columna.
    const zpl = construirEtiquetasZpl([{ ...UNA, cantidad: 2 }], {
      formato: { ...ROLLO_2X1_DOBLE, separacionMm: 6 },
    });
    const xs = [...new Set(equis(filas(zpl)[0] ?? ''))].sort((a, b) => a - b);
    expect(xs[1]! - xs[0]!).toBe(aPuntos(50.8 + 6));
  });
});

describe('el contenido de cada etiqueta', () => {
  it('lleva el nombre, las barras y el código legible', () => {
    const f = filas(construirEtiquetasZpl([UNA]))[0] ?? '';
    expect(f).toContain('GUARDAPOLVO #14');
    expect(f).toContain('^BCN');        // código de barras CODE 128
    // El código aparece dos veces: dentro de las barras y escrito debajo.
    expect((f.match(/PF176/g) ?? []).length).toBe(2);
  });

  it('apaga el texto que la propia Zebra pone bajo las barras', () => {
    // Si no, sale dos veces: el de la impresora y el nuestro.
    expect(filas(construirEtiquetasZpl([UNA]))[0]).toContain('^BCN,');
    expect(filas(construirEtiquetasZpl([UNA]))[0]).toMatch(/\^BCN,\d+,N,N,N/);
  });

  it('un título larguísimo se corta en vez de invadir la etiqueta vecina', () => {
    const largo = 'DISFRAZ DE MUJER MARAVILLA CON CAPA Y ACCESORIOS COMPLETOS PARA NINA #6';
    const f = filas(construirEtiquetasZpl([{ ...UNA, titulo: largo }]))[0] ?? '';
    const texto = /\^FD([^^]*)\^FS/.exec(f)?.[1] ?? '';
    expect(texto.length).toBeLessThan(largo.length);
  });

  it('sin etiquetas no genera nada', () => {
    expect(construirEtiquetasZpl([])).toBe('');
    expect(construirEtiquetasZpl([{ ...UNA, cantidad: 0 }])).toBe('');
  });
});

describe('texto que podría romper la impresión', () => {
  it('neutraliza los caracteres que ZPL toma como comandos', () => {
    // Un "^" suelto parte la etiqueta al medio: la impresora lo lee como el
    // comienzo de una instrucción.
    expect(escaparZpl('A^B~C')).toBe('A\\5EB\\7EC');
  });

  it('un nombre con ^ no corta la etiqueta', () => {
    const f = filas(construirEtiquetasZpl([{ ...UNA, titulo: 'CAPA ^ GORRO' }]))[0] ?? '';
    expect(f).toContain('\\5E');
    expect(f).toContain('^BCN');  // el resto de la etiqueta sigue entero
  });

  it('las tildes y la Ñ se reemplazan por su letra simple', () => {
    // La fuente interna de la Zebra no las tiene: imprimiría cuadraditos.
    expect(aFuenteZebra('Pañuelo de mariné')).toBe('PANUELO DE MARINE');
  });

  it('el nombre real del producto que falló sale legible', () => {
    const f = filas(construirEtiquetasZpl([
      { titulo: 'Mujer Maravilla para niña #6', codigo: 'DT0042', cantidad: 1 },
    ]))[0] ?? '';
    expect(f).toContain('MUJER MARAVILLA PARA NINA #6');
  });
});
