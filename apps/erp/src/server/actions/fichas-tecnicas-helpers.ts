/**
 * Helpers SYNC para fichas técnicas (constantes + tipos).
 * Separado de fichas-tecnicas.ts ('use server') porque Next.js solo permite
 * exports async desde archivos use server.
 */

export const TEMPORADAS = ['VERANO', 'INVIERNO', 'AMBAS', 'INDIFERENTE'] as const;
export type Temporada = (typeof TEMPORADAS)[number];

export const TIPOS_IMAGEN_FICHA = [
  'DELANTERO',
  'POSTERIOR',
  'LATERAL',
  'CORTE_DIAGRAMA',
  'CONFECCION_DETALLE',
  'MEDIDAS_DIAGRAMA',
  'ETIQUETA',
  'ACABADOS_DOBLADO',
  'CALLOUT',
  'OTRA',
] as const;
export type TipoImagenFicha = (typeof TIPOS_IMAGEN_FICHA)[number];

export const TIPO_IMAGEN_LABEL: Record<TipoImagenFicha, string> = {
  DELANTERO: 'Delantero',
  POSTERIOR: 'Posterior',
  LATERAL: 'Lateral',
  CORTE_DIAGRAMA: 'Diagrama de corte',
  CONFECCION_DETALLE: 'Detalle confección',
  MEDIDAS_DIAGRAMA: 'Diagrama medidas',
  ETIQUETA: 'Etiqueta',
  ACABADOS_DOBLADO: 'Acabados / doblado',
  CALLOUT: 'Anotación técnica',
  OTRA: 'Otra',
};

export type FichaTecnica = {
  id: string;
  producto_id: string;
  revision: number;
  vigente: boolean;
  temporada: Temporada | null;
  fecha_aprobacion: string | null;
  cliente_referencia: string | null;
  descripcion_larga: string | null;
  alcance_uso: string | null;
  observaciones: string | null;
  tela_principal_nombre: string | null;
  tela_principal_composicion: string | null;
  tela_principal_color: string | null;
  tela_principal_densidad: string | null;
  tela_principal_ancho: string | null;
  tela_secundaria_nombre: string | null;
  tela_secundaria_composicion: string | null;
  tela_secundaria_color: string | null;
  tela_secundaria_densidad: string | null;
  tela_secundaria_ancho: string | null;
  puntadas_remalle: string | null;
  puntadas_recta: string | null;
  notas_confeccion: string | null;
  notas_acabados: string | null;
  envase_primario: string | null;
  envase_secundario: string | null;
  cinta_embalaje: string | null;
  sticker_talla: string | null;
  rotulado_primario: string | null;
  rotulado_secundario: string | null;
  aprobada_por: string | null;
  creada_por: string | null;
  created_at: string;
  updated_at: string;
};

export type FichaMedida = {
  id: string;
  ficha_id: string;
  codigo: string;
  descripcion: string;
  tolerancia_cm: number;
  observaciones: string | null;
  orden: number;
  valores: { talla: string; valor: number | null }[];
};

export type FichaImagen = {
  id: string;
  ficha_id: string;
  tipo: TipoImagenFicha;
  url: string;
  leyenda: string | null;
  orden: number;
};

export const BUCKET_FICHAS = 'productos-fichas';

// ============================================================================
// FASE 2 — Hoja de corte
// ============================================================================
export const TIPOS_TELA = ['PRINCIPAL', 'SECUNDARIA', 'FORRO', 'OTRO'] as const;
export type TipoTela = (typeof TIPOS_TELA)[number];

export const POSICIONES_CORTE = ['vertical', 'horizontal', 'sesgo'] as const;
export const ORIENTACIONES_CORTE = ['hilo', 'contrahilo', 'diagonal'] as const;

export type PiezaCorte = {
  id: string;
  ficha_id: string;
  tipo_tela: TipoTela;
  descripcion: string;
  cantidad: number;
  posicion: string | null;
  orientacion: string | null;
  observaciones: string | null;
  orden: number;
};

// ============================================================================
// FASE 2 — Avíos (vista derivada de receta + materiales del producto)
// ============================================================================
export type AvioRow = {
  material_id: string;
  codigo: string;
  nombre: string;
  categoria: string;
  color: string | null;
  imagen_url: string | null;
  cantidad_total: number;       // suma de cantidad en todas las tallas
  unidad: string;
};

export type ProcesoFichaRow = {
  id: string;
  proceso: string;
  orden: number;
  area: string | null;
  maquina: string | null;
  descripcion_operativa: string | null;
  tiempo_estandar_min: number;
};

// ============================================================================
// FASE 3 — Plantillas por tipo de prenda
// ============================================================================
export type PlantillaPrenda = {
  key: string;
  nombre: string;
  emoji: string;
  descripcion: string;
  medidas: { codigo: string; descripcion: string; tolerancia_cm: number }[];
  piezas: { tipo_tela: TipoTela; descripcion: string; cantidad: number; posicion: string; orientacion: string }[];
  composicion_sugerida?: {
    tela_principal_nombre?: string;
    tela_principal_composicion?: string;
  };
};

export const PLANTILLAS_PRENDA: PlantillaPrenda[] = [
  {
    key: 'PANTALON',
    nombre: 'Pantalón / Buzo',
    emoji: '👖',
    descripcion: 'Pantalón con elástico, bolsillos opcionales, basta de botapié.',
    medidas: [
      { codigo: 'A', descripcion: 'LARGO DESDE EL BORDE DE PRETINA', tolerancia_cm: 1 },
      { codigo: 'B', descripcion: 'ANCHO CINTURA RELAJADA', tolerancia_cm: 1 },
      { codigo: 'C', descripcion: 'ANCHO CINTURA ESTIRADA', tolerancia_cm: 1 },
      { codigo: 'D', descripcion: 'ALTO DE PRETINA', tolerancia_cm: 0.3 },
      { codigo: 'E', descripcion: 'ANCHO DE MUSLO', tolerancia_cm: 0.5 },
      { codigo: 'F', descripcion: 'TIRO POSTERIOR (incl. pretina)', tolerancia_cm: 0.5 },
      { codigo: 'G', descripcion: 'TIRO DELANTERO (incl. pretina)', tolerancia_cm: 0.5 },
      { codigo: 'H', descripcion: 'ANCHO DE BOTAPIÉ', tolerancia_cm: 0.5 },
      { codigo: 'I', descripcion: 'ANCHO DE BASTA', tolerancia_cm: 0.2 },
    ],
    piezas: [
      { tipo_tela: 'PRINCIPAL', descripcion: 'Delantero', cantidad: 2, posicion: 'vertical', orientacion: 'hilo' },
      { tipo_tela: 'PRINCIPAL', descripcion: 'Posterior', cantidad: 2, posicion: 'vertical', orientacion: 'hilo' },
      { tipo_tela: 'PRINCIPAL', descripcion: 'Vivos', cantidad: 2, posicion: 'vertical', orientacion: 'hilo' },
      { tipo_tela: 'PRINCIPAL', descripcion: 'Bolsa menor', cantidad: 1, posicion: 'vertical', orientacion: 'hilo' },
      { tipo_tela: 'PRINCIPAL', descripcion: 'Bolsa mayor', cantidad: 1, posicion: 'vertical', orientacion: 'hilo' },
    ],
  },
  {
    key: 'POLO',
    nombre: 'Polo / Camiseta',
    emoji: '👕',
    descripcion: 'Polo manga corta cuello redondo o V, hombros y costados con remalle.',
    medidas: [
      { codigo: 'A', descripcion: 'LARGO TOTAL DESDE HOMBRO', tolerancia_cm: 1 },
      { codigo: 'B', descripcion: 'ANCHO PECHO (1cm bajo sisa)', tolerancia_cm: 1 },
      { codigo: 'C', descripcion: 'ANCHO HOMBRO A HOMBRO', tolerancia_cm: 0.5 },
      { codigo: 'D', descripcion: 'LARGO DE MANGA', tolerancia_cm: 0.5 },
      { codigo: 'E', descripcion: 'ANCHO DE MANGA (al puño)', tolerancia_cm: 0.3 },
      { codigo: 'F', descripcion: 'ANCHO DE CUELLO', tolerancia_cm: 0.3 },
      { codigo: 'G', descripcion: 'PROFUNDIDAD ESCOTE', tolerancia_cm: 0.3 },
      { codigo: 'H', descripcion: 'ANCHO DE RUEDO', tolerancia_cm: 1 },
    ],
    piezas: [
      { tipo_tela: 'PRINCIPAL', descripcion: 'Delantero', cantidad: 1, posicion: 'vertical', orientacion: 'hilo' },
      { tipo_tela: 'PRINCIPAL', descripcion: 'Posterior', cantidad: 1, posicion: 'vertical', orientacion: 'hilo' },
      { tipo_tela: 'PRINCIPAL', descripcion: 'Mangas', cantidad: 2, posicion: 'vertical', orientacion: 'hilo' },
      { tipo_tela: 'SECUNDARIA', descripcion: 'Cuello rib', cantidad: 1, posicion: 'horizontal', orientacion: 'contrahilo' },
    ],
  },
  {
    key: 'VESTIDO',
    nombre: 'Vestido / Falda',
    emoji: '👗',
    descripcion: 'Vestido con cuerpo + falda, posible cierre y forro.',
    medidas: [
      { codigo: 'A', descripcion: 'LARGO TOTAL DESDE HOMBRO', tolerancia_cm: 1 },
      { codigo: 'B', descripcion: 'ANCHO BUSTO', tolerancia_cm: 1 },
      { codigo: 'C', descripcion: 'ANCHO CINTURA', tolerancia_cm: 0.5 },
      { codigo: 'D', descripcion: 'ANCHO CADERA', tolerancia_cm: 1 },
      { codigo: 'E', descripcion: 'LARGO DESDE CINTURA AL RUEDO', tolerancia_cm: 1 },
      { codigo: 'F', descripcion: 'PROFUNDIDAD ESCOTE', tolerancia_cm: 0.3 },
      { codigo: 'G', descripcion: 'ANCHO DE RUEDO', tolerancia_cm: 2 },
    ],
    piezas: [
      { tipo_tela: 'PRINCIPAL', descripcion: 'Cuerpo delantero', cantidad: 1, posicion: 'vertical', orientacion: 'hilo' },
      { tipo_tela: 'PRINCIPAL', descripcion: 'Cuerpo posterior', cantidad: 2, posicion: 'vertical', orientacion: 'hilo' },
      { tipo_tela: 'PRINCIPAL', descripcion: 'Falda delantera', cantidad: 1, posicion: 'vertical', orientacion: 'hilo' },
      { tipo_tela: 'PRINCIPAL', descripcion: 'Falda posterior', cantidad: 2, posicion: 'vertical', orientacion: 'hilo' },
      { tipo_tela: 'FORRO', descripcion: 'Forro cuerpo', cantidad: 1, posicion: 'vertical', orientacion: 'hilo' },
    ],
  },
  {
    key: 'DISFRAZ',
    nombre: 'Disfraz completo',
    emoji: '🎭',
    descripcion: 'Disfraz infantil con cuerpo + accesorios típicos (capa, vincha, etc.).',
    medidas: [
      { codigo: 'A', descripcion: 'LARGO TOTAL DESDE HOMBRO', tolerancia_cm: 1.5 },
      { codigo: 'B', descripcion: 'ANCHO PECHO', tolerancia_cm: 1 },
      { codigo: 'C', descripcion: 'CONTORNO CINTURA', tolerancia_cm: 1 },
      { codigo: 'D', descripcion: 'LARGO DE MANGA', tolerancia_cm: 1 },
      { codigo: 'E', descripcion: 'LARGO DE PANTALÓN (si aplica)', tolerancia_cm: 1 },
      { codigo: 'F', descripcion: 'ANCHO DE CAPA / FALDA', tolerancia_cm: 2 },
    ],
    piezas: [
      { tipo_tela: 'PRINCIPAL', descripcion: 'Cuerpo delantero', cantidad: 1, posicion: 'vertical', orientacion: 'hilo' },
      { tipo_tela: 'PRINCIPAL', descripcion: 'Cuerpo posterior', cantidad: 1, posicion: 'vertical', orientacion: 'hilo' },
      { tipo_tela: 'PRINCIPAL', descripcion: 'Mangas', cantidad: 2, posicion: 'vertical', orientacion: 'hilo' },
      { tipo_tela: 'SECUNDARIA', descripcion: 'Aplicaciones decorativas', cantidad: 1, posicion: 'vertical', orientacion: 'hilo' },
    ],
  },
];
