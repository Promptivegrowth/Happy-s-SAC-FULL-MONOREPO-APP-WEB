/**
 * TICKET DE PRUEBA para la ticketera, por el agente de impresión.
 *
 * Existe para poder verificar y CALIBRAR la impresora sin hacer una venta de
 * verdad. Sin esto, la única forma de ver si el corte cae bien sería cobrar un
 * comprobante real: gastando un correlativo y mandándoselo a SUNAT cada vez que
 * se ajusta un milímetro.
 *
 * No es comprobante: no toca la base, no consume numeración y no va a SUNAT.
 *
 * En un solo papel se comprueba todo lo que suele fallar:
 *   · que el ancho configurado coincida con el rollo cargado;
 *   · que el negro salga parejo (densidad del cabezal);
 *   · que las tildes y la ñ salgan bien (página de códigos);
 *   · que el logo se imprima reconocible;
 *   · DÓNDE CAE EL CORTE, que es lo que hay que calibrar;
 *   · que la pistola lea, con códigos de barras de productos reales.
 */

import { TicketEscPos, COLUMNAS, CORTE_MM_POR_DEFECTO } from './index';

export type MuestraPistola = {
  codigo: string;
  nombre: string;
  talla: string;
  /** true si es el SKU porque esa talla no tiene código de barras cargado. */
  esSku?: boolean;
};

export type DatosPrueba = {
  empresa: string;
  equipo: string;
  caja?: string | null;
  cajero?: string | null;
  /** Fecha y hora ya formateadas en hora de Perú. */
  fechaHora: string;
  /** Milímetros de avance que se están probando; se imprimen en el papel. */
  avanceCorteMm: number;
  muestras?: MuestraPistola[];
  logo?: boolean[][] | null;
};

export function construirTicketPrueba(d: DatosPrueba): TicketEscPos {
  const t = new TicketEscPos();
  const avance = d.avanceCorteMm ?? CORTE_MM_POR_DEFECTO;

  t.alinear('centro');
  if (d.logo && d.logo.length > 0) {
    t.imagen(d.logo);
    t.salto();
  }

  t.negrita(true).tamano(1, 2);
  t.linea('TICKET DE PRUEBA');
  t.tamano(1, 1);
  t.negrita(false);
  t.linea('No es comprobante de pago');
  t.linea('No se registra ninguna venta');
  t.salto();
  t.linea(d.empresa);
  t.linea(d.equipo);
  if (d.caja) t.linea(`Caja: ${d.caja}`);
  if (d.cajero) t.linea(`Cajero: ${d.cajero}`);
  t.linea(d.fechaHora);

  t.alinear('izq');
  t.separador();

  // ─────────────────────────────── 1. ancho del papel
  t.negrita(true);
  t.linea('1. ANCHO DEL PAPEL');
  t.negrita(false);
  t.linea('Esta línea debe entrar completa, sin');
  t.linea('partirse en dos:');
  // Una regla de exactamente el ancho del ticket. Si el rollo o el driver están
  // configurados más angostos, se parte y se ve al instante.
  let regla = '';
  for (let i = 1; i <= COLUMNAS; i++) regla += i % 10 === 0 ? String((i / 10) % 10) : '-';
  t.lineaCruda(regla);
  t.salto();

  // ─────────────────────────────── 2. densidad
  t.negrita(true);
  t.linea('2. NEGRO');
  t.negrita(false);
  t.linea('El bloque de abajo debe salir negro');
  t.linea('parejo, sin vetas ni gris:');
  // Un bloque sólido usando el carácter de bloque completo de la CP850.
  t.lineaCruda('█'.repeat(COLUMNAS));
  t.lineaCruda('█'.repeat(COLUMNAS));
  t.salto();

  // ─────────────────────────────── 3. acentos
  t.negrita(true);
  t.linea('3. TILDES Y EÑE');
  t.negrita(false);
  t.linea('ÁÉÍÓÚ áéíóú Ññ ¿? ¡! S/ 1,234.56');
  t.linea('Niña, Piñón, Corazón, Águila');
  t.salto();

  // ─────────────────────────────── 4. tamaños
  t.negrita(true);
  t.linea('4. TAMAÑOS');
  t.negrita(false);
  t.lineaDoble('Normal', 'S/ 85.50');
  t.negrita(true).tamano(1, 2);
  t.lineaDoble('TOTAL', 'S/ 85.50');
  t.tamano(1, 1).negrita(false);
  t.salto();

  // ─────────────────────────────── 5. la pistola
  if (d.muestras && d.muestras.length > 0) {
    t.negrita(true);
    t.linea('5. LA PISTOLA');
    t.negrita(false);
    t.linea('Escanea estos códigos en el buscador');
    t.linea('del POS: cada uno debe agregar la');
    t.linea('prenda y la talla que dice debajo.');
    t.salto();

    for (const m of d.muestras) {
      t.alinear('centro');
      t.codigoBarras(m.codigo, 70);
      t.linea(`${m.nombre} · talla ${m.talla}${m.esSku ? ' (código interno)' : ''}`);
      t.salto();
      t.alinear('izq');
    }
  }

  // ─────────────────────────────── 6. el corte
  t.separador();
  t.negrita(true);
  t.linea('6. EL CORTE');
  t.negrita(false);
  t.linea(`Avance configurado: ${avance} mm`);
  t.linea('El papel debe cortarse justo debajo');
  t.linea('de la línea de abajo, sin comerse');
  t.linea('texto y sin dejar papel en blanco.');
  t.salto();
  t.alinear('centro');
  t.linea('--- CORTAR AQUÍ ---');

  t.cortar(avance);
  return t;
}
