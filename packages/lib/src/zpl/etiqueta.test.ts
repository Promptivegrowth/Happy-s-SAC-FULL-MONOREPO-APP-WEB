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

/** Las coordenadas X de TODOS los orígenes de campo de una fila. */
function equis(fila: string): number[] {
  return [...fila.matchAll(/\^FO(\d+),/g)].map((m) => Number(m[1]));
}

/**
 * Dónde empieza cada etiqueta de la fila, una vez por columna.
 *
 * Se mira el texto y no las barras: el texto arranca en el borde de su
 * etiqueta, mientras que las barras van centradas y por lo tanto corridas una
 * distancia que depende de cuántos caracteres tenga el código.
 */
function columnas(fila: string): number[] {
  return [...new Set(
    [...fila.matchAll(/\^FO(\d+),\d+\^A0N/g)].map((m) => Number(m[1])),
  )].sort((a, b) => a - b);
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
    const xs = columnas(f[0] ?? '');
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
    expect(columnas(f[1] ?? '').length).toBe(1);
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

  it('NO le impone un largo de etiqueta a la impresora', () => {
    /*
     * ^LL le dice "avanza exactamente esto por etiqueta". Basta un desajuste
     * de décimas contra el troquel real para que cada fila se corra un poco
     * más que la anterior, y en una tanda larga la suma adelanta una etiqueta
     * entera: sale una fila en blanco. Pasó en el almacén con el rollo
     * declarado en 25 mm y el troquel de 25,4.
     *
     * El largo lo pone el sensor de la impresora, etiqueta por etiqueta.
     */
    expect(construirEtiquetasZpl([UNA])).not.toContain('^LL');
  });

  it('el alto elegido sigue mandando dentro de la etiqueta', () => {
    // Lo que se deja de declarar es el AVANCE del papel, no el diseño: el
    // código legible se sigue apoyando en el borde de abajo.
    const yCodigo = (alto: number) => {
      const f = filas(construirEtiquetasZpl([UNA], {
        formato: { ...ROLLO_2X1_DOBLE, altoEtiquetaMm: alto },
      }))[0] ?? '';
      return Math.max(...[...f.matchAll(/\^FO\d+,(\d+)/g)].map((m) => Number(m[1])));
    };
    expect(yCodigo(40)).toBeGreaterThan(yCodigo(25.4));
  });

  it('cada fila del lote sale idéntica: nada depende de la anterior', () => {
    /*
     * La prueba de la deriva. Si el ZPL de la fila 1 y el de la fila 30 son
     * iguales, ningún corrimiento puede venir de lo que mandamos: la
     * impresora arranca cada fila en el troquel que encuentra.
     */
    const f = filas(construirEtiquetasZpl([{ ...UNA, cantidad: 60 }]));
    expect(f.length).toBe(30);
    for (const fila of f) expect(fila).toBe(f[0]);
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

  it('un rollo de una sola columna saca una etiqueta por fila', () => {
    // El selector del ERP ofrece rollos de una y de dos columnas; el de una
    // no puede terminar con dos códigos pegados en el mismo sticker.
    const zpl = construirEtiquetasZpl([{ ...UNA, cantidad: 3 }], {
      formato: { anchoEtiquetaMm: 50, altoEtiquetaMm: 30, columnas: 1, separacionMm: 0, margenIzquierdoMm: 2 },
    });
    const f = filas(zpl);
    expect(f.length).toBe(3);
    for (const fila of f) expect(columnas(fila).length).toBe(1);
    expect(zpl).toContain(`^PW${aPuntos(52)}`);   // margen + una etiqueta
  });

  it('se puede ajustar la separación entre columnas sin tocar el código', () => {
    // Cada fabricante troquela distinto; un milímetro corre toda la segunda
    // columna.
    const zpl = construirEtiquetasZpl([{ ...UNA, cantidad: 2 }], {
      formato: { ...ROLLO_2X1_DOBLE, separacionMm: 6 },
    });
    const xs = columnas(filas(zpl)[0] ?? '');
    expect(xs[1]! - xs[0]!).toBe(aPuntos(50.8 + 6));
  });
});

describe('el reparto vertical', () => {
  /** Las coordenadas Y de una fila, en orden de aparición. */
  function yes(fila: string): number[] {
    return [...fila.matchAll(/\^FO\d+,(\d+)/g)].map((m) => Number(m[1]));
  }

  it('el nombre arranca despegado del borde de arriba', () => {
    /*
     * En la primera tanda del almacén salió cortada la parte de arriba de los
     * nombres: la Zebra empieza a imprimir un poco después del borde del
     * sticker y la primera línea quedaba medio renglón afuera.
     */
    const f = filas(construirEtiquetasZpl([UNA]))[0] ?? '';
    expect(Math.min(...yes(f))).toBeGreaterThanOrEqual(aPuntos(2.5));
  });

  it('el aire de arriba es mayor que el de los costados', () => {
    // Abajo sobraba papel y arriba faltaba: el sobrante se movió de lado.
    const f = filas(construirEtiquetasZpl([UNA]))[0] ?? '';
    const xIzq = Math.min(...[...f.matchAll(/\^FO(\d+),/g)].map((m) => Number(m[1])));
    const margenIzquierdo = xIzq - aPuntos(ROLLO_2X1_DOBLE.margenIzquierdoMm);
    expect(Math.min(...yes(f))).toBeGreaterThan(margenIzquierdo);
  });

  it('el aire de arriba se puede ajustar sin tocar el código', () => {
    // Cada impresora arranca en un punto un poco distinto; esta es la perilla
    // para corregirlo mirando una tira impresa.
    const y = (extra: number) => {
      const f = filas(construirEtiquetasZpl([UNA], { margenSuperiorExtraMm: extra }))[0] ?? '';
      return Math.min(...[...f.matchAll(/\^FO\d+,(\d+)/g)].map((m) => Number(m[1])));
    };
    expect(y(3)).toBeGreaterThan(y(1.3));
    expect(y(3) - y(1.3)).toBe(aPuntos(3) - aPuntos(1.3));
  });

  it('nada se pasa del alto de la etiqueta', () => {
    for (const alto of [25, 25.4, 30, 40]) {
      const zpl = construirEtiquetasZpl([UNA], {
        formato: { ...ROLLO_2X1_DOBLE, altoEtiquetaMm: alto },
      });
      const f = filas(zpl)[0] ?? '';
      const altoBarras = Number(/\^BCN,(\d+),/.exec(f)?.[1] ?? 0);
      const ultimo = Math.max(...yes(f));
      expect(Math.max(ultimo, altoBarras)).toBeLessThan(aPuntos(alto));
    }
  });

  it('las barras siguen leyéndose aunque el nombre ocupe más', () => {
    const f = filas(construirEtiquetasZpl([UNA]))[0] ?? '';
    const altoBarras = Number(/\^BCN,(\d+),/.exec(f)?.[1] ?? 0);
    expect(altoBarras).toBeGreaterThanOrEqual(aPuntos(7));
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

  it('el color entra en el nombre, que es lo que distingue una prenda de otra', () => {
    // Con el título en un solo renglón salía "ALA DE MARIPOSA SIN LUCES AMA":
    // idéntica a la fucsia hasta la última palabra.
    const texto = (t: string) => {
      const f = filas(construirEtiquetasZpl([{ ...UNA, titulo: t }]))[0] ?? '';
      return /\^FD([^^]*)\^FS/.exec(f)?.[1] ?? '';
    };
    expect(texto('ala de mariposa sin luces amarillo brasil')).toContain('AMARILLO BRASIL');
    expect(texto('ala de mariposa sin luces fucsia')).toContain('FUCSIA');
  });

  it('las barras siguen siendo legibles con el nombre en dos renglones', () => {
    // El nombre no puede comerse las barras: menos de 7 mm y la pistola falla.
    const f = filas(construirEtiquetasZpl([UNA]))[0] ?? '';
    const alto = Number(/\^BCN,(\d+),/.exec(f)?.[1] ?? 0);
    expect(alto).toBeGreaterThanOrEqual(aPuntos(7));
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

describe('las barras centradas', () => {
  /** El ^FO de las barras y el del texto de arriba, en una fila. */
  function xDeBarras(zpl: string): number {
    return Number(/\^FO(\d+),\d+\^BCN/.exec(zpl)?.[1] ?? -1);
  }

  it('el código queda centrado, no pegado al margen', () => {
    // Esto salió mal en el almacén: ^FB centra texto pero no centra barras,
    // así que el código arrancaba en el margen mientras el nombre y el número
    // sí quedaban centrados. Se veía torcido aunque cada cosa estuviera dentro
    // de su etiqueta.
    const f = filas(construirEtiquetasZpl([UNA]))[0] ?? '';
    const xBarras = xDeBarras(f);
    const xTexto = Number(/\^FO(\d+),/.exec(f)?.[1] ?? -1);
    expect(xBarras).toBeGreaterThan(xTexto);

    // El sobrante a cada lado tiene que ser el mismo, con un punto de holgura
    // por el redondeo.
    const modulos = 11 * (UNA.codigo.length + 2) + 13;
    const modulo = Number(/\^BY(\d+),/.exec(f)?.[1] ?? 0);
    const anchoUtil = aPuntos(ROLLO_2X1_DOBLE.anchoEtiquetaMm - 1.5 * 2);
    const izquierda = xBarras - xTexto;
    const derecha = anchoUtil - modulos * modulo - izquierda;
    expect(Math.abs(izquierda - derecha)).toBeLessThanOrEqual(1);
  });

  it('las barras entran en la etiqueta, no invaden la de al lado', () => {
    const largo = { titulo: 'GORRO', codigo: 'PRDM0018-XL-2026', cantidad: 1 };
    const f = filas(construirEtiquetasZpl([largo]))[0] ?? '';
    const modulo = Number(/\^BY(\d+),/.exec(f)?.[1] ?? 0);
    const ancho = (11 * (largo.codigo.length + 2) + 13) * modulo;
    expect(ancho).toBeLessThanOrEqual(aPuntos(ROLLO_2X1_DOBLE.anchoEtiquetaMm - 1.5 * 2));
  });

  it('un código corto usa barras más gruesas, que la pistola lee mejor', () => {
    const corto = filas(construirEtiquetasZpl([{ ...UNA, codigo: 'PF176' }]))[0] ?? '';
    const largo = filas(construirEtiquetasZpl([{ ...UNA, codigo: 'PRDM0018-XL-2026' }]))[0] ?? '';
    const modulo = (f: string) => Number(/\^BY(\d+),/.exec(f)?.[1] ?? 0);
    expect(modulo(corto)).toBeGreaterThan(modulo(largo));
    expect(modulo(largo)).toBeGreaterThanOrEqual(1);
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
