/**
 * Detecta cuando el método de cobro de una cuenta no concuerda con su nombre.
 *
 * El 15/09/2026 la caja de Huallaga cerró con Plin en S/ 0.00 y S/ 1,175 en
 * transferencias. La cajera había cobrado por Plin y la boleta lo imprimía
 * bien, porque el ticket muestra el NOMBRE de la cuenta. Lo que se guardaba,
 * en cambio, era el método configurado en esa cuenta —"TRANSFERENCIA"— y ese
 * es el que suma el cierre de caja. Seis cobros, S/ 600, en la casilla
 * equivocada.
 *
 * Nadie hizo nada mal: se creó una cuenta llamada "CONTINENTAL - PLIN HAPPYS"
 * y el formulario venía con TRANSFERENCIA puesto de fábrica. El error no se ve
 * en ningún lado hasta que alguien cuadra la caja, y para entonces ya pasó un
 * día entero de ventas.
 *
 * Esto no corrige nada solo: avisa. Puede haber motivos legítimos para la
 * combinación rara, así que el ERP muestra el aviso y deja decidir.
 */

/** Los métodos que una cuenta puede tener asignados. */
export const METODOS_DE_COBRO = [
  'EFECTIVO', 'YAPE', 'PLIN', 'TARJETA_DEBITO', 'TARJETA_CREDITO',
  'TRANSFERENCIA', 'DEPOSITO', 'CREDITO', 'WHATSAPP_PENDIENTE',
] as const;

export type MetodoDeCobro = (typeof METODOS_DE_COBRO)[number];

/** Palabras que delatan de qué es una cuenta, y el método que les corresponde. */
const PISTAS: Array<{ palabra: string; metodo: MetodoDeCobro }> = [
  { palabra: 'YAPE', metodo: 'YAPE' },
  { palabra: 'PLIN', metodo: 'PLIN' },
  { palabra: 'EFECTIVO', metodo: 'EFECTIVO' },
  { palabra: 'TARJETA', metodo: 'TARJETA_CREDITO' },
];

/** Cómo se lee cada método en la pantalla. */
export function nombreDelMetodo(m: string): string {
  switch (m) {
    case 'EFECTIVO': return 'Efectivo';
    case 'YAPE': return 'Yape';
    case 'PLIN': return 'Plin';
    case 'TARJETA_DEBITO': return 'Tarjeta de débito';
    case 'TARJETA_CREDITO': return 'Tarjeta de crédito';
    case 'TRANSFERENCIA': return 'Transferencia';
    case 'DEPOSITO': return 'Depósito';
    case 'CREDITO': return 'Crédito';
    case 'WHATSAPP_PENDIENTE': return 'Pendiente por WhatsApp';
    default: return m;
  }
}

/**
 * Devuelve el aviso cuando el nombre de la cuenta y su método no concuerdan,
 * o null si está todo bien.
 *
 * Solo mira lo que es inequívoco. Una cuenta que dice "YAPE" y graba
 * transferencias es un error casi seguro; una que dice "BCP" puede ser
 * transferencia, depósito o las dos cosas, así que de esas no opina.
 *
 * Con "YAPE" y "PLIN" juntos en el nombre —hay una cuenta así— cualquiera de
 * los dos métodos vale: es una sola cuenta para las dos billeteras.
 */
export function avisoDeMetodo(
  nombre: string | null | undefined,
  banco: string | null | undefined,
  metodo: string | null | undefined,
): string | null {
  const texto = `${nombre ?? ''} ${banco ?? ''}`.toUpperCase();
  const esperados = PISTAS.filter((p) => texto.includes(p.palabra)).map((p) => p.metodo);
  if (esperados.length === 0) return null;

  const actual = String(metodo ?? '');
  // "Tarjeta" a secas abarca débito y crédito: las dos cuentan.
  const aceptados = new Set<string>(esperados);
  if (aceptados.has('TARJETA_CREDITO')) aceptados.add('TARJETA_DEBITO');
  if (aceptados.has(actual)) return null;

  const comoSeLlama = esperados.map(nombreDelMetodo).join(' o ');
  return (
    `Esta cuenta se llama "${(nombre ?? '').trim()}" pero registra los cobros como ` +
    `${nombreDelMetodo(actual)}. El cierre de caja los va a sumar ahí, no en ` +
    `${comoSeLlama}. Si es Plin o Yape, cámbialo; si de verdad entra como ` +
    `${nombreDelMetodo(actual)}, déjalo así.`
  );
}
