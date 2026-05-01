/**
 * Genera la "Guía de Pruebas — HAPPY SAC ERP" en formato .docx para
 * que el cliente pueda probar los módulos Catálogo, Personas y Producción
 * y dejar observaciones por sección.
 *
 * Uso:  npx tsx scripts/generar-guia-cliente.ts
 * Salida: ./Guia-Pruebas-HAPPY-SAC.docx en la raíz del repo.
 */
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  PageBreak,
  BorderStyle,
  Table,
  TableRow,
  TableCell,
  WidthType,
  TableOfContents,
  StyleLevel,
} from 'docx';
import fs from 'node:fs';
import path from 'node:path';

// ==============================
// Helpers de estilo
// ==============================

const COLOR_PRIMARY = '231459';     // corp-900
const COLOR_ACCENT = 'E15A25';      // happy-600
const COLOR_TEXT = '1F2937';        // slate-800
const COLOR_MUTED = '64748B';       // slate-500
const COLOR_OK = '16A34A';          // emerald-600
const COLOR_BG_LIGHT = 'F8FAFC';    // slate-50

function p(text: string, opts: { size?: number; bold?: boolean; color?: string; italics?: boolean; spacingBefore?: number; spacingAfter?: number; alignment?: typeof AlignmentType[keyof typeof AlignmentType] } = {}) {
  return new Paragraph({
    spacing: { before: opts.spacingBefore ?? 60, after: opts.spacingAfter ?? 60 },
    alignment: opts.alignment,
    children: [
      new TextRun({
        text,
        size: opts.size ?? 22,
        bold: opts.bold,
        italics: opts.italics,
        color: opts.color ?? COLOR_TEXT,
        font: 'Calibri',
      }),
    ],
  });
}

function h1(text: string, color = COLOR_PRIMARY) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 480, after: 200 },
    children: [
      new TextRun({ text, bold: true, size: 40, color, font: 'Calibri' }),
    ],
    pageBreakBefore: true,
  });
}

function h2(text: string, color = COLOR_ACCENT) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 360, after: 160 },
    children: [
      new TextRun({ text, bold: true, size: 30, color, font: 'Calibri' }),
    ],
  });
}

function h3(text: string) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 240, after: 120 },
    children: [
      new TextRun({ text, bold: true, size: 26, color: COLOR_PRIMARY, font: 'Calibri' }),
    ],
  });
}

function h4(text: string) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_4,
    spacing: { before: 200, after: 80 },
    children: [
      new TextRun({ text, bold: true, size: 22, color: COLOR_PRIMARY, font: 'Calibri' }),
    ],
  });
}

function bullet(text: string, level = 0) {
  return new Paragraph({
    bullet: { level },
    spacing: { before: 40, after: 40 },
    children: [
      new TextRun({ text, size: 22, color: COLOR_TEXT, font: 'Calibri' }),
    ],
  });
}

function bulletBold(boldPart: string, restPart: string, level = 0) {
  return new Paragraph({
    bullet: { level },
    spacing: { before: 40, after: 40 },
    children: [
      new TextRun({ text: boldPart, bold: true, size: 22, color: COLOR_PRIMARY, font: 'Calibri' }),
      new TextRun({ text: restPart, size: 22, color: COLOR_TEXT, font: 'Calibri' }),
    ],
  });
}

function step(num: number, text: string) {
  return new Paragraph({
    spacing: { before: 80, after: 80 },
    indent: { left: 360 },
    children: [
      new TextRun({ text: `${num}. `, bold: true, size: 22, color: COLOR_ACCENT, font: 'Calibri' }),
      new TextRun({ text, size: 22, color: COLOR_TEXT, font: 'Calibri' }),
    ],
  });
}

function note(text: string) {
  return new Paragraph({
    spacing: { before: 120, after: 120 },
    border: {
      left: { color: COLOR_ACCENT, size: 24, style: BorderStyle.SINGLE, space: 8 },
    },
    indent: { left: 240 },
    children: [
      new TextRun({ text: '💡 ', size: 22, font: 'Calibri' }),
      new TextRun({ text, size: 22, color: COLOR_TEXT, italics: true, font: 'Calibri' }),
    ],
  });
}

function tip(text: string) {
  return new Paragraph({
    spacing: { before: 120, after: 120 },
    border: {
      left: { color: COLOR_OK, size: 24, style: BorderStyle.SINGLE, space: 8 },
    },
    indent: { left: 240 },
    children: [
      new TextRun({ text: '✅ ', size: 22, font: 'Calibri' }),
      new TextRun({ text, size: 22, color: COLOR_TEXT, font: 'Calibri' }),
    ],
  });
}

function warn(text: string) {
  return new Paragraph({
    spacing: { before: 120, after: 120 },
    border: {
      left: { color: 'F59E0B', size: 24, style: BorderStyle.SINGLE, space: 8 },
    },
    indent: { left: 240 },
    children: [
      new TextRun({ text: '⚠️ ', size: 22, font: 'Calibri' }),
      new TextRun({ text, size: 22, color: COLOR_TEXT, font: 'Calibri' }),
    ],
  });
}

// Tabla de campo + descripción
function fieldsTable(rows: { campo: string; descripcion: string; obligatorio?: boolean }[]) {
  const headerRow = new TableRow({
    tableHeader: true,
    children: [
      new TableCell({
        shading: { fill: COLOR_PRIMARY },
        width: { size: 30, type: WidthType.PERCENTAGE },
        children: [
          new Paragraph({
            children: [new TextRun({ text: 'Campo', bold: true, color: 'FFFFFF', size: 22, font: 'Calibri' })],
          }),
        ],
      }),
      new TableCell({
        shading: { fill: COLOR_PRIMARY },
        width: { size: 70, type: WidthType.PERCENTAGE },
        children: [
          new Paragraph({
            children: [new TextRun({ text: 'Descripción', bold: true, color: 'FFFFFF', size: 22, font: 'Calibri' })],
          }),
        ],
      }),
    ],
  });
  const dataRows = rows.map(
    (r, i) =>
      new TableRow({
        children: [
          new TableCell({
            shading: { fill: i % 2 === 0 ? 'FFFFFF' : COLOR_BG_LIGHT },
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: r.campo, bold: true, size: 22, color: COLOR_PRIMARY, font: 'Calibri' }),
                  ...(r.obligatorio ? [new TextRun({ text: ' *', bold: true, color: 'DC2626', size: 22, font: 'Calibri' })] : []),
                ],
              }),
            ],
          }),
          new TableCell({
            shading: { fill: i % 2 === 0 ? 'FFFFFF' : COLOR_BG_LIGHT },
            children: [
              new Paragraph({
                children: [new TextRun({ text: r.descripcion, size: 22, color: COLOR_TEXT, font: 'Calibri' })],
              }),
            ],
          }),
        ],
      }),
  );
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...dataRows],
  });
}

// Caja de observaciones del cliente al final de cada sección
function observacionesBox(modulo: string) {
  const lineas: Paragraph[] = [];
  for (let i = 0; i < 6; i++) {
    lineas.push(
      new Paragraph({
        spacing: { before: 0, after: 0 },
        border: {
          bottom: { color: 'CBD5E1', size: 6, style: BorderStyle.SINGLE, space: 1 },
        },
        children: [new TextRun({ text: ' ', size: 24, font: 'Calibri' })],
      }),
    );
    lineas.push(new Paragraph({ children: [new TextRun({ text: ' ', size: 14 })] }));
  }
  return [
    new Paragraph({
      spacing: { before: 320, after: 80 },
      children: [
        new TextRun({ text: '📝 Tus observaciones — ', bold: true, size: 24, color: COLOR_ACCENT, font: 'Calibri' }),
        new TextRun({ text: modulo, bold: true, size: 24, color: COLOR_PRIMARY, font: 'Calibri' }),
      ],
    }),
    p(
      'Anotá acá lo que viste raro, lo que te parece confuso, lo que te falta, o sugerencias de mejora:',
      { size: 20, color: COLOR_MUTED, italics: true },
    ),
    ...lineas,
  ];
}

// Caja de prueba paso a paso
function pruebaSugerida(titulo: string, pasos: string[]) {
  return [
    new Paragraph({
      spacing: { before: 240, after: 120 },
      children: [
        new TextRun({ text: '🧪 Prueba sugerida: ', bold: true, size: 24, color: COLOR_OK, font: 'Calibri' }),
        new TextRun({ text: titulo, bold: true, size: 24, color: COLOR_PRIMARY, font: 'Calibri' }),
      ],
    }),
    ...pasos.map((paso, i) => step(i + 1, paso)),
  ];
}

// ==============================
// CONTENIDO DE LA GUÍA
// ==============================

const docContent: (Paragraph | Table)[] = [];

// PORTADA
docContent.push(
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 2400, after: 240 },
    children: [
      new TextRun({ text: '🎭', size: 96, font: 'Calibri' }),
    ],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 240, after: 120 },
    children: [
      new TextRun({
        text: 'HAPPY SAC ERP',
        bold: true,
        size: 56,
        color: COLOR_PRIMARY,
        font: 'Calibri',
      }),
    ],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 120, after: 480 },
    children: [
      new TextRun({
        text: 'Guía de Pruebas para el Cliente',
        size: 36,
        color: COLOR_ACCENT,
        font: 'Calibri',
      }),
    ],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 480, after: 120 },
    children: [
      new TextRun({
        text: 'Módulos: Catálogo · Personas · Producción',
        size: 24,
        color: COLOR_MUTED,
        font: 'Calibri',
      }),
    ],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 1200, after: 120 },
    children: [
      new TextRun({
        text: 'Esta guía te acompaña paso a paso para que pruebes',
        size: 22,
        color: COLOR_TEXT,
        font: 'Calibri',
        italics: true,
      }),
    ],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 80, after: 120 },
    children: [
      new TextRun({
        text: 'cada función del sistema y dejes tus observaciones.',
        size: 22,
        color: COLOR_TEXT,
        font: 'Calibri',
        italics: true,
      }),
    ],
  }),
);

// BIENVENIDA
docContent.push(
  h1('Bienvenido(a) a HAPPY SAC ERP'),
  p(
    'Este documento es tu compañero de pruebas. Acá vas a encontrar, módulo por módulo, ' +
      'qué hace cada pantalla, qué significa cada campo, cómo usarlo y un espacio para que ' +
      'anotes lo que veas — bueno, malo, confuso, lo que te falta o lo que mejorarías.',
  ),
  p(' '),
  h3('Cómo está organizado'),
  bullet('Cada módulo tiene su capítulo (Catálogo, Personas, Producción).'),
  bullet('Cada pantalla del módulo tiene su sección.'),
  bullet('Para cada pantalla: para qué sirve, cómo se usa, qué significan los campos y una prueba sugerida.'),
  bullet('Al final de cada módulo hay un espacio para tus observaciones.'),
  p(' '),
  h3('Cómo usar esta guía'),
  step(1, 'Imprimila o tenela abierta en una pantalla mientras probás el ERP en otra.'),
  step(2, 'Seguí las pruebas sugeridas paso a paso.'),
  step(3, 'Anotá en el espacio "Tus observaciones" lo que te llame la atención: errores, mejoras, dudas.'),
  step(4, 'Cuando termines, devolvé este documento (o sus notas) al equipo técnico.'),
  p(' '),
  note(
    'No tengas miedo de "romper algo". El sistema tiene validaciones para evitar errores graves, ' +
      'y cualquier dato de prueba se puede revertir. Probá libremente.',
  ),
  p(' '),
  h3('Convenciones de esta guía'),
  bulletBold('💡 Nota: ', 'aclara algo importante.'),
  bulletBold('✅ Tip: ', 'consejo o atajo útil.'),
  bulletBold('⚠️ Cuidado: ', 'advertencia que conviene leer antes de hacer la acción.'),
  bulletBold('🧪 Prueba sugerida: ', 'pasos concretos para verificar el funcionamiento.'),
  bulletBold('📝 Tus observaciones: ', 'tu turno para anotar.'),
  bulletBold('Campo *: ', 'el asterisco rojo indica un campo obligatorio.'),
);

// ====================================================================
// MÓDULO 1: CATÁLOGO
// ====================================================================

docContent.push(
  h1('Módulo 1 — CATÁLOGO'),
  p(
    'El catálogo es el corazón del negocio: acá viven todos los disfraces que producís y vendés, ' +
      'sus categorías, los materiales con los que están hechos, las recetas (BOM) que los definen, ' +
      'y cómo se publican en la tienda online.',
  ),
  p(' '),
  h3('Qué incluye'),
  bulletBold('Productos / Disfraces: ', 'cada modelo (ej. "Princesa Bella") con sus tallas y precios.'),
  bulletBold('Categorías: ', 'agrupaciones temáticas (Halloween, Princesas, Accesorios…).'),
  bulletBold('Materiales: ', 'telas, hilos, broches, encajes — los insumos para producir.'),
  bulletBold('Recetas (BOM): ', 'qué materiales y cuánto se necesita por modelo y talla.'),
  bulletBold('Publicación Web: ', 'gestión visual de qué aparece en la tienda online.'),
);

// 1.1 Productos / Disfraces
docContent.push(
  h2('1.1 Productos / Disfraces'),
  p('URL: /productos'),
  p(' '),
  h4('Para qué sirve'),
  p(
    'Es el listado completo de tu catálogo. Cada fila es un modelo (ej. "Bella New") que ' +
      'agrupa varias variantes (las tallas: T2, T4, T6…). Desde acá podés crear nuevos productos, ' +
      'editar los existentes, ver su stock por talla y publicarlos en la web.',
  ),
  p(' '),
  h4('Filtros disponibles arriba'),
  bulletBold('Buscador con autocomplete: ', 'escribí parte del nombre o código y aparecen sugerencias.'),
  bulletBold('Todos / Publicados / Sin publicar: ', 'filtran por estado de publicación web.'),
  bulletBold('Sin categoría (badge ámbar): ', 'muestra los productos huérfanos que necesitan que les asignes una categoría.'),
  bulletBold('Inactivos: ', 'muestra los que están desactivados (soft-delete).'),
  bulletBold('Filtro por categoría: ', 'chips para filtrar por una categoría específica.'),
  p(' '),
  h4('Columnas de la tabla'),
  fieldsTable([
    { campo: 'Código', descripcion: 'Identificador interno autogenerado a partir de la categoría (ej. PRC0001 = Princesas Especiales 0001).' },
    { campo: 'Nombre', descripcion: 'Nombre comercial del modelo. Click → entra al editor del producto.' },
    { campo: 'Categoría', descripcion: 'Categoría principal + chips outline con las extras (red de seguridad para multi-temporada).' },
    { campo: 'Campaña', descripcion: 'Si está vinculado a una campaña (ej. Día de la Madre 2026).' },
    { campo: 'Tallas', descripcion: 'Badges con cada talla (T2, T4…). Tachadas = sin stock. Si dice "Falta variantes" → producto sin tallas configuradas. Si dice "Accesorio" → categoría ACC, no requiere tallas.' },
    { campo: 'Precio desde', descripcion: 'El precio público más bajo entre las tallas con precio definido.' },
    { campo: 'Web', descripcion: 'Badge "Publicado" si está visible en la tienda. "Home" si además aparece en sección TOP.' },
    { campo: 'Estado', descripcion: 'Activo (badge verde) o Inactivo (gris).' },
  ]),
  p(' '),
  h4('Editor de producto (click en un nombre)'),
  p('Se abre con 4 pestañas:'),
  bulletBold('Datos del modelo: ', 'nombre, descripción, categoría principal, categorías extra (máx 2), género, piezas, imagen, género, destacado interno, activo.'),
  bulletBold('Variantes: ', 'cada talla con su SKU autogenerado, precio público, código de barras, etc.'),
  bulletBold('Galería: ', 'fotos adicionales del producto.'),
  bulletBold('Publicación web: ', 'toggle Publicar, slug, título web, descripción, descuento %, tallas a excluir del descuento, destacado en home.'),
  p(' '),
  warn(
    'El toggle "Destacar internamente (ERP)" es solo una marca para el equipo, no afecta web/POS. ' +
      'Para destacar en la home de la web usá el toggle "⭐ Destacado" de la pestaña "Publicación web".',
  ),
  ...pruebaSugerida('Crear un producto desde cero', [
    'Click en "+ Nuevo producto" arriba a la derecha.',
    'Nombre: "Disfraz de Prueba". Categoría: Princesas. Género: Niña. Activo: ON. Guardar.',
    'En el editor, ir a pestaña "Variantes" → agregar talla T6, precio público S/ 50.',
    'Pestaña "Publicación web" → activar Publicado. Guardar.',
    'Volver a /productos → buscar "Prueba". Debe aparecer publicado, con badge T6 visible.',
    'Probar editar el producto: cambiar categoría a "Halloween". Verificar que el badge cambia.',
    'Click en "Eliminar" para borrarlo (confirmación requerida).',
  ]),
  ...pruebaSugerida('Categorías extra (red de seguridad)', [
    'Editá un producto que pertenezca a una categoría que cierres por temporada (ej. "Halloween").',
    'En "Datos del modelo" → bloque "Categorías extra" → click en "Día de la Madre" para agregarla.',
    'Guardar. En el listado /productos debe aparecer al lado del badge de categoría: "+ Día de la Madre".',
    'Ahora en /categorias, apagar el toggle de "Halloween".',
    'El producto NO debería despublicarse porque sigue activo en "Día de la Madre".',
    'Verificá en la web: el producto debería seguir visible bajo /categoria/dia-de-la-madre.',
  ]),
  ...observacionesBox('Productos / Disfraces'),
);

// 1.2 Categorías
docContent.push(
  h2('1.2 Categorías'),
  p('URL: /categorias'),
  p(' '),
  h4('Para qué sirve'),
  p(
    'Categorías agrupan los productos por temática (Halloween, Princesas, Profesiones, Accesorios…). ' +
      'Cada categoría tiene un toggle que controla si TODOS sus productos están publicados en la web. ' +
      'Sirve para encender/apagar temporadas con un solo click.',
  ),
  p(' '),
  h4('Métricas globales arriba'),
  bullet('Productos activos totales: cuántos modelos hay en el catálogo.'),
  bullet('Publicados en web: cuántos están visibles para el cliente final.'),
  bullet('Sin publicar: la diferencia (incluye huérfanos sin categoría).'),
  p(' '),
  h4('Botón verde "Publicar todo el catálogo" (atajo)'),
  p(
    'Enciende todas las categorías apagadas + publica todos los productos con categoría asignada. ' +
      'Es el botón de emergencia para poblar la web por primera vez. Solo aparece si hay productos sin publicar.',
  ),
  p(' '),
  h4('Tabla de categorías'),
  fieldsTable([
    { campo: 'Código', descripcion: 'Código corto único (HALLOWEEN, ACC, PRINCESAS…).' },
    { campo: 'Nombre', descripcion: 'Nombre que se muestra en la web. Click → editor.' },
    { campo: 'Slug', descripcion: 'Parte de la URL en la web (/categoria/halloween).' },
    { campo: 'Productos', descripcion: 'Cuántos productos activos tiene asignados (como categoría principal).' },
    { campo: 'Publicados', descripcion: 'Cuántos de esos están visibles en la web. Badge verde = 100% cubierto.' },
    { campo: 'Orden', descripcion: 'Posición en menús (menor número = primero).' },
    { campo: 'Categoría activa (toggle)', descripcion: 'ON = publica todos sus productos en la web. OFF = los despublica todos.' },
    { campo: 'Acciones', descripcion: 'Menú ⋮ con "Publicar todos" / "Despublicar todos" + botón "Editar".' },
  ]),
  p(' '),
  warn(
    'Al APAGAR el toggle, todos los productos de la categoría se despublican. EXCEPCIÓN: si un producto tiene ' +
      'una categoría EXTRA activa, se queda publicado bajo esa otra (la "red de seguridad").',
  ),
  ...pruebaSugerida('Encender una categoría completa', [
    'Buscá la categoría "Halloween" en el listado.',
    'Si el toggle "Categoría activa" está apagado → encenderlo (con confirmación).',
    'El sistema publica automáticamente todos los productos activos de Halloween.',
    'Toast confirma: "✨ Categoría encendida · X productos publicados en la web".',
    'En la web (/categoria/halloween) deberías ver todos esos productos visibles.',
  ]),
  ...pruebaSugerida('Crear una categoría nueva', [
    'Click en "+ Nueva categoría".',
    'Código: TEST. Nombre: "Prueba". Slug se autocompleta como "prueba".',
    'Ícono: cualquier emoji (ej. 🎉). Orden web: 99. Activa: ON.',
    'Guardar. La nueva categoría aparece en el listado.',
    'Después podés borrarla desde el editor (botón eliminar).',
  ]),
  ...observacionesBox('Categorías'),
);

// 1.3 Materiales
docContent.push(
  h2('1.3 Materiales'),
  p('URL: /materiales'),
  p(' '),
  h4('Para qué sirve'),
  p(
    'Catálogo de los insumos físicos para producir: telas, hilos, broches, cierres, encajes, etiquetas, etc. ' +
      'Cada material tiene un código autogenerado, categoría, unidad de medida, precio unitario, factor de conversión ' +
      'y opcionalmente una imagen. Los materiales se usan en las recetas (BOM) de los productos.',
  ),
  p(' '),
  h4('Filtros disponibles'),
  bullet('Buscador por nombre o código.'),
  bullet('Filtros por categoría (Tela, Avíos, Insumo, etc.)'),
  bullet('Filtro Activos / Inactivos.'),
  p(' '),
  h4('Campos del editor de material'),
  fieldsTable([
    { campo: 'Código', descripcion: 'Autogenerado al crear (3 letras de la categoría + 4 dígitos, ej. TEL0001).', obligatorio: false },
    { campo: 'Nombre', descripcion: 'Descripción del material (ej. "Tela polar rojo intenso").', obligatorio: true },
    { campo: 'Categoría', descripcion: 'TELA / AVIOS / INSUMO / IMPORTACION. Define el prefijo del código.', obligatorio: true },
    { campo: 'Unidad de medida', descripcion: 'Metros, gramos, piezas, etc. Define cómo se mide el consumo en las recetas.', obligatorio: true },
    { campo: 'Precio unitario', descripcion: 'Costo por unidad de medida (S/). Se usa para calcular costo de producción.' },
    { campo: 'Factor de conversión', descripcion: 'Si comprás en kg pero usás en gramos, el factor convierte. Auto-sugerido según unidades.' },
    { campo: 'Color / Marca / Proveedor', descripcion: 'Datos descriptivos opcionales para identificar variantes del mismo insumo.' },
    { campo: 'Imagen', descripcion: 'Foto del material (opcional). Útil para identificar visualmente.' },
    { campo: 'Activo', descripcion: 'Si está OFF, no aparece en los selectores de receta.' },
  ]),
  p(' '),
  ...pruebaSugerida('Agregar un material nuevo', [
    'Click "+ Nuevo material".',
    'Categoría: TELA. Nombre: "Tela demo". Unidad: metros. Precio: S/ 12.',
    'Guardar. El código se autogenera (ej. TEL0042).',
    'Volver al listado y verificar que aparece. Filtrarlo por categoría TELA.',
    'Editarlo: subir una imagen, cambiar precio. Guardar.',
    'Desactivarlo (toggle Activo OFF). En el listado debería quedar fuera del filtro Activos.',
  ]),
  ...observacionesBox('Materiales'),
);

// 1.4 Recetas BOM
docContent.push(
  h2('1.4 Recetas (BOM)'),
  p('URL: /recetas'),
  p(' '),
  h4('Para qué sirve'),
  p(
    'BOM = Bill Of Materials. Es la receta de fabricación de cada modelo. Define qué materiales se usan, ' +
      'cuánto de cada uno por talla, y los procesos productivos (corte, costura, decorado, etc.). ' +
      'Sin receta no se puede producir el modelo.',
  ),
  p(' '),
  h4('Listado'),
  bullet('Filtro por estado: Activas / Históricas. Una receta se vuelve histórica cuando se crea una nueva versión.'),
  bullet('Buscador por producto o código.'),
  bullet('Botón "+ Nueva receta" arriba a la derecha → modal con buscador de productos sin receta activa.'),
  p(' '),
  h4('Editor de receta — pestaña "Materiales (BOM)"'),
  p('Tabla por talla con las líneas del BOM. Cada línea representa un material consumido para esa talla:'),
  fieldsTable([
    { campo: 'Material', descripcion: 'Buscador con autocomplete. Aparece código + nombre + categoría + precio unitario.', obligatorio: true },
    { campo: 'Talla', descripcion: 'A qué talla aplica (T2, T4, T6… o TS / TAD para adulto).', obligatorio: true },
    { campo: 'Cantidad', descripcion: 'Cuánto se consume del material para fabricar 1 unidad de esa talla. Editable inline.', obligatorio: true },
    { campo: 'Unidad', descripcion: 'Por defecto la del material. Permite override si se compra en otra unidad.' },
    { campo: '✂️ Va al taller (toggle)', descripcion: 'ON = el material viaja con el corte cuando se manda al taller (ej. tela, hilo). OFF = se usa en planta interna (ej. broches del control de calidad).' },
    { campo: 'Queda en almacén', descripcion: 'Si "va al taller" es ON pero se reserva una parte en almacén para acabados.' },
    { campo: 'Costo total', descripcion: 'Calculado: cantidad × precio_unitario del material.' },
  ]),
  p(' '),
  h4('Acciones disponibles'),
  bulletBold('Filtrar talla: ', 'click en el chip de la talla → muestra solo sus líneas.'),
  bulletBold('Duplicar talla (botón en el header de cada talla): ', 'copia las líneas de esa talla a otra talla del mismo producto. Útil cuando ya tenés T6 y querés hacer T8.'),
  bulletBold('Duplicar a otro producto: ', 'copia toda la receta a otro producto. Permite filtrar por talla origen y/o cambiar la talla destino.'),
  bulletBold('Editar inline: ', 'click en cantidad o "queda en alm." → cambiá el número → Enter o salir del input → se guarda automático.'),
  p(' '),
  h4('Editor de receta — pestaña "Procesos / Operaciones"'),
  p(
    'Define la secuencia de procesos que pasa el modelo (Corte → Costura → Bordado → Acabado → Planchado, etc.) ' +
      'con tiempo estándar por proceso y área asignada.',
  ),
  fieldsTable([
    { campo: 'Proceso', descripcion: 'Tipo de operación (CORTE, COSTURA, BORDADO, ESTAMPADO, SUBLIMADO, PLISADO, ACABADO, PLANCHADO, OJAL_BOTON, CONTROL_CALIDAD, EMBALAJE, DECORADO).', obligatorio: true },
    { campo: 'Área', descripcion: 'Área de producción que ejecuta el proceso. De acá sale el costo/minuto. Ej: "Servicio Taller" → S/ 0.183/min.' },
    { campo: 'Tiempo estándar (min)', descripcion: 'Cuánto tarda el proceso por unidad. Editable inline.' },
    { campo: 'Talla (opcional)', descripcion: 'Vacío = aplica a todas las tallas. Sino = solo a esa talla.' },
    { campo: 'Tercerizado', descripcion: 'Toggle: ON = lo hace un taller externo. OFF = se hace en planta propia.' },
    { campo: 'Costo', descripcion: 'Calculado: tiempo × valor_minuto del área. La suma total se muestra al pie.' },
  ]),
  p(' '),
  tip(
    'Las tarifas por minuto de cada área (Corte 0.211, Decorado 0.110, Bordado 0.234, etc.) ya están cargadas ' +
      'en el sistema según el Excel del cliente.',
  ),
  ...pruebaSugerida('Armar la receta de un modelo desde cero', [
    'En /recetas → click "+ Nueva receta" → buscar un producto que no tenga receta → crear.',
    'En el editor → pestaña "Materiales" → "+ Agregar línea".',
    'Material: buscar "tela polar". Talla: T6. Cantidad: 1.5. Unidad: metros. ✂️ Va al taller: ON.',
    'Guardar. La línea aparece en la tabla con costo calculado.',
    'Agregar otra línea: hilo negro, T6, 50, gramos, ✂️ Va al taller ON.',
    'Click en "Duplicar talla" del header T6 → elegir T8. Las líneas se copian a T8.',
    'Editar la cantidad de tela en T8 (debería ser un poco más, ej. 1.7).',
    'Pestaña "Procesos" → "+ Agregar operación". Proceso: COSTURA. Área: Servicio Taller. Tiempo: 25 min. Tercerizado: ON.',
    'Verificar el costo MO total al pie de la tabla.',
  ]),
  ...observacionesBox('Recetas (BOM)'),
);

// 1.5 Publicación Web
docContent.push(
  h2('1.5 Publicación Web'),
  p('URL: /web-catalogo'),
  p(' '),
  h4('Para qué sirve'),
  p(
    'Vista consolidada para gestionar la vidriera web. Lista todos los productos publicados con sus ' +
      'opciones de SEO y descuentos, y permite publicar/despublicar productos individuales sin tocar ' +
      'la categoría completa.',
  ),
  p(' '),
  h4('Acciones disponibles'),
  bullet('Toggle "Publicar" por producto: gestión fina cuando querés ocultar UN producto sin afectar al resto de la categoría (ej. está sin foto, agotado en producción).'),
  bullet('Edición de slug, título web, descripción corta y larga.'),
  bullet('Descuentos % por producto + tallas a excluir del descuento (ej. T6 no tiene descuento por escasez).'),
  bullet('Toggle "⭐ Destacado en home" para que aparezca en sección "Lo más TOP" de la home web.'),
  p(' '),
  note(
    'Para gestionar TODA una categoría a la vez (encender/apagar temporadas), usá /categorias. ' +
      'Para ajustes finos producto por producto, usá /web-catalogo.',
  ),
  ...observacionesBox('Publicación Web'),
);

// ====================================================================
// MÓDULO 2: PERSONAS
// ====================================================================

docContent.push(
  h1('Módulo 2 — PERSONAS'),
  p(
    'Acá viven todas las personas que tocan el negocio: clientes (B2C y B2B), proveedores, ' +
      'talleres tercerizados de servicios, y operarios de planta interna.',
  ),
);

// 2.1 Clientes
docContent.push(
  h2('2.1 Clientes'),
  p('URL: /clientes'),
  p(' '),
  h4('Para qué sirve'),
  p(
    'Registrar a tus clientes finales (consumidores con DNI) y mayoristas/empresas (con RUC). ' +
      'Cada cliente puede tener listas de precios distintas, descuentos default, límites de crédito y direcciones de delivery.',
  ),
  p(' '),
  h4('Filtros'),
  bullet('Buscador por nombre, RUC o DNI.'),
  bullet('Filtro por tipo de cliente (Público final / Mayorista A/B/C / Industrial).'),
  bullet('Activos / Inactivos.'),
  p(' '),
  h4('Campos del editor'),
  fieldsTable([
    { campo: 'Tipo de documento', descripcion: 'DNI / RUC / CE / Pasaporte. Define qué campos se muestran después.', obligatorio: true },
    { campo: 'Número de documento', descripcion: '8 a 20 caracteres. Si es DNI o RUC, se autocompletan datos desde RENIEC / SUNAT.', obligatorio: true },
    { campo: 'Razón social', descripcion: 'Solo si tipo = RUC. Autocompletado de SUNAT.' },
    { campo: 'Nombres / Apellidos', descripcion: 'Solo si tipo = DNI. Autocompletado de RENIEC.' },
    { campo: 'Nombre comercial', descripcion: 'Nombre con el que el cliente se conoce comercialmente.' },
    { campo: 'Email', descripcion: 'Único. Validación de formato.' },
    { campo: 'Teléfono / Teléfono secundario', descripcion: 'Datos de contacto.' },
    { campo: 'Dirección + Ubigeo', descripcion: 'Ubigeo es código de 6 dígitos (Surco = 150140).' },
    { campo: 'Tipo de cliente', descripcion: 'Público final / Mayorista A/B/C / Industrial. Define lista de precios.', obligatorio: true },
    { campo: 'Lista de precio', descripcion: 'A qué lista aplica (PUBLICO / MAYORISTA_A/B/C / INDUSTRIAL).' },
    { campo: 'Descuento default (%)', descripcion: 'Se aplica automáticamente en todas sus ventas.' },
    { campo: 'Límite de crédito', descripcion: 'Tope de cuenta corriente en S/.' },
    { campo: 'Días de crédito', descripcion: 'Cuántos días tiene el cliente para pagar.' },
    { campo: 'Adelantos / Marketing / Notas', descripcion: 'Toggles y observaciones internas.' },
  ]),
  ...pruebaSugerida('Crear un cliente B2B (mayorista)', [
    'Click "+ Nuevo cliente".',
    'Tipo de documento: RUC. Número: ingresá el RUC de prueba (ej. 20100070970 = Backus).',
    'El sistema consulta SUNAT y autocompleta razón social y dirección.',
    'Tipo de cliente: MAYORISTA_A. Lista de precio: MAYORISTA_A. Descuento: 10%.',
    'Límite crédito: 5000. Días crédito: 30.',
    'Guardar. Buscarlo en el listado para verificar.',
    'Editarlo, desactivarlo (botón "Eliminar" hace soft-delete).',
  ]),
  ...observacionesBox('Clientes'),
);

// 2.2 Proveedores
docContent.push(
  h2('2.2 Proveedores'),
  p('URL: /proveedores'),
  p(' '),
  h4('Para qué sirve'),
  p(
    'Registrar proveedores de materiales (telas, avíos, insumos), servicios y proveedores de importación. ' +
      'Cada proveedor puede tener su tarifario de materiales, días de pago, moneda y datos bancarios.',
  ),
  p(' '),
  h4('Filtros'),
  bullet('Buscador por razón social o RUC.'),
  bullet('Nacional / Importación.'),
  bullet('Activos / Inactivos.'),
  p(' '),
  h4('Campos del editor'),
  fieldsTable([
    { campo: 'Tipo de documento', descripcion: 'RUC (default), DNI, CE, Pasaporte.', obligatorio: true },
    { campo: 'Número de documento', descripcion: 'Autocompletado SUNAT si es RUC.', obligatorio: true },
    { campo: 'Razón social', descripcion: '2 a 200 caracteres.', obligatorio: true },
    { campo: 'Nombre comercial', descripcion: 'Opcional, nombre con el que se lo conoce.' },
    { campo: 'Dirección + Ubigeo + Teléfono + Email', descripcion: 'Datos generales de contacto.' },
    { campo: 'Contacto nombre / teléfono', descripcion: 'La persona específica con la que tratás.' },
    { campo: 'Días de pago default', descripcion: '0 = contado, 30 = a 30 días, etc.' },
    { campo: 'Moneda', descripcion: 'PEN o USD. Para importadores típicamente USD.' },
    { campo: 'Es importación', descripcion: 'Toggle. Marca proveedores del exterior.' },
    { campo: 'Tipo de suministro', descripcion: 'Auto: TELA / AVIOS / INSUMO / IMPORTACION según los materiales que provee.' },
    { campo: 'Notas', descripcion: 'Observaciones internas.' },
  ]),
  ...pruebaSugerida('Crear un proveedor nacional', [
    'Click "+ Nuevo proveedor".',
    'Documento: RUC + número (autocompletado SUNAT).',
    'Datos de contacto: persona, teléfono, email.',
    'Días de pago: 30. Moneda: PEN.',
    'Guardar. Verificar en el listado.',
  ]),
  ...observacionesBox('Proveedores'),
);

// 2.3 Talleres
docContent.push(
  h2('2.3 Talleres'),
  p('URL: /talleres'),
  p(' '),
  h4('Para qué sirve'),
  p(
    'Registrar los talleres tercerizados que reciben las órdenes de servicio (costura, bordado, etc.). ' +
      'Cada taller tiene su contacto, dirección, especialidades y tarifas pactadas.',
  ),
  p(' '),
  h4('Datos típicos'),
  bullet('Nombre del taller, contacto principal, teléfono, dirección.'),
  bullet('Procesos que ejecuta (costura, bordado, estampado, etc.).'),
  bullet('Tarifa base por unidad o por proceso.'),
  bullet('Activo / Inactivo.'),
  ...observacionesBox('Talleres'),
);

// 2.4 Operarios
docContent.push(
  h2('2.4 Operarios'),
  p('URL: /operarios'),
  p(' '),
  h4('Para qué sirve'),
  p(
    'Personal interno de planta (corte, costura, bordado, planchado, acabados…). Cada operario está ' +
      'vinculado a un área de producción y a un tipo de contrato (planilla, destajo, mixto, honorarios). ' +
      'Es la base para calcular destajos y registrar producción.',
  ),
  p(' '),
  h4('Columnas del listado'),
  fieldsTable([
    { campo: 'Código', descripcion: 'Identificador único del operario.' },
    { campo: 'Nombres + Apellido', descripcion: 'Nombre completo.' },
    { campo: 'DNI', descripcion: 'Documento de identidad (opcional pero único).' },
    { campo: 'Área', descripcion: 'Área de producción (corte, costura, bordado…).' },
    { campo: 'Tipo de contrato', descripcion: 'PLANILLA / DESTAJO / MIXTO / HONORARIOS.' },
    { campo: 'Activo', descripcion: 'Estado.' },
  ]),
  p(' '),
  h4('Campos del operario (cuando se cree la pantalla)'),
  fieldsTable([
    { campo: 'Tarifa destajo', descripcion: 'S/ por pieza producida (si tipo = DESTAJO o MIXTO).' },
    { campo: 'Sueldo base', descripcion: 'S/ mensual fijo (si tipo = PLANILLA o MIXTO).' },
    { campo: 'Usuario sistema (opcional)', descripcion: 'Vincular a un usuario de auth si el operario va a usar la app (ej. tablet en planta para declarar producción).' },
    { campo: 'Fecha ingreso / salida', descripcion: 'Para histórico laboral.' },
  ]),
  p(' '),
  warn(
    'Hoy la pantalla de operarios es de solo lectura. La creación / edición se hace desde el panel admin de Supabase. ' +
      'Si necesitás dar de alta operarios desde el ERP, avisá al equipo técnico.',
  ),
  ...observacionesBox('Operarios'),
);

// ====================================================================
// MÓDULO 3: PRODUCCIÓN
// ====================================================================

docContent.push(
  h1('Módulo 3 — PRODUCCIÓN'),
  p(
    'El flujo completo de producción de los disfraces: desde la planificación semanal hasta el ' +
      'producto terminado disponible en almacén para vender. Es el corazón operativo del negocio.',
  ),
  p(' '),
  h3('Flujo end-to-end (resumen)'),
  step(1, 'Plan Maestro: planificás qué producir esta semana.'),
  step(2, 'OT (Orden de Trabajo): se generan automáticamente o se crean a mano. Definen qué modelo y qué tallas.'),
  step(3, 'Corte: registrás cuánto cortaste físicamente (capas, metros, merma).'),
  step(4, 'Orden de Servicio: lo cortado + avíos viajan al taller para coser/bordar/decorar.'),
  step(5, 'Control de Calidad: se inspecciona la devolución del taller (próximamente).'),
  step(6, 'Cierre de OT: se generan lotes PT, kardex y trazabilidad → stock disponible para vender.'),
  p(' '),
  tip(
    'Cada paso valida que el anterior se haya hecho. Por ejemplo: no podés cerrar una OT si no está ' +
      'en estado "Control de Calidad". Si te confundís de orden, el sistema te avisa con mensaje claro.',
  ),
);

// 3.1 Plan Maestro
docContent.push(
  h2('3.1 Plan Maestro'),
  p('URL: /plan-maestro'),
  p(' '),
  h4('Para qué sirve'),
  p(
    'Planificación semanal de producción. Definís qué modelos y qué cantidades vas a producir esa semana, ' +
      'agrupados por prioridad y campaña. Cuando aprobás el plan, el sistema genera automáticamente ' +
      'las OTs (Órdenes de Trabajo) correspondientes.',
  ),
  p(' '),
  h4('Listado'),
  fieldsTable([
    { campo: 'Código', descripcion: 'Autogenerado: PM-YYYY-SXX-NNN (ej. PM-2026-S18-001). YY = año, XX = semana ISO.' },
    { campo: 'Semana', descripcion: 'Número de semana ISO 8601.' },
    { campo: 'Inicio / Fin', descripcion: 'Lunes y domingo de esa semana.' },
    { campo: 'Líneas', descripcion: 'Cantidad de items a producir en el plan.' },
    { campo: 'Estado', descripcion: 'BORRADOR → APROBADO → EN_EJECUCION → COMPLETADO (o CANCELADO).' },
  ]),
  p(' '),
  h4('Crear plan (/plan-maestro/nuevo)'),
  fieldsTable([
    { campo: 'Fecha inicio', descripcion: 'Lunes de la semana. El sistema calcula la semana ISO automáticamente.', obligatorio: true },
    { campo: 'Fecha fin', descripcion: 'Domingo de la semana.', obligatorio: true },
    { campo: 'Notas', descripcion: 'Observaciones internas.' },
  ]),
  p(' '),
  h4('Detalle del plan — agregar líneas'),
  fieldsTable([
    { campo: 'Producto', descripcion: 'Combobox con todos los productos activos.', obligatorio: true },
    { campo: 'Talla', descripcion: 'T0 a T16, TS, TAD.', obligatorio: true },
    { campo: 'Cantidad planificada', descripcion: 'Cuántas unidades producir de esa talla.', obligatorio: true },
    { campo: 'Prioridad', descripcion: 'Número (menor = más urgente). Default 100.' },
    { campo: 'Campaña (opcional)', descripcion: 'Vincular a Día de la Madre, Halloween, etc.' },
  ]),
  p(' '),
  h4('Acciones'),
  bulletBold('Aprobar plan: ', 'transición BORRADOR → APROBADO. Solo se permite una vez (idempotente).'),
  bulletBold('Generar OTs: ', 'crea automáticamente una OT por cada producto con todas sus tallas. Solo desde APROBADO. Si las OTs ya fueron generadas, te avisa que no se duplican.'),
  bulletBold('Explosión de materiales: ', 'vista que calcula cuánto material total necesitás para todo el plan, multiplicando recetas × cantidades.'),
  ...pruebaSugerida('Crear y aprobar un plan semanal', [
    'Click "+ Nuevo plan". Fecha inicio: lunes próximo. Fecha fin: domingo siguiente.',
    'Notas: "Plan de prueba". Guardar.',
    'En el detalle → agregar línea: producto X, talla T6, 50 unidades.',
    'Agregar otra línea: producto X talla T8, 30 unidades.',
    'Ver "Explosión de materiales" → debería mostrar tela, hilo, etc. multiplicados.',
    'Click "Aprobar plan" → estado BORRADOR → APROBADO.',
    'Probar aprobar de nuevo → debería rechazar con mensaje claro.',
    'Click "Generar OTs" → crea las OTs automáticamente.',
    'En /ot debería aparecer una OT nueva con las 2 líneas.',
  ]),
  ...observacionesBox('Plan Maestro'),
);

// 3.2 Órdenes de Trabajo
docContent.push(
  h2('3.2 Órdenes de Trabajo (OT)'),
  p('URL: /ot'),
  p(' '),
  h4('Para qué sirve'),
  p(
    'La orden concreta de fabricar X unidades de un modelo en sus distintas tallas. Una OT puede ' +
      'tener muchas líneas (mismo modelo, distintas tallas) y atraviesa una serie de estados desde ' +
      'BORRADOR hasta COMPLETADA.',
  ),
  p(' '),
  h4('Filtros del listado'),
  bullet('Buscador por número (ej. "OT-000234").'),
  bullet('Estado: Todas / Activas (todos los intermedios) / cada estado individual / Completadas / Canceladas.'),
  bullet('Prioridad: 🔥 Urgente (≤30) / Alta (31-60) / Normal (61+).'),
  p(' '),
  h4('Estados de la OT (máquina de estados)'),
  bulletBold('BORRADOR: ', 'recién creada, editable, no tiene compromiso.'),
  bulletBold('PLANIFICADA: ', 'lista para entrar a producción.'),
  bulletBold('EN_CORTE: ', 'físicamente se está cortando.'),
  bulletBold('EN_HABILITADO: ', '(opcional) preparación de materiales.'),
  bulletBold('EN_SERVICIO: ', 'enviada al taller para coser/bordar.'),
  bulletBold('EN_DECORADO: ', '(opcional) en decoración.'),
  bulletBold('EN_CONTROL_CALIDAD: ', 'inspección antes del cierre.'),
  bulletBold('COMPLETADA: ', 'cerrada, lotes PT generados, stock disponible.'),
  bulletBold('CANCELADA: ', 'anulada (desde cualquier activo).'),
  p(' '),
  h4('Crear OT manual (/ot/nueva)'),
  fieldsTable([
    { campo: 'Fecha entrega objetivo', descripcion: 'Deadline. Default: +14 días.' },
    { campo: 'Prioridad', descripcion: 'Número (menor = más urgente). Default 100.' },
    { campo: 'Campaña (opcional)', descripcion: 'Vincular a una campaña activa.' },
    { campo: 'Observación', descripcion: 'Notas internas.' },
  ]),
  p(' '),
  h4('Detalle de la OT — pestaña "Líneas / Producción"'),
  bullet('Agregar línea: producto + talla + cantidad planificada.'),
  bullet('Declarar avance: cantidad cortada y cantidad fallas (validado server-side: cortada ≤ planificada).'),
  bullet('Eliminar línea: solo si OT no está cerrada.'),
  p(' '),
  h4('Detalle de la OT — pestaña "Bitácora"'),
  bullet('Cada cambio de estado, nota agregada o evento queda registrado con usuario y fecha.'),
  bullet('Botón "Agregar nota" para dejar comentarios manuales.'),
  p(' '),
  h4('Botones del header'),
  bulletBold('Cambiar estado: ', 'avanza por la cadena (validado server-side, no se pueden saltar pasos).'),
  bulletBold('Cerrar OT: ', 'solo desde EN_CONTROL_CALIDAD. Selecciona almacén destino y dispara la cascada de cierre (ver más abajo).'),
  p(' '),
  h4('Qué pasa al cerrar la OT (¡importante!)'),
  p('Es una operación atómica que hace 5 cosas en una transacción:'),
  step(1, 'Genera un INGRESO PT (INGPT-XXXXXX) — el documento contable de entrada al almacén.'),
  step(2, 'Por cada línea con prendas terminadas, crea un LOTE PT (LT-YYYYMMDD-SKU-NNNN).'),
  step(3, 'Inserta movimiento en KARDEX tipo ENTRADA_PRODUCCION con el costo unitario.'),
  step(4, 'Inserta evento de TRAZABILIDAD vinculando lote ↔ OT.'),
  step(5, 'Marca la OT como COMPLETADA y deja la fecha de cierre.'),
  p(' '),
  warn(
    'Validaciones server-side antes del cierre: la OT debe estar en EN_CONTROL_CALIDAD; debe haber al menos ' +
      'una línea con cantidad cortada > 0; ninguna línea puede tener cantidad terminada > planificada. ' +
      'Si algo falla, se reverte todo (no quedan lotes huérfanos).',
  ),
  ...pruebaSugerida('Crear OT manual y avanzarla por todos los estados', [
    'Click "+ Nueva OT". Fecha entrega: +7 días. Prioridad: 50. Guardar.',
    'En el detalle → agregar línea: producto X, talla T6, cantidad 10.',
    'Cambiar estado: BORRADOR → PLANIFICADA → EN_CORTE.',
    'Probar saltar pasos: intentar cambiar a COMPLETADA directamente. Debería rechazar con mensaje claro.',
    'Declarar producción de la línea: cantidad cortada 9, fallas 1.',
    'Avanzar: EN_CORTE → EN_SERVICIO → EN_CONTROL_CALIDAD → COMPLETADA (con almacén Santa Bárbara).',
    'Verificar: en /kardex aparece movimiento ENTRADA_PRODUCCION; en /inventario aparece +8 unidades de esa variante (9 - 1 falla).',
  ]),
  ...observacionesBox('Órdenes de Trabajo'),
);

// 3.3 Corte
docContent.push(
  h2('3.3 Corte'),
  p('URL: /corte'),
  p(' '),
  h4('Para qué sirve'),
  p(
    'Registrar el corte físico de la tela en planta. Cada orden de corte (COR-XXXXXX) se vincula a una OT ' +
      'y a un producto, y registra cuántas capas se tendieron, cuántos metros se consumieron y cuántas piezas ' +
      'salieron por talla (incluyendo merma).',
  ),
  p(' '),
  h4('Listado'),
  fieldsTable([
    { campo: 'Número', descripcion: 'Autogenerado COR-XXXXXX.' },
    { campo: 'OT vinculada', descripcion: 'A qué OT pertenece este corte.' },
    { campo: 'Producto', descripcion: 'Modelo que se está cortando.' },
    { campo: 'Capas tendidas', descripcion: 'Cuántas capas de tela se apilaron antes de cortar.' },
    { campo: 'Metros consumidos', descripcion: 'Total de tela usada.' },
    { campo: 'Estado', descripcion: 'ABIERTO → EN_PROCESO → COMPLETADO → ANULADO.' },
  ]),
  p(' '),
  h4('Crear orden de corte (/corte/nuevo)'),
  fieldsTable([
    { campo: 'OT', descripcion: 'Combobox de OTs en estado activo. Las completadas/canceladas no aparecen.', obligatorio: true },
    { campo: 'Producto', descripcion: 'Modelo a cortar (uno de los productos de la OT).', obligatorio: true },
    { campo: 'Responsable', descripcion: 'Operario a cargo del corte (filtra por área = corte).' },
    { campo: 'Capas tendidas', descripcion: 'Número entero ≥ 0.' },
    { campo: 'Metros consumidos', descripcion: 'Número decimal ≥ 0.' },
    { campo: 'Observación', descripcion: 'Notas internas.' },
  ]),
  p(' '),
  h4('Detalle — líneas por talla'),
  fieldsTable([
    { campo: 'Talla', descripcion: 'T0 a TAD.', obligatorio: true },
    { campo: 'Cantidad teórica', descripcion: 'Cuántas piezas debían salir según la OT.', obligatorio: true },
    { campo: 'Cantidad real', descripcion: 'Cuántas piezas salieron de verdad. Puede ser menor (merma) o mayor (sobra).' },
    { campo: 'Merma', descripcion: 'Piezas perdidas / mal cortadas.' },
  ]),
  p(' '),
  h4('Cerrar corte'),
  p(
    'Botón "Cerrar corte" → ejecuta una transacción atómica que (1) suma cantidad_real al cantidad_cortada ' +
      'de la línea correspondiente de la OT (matchea por talla y producto), y (2) marca el corte como COMPLETADO. ' +
      'Si algo falla, ROLLBACK total — no queda corte cerrado sin sincronizar la OT.',
  ),
  ...pruebaSugerida('Crear y cerrar un corte', [
    'Click "+ Nuevo corte". OT: la que tenga estado activo. Producto: el del paso anterior.',
    'Capas: 5. Metros: 25. Responsable: cualquier operario. Guardar.',
    'En el detalle → agregar línea: T6, teórica 10, real 9, merma 1.',
    'Click "Cerrar corte" (con confirmación).',
    'Volver a la OT vinculada → la línea T6 debería tener cantidad_cortada = 9.',
  ]),
  ...observacionesBox('Corte'),
);

// 3.4 Órdenes de Servicio
docContent.push(
  h2('3.4 Órdenes de Servicio'),
  p('URL: /servicios'),
  p(' '),
  h4('Para qué sirve'),
  p(
    'Cuando el corte está hecho, las prendas viajan a un taller tercerizado (o área propia) para coser, ' +
      'bordar, decorar, etc. La OS (Orden de Servicio) es el documento que acompaña ese envío: dice qué ' +
      'prendas van por talla, qué materiales (avíos) se mandan, a qué taller, qué proceso ejecuta y cuánto se le paga.',
  ),
  p(' '),
  h4('Listado'),
  fieldsTable([
    { campo: 'Número', descripcion: 'Autogenerado OS-XXXXXX.' },
    { campo: 'Taller', descripcion: 'A qué taller se envió.' },
    { campo: 'Proceso', descripcion: 'COSTURA / BORDADO / ESTAMPADO / etc.' },
    { campo: 'OT', descripcion: 'OT origen.' },
    { campo: 'Estado', descripcion: 'EMITIDA → DESPACHADA → EN_PROCESO → RECEPCIONADA → CERRADA (o ANULADA).' },
    { campo: 'Total a pagar', descripcion: 'Suma de monto base + adicionales.' },
  ]),
  p(' '),
  h4('Crear OS desde un corte (/servicios/nuevo)'),
  fieldsTable([
    { campo: 'Corte (opcional)', descripcion: 'Si se vincula a un corte, las líneas y avíos se POPULAN AUTOMÁTICAMENTE.' },
    { campo: 'OT', descripcion: 'Auto si viene de corte. Manual si no.', obligatorio: true },
    { campo: 'Taller', descripcion: 'Combobox de talleres activos.', obligatorio: true },
    { campo: 'Proceso', descripcion: 'Tipo de operación que ejecutará el taller.', obligatorio: true },
    { campo: 'Fecha entrega esperada', descripcion: 'Cuándo se espera la devolución del taller.' },
    { campo: 'Monto base', descripcion: 'Pago acordado al taller (S/).' },
    { campo: 'Adicional movilidad / campaña', descripcion: 'Costos extra de transporte o por temporada.' },
    { campo: 'Observaciones / Cuidados / Consideraciones', descripcion: 'Notas para el taller.' },
  ]),
  p(' '),
  h4('Detalle de la OS — qué se ve'),
  bulletBold('Card "Pago al taller": ', 'desglose de monto base + adicionales = total.'),
  bulletBold('Card "Notas y consideraciones": ', 'observaciones, cuidados, consideraciones.'),
  bulletBold('Card "Corte vinculado": ', 'link al corte origen (si existe).'),
  bulletBold('Card "Prendas enviadas al taller": ', 'tabla con producto, talla, cantidad enviada, recepcionada, falladas.'),
  bulletBold('Card "Avíos enviados": ', 'tabla con material, categoría, cantidad enviada, devuelta, observación.'),
  p(' '),
  tip(
    'Cuando creás una OS desde un corte: las líneas (cantidad por talla) y los avíos (materiales del BOM con ' +
      '"va al taller" = ON, multiplicados por la cantidad a producir) se generan automáticamente. No tenés que cargar nada a mano.',
  ),
  p(' '),
  h4('Transiciones de estado'),
  bullet('EMITIDA → DESPACHADA: el taller ya tiene el material.'),
  bullet('DESPACHADA → EN_PROCESO: el taller empezó a trabajar.'),
  bullet('EN_PROCESO → RECEPCIONADA: el taller devolvió las prendas (queda fecha de recepción).'),
  bullet('RECEPCIONADA → CERRADA: pagada y archivada.'),
  bullet('Cualquier activo → ANULADA: cancelar.'),
  ...pruebaSugerida('Generar una OS desde un corte cerrado', [
    'En /servicios → "+ Nueva OS".',
    'Vincular a un corte que esté CERRADO. La OT y producto se autocompletan.',
    'Taller: elegí uno activo. Proceso: COSTURA. Fecha entrega: +5 días. Monto base: 100.',
    'Guardar. En el detalle deberían aparecer:',
    '  · Card "Prendas enviadas": las tallas y cantidades del corte.',
    '  · Card "Avíos enviados": tela, hilo, etc. (calculados desde la receta).',
    'Cambiar estado: EMITIDA → DESPACHADA → EN_PROCESO → RECEPCIONADA. Verificar fecha de recepción.',
  ]),
  ...observacionesBox('Órdenes de Servicio'),
);

// 3.5 Control de Calidad
docContent.push(
  h2('3.5 Control de Calidad'),
  p('URL: /control-calidad'),
  p(' '),
  warn('Esta pantalla está EN CONSTRUCCIÓN. La lógica de negocio ya está diseñada pero la interfaz aún no se implementó.'),
  p(' '),
  h4('Funcionalidad planeada'),
  bullet('Inspección al regreso del taller y antes de ingresar al almacén PT.'),
  bullet('Registro de defectos con clasificación (reproceso, segunda calidad, merma, devolución al taller).'),
  bullet('Checklist configurable por modelo de las cosas a revisar.'),
  bullet('Catálogo de defectos: costura suelta, manchas, medidas mal, etc.'),
  bullet('Descuentos automáticos al pago del taller según defectos detectados.'),
  bullet('Reportes de tasa de defectos por taller, por operario, por modelo, por período.'),
  ...observacionesBox('Control de Calidad'),
);

// 3.6 Trazabilidad
docContent.push(
  h2('3.6 Trazabilidad'),
  p('URL: /trazabilidad'),
  p(' '),
  warn('Esta pantalla está EN CONSTRUCCIÓN. La función SQL `timeline_lote()` ya existe en la base, falta la interfaz.'),
  p(' '),
  h4('Funcionalidad planeada'),
  bullet('Timeline visual end-to-end de cada lote: producción → ingreso PT → traslado a tienda → venta → cliente.'),
  bullet('Búsqueda por código QR / SKU / OT.'),
  bullet('Detalle por lote: quién vendió, a qué cliente, cuándo, con qué descuento, devoluciones, mermas.'),
  bullet('Auditoría completa para reclamos, devoluciones y análisis post-venta.'),
  ...observacionesBox('Trazabilidad'),
);

// CIERRE
docContent.push(
  h1('Cierre y agradecimientos'),
  p(
    'Llegaste al final de la guía. Si llegaste hasta acá probaste todos los módulos clave y dejaste tus ' +
      'observaciones — eso vale oro para mejorar el sistema.',
  ),
  p(' '),
  h3('Siguiente paso'),
  step(1, 'Devolvé este documento (o sus notas) al equipo técnico de HAPPY SAC.'),
  step(2, 'Marcá las observaciones más urgentes con ⭐ o ⚠️ para priorizar.'),
  step(3, 'Si encontraste un bug crítico (algo que rompe el flujo), avisá inmediatamente.'),
  p(' '),
  h3('¿Necesitás ayuda durante la prueba?'),
  bullet('Si una pantalla queda colgada: refrescá (F5).'),
  bullet('Si aparece un mensaje de error rojo: leelo y anotalo. Sirve para debug.'),
  bullet('Si no encontrás un botón: probablemente no está implementado todavía. Anotalo en observaciones.'),
  bullet('Si dudás si algo es un bug o un comportamiento esperado: anotalo igual.'),
  p(' '),
  p(' '),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 480, after: 240 },
    children: [
      new TextRun({ text: '🎭', size: 48, font: 'Calibri' }),
    ],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [
      new TextRun({
        text: 'Gracias por tu tiempo y feedback.',
        size: 28,
        bold: true,
        color: COLOR_PRIMARY,
        italics: true,
        font: 'Calibri',
      }),
    ],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 80 },
    children: [
      new TextRun({
        text: 'Tu mirada hace que este ERP sea mejor.',
        size: 24,
        color: COLOR_ACCENT,
        italics: true,
        font: 'Calibri',
      }),
    ],
  }),
);

// ==============================
// GENERAR EL DOC
// ==============================

const doc = new Document({
  creator: 'HAPPY SAC',
  title: 'Guía de Pruebas — HAPPY SAC ERP',
  description:
    'Guía amigable para que el cliente pruebe los módulos Catálogo, Personas y Producción y deje observaciones.',
  styles: {
    default: {
      document: {
        run: { font: 'Calibri', size: 22 },
        paragraph: { spacing: { line: 320 } },
      },
    },
  },
  sections: [
    {
      properties: {
        page: {
          margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 },
        },
      },
      children: docContent,
    },
  ],
});

const outPath = path.resolve(process.cwd(), 'Guia-Pruebas-HAPPY-SAC.docx');
Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(outPath, buf);
  console.info(`✓ Guía generada en: ${outPath}`);
  console.info(`  Tamaño: ${(buf.length / 1024).toFixed(1)} KB`);
});
