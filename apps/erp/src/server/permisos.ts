/**
 * Quién puede entrar a cada parte del ERP.
 *
 * Hasta ahora esto no existía como tal. El menú escondía nueve de sus cuarenta y
 * cinco entradas según el rol, y eso era todo: el resto se le mostraba a
 * cualquiera, y aun las escondidas se abrían tecleando la dirección, porque el
 * middleware sólo comprobaba que la persona hubiera iniciado sesión, nunca qué
 * rol tenía. De 118 pantallas, 13 se defendían solas. Por eso un almacenero veía
 * prácticamente lo mismo que gerencia aunque su rol estuviera bien asignado.
 *
 * Este archivo es la única fuente de verdad: lo usa el menú para decidir qué
 * mostrar y el layout para decidir qué dejar abrir. Al salir los dos de acá no
 * pueden contradecirse, que era el otro problema de fondo — esconder un botón no
 * es cerrar una puerta.
 *
 * NADA DE ESTO TOCA EL POS. Vender es otra aplicación (apps/pos) con su propia
 * sesión y sus propias reglas; acá no se le cambia nada.
 *
 * Es puro a propósito (sin imports de servidor): lo importa el sidebar, que es
 * un componente de cliente.
 */

import type { Rol } from '@happy/db/enums';

/**
 * Todo el personal, o sea cualquiera menos un cliente externo.
 *
 * Se usa en las secciones que son de consulta común. Al armar el mapa el
 * criterio fue no romper la operación en curso: se cierra lo que de verdad es
 * de gerencia y se deja abierto lo que alguien puede necesitar en su turno.
 * Apretar de más es tan malo como no apretar: deja a una persona sin trabajar y
 * sin entender por qué.
 */
const PERSONAL: Rol[] = ['almacenero', 'jefe_produccion', 'operario', 'cajero', 'vendedor_b2b', 'contador'];

/** Quien mueve mercadería: almacén y producción. */
const LOGISTICA: Rol[] = ['almacenero', 'jefe_produccion'];

/**
 * Quien administra: gerencia y contabilidad.
 *
 * Son los únicos que ven los tableros. Pedido de Javier el 19/09/2026: los
 * números del negocio son para quien los tiene que leer, no para todo el
 * personal.
 */
const ADMINISTRATIVO: Rol[] = ['contador'];

/** Quien atiende y factura. */
const COMERCIAL: Rol[] = ['cajero', 'vendedor_b2b'];

/** Quien fabrica. */
const PRODUCCION: Rol[] = ['jefe_produccion', 'operario'];

/**
 * Áreas del ERP y quién entra a cada una.
 *
 * `gerente` no figura en ninguna lista porque entra a todo por definición; se
 * resuelve en `puedeVer`. Gana la ruta más específica, así que
 * `/ventas/exportacion` puede ser más estricta que `/ventas`.
 *
 * Las 32 secciones del ERP están todas acá a propósito: lo que no figure queda
 * sólo para gerencia, y una sección olvidada dejaría gente afuera.
 */
export const PERMISOS: Array<{ prefijo: string; roles: Rol[] }> = [
  // ── Sólo gerencia ────────────────────────────────────────────────────────
  // Configuración del sistema, cuentas de usuario, la web pública, los
  // reclamos de INDECOPI y las ventas de exportación. Es lo que Javier vio que
  // no correspondía que tuviera un almacenero.
  { prefijo: '/configuracion', roles: [] },
  { prefijo: '/usuarios', roles: [] },
  { prefijo: '/web-catalogo', roles: [] },
  { prefijo: '/reclamos', roles: [] },
  { prefijo: '/ventas/exportacion', roles: [] },

  // ── Administración y plata ───────────────────────────────────────────────
  { prefijo: '/reportes', roles: ['contador', 'jefe_produccion'] },
  { prefijo: '/compras/cxp', roles: ['contador'] },

  // ── Comercial ────────────────────────────────────────────────────────────
  { prefijo: '/ventas', roles: [...COMERCIAL, 'contador'] },
  { prefijo: '/comprobantes', roles: [...COMERCIAL, 'contador'] },
  { prefijo: '/pedidos-web', roles: COMERCIAL },
  { prefijo: '/b2b', roles: ['vendedor_b2b'] },
  { prefijo: '/clientes', roles: COMERCIAL },
  { prefijo: '/pos', roles: ['cajero'] },

  // ── Almacén y compras ────────────────────────────────────────────────────
  // `cajero` entra a stock, kardex y traslados a propósito: la tienda recibe
  // mercadería y consulta existencias todos los días.
  { prefijo: '/inventario', roles: [...LOGISTICA, 'cajero', 'almacen_la_quinta'] },
  { prefijo: '/kardex', roles: [...LOGISTICA, 'cajero', 'contador'] },
  { prefijo: '/traslados', roles: [...LOGISTICA, 'cajero'] },
  { prefijo: '/materiales', roles: LOGISTICA },
  { prefijo: '/oc', roles: [...LOGISTICA, 'contador'] },
  { prefijo: '/recepciones', roles: LOGISTICA },
  { prefijo: '/compras', roles: [...LOGISTICA, 'contador'] },
  /*
   * Almacén NO entra a Proveedores. Pedido de Javier el 19/09/2026: el módulo
   * de Personas no es asunto de quien mueve mercadería.
   */
  { prefijo: '/proveedores', roles: ['jefe_produccion', 'contador'] },

  // ── Producción ───────────────────────────────────────────────────────────
  { prefijo: '/plan-maestro', roles: ['jefe_produccion'] },
  { prefijo: '/ot', roles: PRODUCCION },
  { prefijo: '/corte', roles: PRODUCCION },
  { prefijo: '/servicios', roles: ['jefe_produccion'] },
  { prefijo: '/produccion', roles: PRODUCCION },
  { prefijo: '/recetas', roles: ['jefe_produccion'] },
  { prefijo: '/categorias', roles: ['jefe_produccion'] },
  { prefijo: '/talleres', roles: ['jefe_produccion'] },
  { prefijo: '/operarios', roles: ['jefe_produccion'] },
  { prefijo: '/calidad', roles: [...PRODUCCION, 'almacenero'] },

  // ── Consulta común ───────────────────────────────────────────────────────
  { prefijo: '/productos', roles: PERSONAL },
  { prefijo: '/trazabilidad', roles: PERSONAL },
  /*
   * El tablero es sólo para gerencia y contabilidad.
   *
   * Quien no lo tenga NO se queda contra una pared: `primeraRutaPara` lo manda
   * a la primera pantalla que sí le corresponde. Sin eso, restringir el tablero
   * dejaría a media empresa sin poder entrar, porque es la pantalla a la que
   * cae todo el mundo al iniciar sesión.
   */
  { prefijo: '/dashboard', roles: ADMINISTRATIVO },
  { prefijo: '/notificaciones', roles: PERSONAL },
];

/** Lo único que abre la cuenta de Almacén La Quinta. La campanita va incluida
 *  porque, si no, el aviso que le llega no lo puede ni abrir. */
const SOLO_LA_QUINTA: string[] = ['/inventario', '/notificaciones'];

/** La regla que aplica a una ruta: la de prefijo más largo que coincida. */
export function reglaDe(pathname: string): { prefijo: string; roles: Rol[] } | null {
  let mejor: { prefijo: string; roles: Rol[] } | null = null;
  for (const r of PERMISOS) {
    if (pathname === r.prefijo || pathname.startsWith(`${r.prefijo}/`)) {
      if (!mejor || r.prefijo.length > mejor.prefijo.length) mejor = r;
    }
  }
  return mejor;
}

/**
 * Si esos roles alcanzan para ver esa ruta.
 *
 * Una ruta que no figura en el mapa queda sólo para gerencia. Es a propósito:
 * si mañana alguien agrega una pantalla y se olvida de declararla, lo que pasa
 * es que nadie más la ve —molesto y visible— y no que la vea todo el mundo, que
 * es justamente cómo se llegó a este problema.
 */
export function puedeVer(roles: Rol[], pathname: string): boolean {
  if (roles.includes('gerente')) return true;

  /*
   * Almacén La Quinta: sólo Inventario, pase lo que pase.
   *
   * En la base, ese rol no figura en ninguna de las 105 políticas de seguridad
   * —ni siquiera en la que deja leer los propios roles—, así que la cuenta
   * entraba sin ningún rol a la vista y se quedaba mirando una pantalla vacía.
   * Para que pueda trabajar lleva además el rol de `almacenero`, que es el que
   * la base sí reconoce.
   *
   * Ese rol extra le abriría medio menú, y Javier pidió el 19/09/2026 que esta
   * cuenta viera Inventario y nada más. Entonces acá manda la lista corta: no
   * importa qué otros roles tenga, si es La Quinta sólo pasa esto.
   */
  if (roles.includes('almacen_la_quinta')) {
    return SOLO_LA_QUINTA.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  }

  const regla = reglaDe(pathname);
  if (!regla) return false;
  return regla.roles.some((r) => roles.includes(r));
}

/**
 * Adónde mandar a alguien cuando entra.
 *
 * Todo el mundo cae en /dashboard al iniciar sesión, pero desde el 19/09/2026
 * el tablero es sólo de gerencia y contabilidad. Sin esta función, restringirlo
 * dejaría a media empresa mirando "esta sección no es para tu rol" nada más
 * entrar, sin haber hecho nada mal y sin saber a dónde ir.
 *
 * Devuelve la primera pantalla que esa persona SÍ puede abrir, en orden de lo
 * que hace cada uno: el almacenero aterriza en stock, la cajera en ventas, el
 * jefe de producción en sus órdenes.
 */
const ATERRIZAJE: string[] = [
  '/dashboard',     // gerencia y contabilidad
  '/ventas',        // caja y mayoristas
  '/ot',            // producción y operarios
  '/inventario',    // almacén, y el único destino de Almacén La Quinta
  '/productos',     // último recurso: lo ve todo el personal
];

export function primeraRutaPara(roles: Rol[]): string {
  for (const ruta of ATERRIZAJE) {
    if (puedeVer(roles, ruta)) return ruta;
  }
  /*
   * Nadie debería llegar acá: significa que la persona no puede ver ni
   * Productos, o sea que no tiene ningún rol de staff. Se la manda igual al
   * tablero, donde el cartel le explica que hable con gerencia.
   */
  return '/dashboard';
}
