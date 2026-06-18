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
