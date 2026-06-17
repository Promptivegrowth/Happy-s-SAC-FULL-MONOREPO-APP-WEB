export const ROLES_SISTEMA = [
  'gerente',
  'jefe_produccion',
  'operario',
  'almacenero',
  'cajero',
  'vendedor_b2b',
  'contador',
  'cliente',
] as const;

export type RolSistema = (typeof ROLES_SISTEMA)[number];

export const DESCRIPCION_ROL: Record<RolSistema, string> = {
  gerente: 'Acceso total al sistema',
  jefe_produccion: 'Planificación, OTs, recetas y control de calidad',
  operario: 'Registro de tiempos en OTs',
  almacenero: 'Movimientos de stock, recepciones, traslados',
  cajero: 'POS y ventas en mostrador',
  vendedor_b2b: 'Pedidos mayoristas',
  contador: 'Comprobantes, SUNAT, reportes financieros',
  cliente: 'Acceso al portal web público',
};
