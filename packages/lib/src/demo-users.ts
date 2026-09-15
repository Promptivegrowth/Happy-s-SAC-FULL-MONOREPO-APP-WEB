/**
 * Catálogo compartido de usuarios demo (entornos de prueba).
 *
 * ⚠️ El panel que los muestra en la pantalla de login IMPRIME LA CONTRASEÑA y
 * entra con un clic. Eso está bien mientras se prueba y es un agujero cuando el
 * sistema ya emite comprobantes a SUNAT: cualquiera con el enlace entra como
 * gerente con acceso total.
 *
 * Por eso el panel viene APAGADO salvo que se encienda a propósito, con
 * `NEXT_PUBLIC_MOSTRAR_CUENTAS_DEMO=1`. Se usa en local y en los entornos de
 * prueba; en producción no se define y el login pide correo y contraseña como
 * cualquier sistema.
 *
 * Apagar el panel NO reemplaza cambiar las contraseñas: la que se usó durante
 * las pruebas circuló por WhatsApp. Las cuentas reales de la tienda necesitan su
 * propia clave, cambiada desde Usuarios & Roles.
 */

/**
 * La contraseña de las cuentas de prueba, si es que hay panel.
 *
 * Sale de una variable y no del código porque estaba quedando DENTRO DEL
 * PAQUETE QUE SE MANDA AL NAVEGADOR: con el panel oculto seguía ahí, visible
 * para cualquiera que abriera las herramientas de desarrollo. Ocultar el panel
 * era cosmético; esto la saca de verdad.
 *
 * Sin `NEXT_PUBLIC_DEMO_PASSWORD` definida, no hay panel y no hay nada que leer.
 */
export function demoPassword(): string | null {
  return process.env.NEXT_PUBLIC_DEMO_PASSWORD || null;
}

/**
 * ¿Se muestran las cuentas de un clic en el login?
 *
 * Apagado por defecto a propósito: si mañana alguien despliega una copia nueva
 * sin acordarse de esta variable, el resultado seguro es que el login pida
 * credenciales, no que las regale.
 */
export function mostrarCuentasDemo(): boolean {
  return process.env.NEXT_PUBLIC_MOSTRAR_CUENTAS_DEMO === '1' && demoPassword() !== null;
}

export type DemoUser = {
  email: string;
  label: string;
  rol: string;
  emoji: string;
  badge: string;
  acceso: 'erp' | 'pos' | 'ambos';
  scope?: string;
};

export const DEMO_USERS: DemoUser[] = [
  { email: 'gerente@happys.pe',           label: 'Gerente',          rol: 'gerente',         emoji: '👑', badge: 'Acceso total',        acceso: 'ambos' },
  { email: 'jefe@happys.pe',              label: 'Jefe Producción',  rol: 'jefe_produccion', emoji: '🏭', badge: 'Producción',          acceso: 'erp',  scope: 'ALM Santa Bárbara' },
  { email: 'operario@happys.pe',          label: 'Operario',         rol: 'operario',        emoji: '🛠️', badge: 'Avance OT',           acceso: 'erp',  scope: 'ALM Santa Bárbara' },
  { email: 'almacenero@happys.pe',        label: 'Almacenero',       rol: 'almacenero',      emoji: '📦', badge: 'Inventario',          acceso: 'erp',  scope: 'ALM Santa Bárbara' },
  { email: 'cajero.huallaga@happys.pe',   label: 'Cajero Huallaga',  rol: 'cajero',          emoji: '💳', badge: 'POS Huallaga',        acceso: 'pos',  scope: 'TDA Huallaga · CAJA-HU-01' },
  { email: 'cajero.laquinta@happys.pe',   label: 'Cajero La Quinta', rol: 'cajero',          emoji: '💳', badge: 'POS La Quinta',       acceso: 'pos',  scope: 'TDA La Quinta · CAJA-LQ-01' },
  { email: 'vendedor@happys.pe',          label: 'Vendedor B2B',     rol: 'vendedor_b2b',    emoji: '🤝', badge: 'Mayoristas',          acceso: 'erp' },
  { email: 'contador@happys.pe',          label: 'Contador',         rol: 'contador',        emoji: '🧾', badge: 'Facturación',         acceso: 'erp' },
];
