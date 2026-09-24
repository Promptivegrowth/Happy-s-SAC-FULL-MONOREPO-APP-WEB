/**
 * El diseño de una campaña de temporada: colores, textos y la pestaña del menú.
 *
 * Vive en la librería compartida porque lo leen DOS lados que tienen que verlo
 * igual: la tienda web, que lo muestra, y el ERP, que lo previsualiza mientras
 * Javier lo edita. Si cada uno tuviera su copia, la vista previa mentiría.
 *
 * En la base es una sola columna jsonb (`campanas.estilo`, mig 105) con todo
 * opcional. `resolverEstilo` completa lo que falte con el diseño de siempre, así
 * que una campaña sin nada cargado se ve exactamente como se veía antes.
 */

export type ModoTexto = 'auto' | 'claro' | 'oscuro';
export type ModoImagen = 'fondo' | 'suave';

/** Lo que se guarda: todo opcional. */
export type EstiloCampana = {
  color_inicio?: string;
  /** Opcional: un tercer color en el medio del degradado. */
  color_medio?: string;
  color_fin?: string;
  color_texto?: ModoTexto;
  etiqueta?: string;
  mostrar_fechas?: boolean;
  imagen_modo?: ModoImagen;
  menu_texto?: string;
  menu_color?: string;
  menu_etiqueta?: string;
  menu_etiqueta_color?: string;
};

/** Lo que se usa: todo resuelto, sin huecos. */
export type EstiloResuelto = {
  colorInicio: string;
  colorMedio: string | null;
  colorFin: string;
  /** Si el texto va oscuro (fondos claros) o blanco. */
  textoOscuro: boolean;
  etiqueta: string;
  mostrarFechas: boolean;
  imagenModo: ModoImagen;
  menuTexto: string;
  menuColor: string;
  /** Vacío = sin pastilla. */
  menuEtiqueta: string;
  menuEtiquetaColor: string;
};

/** El diseño de siempre: naranja Happy's a azul corporativo, "HOT" rojo. */
export const ESTILO_BASE = {
  color_inicio: '#F5821F',
  color_medio: '#EC1C24',
  color_fin: '#2D3193',
  etiqueta: 'Campaña activa',
  menu_color: '#FAB57E',
  menu_etiqueta: 'HOT',
  menu_etiqueta_color: '#EC1C24',
} as const;

/**
 * Atajos por temporada: un clic y quedan los colores que corresponden.
 *
 * Son un punto de partida, no un corsé: después de elegir uno se puede tocar
 * cualquier color a mano.
 */
export const TEMAS: Array<{ nombre: string; estilo: EstiloCampana }> = [
  {
    nombre: "Happy's",
    estilo: { color_inicio: '#F5821F', color_medio: '#EC1C24', color_fin: '#2D3193', menu_color: '#FAB57E', menu_etiqueta_color: '#EC1C24' },
  },
  {
    nombre: 'Halloween',
    estilo: { color_inicio: '#F97316', color_fin: '#3B0764', menu_color: '#FB923C', menu_etiqueta_color: '#7E22CE' },
  },
  {
    nombre: 'Navidad',
    estilo: { color_inicio: '#B91C1C', color_fin: '#14532D', menu_color: '#FCA5A5', menu_etiqueta_color: '#15803D' },
  },
  {
    nombre: 'Fiestas Patrias',
    estilo: { color_inicio: '#D91023', color_fin: '#7F0A14', menu_color: '#FECACA', menu_etiqueta_color: '#D91023' },
  },
  {
    nombre: 'Día de la Madre',
    estilo: { color_inicio: '#EC4899', color_fin: '#9D174D', menu_color: '#F9A8D4', menu_etiqueta_color: '#DB2777' },
  },
  {
    nombre: 'Verano',
    estilo: { color_inicio: '#FACC15', color_fin: '#0EA5E9', menu_color: '#FDE047', menu_etiqueta_color: '#0284C7' },
  },
];

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Un color válido "#RRGGBB", o null. */
export function colorValido(c: unknown): string | null {
  return typeof c === 'string' && HEX.test(c.trim()) ? c.trim().toUpperCase() : null;
}

/** Luminancia relativa (WCAG) de un "#RRGGBB": 0 negro, 1 blanco. */
function luminancia(hex: string): number {
  const canal = (i: number) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(1) + 0.7152 * canal(3) + 0.0722 * canal(5);
}

/**
 * Si sobre este fondo conviene letra oscura.
 *
 * Se mira el promedio de los dos colores del degradado. Un fondo amarillo o
 * rosado pastel con letra blanca no se lee, y lo natural al elegir colores es
 * no darse cuenta hasta verlo publicado.
 */
export function pideTextoOscuro(colorInicio: string, colorFin: string): boolean {
  return (luminancia(colorInicio) + luminancia(colorFin)) / 2 > 0.45;
}

/** El degradado listo para usar en `style={{ background }}`. */
export function fondoCss(r: Pick<EstiloResuelto, 'colorInicio' | 'colorMedio' | 'colorFin'>): string {
  return r.colorMedio
    ? `linear-gradient(135deg, ${r.colorInicio} 0%, ${r.colorMedio} 50%, ${r.colorFin} 100%)`
    : `linear-gradient(135deg, ${r.colorInicio} 0%, ${r.colorFin} 100%)`;
}

/** Completa lo que falte con el diseño de siempre. `nombre` es el de la campaña. */
export function resolverEstilo(estilo: EstiloCampana | null | undefined, nombre: string): EstiloResuelto {
  const e = (estilo ?? {}) as EstiloCampana;
  const colorInicio = colorValido(e.color_inicio) ?? ESTILO_BASE.color_inicio;
  const colorFin = colorValido(e.color_fin) ?? ESTILO_BASE.color_fin;
  // Sin colores propios va el degradado de siempre, que tiene rojo en el medio.
  // Con colores propios, el medio solo si se pidio.
  const sinColoresPropios = !colorValido(e.color_inicio) && !colorValido(e.color_fin);
  const colorMedio = colorValido(e.color_medio) ?? (sinColoresPropios ? ESTILO_BASE.color_medio : null);
  const modo = e.color_texto ?? 'auto';
  const textoOscuro = modo === 'oscuro' ? true : modo === 'claro' ? false : pideTextoOscuro(colorInicio, colorFin);

  return {
    colorInicio,
    colorMedio,
    colorFin,
    textoOscuro,
    etiqueta: (e.etiqueta ?? ESTILO_BASE.etiqueta).trim(),
    mostrarFechas: e.mostrar_fechas ?? true,
    imagenModo: e.imagen_modo === 'suave' ? 'suave' : 'fondo',
    menuTexto: (e.menu_texto ?? '').trim() || nombre,
    menuColor: colorValido(e.menu_color) ?? ESTILO_BASE.menu_color,
    // "" es una decisión (sin pastilla), distinto de no haber dicho nada.
    menuEtiqueta: e.menu_etiqueta === undefined ? ESTILO_BASE.menu_etiqueta : e.menu_etiqueta.trim(),
    menuEtiquetaColor: colorValido(e.menu_etiqueta_color) ?? ESTILO_BASE.menu_etiqueta_color,
  };
}
