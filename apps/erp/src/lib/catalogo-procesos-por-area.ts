/**
 * Catálogo maestro de "pasos operativos" por área de producción.
 *
 * Origen: Excel AREAS-PROCESOS.xlsx que el cliente pasó el 2026-07-10.
 * Antes de esto, el dropdown de proceso mostraba solo los 3 enums de
 * `tipo_proceso_produccion` compatibles con el área (ej. ACABADO / CONTROL_CALIDAD
 * / EMBALAJE). El cliente en su Excel piensa en pasos concretos como
 * "DESEMBOLSADO DE PAQUETES" o "DELANTERO IZQ" — que NO son enums.
 *
 * Modelo:
 *  - Al elegir un área, el editor muestra este catálogo para esa área.
 *  - Cuando el usuario elige un paso, se guardan:
 *      · descripcion_operativa = nombre del paso (texto libre, ej "LIMPIEZA")
 *      · proceso (enum) = área.codigo mapeado al enum de tipo_proceso_produccion
 *  - Un mismo paso puede vivir en varias áreas (SUBLIMADO 1 ARTE está en CORTE,
 *    ESTAMPADO y SUBLIMADO). Es intencional — se cobra según valor/minuto del
 *    área elegida. Confirmado con cliente 2026-07-10.
 *
 * El catálogo es hardcodeado por ahora (no una tabla en BD) porque:
 *  - Cambia poco.
 *  - El cliente puede seguir escribiendo "Otro paso" manual si algo falta.
 *  - Evita una migración de BD y una pantalla de admin extra.
 * Si en el futuro el cliente pide editarlo desde la UI, se migra a tabla.
 */

/** Mapping area.codigo → enum tipo_proceso_produccion. */
export const AREA_A_ENUM: Record<string, string> = {
  CORTE:     'CORTE',
  COSTURA:   'COSTURA',   // el nombre visible es CONFECCIÓN pero el código queda COSTURA
  BORDADO:   'BORDADO',
  ESTAMPADO: 'ESTAMPADO',
  SUBLIMADO: 'SUBLIMADO',
  PLISADO:   'PLISADO',
  DECORADO:  'DECORADO',
  ACABADO:   'ACABADO',
  PLANCHADO: 'PLANCHADO',
  // TALLER no está en el catálogo del cliente porque las OTs terciarizadas
  // heredan el proceso del origen — no se elige "paso" desde TALLER.
};

/**
 * Catálogo de pasos operativos por área.  Keys = area.codigo (uppercase).
 * Los nombres respetan el formato del Excel del cliente para que reconozca
 * la lista de una.
 */
export const CATALOGO_PROCESOS_POR_AREA: Record<string, readonly string[]> = {
  ACABADO: [
    'AMARRADO Y ETIQUETADO',
    'DECORACIÓN DE GALONES',
    'DECORACIÓN DE GORRO',
    'DECORACIÓN DE PECHERA',
    'DECORADO PRENDA',
    'DESEMBOLSADO DE PAQUETES',
    'DOBLADO Y EMBOLSADO',
    'HABILITADO',
    'HABILITADO DE CORTE',
    'HABILITADO EN PROCESOS',
    'LIMPIEZA',
    'MASCARA',
    'PEGADO, MARC. Y CORTE GAL.',
  ],
  BORDADO: [
    'BORDADO OTRO ARTE',
    'DELANTERO DER',
    'DELANTERO INFERIOR',
    'DELANTERO IZQ',
    'DELANTERO SUPERIOR',
    'ESPALDA',
    'ESPALDA INFERIOR',
    'ESPALDA SUPERIOR',
    'FALDA',
    'MANGA',
    'PECHO',
  ],
  COSTURA: [
    'BOBOS',
    'CONFECCIÓN',
  ],
  CORTE: [
    'CORTE',
    'HABILITADO',
    'HABILITADO DE CORTE',
    'SUBLIMADO 1 ARTE',
    'TENDIDO',
  ],
  DECORADO: [
    'AMARRADO Y ETIQUETADO',
    'DECORACIÓN DE GALONES',
    'DECORACIÓN DE GORRO',
    'DECORACIÓN DE PECHERA',
    'DECORADO PRENDA',
    'DOBLADO Y EMBOLSADO',
    'LIMPIEZA',
    'PEGADO, MARC. Y CORTE GAL.',
  ],
  ESTAMPADO: [
    'BOTAS',
    'CORREA',
    'DELANTERO IZQ',
    'DELANTERO SUPERIOR',
    'ESPALDA',
    'ESPALDA SUPERIOR',
    'MANGA',
    'MASCARA',
    'OTRA PZA ESTAMPADA',
    'PECHO',
    'PIERNA',
    'SUBLIMADO 1 ARTE',
  ],
  PLANCHADO: [
    'PLANCHADO',
  ],
  PLISADO: [
    'PLISADO',
  ],
  SUBLIMADO: [
    'SUBLIMADO 1 ARTE',
    'SUBLIMADO TOTAL',
  ],
};

/** Devuelve los pasos disponibles para un area.codigo, o null si el área no está en el catálogo. */
export function pasosDeArea(areaCodigo: string | null | undefined): readonly string[] | null {
  if (!areaCodigo) return null;
  return CATALOGO_PROCESOS_POR_AREA[areaCodigo.toUpperCase()] ?? null;
}

/** Devuelve el enum de tipo_proceso_produccion a asignar automáticamente para un area.codigo. */
export function enumDeArea(areaCodigo: string | null | undefined): string | null {
  if (!areaCodigo) return null;
  return AREA_A_ENUM[areaCodigo.toUpperCase()] ?? null;
}
