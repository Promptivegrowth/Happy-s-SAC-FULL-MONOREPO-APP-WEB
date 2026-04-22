/**
 * Catálogo compartido de usuarios demo (entornos de prueba).
 * ⚠️ Removerlo antes de producción real.
 *
 * Mismo password para todos: `Happy2026!`
 */

export const DEMO_PASSWORD = 'Happy2026!';

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
