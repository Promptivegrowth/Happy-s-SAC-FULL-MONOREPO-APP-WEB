/**
 * Cómo se nombra un pago cuando hay que mostrarlo.
 *
 * El POS ya guardaba a qué cuenta entró cada cobro —en `ventas_pagos.referencia`
 * hay "BCP JAVIER", "CONTINENTAL - PLIN HAPPYS"— pero no se mostraba en ninguna
 * pantalla ni en el voucher: el cliente solo veía "Transferencia". Sin eso, al
 * cuadrar contra el estado de cuenta no hay forma de saber qué venta entró a qué
 * banco, y con dos Yape y dos Plin distintos la conciliación se vuelve a ojo.
 *
 * Esto vive en el paquete compartido porque el mismo texto tiene que salir
 * idéntico en la ticketera, en el PDF, en la pantalla de ventas, en el cierre de
 * caja y en los reportes. Cuando cada lugar lo arma por su cuenta, terminan
 * diciendo cosas distintas del mismo cobro.
 */

/** El método de pago en palabras, como lo lee una persona. */
export function nombreMetodo(metodo: string): string {
  switch ((metodo ?? '').trim().toUpperCase()) {
    case 'EFECTIVO': return 'Efectivo';
    case 'YAPE': return 'Yape';
    case 'PLIN': return 'Plin';
    case 'TARJETA_DEBITO': return 'Tarjeta débito';
    case 'TARJETA_CREDITO': return 'Tarjeta crédito';
    case 'TRANSFERENCIA': return 'Transferencia';
    case 'DEPOSITO': return 'Depósito';
    case 'WHATSAPP_PENDIENTE': return 'WhatsApp pendiente';
    case 'CREDITO': return 'Crédito';
    default: return (metodo ?? '').trim() || 'Otro';
  }
}

/**
 * La cuenta destino de un pago, si la hay.
 *
 * No toda referencia es una cuenta. El efectivo se guarda con la referencia
 * "EFECTIVO" —el nombre del método repetido, que no agrega nada— y un saldo a
 * favor aplicado viene como "ADELANTO". Se devuelve null en esos casos para que
 * ninguna pantalla imprima "Efectivo · EFECTIVO".
 */
export function cuentaDePago(metodo: string, referencia?: string | null): string | null {
  const r = (referencia ?? '').trim();
  if (!r) return null;

  const m = (metodo ?? '').trim().toUpperCase();
  const rMayus = r.toUpperCase();

  // La referencia que solo repite el método no es una cuenta.
  if (rMayus === m) return null;
  if (rMayus === 'EFECTIVO') return null;

  /*
   * Se devuelve el nombre TAL CUAL, sin recortarle nada.
   *
   * Es el texto del botón que aprieta la cajera. Retocarlo —aunque sea para
   * que lea mejor— rompe lo único que importa acá: que el papel, la pantalla y
   * el botón digan exactamente lo mismo. "debe aparecer tal cual lo que se
   * selecciona en la ventana de venta", pidió el cliente el 16/09/2026.
   */
  return r;
}

/**
 * Nombre completo del pago: método y cuenta.
 *
 * Ej.: "Plin · CONTINENTAL - PLIN HAPPYS". El separador es un punto medio
 * porque el guion ya aparece dentro de los nombres de cuenta del cliente.
 */
export function etiquetaPago(metodo: string, referencia?: string | null): string {
  const cuenta = cuentaDePago(metodo, referencia);
  const nombre = nombreMetodo(metodo);
  if (!cuenta) return nombre;

  /*
   * Si el nombre de la cuenta ya empieza diciendo el método, alcanza con él.
   *
   * La cuenta de Yape se llama "YAPE (BCP HAPPYS)" —tiene que decir Yape para
   * que se encuentre el botón—, y anteponerle el método daría "Yape · YAPE
   * (BCP HAPPYS)". En cambio "BCP JAVIER" no dice por sí solo que es una
   * transferencia, así que ahí el método sí aporta.
   *
   * En los dos casos el nombre del botón aparece entero y sin retocar.
   */
  if (cuenta.toUpperCase().startsWith((metodo ?? '').trim().toUpperCase())) return cuenta;
  return `${nombre} · ${cuenta}`;
}

export type PagoAgrupable = {
  metodo: string;
  referencia?: string | null;
  monto: number | string | null;
};

export type TotalPorCuenta = {
  metodo: string;
  /** Nombre de la cuenta, o null si el cobro no entró a ninguna (efectivo). */
  cuenta: string | null;
  /**
   * El nombre del botón, tal cual está guardado: "YAPE (BCP HAPPYS)".
   *
   * `cuenta` está pulido para leerse al lado del método; este es el crudo, y
   * es el que sirve para cruzar contra el catálogo de cuentas del POS.
   */
  referencia: string | null;
  /** Ya listo para imprimir: "Plin · CONTINENTAL - PLIN HAPPYS". */
  etiqueta: string;
  monto: number;
  cantidad: number;
};

/**
 * Suma los pagos agrupando por método Y cuenta.
 *
 * Agrupar solo por método es lo que hacía el cierre de caja, y por eso el
 * arqueo decía "Transferencia S/ 1165" sin distinguir si entró al BCP o al
 * Continental. Dos cuentas del mismo banco con el mismo método son dos
 * renglones distintos: son dos estados de cuenta distintos que alguien tiene
 * que cuadrar por separado.
 *
 * El orden es el de aparición, no alfabético: así el efectivo —que casi siempre
 * es el primer cobro del día— encabeza la lista en vez de quedar sepultado.
 */
export function agruparPorCuenta(pagos: PagoAgrupable[]): TotalPorCuenta[] {
  const mapa = new Map<string, TotalPorCuenta>();

  for (const p of pagos ?? []) {
    const metodo = (p.metodo ?? '').trim().toUpperCase();
    const cuenta = cuentaDePago(metodo, p.referencia);
    const clave = `${metodo}>>${cuenta ?? ''}`;

    const previo = mapa.get(clave);
    const monto = Number(p.monto ?? 0);
    if (previo) {
      previo.monto += monto;
      previo.cantidad += 1;
    } else {
      mapa.set(clave, {
        metodo,
        cuenta,
        referencia: (p.referencia ?? '').trim() || null,
        etiqueta: etiquetaPago(metodo, p.referencia),
        monto,
        cantidad: 1,
      });
    }
  }

  return [...mapa.values()];
}


export type CuentaPos = {
  /** El texto del botón en la ventana de venta: "CONTINENTAL - PLIN HAPPYS". */
  nombre_corto: string;
  /** El método que ese botón registra: YAPE, PLIN, TRANSFERENCIA, EFECTIVO… */
  metodo_default: string;
};

/**
 * El arqueo de caja, con los MISMOS renglones que los botones de cobro.
 *
 * Pedido del cliente (16/09/2026), textual: "los medios de pago están mal,
 * debe aparecer los medios de pago que muestra la ventana de venta… debe
 * aparecer tal cual lo que se selecciona en la ventana de venta y eso debe
 * tener trazabilidad total".
 *
 * Antes el cierre mostraba cinco renglones fijos —Efectivo, Yape, Plin,
 * Tarjeta, Transferencia— que no son lo que la cajera toca. Ella aprieta
 * "BCP JAVIER" o "CONTINENTAL - PLIN HAPPYS"; que el arqueo hable de
 * "Transferencia" la obliga a traducir de memoria, y con dos cuentas de
 * transferencia la traducción es imposible: el papel decía 810 sin decir a
 * cuál de los dos bancos.
 *
 * Van TODOS los botones, incluso los que no se usaron, en el mismo orden de la
 * pantalla: un renglón en cero dice "por acá no entró nada", que es
 * información, y deja el papel comparable entre dos turnos distintos.
 *
 * Y al final se agregan los cobros que no correspondan a ningún botón actual
 * —una cuenta que después se ocultó, un saldo a favor aplicado—: si entró
 * plata, tiene que estar, aunque el botón ya no exista.
 */
export function arqueoPorCuenta(
  cuentasPos: CuentaPos[],
  pagos: PagoAgrupable[],
): TotalPorCuenta[] {
  const totales = agruparPorCuenta(pagos);
  const usados = new Set<number>();
  const clave = (s: string) => s.trim().toUpperCase();

  const filas: TotalPorCuenta[] = (cuentasPos ?? []).map((c) => {
    const nombre = (c.nombre_corto ?? '').trim();
    const metodo = (c.metodo_default ?? '').trim().toUpperCase();

    /*
     * Un cobro es de este botón cuando coincide el nombre de la cuenta. El
     * efectivo es el caso aparte: se guarda con la referencia "EFECTIVO" o sin
     * ninguna, y en los dos casos es el mismo botón.
     */
    let monto = 0;
    let cantidad = 0;
    totales.forEach((t, i) => {
      if (usados.has(i)) return;
      const coincide = t.referencia
        ? clave(t.referencia) === clave(nombre)
        : t.metodo === metodo && metodo === 'EFECTIVO';
      if (!coincide) return;
      usados.add(i);
      monto += t.monto;
      cantidad += t.cantidad;
    });

    return {
      metodo,
      cuenta: metodo === 'EFECTIVO' ? null : nombre,
      referencia: nombre,
      etiqueta: nombre,
      monto,
      cantidad,
    };
  });

  // Lo que entró por un botón que ya no está en la pantalla no se puede perder.
  totales.forEach((t, i) => {
    if (usados.has(i)) return;
    filas.push({ ...t, etiqueta: t.referencia ?? nombreMetodo(t.metodo) });
  });

  return filas;
}
