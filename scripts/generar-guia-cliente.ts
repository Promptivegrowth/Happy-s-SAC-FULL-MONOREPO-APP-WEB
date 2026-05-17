/**
 * Genera la "Guía de Pruebas — HAPPY SAC ERP" en formato .docx para
 * que el cliente pueda probar los módulos Catálogo, Personas, Configuración
 * y Producción y deje observaciones por sección.
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
  BorderStyle,
  Table,
  TableRow,
  TableCell,
  WidthType,
} from 'docx';
import fs from 'node:fs';
import path from 'node:path';

// ==============================
// Helpers de estilo
// ==============================

const COLOR_PRIMARY = '231459';
const COLOR_ACCENT = 'E15A25';
const COLOR_TEXT = '1F2937';
const COLOR_MUTED = '64748B';
const COLOR_OK = '16A34A';
const COLOR_BG_LIGHT = 'F8FAFC';

function p(text: string, opts: { size?: number; bold?: boolean; color?: string; italics?: boolean; spacingBefore?: number; spacingAfter?: number; alignment?: typeof AlignmentType[keyof typeof AlignmentType] } = {}) {
  return new Paragraph({
    spacing: { before: opts.spacingBefore ?? 60, after: opts.spacingAfter ?? 60 },
    alignment: opts.alignment,
    children: [new TextRun({ text, size: opts.size ?? 22, bold: opts.bold, italics: opts.italics, color: opts.color ?? COLOR_TEXT, font: 'Calibri' })],
  });
}

function h1(text: string, color = COLOR_PRIMARY) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 480, after: 200 },
    children: [new TextRun({ text, bold: true, size: 40, color, font: 'Calibri' })],
    pageBreakBefore: true,
  });
}

function h2(text: string, color = COLOR_ACCENT) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 360, after: 160 },
    children: [new TextRun({ text, bold: true, size: 30, color, font: 'Calibri' })],
  });
}

function h3(text: string) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 240, after: 120 },
    children: [new TextRun({ text, bold: true, size: 26, color: COLOR_PRIMARY, font: 'Calibri' })],
  });
}

function h4(text: string) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_4,
    spacing: { before: 200, after: 80 },
    children: [new TextRun({ text, bold: true, size: 22, color: COLOR_PRIMARY, font: 'Calibri' })],
  });
}

function bullet(text: string, level = 0) {
  return new Paragraph({
    bullet: { level },
    spacing: { before: 40, after: 40 },
    children: [new TextRun({ text, size: 22, color: COLOR_TEXT, font: 'Calibri' })],
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
    border: { left: { color: COLOR_ACCENT, size: 24, style: BorderStyle.SINGLE, space: 8 } },
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
    border: { left: { color: COLOR_OK, size: 24, style: BorderStyle.SINGLE, space: 8 } },
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
    border: { left: { color: 'F59E0B', size: 24, style: BorderStyle.SINGLE, space: 8 } },
    indent: { left: 240 },
    children: [
      new TextRun({ text: '⚠️ ', size: 22, font: 'Calibri' }),
      new TextRun({ text, size: 22, color: COLOR_TEXT, font: 'Calibri' }),
    ],
  });
}

function nuevo(text: string) {
  return new Paragraph({
    spacing: { before: 120, after: 120 },
    border: { left: { color: '8B5CF6', size: 24, style: BorderStyle.SINGLE, space: 8 } },
    indent: { left: 240 },
    children: [
      new TextRun({ text: '🆕 NUEVO: ', bold: true, size: 22, color: '8B5CF6', font: 'Calibri' }),
      new TextRun({ text, size: 22, color: COLOR_TEXT, font: 'Calibri' }),
    ],
  });
}

function fieldsTable(rows: { campo: string; descripcion: string; obligatorio?: boolean }[]) {
  const headerRow = new TableRow({
    tableHeader: true,
    children: [
      new TableCell({
        shading: { fill: COLOR_PRIMARY },
        width: { size: 30, type: WidthType.PERCENTAGE },
        children: [new Paragraph({ children: [new TextRun({ text: 'Campo', bold: true, color: 'FFFFFF', size: 22, font: 'Calibri' })] })],
      }),
      new TableCell({
        shading: { fill: COLOR_PRIMARY },
        width: { size: 70, type: WidthType.PERCENTAGE },
        children: [new Paragraph({ children: [new TextRun({ text: 'Descripción', bold: true, color: 'FFFFFF', size: 22, font: 'Calibri' })] })],
      }),
    ],
  });
  const dataRows = rows.map((r, i) =>
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
          children: [new Paragraph({ children: [new TextRun({ text: r.descripcion, size: 22, color: COLOR_TEXT, font: 'Calibri' })] })],
        }),
      ],
    }),
  );
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...dataRows],
  });
}

function observacionesBox(modulo: string) {
  const lineas: Paragraph[] = [];
  for (let i = 0; i < 6; i++) {
    lineas.push(
      new Paragraph({
        spacing: { before: 0, after: 0 },
        border: { bottom: { color: 'CBD5E1', size: 6, style: BorderStyle.SINGLE, space: 1 } },
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
    p('Anotá acá lo que viste raro, lo que te parece confuso, lo que te falta, o sugerencias de mejora:', { size: 20, color: COLOR_MUTED, italics: true }),
    ...lineas,
  ];
}

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
    children: [new TextRun({ text: '🎭', size: 96, font: 'Calibri' })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 240, after: 120 },
    children: [new TextRun({ text: 'HAPPY SAC ERP', bold: true, size: 56, color: COLOR_PRIMARY, font: 'Calibri' })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 120, after: 480 },
    children: [new TextRun({ text: 'Guía de Pruebas para el Cliente', size: 36, color: COLOR_ACCENT, font: 'Calibri' })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 240, after: 120 },
    children: [new TextRun({ text: 'Versión 2 · Mayo 2026', size: 24, bold: true, color: COLOR_PRIMARY, font: 'Calibri' })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 120, after: 120 },
    children: [new TextRun({ text: 'Catálogo · Personas · Configuración · Producción · Resto del sistema', size: 22, color: COLOR_MUTED, font: 'Calibri' })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 1200, after: 120 },
    children: [new TextRun({ text: 'Esta guía recoge todos los cambios desde la primera entrega.', size: 22, color: COLOR_TEXT, font: 'Calibri', italics: true })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 80, after: 120 },
    children: [new TextRun({ text: 'Probá libremente y devolvenos tus observaciones.', size: 22, color: COLOR_TEXT, font: 'Calibri', italics: true })],
  }),
);

// BIENVENIDA
docContent.push(
  h1('Bienvenido(a) a HAPPY SAC ERP — V2'),
  p(
    'Este documento es tu compañero de pruebas. Acá vas a encontrar, módulo por módulo, qué hace cada pantalla, ' +
      'qué significa cada campo, cómo usarlo y un espacio para que anotes lo que veas — bueno, malo, confuso, ' +
      'lo que te falta o lo que mejorarías.',
  ),
  p(' '),
  h3('Novedades en esta versión (mayo 2026)'),
  p('Desde la primera entrega se trabajaron todos los puntos que dejaste como observación. Resumen de los cambios fuertes:'),
  bulletBold('Operarios: ', 'CRUD completo nuevo. Cargás solo el DNI y RENIEC autocompleta nombres y apellidos. Definís tipo de operario, contrato (planilla / destajo / mixto / honorarios) y jornada (estándar o personalizada).'),
  bulletBold('Categorías: ', 'el código se autogenera del nombre con preview de los SKUs que se van a producir (ej: "Halloween" → HLW0001). Editable si querés override.'),
  bulletBold('Materiales: ', 'podés crear unidades de medida nuevas sin salir del formulario. Botón "+" al lado del dropdown abre un modal liviano y la unidad queda seleccionada al instante.'),
  bulletBold('Plan maestro: ', 'cantidades arrancan vacías (antes salían en 50 y confundía). El sistema bloquea generar OTs si hay productos sin receta activa, con detalle de cuáles faltan.'),
  bulletBold('Corte: ', 'el modelo se toma automáticamente de la OT — ya no hay que volver a elegirlo. La cantidad teórica se autocompleta con el saldo del plan. La merma se carga una sola vez a nivel cabecera (en metros), no por talla.'),
  bulletBold('Órdenes de Servicio: ', 'la movilidad y el adicional de campaña se cargan POR UNIDAD enviada (no como total). Hay una nueva sección "Procesos / tiempos" para registrar quién hizo qué etapa, cuándo y por cuánto tiempo.'),
  bulletBold('Talleres: ', 'auto-código (TAL-001, TAL-002…). Las tarifas por taller pasaron a ser solo OVERRIDES, la tarifa central vive en Configuración → Tarifas de servicios.'),
  bulletBold('Tarifas centralizadas: ', 'nueva pantalla en Configuración. Cargás una vez la tarifa por proceso × producto × talla y vale para todos los talleres.'),
  p(' '),
  h3('Cómo está organizado'),
  bullet('Cada módulo tiene su capítulo (Catálogo, Personas, Configuración, Producción, Resto del sistema).'),
  bullet('Cada pantalla del módulo tiene su sección.'),
  bullet('Para cada pantalla: para qué sirve, cómo se usa, qué significan los campos y una prueba sugerida.'),
  bullet('Al final de cada módulo hay un espacio para tus observaciones.'),
  p(' '),
  h3('Cómo usar esta guía'),
  step(1, 'Imprimila o tenela abierta en una pantalla mientras probás el ERP en otra.'),
  step(2, 'Seguí las pruebas sugeridas paso a paso. No tengas miedo de probar todo — el sistema tiene validaciones.'),
  step(3, 'Anotá en el espacio "Tus observaciones" lo que te llame la atención: errores, mejoras, dudas.'),
  step(4, 'Cuando termines, devolvé este documento (o sus notas) al equipo técnico.'),
  p(' '),
  note(
    'Los datos que cargues durante las pruebas pueden quedarse o limpiarse al final. Avisanos si querés que dejemos un set de datos de ejemplo cargado al cierre.',
  ),
  p(' '),
  h3('Convenciones de esta guía'),
  bulletBold('💡 Nota: ', 'aclara algo importante.'),
  bulletBold('✅ Tip: ', 'consejo o atajo útil.'),
  bulletBold('⚠️ Cuidado: ', 'advertencia que conviene leer antes de hacer la acción.'),
  bulletBold('🆕 NUEVO: ', 'función o cambio agregado en esta versión 2.'),
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
    'El catálogo es el corazón del negocio: acá viven todos los disfraces que producís y vendés, sus categorías, ' +
      'los materiales con los que están hechos, las recetas (BOM) que los definen, y cómo se publican en la tienda online.',
  ),
  p(' '),
  h3('Qué incluye'),
  bulletBold('Productos / Disfraces: ', 'cada modelo (ej. "Princesa Bella") con sus tallas y precios.'),
  bulletBold('Categorías: ', 'agrupaciones temáticas (Halloween, Princesas, Accesorios…). Ahora el código se autogenera del nombre.'),
  bulletBold('Materiales: ', 'telas, hilos, broches, encajes — los insumos para producir. Podés crear unidades nuevas sin salir del form.'),
  bulletBold('Recetas (BOM): ', 'qué materiales y cuánto se necesita por modelo y talla.'),
  bulletBold('Publicación Web: ', 'gestión visual de qué aparece en la tienda online.'),
);

// 1.1 Productos
docContent.push(
  h2('1.1 Productos / Disfraces'),
  p('URL: /productos'),
  p(' '),
  h4('Para qué sirve'),
  p(
    'Es el listado completo de tu catálogo. Cada fila es un modelo (ej. "Bella New") que agrupa varias variantes ' +
      '(las tallas: T2, T4, T6…). Desde acá creás nuevos productos, editás los existentes, ves su stock por talla y los publicás en la web.',
  ),
  p(' '),
  h4('Qué vas a ver en la lista'),
  bullet('Filtros arriba: búsqueda por nombre/código, categoría, estado, web, sin categoría.'),
  bullet('Cada fila: código, nombre, categoría principal + extras (badges), campaña, tallas con stock, precio, estado web, estado activo.'),
  bullet('Productos sin categoría aparecen resaltados (no se pueden publicar sin categoría asignada).'),
  p(' '),
  h4('Crear / editar un producto'),
  p('Click en "Nuevo producto" o sobre cualquier fila. Pestañas: Datos del modelo · Variantes · Galería · Publicación web.'),
  p(' '),
  h4('Pestaña "Datos del modelo" — secciones y campos'),
  p('El form está dividido en tres secciones: Identificación del modelo, Composición física e Imagen y ficha.'),
  p(' '),
  h4('Sección "Identificación del modelo"'),
  fieldsTable([
    { campo: 'Nombre', descripcion: 'Nombre comercial del modelo (ej. "Bella New", "Pirata Adulto"). Placeholder: "Ej: Moana, Bolívar, Disfraz de Bombero…".', obligatorio: true },
    { campo: 'Categoría principal', descripcion: 'La categoría dominante. Define la URL, el código autogenerado y el breadcrumb en la web. Si elegís "Sin categoría" el producto queda huérfano y no se puede publicar.' },
    { campo: 'Campaña / Temporada', descripcion: 'Halloween, Navidad, Patrias… opcional, solo informativa.' },
    { campo: 'Género', descripcion: 'Unisex / Niño / Niña / Mujer / Hombre.' },
    { campo: 'Descripción', descripcion: 'Notas técnicas internas (no se muestra al cliente final). Para el texto público usar "Descripción larga" en la pestaña Publicación web.' },
    { campo: 'Categorías extra (opcional, máx 2)', descripcion: 'Chips clickeables. Red de seguridad para productos multi-temporada: si apagás la principal, el producto sigue publicado mientras tenga al menos una extra activa. NO genera código nuevo.' },
  ]),
  p(' '),
  warn(
    'El código del producto NO tiene campo en el form: se autogenera SIEMPRE con el patrón <ABV>M<NNNN> a partir de la categoría principal (ej. categoría "Halloween" → HLW → producto HLWM0001). ' +
      'No se puede tipear manualmente desde la UI. Si necesitás un código específico, contactá al equipo técnico.',
  ),
  p(' '),
  h4('Sección "Composición física"'),
  fieldsTable([
    { campo: 'Piezas que incluye', descripcion: 'Texto libre con qué piezas trae (ej. "Pantalón + Chaqueta + Gorro + Guantes").' },
    { campo: 'Es un conjunto', descripcion: 'Toggle. Marcado por defecto (los disfraces suelen ser conjunto: vestido + accesorios). Apagalo si es una sola pieza.' },
  ]),
  p(' '),
  h4('Sección "Imagen y ficha"'),
  fieldsTable([
    { campo: 'Imagen principal del modelo', descripcion: 'Foto cuadrada de portada. Aparece en cards y como hero en la ficha web.' },
    { campo: 'Versión de ficha técnica', descripcion: 'Texto libre, default "v1.0". Sirve para versionar la ficha técnica que se le pasa al taller.' },
    { campo: 'Destacar internamente (ERP)', descripcion: 'Toggle. Marca visible solo para el equipo, NO afecta web/POS. Para destacar en la home de la web, usá la pestaña "Publicación web" (es otro toggle distinto).' },
    { campo: 'Producto activo', descripcion: 'Toggle. Apagar oculta el producto del catálogo y de la web sin borrarlo (soft-delete).' },
  ]),
  p(' '),
  h4('Pestaña Variantes'),
  p(
    'Una variante = un modelo en una talla específica con su precio. Listado con tallas ordenadas y un form inline para agregar nuevas. ' +
      'Restricción: no podés tener dos variantes con la misma talla + color en el mismo modelo.',
  ),
  fieldsTable([
    { campo: 'Talla', descripcion: 'T0, T2, T4, T6, T8, T10, T12, T14, T16, TS, TAD. El dropdown filtra las que ya están cargadas.', obligatorio: true },
    { campo: 'SKU', descripcion: 'Código visible al cliente. Si lo dejás vacío se autogenera (ej. HLW0001). Es el que ve POS, web e inventario.' },
    { campo: 'Código de barras', descripcion: 'EAN-13 opcional. Útil si usás pistola lectora.' },
    { campo: 'Precio público', descripcion: 'Precio al cliente final.', obligatorio: true },
    { campo: 'Precio mayorista A / B / C', descripcion: 'Listas de precios escalonadas. A es el más alto, C el más agresivo.' },
    { campo: 'Precio costo estándar', descripcion: 'Costo calculado de la receta. Editable como override.' },
  ]),
  p(' '),
  ...pruebaSugerida('Crear un disfraz nuevo de punta a punta', [
    'Andá a /productos y click en "Nuevo producto".',
    'Nombre: "Pirata Test". Elegí categoría "Halloween" (o creá una nueva antes si no existe).',
    'Marcá una categoría extra (opcional). Verificá que no podés elegir más de 2 — al intentar la tercera, se deshabilita.',
    'Subí una imagen principal en la sección "Imagen y ficha" y dejá la versión de ficha en "v1.0".',
    'Guardá. El sistema autogenera el código (ej. HLWM0001) y te lleva al detalle del producto.',
    'Andá a la pestaña "Variantes". Agregá tres variantes: T4, T6, T8 con precios distintos. Verificá que el SKU se autogenera (ej. HLW0001, HLW0002, HLW0003).',
    'Volvé a /productos y verificá que el producto aparece con todas sus tallas y la imagen.',
  ]),
  ...observacionesBox('Productos / Disfraces'),
);

// 1.2 Categorías (con NOVEDAD: autocompletado)
docContent.push(
  h2('1.2 Categorías'),
  p('URL: /categorias'),
  p(' '),
  h4('Para qué sirve'),
  p(
    'Las categorías agrupan productos para el catálogo y la web. También son la base del sistema de SKUs: el código ' +
      'de cada categoría se usa como prefijo de los códigos de productos y SKUs de variantes.',
  ),
  nuevo(
    'Antes había que tipear el código a mano. Ahora se autocompleta del nombre mientras escribís, con preview en vivo ' +
      'de los SKUs que se van a generar (ej. "Halloween" → HLW → HLW0001, HLW0002…). El campo sigue editable si querés override.',
  ),
  p(' '),
  h4('Crear una categoría — el flujo nuevo'),
  step(1, 'Click en "Nueva categoría".'),
  step(2, 'Tipeá el nombre (ej. "Halloween"). A los 400 ms aparece el código sugerido en el campo de al lado (HLW).'),
  step(3, 'Debajo del campo aparece un cartel: "Los productos creados aquí tendrán códigos como HLWM0001 (modelo) y SKUs visibles al cliente como HLW0001, HLW0002…".'),
  step(4, 'Si te gusta, seguí. Si querés otra abreviatura (ej. "MOM" para Día de la Madre), tipeá el código manualmente y deja de pisarse al cambiar el nombre.'),
  step(5, 'Completá los demás campos (descripción, emoji, imagen) y guardá.'),
  p(' '),
  h4('Campos del formulario'),
  fieldsTable([
    { campo: 'Nombre', descripcion: 'El nombre que ve el cliente (ej. "Halloween", "Día de la Madre").', obligatorio: true },
    { campo: 'Código', descripcion: 'Auto-sugerido del nombre. Es la abreviatura que usan los SKUs. Editable.' },
    { campo: 'Slug (URL)', descripcion: 'Versión URL-friendly. Se autogenera del nombre si lo dejás vacío.' },
    { campo: 'Orden en web', descripcion: 'Menor número = aparece primero. Default 100.' },
    { campo: 'Descripción', descripcion: 'Texto corto para SEO y banner de la categoría.' },
    { campo: 'Emoji', descripcion: 'Hay 40+ emojis sugeridos por temática. Click para elegir o escribí cualquier otro.' },
    { campo: 'Imagen de portada', descripcion: 'Banner de la categoría en la web. Si no subís imagen, se usa el emoji.' },
    { campo: 'Publicar en la tienda web', descripcion: 'Toggle. Si está OFF, la categoría no aparece en la web pública.' },
    { campo: 'Activa', descripcion: 'Toggle maestro. Apagar despublica la categoría (con red de seguridad por categorías extra de productos).' },
  ]),
  p(' '),
  warn(
    'En modo edición el código NO se autogenera, ni siquiera al cambiar el nombre. Es a propósito: cambiar el código rompería los SKUs ya emitidos. ' +
      'Si lo querés cambiar, hacelo a mano y bajo tu propio riesgo.',
  ),
  ...pruebaSugerida('Crear una categoría con autocompletado', [
    'Andá a /categorias → "Nueva categoría".',
    'Tipeá "Día de la Madre" en Nombre. Esperá un momento (el sistema espera ~400 ms tras tu última tecla para evitar consultas innecesarias).',
    'Verificá que el campo Código se llenó solo (probablemente "DDM" o similar) y que aparece el preview "HLWM0001"… con el nuevo código.',
    'Cambialo a "MOM" manualmente y verificá que el preview se actualiza.',
    'Tipeá una palabra que ya existe (ej. "Halloween" si ya creaste una). Verificá que se ofrece un código alternativo y no choca.',
    'Guardá y crea un producto en esa categoría — verificá que el SKU autogenerado tiene el prefijo que vos definiste.',
  ]),
  ...observacionesBox('Categorías'),
);

// 1.3 Materiales (con NOVEDAD: unidades inline)
docContent.push(
  h2('1.3 Materiales'),
  p('URL: /materiales'),
  p(' '),
  h4('Para qué sirve'),
  p(
    'El catálogo de insumos: telas, avíos, hilos, broches, etiquetas. Cada material se compra en una unidad (rollo, kg, paquete) ' +
      'y se consume en otra (metro, gramo, unidad). Acá se cargan los precios de costo, los stocks mínimos y los proveedores preferidos.',
  ),
  p(' '),
  h4('Categorías de material'),
  bulletBold('TELA: ', 'telas crudas, lycras, satenes…'),
  bulletBold('AVIO: ', 'botones, cierres, encajes, apliques.'),
  bulletBold('INSUMO: ', 'hilos, gomas, broches genéricos.'),
  bulletBold('EMPAQUE: ', 'bolsas, etiquetas, fundas.'),
  p(' '),
  h4('Sección "Identificación"'),
  fieldsTable([
    { campo: 'Código', descripcion: 'Opcional. Si lo dejás vacío se autogenera según categoría (TELN0001 para tela, AVIN0001 para avío, INSN0001 para insumo, EMPN0001 para empaque). La "N" final indica "Nuevo" — distingue los materiales creados desde el ERP de los importados del sistema viejo (que tienen códigos como TEL0000057).' },
    { campo: 'Categoría', descripcion: 'TELA / AVIO / INSUMO / EMPAQUE.', obligatorio: true },
    { campo: 'Sub-categoría', descripcion: 'Texto libre para agrupar dentro de la categoría (ej. SERMAT, BOTÓN, GRECA).' },
    { campo: 'Nombre', descripcion: 'Descripción comercial (ej. "Lycra brillo dorada").', obligatorio: true },
    { campo: 'Color', descripcion: 'Texto descriptivo (DORADO, AZULINO, ROJO).' },
  ]),
  p(' '),
  h4('Sección "Unidades y precio"'),
  fieldsTable([
    { campo: 'Unidad de compra', descripcion: 'Cómo se compra al proveedor (ROLLO, BOLSA, KG…). Tiene un botón "+" al lado para crear una unidad nueva sin salir del form.' },
    { campo: 'Unidad de consumo', descripcion: 'Cómo se descuenta del stock al producir (METRO, GRAMO, UNIDAD). También tiene su propio botón "+". Si difiere de la compra, el factor de conversión es la equivalencia (ej. 1 rollo = 50 m).' },
    { campo: 'Factor conversión', descripcion: 'Cuántas unidades de consumo entran en 1 de compra. El sistema sugiere el factor si hay materiales similares ya cargados (chip "Sugerido por X material(es) similar(es)").' },
    { campo: 'Precio unitario (S/)', descripcion: 'Precio por unidad de COMPRA (no por metro: el precio de un rollo entero, por ejemplo).', obligatorio: true },
    { campo: 'Stock mínimo', descripcion: 'Por debajo de este número se generan alertas de reposición.' },
    { campo: 'Proveedor preferido', descripcion: 'A quién se le suele comprar. Aparece sugerido al crear órdenes de compra.' },
  ]),
  p(' '),
  h4('Sección "Imagen del material"'),
  bullet('Foto de referencia. PNG, JPG o WebP, máximo 10 MB. Para identificar el material visualmente al cargarlo en una receta o recepción.'),
  p(' '),
  h4('Sección "Otras opciones"'),
  fieldsTable([
    { campo: 'El precio incluye IGV', descripcion: 'Toggle. Marcado por defecto. Define si el precio cargado ya tiene IGV adentro o se le agrega al calcular costos.' },
    { campo: 'Es importado', descripcion: 'Toggle. Marca si el material viene de importación (afecta el flujo de Importaciones).' },
    { campo: 'Requiere control de lote', descripcion: 'Toggle. Si está ON, las recepciones de este material exigen registrar lote (útil para textiles que pueden venir con diferencias entre rollos).' },
    { campo: 'Activo', descripcion: 'Toggle. Apagar oculta el material del selector sin borrarlo.' },
    { campo: 'Notas', descripcion: 'Texto libre para observaciones internas.' },
  ]),
  p(' '),
  h4('Crear unidades nuevas sin salir del form'),
  nuevo(
    'Si la unidad que necesitás no está en el dropdown, NO tenés que abrir otra pantalla. Al lado de CADA dropdown ' +
      '(uno para "Unidad de compra" y otro para "Unidad de consumo") hay un botón "+" que abre un modal liviano con ' +
      'los 4 campos esenciales (código, nombre, símbolo, tipo). Al guardar se inyecta en el dropdown que abrió el modal ' +
      'y se selecciona automáticamente. No perdés lo que estabas tipeando.',
  ),
  p(' '),
  ...pruebaSugerida('Cargar un material con unidad nueva inline', [
    'Andá a /materiales → "Nuevo material".',
    'Categoría: TELA. Nombre: "Tela test rollo".',
    'En "Unidad de compra" abrí el dropdown — verificá si está la unidad que necesitás.',
    'Si no, click en el botón "+" al lado del dropdown.',
    'En el modal: código "rollo50", nombre "Rollo 50m", símbolo "rollo", tipo CONJUNTO.',
    'Click "Crear y seleccionar". Verificá que el modal cierra y la unidad nueva quedó seleccionada.',
    'Completá precio y guardá. El material queda creado con la unidad recién definida.',
  ]),
  tip('Para campos avanzados de la unidad (factor de conversión, equivalente SUNAT) andá al CRUD completo en Configuración → Unidades de medida.'),
  ...observacionesBox('Materiales'),
);

// 1.4 Recetas
docContent.push(
  h2('1.4 Recetas (BOM)'),
  p('URL: /recetas o desde el detalle del producto → "Ver receta BOM"'),
  p(' '),
  h4('Para qué sirve'),
  p(
    'La receta o BOM (Bill of Materials) define qué materiales y cuánto consume cada producto, separado por talla. ' +
      'Es la base para: calcular costos, despachar avíos al taller con cada Orden de Servicio, y explosionar materiales en el plan maestro.',
  ),
  p(' '),
  h4('Cómo funciona'),
  bullet('Cada producto tiene UNA receta activa (versión "v1.0", "v2.0"…). Solo una activa a la vez.'),
  bullet('La receta tiene líneas. Cada línea = un material × una talla × cantidad.'),
  bullet('Por línea se define si "sale al taller" (avío que viaja con el corte) o si "queda en almacén" (decoración manual).'),
  bullet('Al crear la receta podés copiarla de otra similar y solo ajustar diferencias.'),
  p(' '),
  h4('Campos por línea'),
  fieldsTable([
    { campo: 'Material', descripcion: 'Buscador. Filtra por código y nombre.', obligatorio: true },
    { campo: 'Talla', descripcion: 'A qué talla aplica (ej. T4 lleva menos tela que T8).', obligatorio: true },
    { campo: 'Cantidad', descripcion: 'En unidades de consumo (metros, gramos…).', obligatorio: true },
    { campo: 'Sale al taller', descripcion: 'Si está ON, esa cantidad viaja con el corte a la OS. Si está OFF, queda en almacén para procesos internos.' },
    { campo: 'Cantidad almacén', descripcion: 'Si parte del material queda en planta (ej. 0.5 m por unidad para decoración), se descuenta del envío al taller.' },
  ]),
  p(' '),
  warn(
    'Sin receta activa NO se puede generar OT desde el plan maestro (lo veremos en Producción). Cargá las recetas primero — al menos una línea por talla planificada.',
  ),
  ...observacionesBox('Recetas (BOM)'),
);

// 1.5 Publicación Web
docContent.push(
  h2('1.5 Publicación Web'),
  p('URL: dentro de cada producto → pestaña "Publicación web", o /web-catalogo'),
  p(' '),
  h4('Para qué sirve'),
  p('Define qué se ve y cómo en la tienda online. Cada producto tiene una entrada de publicación independiente del catálogo interno.'),
  p(' '),
  h4('Campos'),
  fieldsTable([
    { campo: 'Publicado', descripcion: 'Toggle. Si está OFF, el producto no aparece en la web pública.' },
    { campo: 'Título web', descripcion: 'Texto del título en la ficha pública (puede diferir del nombre interno).' },
    { campo: 'Descripción corta', descripcion: 'Aparece en el listado de productos (cards).' },
    { campo: 'Descripción larga', descripcion: 'Texto completo de la ficha. Acepta texto enriquecido.' },
    { campo: 'Slug', descripcion: 'URL amigable. Se autogenera del título y se asegura que sea único.' },
    { campo: 'Precio oferta', descripcion: 'Si está cargado, se muestra el precio tachado y el oferta visible.' },
    { campo: 'Destacado web', descripcion: 'Aparece en sección "Destacados" del home.' },
  ]),
  p(' '),
  h4('Categorías como red de seguridad'),
  p(
    'Las categorías extra del producto sirven para multi-temporada. Si un disfraz "Bruja" está en categoría principal "Halloween" + extra "Horror General", ' +
      'cuando termine Halloween y desactives esa categoría, el producto sigue publicado porque "Horror General" sigue activa. ' +
      'Solo se despublica cuando NINGUNA de sus categorías queda activa.',
  ),
  ...pruebaSugerida('Publicar un producto y rotar campañas', [
    'Andá a un producto → pestaña "Publicación web". Activá el toggle "Publicado". Guardá.',
    'Abrí la web pública en otra pestaña y verificá que el producto aparece.',
    'Asignale una categoría extra al producto (ej. si la principal es Halloween, agregá "Horror").',
    'Andá a /categorias y desactivá la categoría principal.',
    'Volvé a la web — el producto debería SEGUIR visible (porque tiene la extra activa).',
    'Desactivá también la categoría extra. Ahora sí debería desaparecer de la web.',
  ]),
  ...observacionesBox('Publicación Web'),
);

// ====================================================================
// MÓDULO 2: PERSONAS
// ====================================================================

docContent.push(
  h1('Módulo 2 — PERSONAS'),
  p(
    'Acá viven todas las personas y empresas con las que interactúa el negocio: clientes (compradores), ' +
      'proveedores (insumos y servicios), talleres externos (confección) y operarios (planta propia).',
  ),
);

// 2.1 Clientes
docContent.push(
  h2('2.1 Clientes'),
  p('URL: /clientes'),
  p(' '),
  h4('Para qué sirve'),
  p('Padrón de compradores. Soporta personas naturales (DNI / CE / Pasaporte) y empresas (RUC). Define la lista de precios que aplica por defecto.'),
  p(' '),
  h4('Tipos de cliente'),
  bulletBold('PUBLICO_FINAL: ', 'precio público.'),
  bulletBold('MAYORISTA_A / B / C: ', 'tres niveles de precio mayorista (A más caro, C más agresivo).'),
  bulletBold('INDUSTRIAL: ', 'precio para clientes industriales / instituciones.'),
  p(' '),
  h4('Sección "Identificación"'),
  fieldsTable([
    { campo: 'Tipo de documento', descripcion: 'DNI / RUC / CE / Pasaporte.', obligatorio: true },
    { campo: 'Número de documento', descripcion: 'Para DNI y RUC hay autocompletado: tipeás el número y los datos vienen de RENIEC / SUNAT.', obligatorio: true },
    { campo: '(Si es RUC) Razón social', descripcion: 'Se llena con el lookup. Editable.', obligatorio: true },
    { campo: '(Si es RUC) Nombre comercial', descripcion: 'Cómo se conoce comercialmente.' },
    { campo: '(Si es DNI/CE) Nombres', descripcion: 'Se llena con el lookup. Editable.', obligatorio: true },
    { campo: '(Si es DNI/CE) Apellido paterno / materno', descripcion: 'Se llenan con el lookup.' },
    { campo: 'Tipo de cliente', descripcion: 'Define qué lista de precios aplica por defecto: PUBLICO_FINAL / MAYORISTA_A / B / C / INDUSTRIAL.', obligatorio: true },
  ]),
  p(' '),
  h4('Sección "Contacto y dirección"'),
  fieldsTable([
    { campo: 'Email', descripcion: 'Email del cliente.' },
    { campo: 'Teléfono', descripcion: 'Teléfono principal o WhatsApp.' },
    { campo: 'Teléfono secundario', descripcion: 'Opcional, segundo número de contacto.' },
    { campo: 'Descuento por defecto (%)', descripcion: 'Descuento que se aplica automáticamente a este cliente en POS y B2B (encima de la lista de precios).' },
    { campo: 'Dirección', descripcion: 'Dirección de despacho.' },
    { campo: 'Ubigeo', descripcion: 'Código SUNAT de 6 dígitos del distrito. Hay buscador.' },
  ]),
  p(' '),
  h4('Sección "Otros"'),
  fieldsTable([
    { campo: 'Notas internas', descripcion: 'Texto libre con observaciones que solo ve el equipo (no el cliente).' },
    { campo: 'Cliente activo', descripcion: 'Toggle. Apagar oculta el cliente de los selectores sin borrarlo.' },
  ]),
  p(' '),
  ...pruebaSugerida('Crear un cliente con DNI', [
    'Andá a /clientes → "Nuevo cliente".',
    'Tipo de documento: DNI. Tipeá un DNI válido y click "Consultar".',
    'Verificá que se autocompletan nombres, apellidos y dirección.',
    'Tipo de cliente: PUBLICO_FINAL. Guardá.',
    'Verificá que el cliente aparece en el listado.',
  ]),
  ...observacionesBox('Clientes'),
);

// 2.2 Proveedores
docContent.push(
  h2('2.2 Proveedores'),
  p('URL: /proveedores'),
  p(' '),
  h4('Para qué sirve'),
  p('Padrón de proveedores: a quién le compramos materiales o servicios. Mismo flujo de identificación con SUNAT que clientes.'),
  p(' '),
  h4('Sección "Identificación"'),
  fieldsTable([
    { campo: 'Tipo', descripcion: 'RUC / DNI / CE. Default RUC.' },
    { campo: 'Número (RUC/DNI/CE)', descripcion: 'Botón "Consultar" trae datos de SUNAT/RENIEC y autocompleta razón social y dirección.', obligatorio: true },
    { campo: 'Razón social', descripcion: 'Se llena con el lookup. Editable.', obligatorio: true },
    { campo: 'Nombre comercial', descripcion: 'Cómo lo conoce todo el mundo (puede diferir de la razón social).' },
  ]),
  p(' '),
  h4('Sección "Dirección y contacto"'),
  fieldsTable([
    { campo: 'Dirección', descripcion: 'Se llena con el lookup. Editable.' },
    { campo: 'Ubigeo', descripcion: 'Distrito SUNAT (6 dígitos). Hay buscador.' },
    { campo: 'Teléfono', descripcion: 'Teléfono fijo o WhatsApp del proveedor.' },
    { campo: 'Email', descripcion: 'Email institucional.' },
    { campo: 'Contacto (persona)', descripcion: 'Nombre del referente con quien tratás directamente.' },
    { campo: 'Tel. del contacto', descripcion: 'WhatsApp directo del referente.' },
  ]),
  p(' '),
  h4('Sección "Términos comerciales"'),
  fieldsTable([
    { campo: 'Días de pago', descripcion: 'Plazo default de pago. 0 = al contado, 30 = a 30 días, etc.' },
    { campo: 'Moneda', descripcion: 'PEN o USD. Define en qué moneda se cargan las OCs por default.' },
  ]),
  p(' '),
  h4('Sección "Otros"'),
  fieldsTable([
    { campo: 'Notas', descripcion: 'Texto libre con observaciones internas.' },
    { campo: 'Es proveedor de importación', descripcion: 'Toggle. Marca si las compras suelen venir de importación (afecta el flujo de Importaciones en /compras).' },
    { campo: 'Activo', descripcion: 'Toggle. Apagar oculta el proveedor del selector sin borrarlo.' },
  ]),
  p(' '),
  note(
    'Si necesitás cargar bancos, CCI o materiales preferidos asociados al proveedor, eso se hace en otras pantallas: la cuenta bancaria al pagar al taller (en /talleres/[id]/pagos), y los materiales que provee se asignan desde el form de cada material (campo "Proveedor preferido"). El form del proveedor en sí solo cubre identificación, contacto y términos comerciales.',
  ),
  ...observacionesBox('Proveedores'),
);

// 2.3 Talleres
docContent.push(
  h2('2.3 Talleres'),
  p('URL: /talleres'),
  p(' '),
  h4('Para qué sirve'),
  p('Padrón de talleres externos (costureras, bordadoras, estampadoras…) a quienes mandás corte para que produzcan. Cada uno con sus especialidades, datos de pago y calificación.'),
  nuevo('El código del taller se autogenera (TAL-001, TAL-002…). Si lo dejás vacío al crear, el sistema lo asigna solo.'),
  p(' '),
  h4('Sección "Identificación"'),
  fieldsTable([
    { campo: 'Código', descripcion: 'TAL-NNN. Auto si lo dejás vacío. Editable.' },
    { campo: 'Tipo doc', descripcion: 'RUC / DNI / CE. Opcional si el taller no formaliza.' },
    { campo: 'Número doc', descripcion: 'Con botón Consultar: si es RUC, lookup SUNAT autocompleta razón social y dirección.' },
    { campo: 'Nombre', descripcion: 'Ej. "Taller de Doña Rosa". Se llena con el lookup si hay RUC, pero podés poner cualquier nombre.', obligatorio: true },
  ]),
  p(' '),
  h4('Sección "Especialidades"'),
  bullet('Checkboxes para los 10 procesos posibles: COSTURA, CORTE, BORDADO, ESTAMPADO, SUBLIMADO, PLISADO, DECORADO, ACABADO, PLANCHADO, OJAL_BOTON.'),
  bullet('Marcá todas las que aplican. Esto filtra el taller en los selectores al crear una OS por proceso (ej. al elegir taller para BORDADO, solo aparecen los que tienen esa especialidad marcada).'),
  p(' '),
  h4('Sección "Contacto y dirección"'),
  fieldsTable([
    { campo: 'Dirección', descripcion: 'Dirección física del taller.' },
    { campo: 'Ubigeo', descripcion: 'Distrito SUNAT (6 dígitos). Hay buscador.' },
    { campo: 'Teléfono', descripcion: 'Teléfono o WhatsApp del taller.' },
    { campo: 'Contacto', descripcion: 'Nombre del referente con quien tratás directamente.' },
    { campo: 'Calificación (0-5)', descripcion: 'Tipo número con paso 0.1. Solo informativa, te ayuda a priorizar talleres confiables.' },
  ]),
  p(' '),
  h4('Sección "Pagos"'),
  fieldsTable([
    { campo: 'Banco', descripcion: 'Dropdown con bancos peruanos (BCP, BBVA, Interbank, Scotiabank, BanBif, Banco de la Nación, Mibanco, Pichincha, GNB, Yape, Plin, Otro). Donde se le deposita al taller.' },
    { campo: 'Número de cuenta / CCI', descripcion: 'Cuenta o CCI. Placeholder de ejemplo: "191-12345678901-2-34 o CCI 002 191…".' },
    { campo: 'Notas', descripcion: 'Observaciones internas (ej. "tiene 2 cuentas, depositar martes").' },
    { campo: 'Emite comprobante (RUC)', descripcion: 'Toggle. Si está ON, el taller te factura; si está OFF, es trabajo informal y se manejan recibos internos.' },
    { campo: 'Activo', descripcion: 'Toggle. Apagar oculta el taller del selector pero conserva el histórico.' },
  ]),
  p(' '),
  h4('Acciones por taller (botones en el header del detalle)'),
  bulletBold('Tarifas (/talleres/[id]/tarifas): ', 'pantalla de OVERRIDES. Solo cargá acá tarifas si ESTE taller específico cobra distinto a la tarifa estándar (Configuración → Tarifas de servicios). El sistema usa el override si existe, sino cae a la tarifa central.'),
  bulletBold('Pagos (/talleres/[id]/pagos): ', 'registro y liquidación de pagos al taller. Listado de OS pendientes de pago + pagos hechos. Podés registrar un pago nuevo (efectivo, transferencia, Yape, Plin) y eliminar un pago si te equivocaste.'),
  bulletBold('Desactivar: ', 'soft-delete. El taller se oculta del selector pero el histórico se conserva.'),
  p(' '),
  h4('Pagos al taller — flujo'),
  step(1, 'Andá al detalle del taller → botón "Ver pagos".'),
  step(2, 'Arriba ves un resumen: total facturado por OS, total pagado, saldo pendiente.'),
  step(3, 'Para registrar un pago: click "Nuevo pago". Elegí monto, método, fecha y notas opcionales.'),
  step(4, 'Para vincular el pago a una OS específica: lo elegís del listado de OS pendientes.'),
  step(5, 'Si te equivocaste, podés eliminar un pago con el ícono papelera (revierte el saldo).'),
  ...pruebaSugerida('Crear un taller con auto-código', [
    'Andá a /talleres → "Nuevo taller".',
    'Dejá Código vacío. Verificá que el placeholder dice "Se autogenera".',
    'Tipo doc: RUC. Tipeá un RUC válido y consultá. Verificá que el nombre se autocompleta.',
    'Marcá las especialidades (ej. COSTURA + ACABADO).',
    'Cargá banco y número de cuenta.',
    'Guardá. Verificá que el código asignado fue TAL-NNN consecutivo.',
  ]),
  ...observacionesBox('Talleres'),
);

// 2.4 Operarios — REESCRITO COMPLETO
docContent.push(
  h2('2.4 Operarios'),
  p('URL: /operarios'),
  p(' '),
  nuevo('Esta pantalla es prácticamente nueva. Antes era solo lectura (no había forma de cargar operarios desde la UI). Ahora tiene CRUD completo con DNI lookup automático, tipo de operario, modalidad de contrato y jornada (estándar o personalizada).'),
  p(' '),
  h4('Para qué sirve'),
  p(
    'Padrón del personal de planta propia: cortadores, costureras, ayudantes, supervisores, decoradores. Se usa para asignar responsables de corte, ' +
      'registrar quién hizo cada proceso, controlar tiempos y costear.',
  ),
  p(' '),
  h4('Crear un operario — flujo nuevo'),
  step(1, 'Click en "Nuevo operario".'),
  step(2, 'Tipeá el DNI y click "Consultar". RENIEC autocompleta nombres + apellidos.'),
  step(3, 'Elegí el tipo de operario (categoría laboral).'),
  step(4, 'Elegí el área de producción (corte, costura, acabado…).'),
  step(5, 'Modalidad de contrato: planilla / destajo / mixto / honorarios. Según elijas, aparecen los campos de sueldo y/o tarifa.'),
  step(6, 'Jornada: por defecto usa la estándar (08:00 – 17:00 L–S). Si este operario tiene un horario distinto, activá el toggle "Jornada personalizada" y definí entrada/salida y días.'),
  p(' '),
  h4('Sección "Identificación"'),
  fieldsTable([
    { campo: 'Código', descripcion: 'OP-NNN. Auto si lo dejás vacío. Editable.' },
    { campo: 'DNI', descripcion: 'Botón "Consultar" trae datos de RENIEC. Recomendado.', obligatorio: true },
    { campo: 'Nombres', descripcion: 'Se llena con el lookup. Editable.', obligatorio: true },
    { campo: 'Apellido paterno', descripcion: 'Se llena con el lookup.' },
    { campo: 'Apellido materno', descripcion: 'Se llena con el lookup.' },
  ]),
  p(' '),
  h4('Sección "Categoría y área"'),
  fieldsTable([
    { campo: 'Tipo de operario', descripcion: 'OPERARIO / AYUDANTE / SUPERVISOR / JEFE_AREA / ADMINISTRATIVO / SERVICIO (limpieza, comedor).', obligatorio: true },
    { campo: 'Área de producción', descripcion: 'A qué área pertenece (corte, costura, acabado…). Sirve para tarifa por minuto al costear.' },
  ]),
  p(' '),
  h4('Sección "Modalidad de trabajo"'),
  fieldsTable([
    { campo: 'Tipo de contrato', descripcion: 'PLANILLA: sueldo mensual. DESTAJO: por unidad producida. MIXTO: ambos. HONORARIOS: recibo por honorarios (RH).' },
    { campo: 'Fecha de ingreso', descripcion: 'Cuándo empezó a trabajar. Default: hoy.' },
    { campo: 'Sueldo base (S/)', descripcion: 'Solo aparece si el contrato es PLANILLA o MIXTO.' },
    { campo: 'Tarifa destajo (S/ por unidad)', descripcion: 'Solo aparece si el contrato es DESTAJO o MIXTO.' },
  ]),
  p(' '),
  h4('Sección "Jornada de trabajo"'),
  fieldsTable([
    { campo: 'Jornada personalizada', descripcion: 'Toggle. Si está OFF usa la jornada estándar global. Si está ON, abre los campos de horario propio.' },
    { campo: 'Hora de entrada', descripcion: 'Solo si la jornada es personalizada (type time, ej. 06:00 para turno mañana).' },
    { campo: 'Hora de salida', descripcion: 'Solo si la jornada es personalizada (type time, ej. 14:00).' },
    { campo: 'Días laborables', descripcion: 'Chips L M X J V S D. Solo si la jornada es personalizada. Click para activar/desactivar cada día.' },
  ]),
  p(' '),
  h4('Sección "Contacto y notas"'),
  fieldsTable([
    { campo: 'Teléfono', descripcion: 'Teléfono o WhatsApp del operario.' },
    { campo: 'Email', descripcion: 'Email del operario.' },
    { campo: 'Notas internas', descripcion: 'Texto libre para observaciones del equipo.' },
    { campo: 'Operario activo', descripcion: 'Toggle. Apagar registra fecha de salida automáticamente y oculta el operario del selector (soft-delete, conserva histórico).' },
  ]),
  p(' '),
  h4('Jornada estándar global'),
  p('Por defecto: 08:00 – 17:00, lunes a sábado. Configurable globalmente desde la tabla "configuracion" (claves jornada_estandar_inicio / fin / dias).'),
  p(' '),
  h4('Listado de operarios'),
  bullet('Filtros: vista activos / inactivos / todos.'),
  bullet('Cada fila: código, nombre, DNI, tipo (badge), área, contrato (badge), jornada (estándar o "06:00–14:00" si es personalizada), estado.'),
  bullet('Click en el nombre o el lápiz para editar. Click en la papelera para desactivar (soft-delete con fecha de salida).'),
  p(' '),
  ...pruebaSugerida('Cargar dos operarios con jornadas distintas', [
    'Andá a /operarios → "Nuevo operario".',
    'Tipeá un DNI válido y click Consultar. Verificá autocompletado.',
    'Tipo: OPERARIO. Área: COSTURA. Contrato: PLANILLA → Sueldo S/ 1025.',
    'Dejá la jornada estándar (sin tocar el toggle). Guardá.',
    'Crea otro operario con jornada PERSONALIZADA: 06:00 – 14:00, días L–V (sin sábado).',
    'Volvé a /operarios y verificá que la columna "Jornada" muestra "Estándar" para uno y "06:00–14:00" para el otro.',
  ]),
  ...observacionesBox('Operarios'),
);

// ====================================================================
// MÓDULO 3: CONFIGURACIÓN (NUEVO)
// ====================================================================

docContent.push(
  h1('Módulo 3 — CONFIGURACIÓN'),
  p('URL: /configuracion'),
  p(' '),
  nuevo('Este módulo no se documentó en la versión anterior. Acá viven los catálogos auxiliares y los parámetros globales del sistema.'),
  p(' '),
  h3('Qué incluye'),
  bulletBold('Unidades de medida: ', 'kg, m, rollo, unidad… Las que se usan en materiales y recetas.'),
  bulletBold('Tarifas de servicios: ', 'tarifa CENTRAL de pago a talleres por proceso × producto × talla. Una sola entrada vale para todos los talleres.'),
  bulletBold('Áreas de producción: ', 'corte, costura, decorado, acabado… Con tarifa por minuto para costeo.'),
  bulletBold('SUNAT: ', 'series de comprobantes, datos de emisión.'),
  bulletBold('Datos de empresa: ', 'razón social, RUC, dirección, IGV.'),
  bulletBold('Parámetros globales: ', 'jornada estándar, moneda base, WhatsApp, etc.'),
);

// 3.1 Tarifas de servicios (NUEVO)
docContent.push(
  h2('3.1 Tarifas de servicios (NUEVA)'),
  p('URL: /configuracion/tarifas-servicios'),
  p(' '),
  nuevo('Esta pantalla es nueva. Antes la tarifa de pago a un taller se cargaba dentro del taller (pestaña "Tarifas"). Eso obligaba a re-cargar la misma tarifa para cada taller. Ahora hay una tarifa CENTRAL: una sola entrada por proceso × producto × talla vale para todos los talleres.'),
  p(' '),
  h4('Cómo funciona la cascada'),
  p('Cuando el sistema calcula el monto sugerido de una OS, busca la tarifa más específica en este orden:'),
  step(1, 'Override del taller (en /talleres/[id]/tarifas): si ese taller específico cobra distinto al estándar, gana.'),
  step(2, 'Tarifa central de servicios (esta pantalla): la estándar para todos los talleres.'),
  p(' '),
  h4('Cómo cargar tarifas'),
  bullet('Click "Nueva tarifa".'),
  bullet('Proceso (opcional): TRAZADO / TENDIDO / CORTE / HABILITADO / COSTURA / BORDADO / ESTAMPADO / SUBLIMADO / PLISADO / ACABADO / PLANCHADO / OJAL_BOTON / CONTROL_CALIDAD / EMBALAJE / DECORADO. Vacío = "Cualquier proceso".'),
  bullet('Talla (opcional): T0…T16, TS, TAD. Vacío = "Cualquier talla".'),
  bullet('Producto (opcional): combobox con búsqueda. Vacío = "Cualquier producto".'),
  bullet('Tarifa por unidad (S/): el monto en soles que paga la empresa al taller por cada prenda.'),
  bullet('Notas (opcional): observación interna sobre la tarifa (ej. "incluye plancha. Vigente Q2 2026").'),
  p(' '),
  tip('Empezá con tarifas amplias (ej. "COSTURA = S/ 4.50 para todos los productos y tallas") y agregá excepciones después.'),
  p(' '),
  h4('Cuándo usar override por taller'),
  warn(
    'La pantalla de tarifas de cada taller (/talleres/[id]/tarifas) es solo para casos donde un taller cobra distinto a la tarifa central. ' +
      'No cargues ahí lo que ya está en la tarifa central. La pantalla del taller te muestra una alerta amber recordándote esto.',
  ),
  ...pruebaSugerida('Cargar la tarifa central y un override', [
    'Andá a /configuracion/tarifas-servicios → "Nueva tarifa".',
    'Proceso: COSTURA. Producto: vacío. Talla: vacío. Precio: S/ 4.50.',
    'Guardá. Esta tarifa vale para TODOS los talleres y productos.',
    'Andá a un taller específico → /talleres/[id]/tarifas.',
    'Cargá un override: COSTURA, mismo producto vacío, talla vacía, precio S/ 5.20.',
    'Creá una OS con ese taller. El monto sugerido debería usar S/ 5.20 (override) en lugar de S/ 4.50.',
    'Creá una OS con OTRO taller (sin override). El monto sugerido debería usar S/ 4.50 (la central).',
  ]),
  ...observacionesBox('Tarifas de servicios'),
);

// 3.2 Áreas de producción
docContent.push(
  h2('3.2 Áreas de producción'),
  p('URL: /configuracion/areas'),
  p(' '),
  h4('Para qué sirve'),
  p('Catálogo de áreas internas de planta (corte, costura, decorado, acabado…). Se usa para asignar operarios a áreas y para costeo (tarifa por minuto).'),
  p(' '),
  h4('Campos'),
  fieldsTable([
    { campo: 'Nombre', descripcion: 'Ej. CORTE, COSTURA, DECORADO, ACABADO.', obligatorio: true },
    { campo: 'Código', descripcion: 'Identificador corto. Auto si lo dejás vacío.' },
    { campo: 'Tarifa por minuto', descripcion: 'Cuánto cuesta 1 minuto de trabajo en esa área. Se usa para costear el ticket de operación.' },
    { campo: 'Activa', descripcion: 'Toggle.' },
  ]),
  ...observacionesBox('Áreas de producción'),
);

// 3.3 Unidades de medida
docContent.push(
  h2('3.3 Unidades de medida'),
  p('URL: /configuracion/unidades'),
  p(' '),
  h4('Para qué sirve'),
  p('Catálogo de unidades para materiales: kg, m, cm, rollo, unidad, etc. Se usan en compra y consumo.'),
  p(' '),
  tip('Recordá: desde el form de material podés crear unidades nuevas con el botón "+" sin venir acá. Esta pantalla es para gestión avanzada (factor de conversión, código SUNAT).'),
  p(' '),
  h4('Campos'),
  fieldsTable([
    { campo: 'Código', descripcion: 'Identificador único en minúsculas (kg, m, rollo50…).', obligatorio: true },
    { campo: 'Nombre', descripcion: 'Nombre completo (Kilogramo, Metro).', obligatorio: true },
    { campo: 'Símbolo', descripcion: 'Símbolo corto para mostrar (kg, m, rollo).' },
    { campo: 'Tipo', descripcion: 'LONGITUD / PESO / VOLUMEN / UNIDAD / CONJUNTO.' },
    { campo: 'Código SUNAT', descripcion: 'Para emisión electrónica (MTR, KGM, NIU…).' },
    { campo: 'Factor de conversión', descripcion: 'Si la unidad se descompone en otra (ej. rollo de 50 m → factor=50, unidad base=m).' },
    { campo: 'Unidad base', descripcion: 'A qué unidad se convierte (en el ejemplo del rollo: "m").' },
    { campo: 'Activa', descripcion: 'Toggle. Desactivar la oculta de los selectores sin romper materiales viejos.' },
  ]),
  p(' '),
  warn('No se puede ELIMINAR una unidad si ya está usada por algún material. En ese caso, desactivala con el toggle.'),
  ...observacionesBox('Configuración'),
);

// ====================================================================
// MÓDULO 4: PRODUCCIÓN
// ====================================================================

docContent.push(
  h1('Módulo 4 — PRODUCCIÓN'),
  p(
    'El corazón operativo: planificás, generás órdenes de trabajo, cortás telas, mandás a coser, recibís y liquidás. ' +
      'Todo conectado: lo que pasa en una pantalla se refleja en la siguiente.',
  ),
  p(' '),
  h3('Flujo end-to-end (resumen)'),
  step(1, 'Plan Maestro: definís qué producir esta semana (productos × tallas × cantidades).'),
  step(2, 'Generás OTs (una por modelo) desde el plan aprobado.'),
  step(3, 'Por cada OT abrís Cortes (una orden de corte por evento de tendido). Cargás cantidades reales.'),
  step(4, 'Cerrás el corte y desde ahí generás Órdenes de Servicio (OS) hacia el taller que va a coser.'),
  step(5, 'La OS lleva las prendas + los avíos del BOM al taller. El taller produce.'),
  step(6, 'Registrás procesos y tiempos en la OS (quién hizo qué etapa, cuánto tardó).'),
  step(7, 'Recibís las prendas terminadas y cerrás la OS. Se liquida el pago al taller.'),
);

// 4.1 Plan Maestro (con NOVEDADES)
docContent.push(
  h2('4.1 Plan Maestro'),
  p('URL: /plan-maestro'),
  p(' '),
  h4('Para qué sirve'),
  p(
    'Definís la producción de una semana. Es la cabecera donde agrupás todos los productos × tallas × cantidades que querés producir. ' +
      'Una vez aprobado, el sistema genera automáticamente una OT por cada producto.',
  ),
  p(' '),
  h4('Estados del plan'),
  bullet('BORRADOR: editable. Podés agregar y borrar líneas libremente.'),
  bullet('APROBADO: bloqueado, listo para generar OTs.'),
  bullet('EN_EJECUCION: ya se generaron las OTs. No se vuelve atrás.'),
  bullet('COMPLETADO / CANCELADO: estados finales.'),
  p(' '),
  h4('Crear y agregar líneas'),
  step(1, 'Click "Nuevo plan". Definís fecha de inicio y fin (semana).'),
  step(2, 'Dentro del plan: "Agregar líneas".'),
  step(3, 'Buscá un producto. Aparece el selector de tallas (chips T0, T2, T4…).'),
  step(4, 'Click en una talla para incluirla. Cargá la cantidad para cada talla seleccionada.'),
  step(5, 'Asigná prioridad (default 100, menor número = más prioritario).'),
  step(6, 'Click "Agregar líneas".'),
  p(' '),
  nuevo('Las cantidades arrancan VACÍAS, ya no en 50. Si querés llenar todas con el mismo número de un click usá el botón "Aplicar X a todas". Si dejás alguna talla sin cantidad, sale un toast claro: "Falta cantidad en talla(s): 2, 6".'),
  p(' '),
  h4('Aprobar el plan'),
  bullet('Click "Aprobar plan" cuando todas las líneas estén OK.'),
  bullet('Tiene que haber al menos 1 línea para poder aprobar.'),
  bullet('Una vez aprobado no se editan líneas. Solo se generan OTs.'),
  p(' '),
  h4('Generar OTs'),
  nuevo(
    'El sistema bloquea generar OTs si algún producto × talla del plan NO TIENE receta activa. El botón "Generar OTs" se deshabilita y muestra ' +
      '"Generar OTs (faltan N recetas)". El error te lista qué productos × tallas faltan para que vayas a /recetas a cargar lo que falta.',
  ),
  bullet('Antes podías generar OTs igual y la explosión de materiales venía vacía — confuso.'),
  bullet('Ahora el bloqueo es preventivo, claro y reversible (cargás la receta y volvés a apretar el botón).'),
  p(' '),
  h4('Pestañas dentro del plan'),
  bulletBold('Líneas: ', 'el editor de productos × tallas × cantidades.'),
  bulletBold('Explosión materiales: ', 'lista los materiales totales que se necesitan para todo el plan, según las recetas. Avisa qué líneas no tienen receta.'),
  bulletBold('OTs: ', 'una vez aprobado, lista las OTs generadas con su estado.'),
  p(' '),
  ...pruebaSugerida('Plan completo de punta a punta', [
    'Asegurate de que al menos 2 productos tengan receta activa (con líneas en las tallas que vas a planificar).',
    'Andá a /plan-maestro → "Nuevo plan". Fecha inicio: hoy. Fecha fin: en 7 días. Guardá.',
    'Click "Agregar líneas". Buscá un producto, marcá tallas T2 y T4, cantidades 50 y 30. Agregá.',
    'Sumá un segundo producto del cual SÍ tenés receta completa. Cargá tallas con cantidades.',
    'Andá a la pestaña "Explosión materiales" — verificá que aparece la lista de materiales totales.',
    'Click "Aprobar plan".',
    'Click "Generar OTs". Verificá que aparece el toast "N OT(s) generadas" y la pestaña OTs se llena.',
    'Probá a posta: agregá un producto SIN receta, intentá generar OTs. El botón debería deshabilitarse y mostrar "(faltan N recetas)".',
  ]),
  ...observacionesBox('Plan Maestro'),
);

// 4.2 OT
docContent.push(
  h2('4.2 Órdenes de Trabajo (OT)'),
  p('URL: /ot'),
  p(' '),
  h4('Para qué sirve'),
  p('Cada OT representa la producción de UN modelo (con todas sus tallas) dentro de un plan. Es la unidad de trabajo principal: corte, costura, acabado giran alrededor de la OT.'),
  p(' '),
  h4('Estados'),
  bullet('BORRADOR: la OT existe pero no fue activada.'),
  bullet('PLANIFICADA: lista para producir, generada desde el plan maestro.'),
  bullet('EN_CORTE: ya se inició al menos un corte para esta OT.'),
  bullet('EN_HABILITADO: el corte está terminado y los avíos se están preparando para el taller.'),
  bullet('EN_SERVICIO: la OT está con un taller externo (cosiendo, bordando…).'),
  bullet('EN_DECORADO: las prendas volvieron del taller y están en decoración interna.'),
  bullet('EN_CONTROL_CALIDAD: revisión final antes de pasar a inventario.'),
  bullet('COMPLETADA: producción cerrada, prendas en stock.'),
  bullet('CANCELADA: OT descartada en cualquier momento.'),
  p(' '),
  h4('Pestañas dentro de la OT'),
  bulletBold('Líneas / Producción: ', 'avance por talla — cuánto está planificado, cortado, fallado, terminado.'),
  bulletBold('Bitácora: ', 'timeline de eventos (cambios de estado, anomalías, observaciones).'),
  p(' '),
  h4('Acciones por OT'),
  bullet('Botón "EN CORTE" en el header: cambia el estado.'),
  bullet('Botón "CANCELADA" en el header: si querés tirar la OT.'),
  bullet('Declarar terminado por talla: en la columna "Declarar" de cada línea, click "Editar" para registrar cuántas unidades terminaste.'),
  ...observacionesBox('Órdenes de Trabajo'),
);

// 4.3 Corte (con NOVEDADES)
docContent.push(
  h2('4.3 Corte'),
  p('URL: /corte'),
  p(' '),
  h4('Para qué sirve'),
  p('Cada orden de corte es UN evento de tendido y cortado: un modelo, varias tallas, X capas, Y metros consumidos. Una OT puede tener varios cortes (si el modelo se corta en diferentes batches).'),
  p(' '),
  nuevo('El form de Nuevo corte cambió fuerte: ya no te pide elegir el modelo (lo deduce de la OT). La cantidad teórica por talla se autocompleta con el saldo del plan. La merma se carga UNA vez a nivel cabecera (en metros), no por talla.'),
  p(' '),
  h4('Crear un corte — flujo nuevo'),
  step(1, 'Click "Nueva orden de corte".'),
  step(2, 'Elegí la OT. Debajo aparece automáticamente un panel "Modelo: ABEJITA2" (auto-derivado de la OT, no es un dropdown).'),
  step(3, 'Si la OT tuviera por error varios productos planificados, aparece un picker filtrado solo a esos productos.'),
  step(4, 'Cargá responsable (operario), capas tendidas, metros consumidos y MERMA EN METROS (a nivel cabecera).'),
  step(5, 'Guardá. Vas a la pantalla de detalle del corte.'),
  p(' '),
  h4('Cargar líneas por talla'),
  step(1, 'Click "Agregar talla".'),
  step(2, 'El dropdown de talla muestra solo las tallas que están en el plan de la OT (no las 11 tallas posibles del enum).'),
  step(3, 'La cantidad teórica se llena automáticamente con el SALDO del plan: planificada – ya cortado en otros cortes de la misma OT.'),
  step(4, 'Si querés override, editá la cantidad teórica.'),
  step(5, 'Cargá cantidad real (cuánto efectivamente salió del corte).'),
  step(6, 'Guardá. La diferencia (real – teórica) se calcula sola.'),
  p(' '),
  h4('Estados del corte'),
  bullet('ABIERTO: editable.'),
  bullet('COMPLETADO: cerrado. Sincroniza ot_lineas.cantidad_cortada con la OT padre. Listo para generar OS al taller.'),
  bullet('ANULADO: tirado.'),
  p(' '),
  h4('Cerrar el corte'),
  bullet('Click "Cerrar corte" en el header. Después no se pueden agregar más tallas.'),
  bullet('La operación es ATÓMICA: actualiza ot_lineas Y marca el corte completado en una sola transacción.'),
  bullet('Si algo falla, ROLLBACK total — ninguna línea queda actualizada parcial.'),
  p(' '),
  h4('Generar OS desde un corte cerrado'),
  bullet('En el detalle del corte, una vez COMPLETADO, aparece el botón "Generar Orden de Servicio".'),
  bullet('Elegís taller, proceso, y se prepoblan automáticamente: las prendas (líneas de la OS = tallas del corte con cantidad_real) y los avíos del BOM (con descuento de cantidad_almacen).'),
  bullet('Podés DIVIDIR un corte: en la pantalla de Nueva OS, los chips de talla se desmarcan para mandar solo algunas a un taller y crear OTRA OS con las restantes.'),
  p(' '),
  ...pruebaSugerida('Corte y OS de punta a punta', [
    'Tomá una OT en estado PLANIFICADA generada en el paso anterior.',
    'Andá a /corte → "Nueva orden de corte".',
    'Elegí la OT. Verificá que aparece el modelo auto-derivado.',
    'Cargá metros consumidos (ej. 20.00), merma metros (ej. 1.50), capas (ej. 7).',
    'Guardá. Ahora vas al detalle.',
    'Click "Agregar talla". Dropdown debería tener SOLO las tallas planificadas en la OT.',
    'Verificá que la cantidad teórica viene precargada con el saldo. Editá la cantidad real.',
    'Agregá una segunda talla. Cerrá el corte.',
    'Click "Generar Orden de Servicio". Elegí un taller. Verificá que las tallas y avíos se prepueblan.',
  ]),
  ...observacionesBox('Corte'),
);

// 4.4 OS (con NOVEDADES)
docContent.push(
  h2('4.4 Órdenes de Servicio (OS)'),
  p('URL: /servicios'),
  p(' '),
  h4('Para qué sirve'),
  p(
    'Cada OS es un envío de trabajo a un taller externo. Lleva las prendas a coser/bordar/decorar y los avíos del BOM (botones, encajes, etiquetas). ' +
      'Cuando el taller devuelve, registrás recepciones y liquidás el pago.',
  ),
  p(' '),
  nuevo('Dos cambios fuertes en esta versión: (1) los adicionales de movilidad y campaña ahora se cargan POR UNIDAD enviada (no como total), y (2) hay una sección nueva "Procesos / tiempos" para registrar quién hizo cada etapa, cuándo y por cuánto tiempo.'),
  p(' '),
  h4('Crear una OS desde un corte'),
  step(1, 'Andá a /servicios → "Nueva OS" o desde el detalle de un corte completado, click "Generar Orden de Servicio".'),
  step(2, 'Elegí el corte. Las prendas y avíos se prepueblan automáticamente.'),
  step(3, 'Marcá / desmarcá las tallas que vas a enviar. Las desmarcadas quedan disponibles para crear OTRA OS (división).'),
  step(4, 'Elegí el taller. Si tiene tarifas configuradas, el sistema sugiere el monto base (calcula tras un debounce de ~600 ms cuando cambia el taller, proceso o las tallas).'),
  step(5, 'Elegí el proceso (COSTURA, BORDADO, ESTAMPADO, SUBLIMADO, PLISADO, DECORADO, ACABADO, PLANCHADO, OJAL_BOTON).'),
  step(6, 'Si la OS es de campaña, activá el toggle "Es campaña" (queda registrado para diferenciar pagos en reportes).'),
  step(7, 'Cargá adicionales POR UNIDAD: movilidad y campaña.'),
  step(8, 'Guardá. El sistema muestra el toast "OS creada · N líneas y M avíos cargados desde el corte" y te lleva al detalle de la OS.'),
  p(' '),
  h4('Adicionales por unidad — cómo funciona'),
  nuevo(
    'Antes ingresabas "Movilidad: S/ 5.00" como un total fijo. Ahora ingresás "S/ 0.10 por unidad" y el sistema multiplica por las unidades efectivamente enviadas. ' +
      'El hint debajo del campo te muestra en vivo: "Total movilidad ≈ S/ 2.00 (20 unid)" mientras tipeás. ' +
      'El detalle de la OS desglosa: "Movilidad (S/ 0.10 × 20 unid) = S/ 2.00".',
  ),
  bulletBold('Pago base: ', 'sigue como antes — total acordado al taller (o sugerido por las tarifas).'),
  bulletBold('Movilidad por unidad: ', 'S/ por prenda enviada. Total = unidad × cantidad.'),
  bulletBold('Campaña por unidad: ', 'S/ extra por prenda si es campaña. Total = unidad × cantidad.'),
  p(' '),
  h4('Estados de la OS'),
  bullet('EMITIDA: creada, no despachada todavía.'),
  bullet('DESPACHADA: las prendas y avíos ya se entregaron al taller.'),
  bullet('EN_PROCESO: el taller está trabajando.'),
  bullet('RECEPCIONADA: las prendas volvieron del taller.'),
  bullet('CERRADA: liquidación completa.'),
  bullet('ANULADA: tirada en cualquier momento.'),
  p(' '),
  h4('Botones de transición'),
  bullet('Solo se muestran las transiciones permitidas según el estado actual. Si no aparece un botón, es porque no es válido desde donde estás.'),
  p(' '),
  h4('Sección "Procesos / tiempos" — NUEVA'),
  nuevo('Acá registrás cada etapa del trabajo en taller con tiempos y responsables. Sirve para costear, trazar y controlar.'),
  step(1, 'Click "Iniciar proceso".'),
  step(2, 'Proceso: por defecto el de la OS (ej. COSTURA). Editable.'),
  step(3, 'Operario: quién está ejecutando.'),
  step(4, 'Área: para tarifa por minuto (opcional).'),
  step(5, 'Cantidad: unidades trabajadas en esta sesión (default = total OS).'),
  step(6, 'Click "Iniciar". Aparece en la tabla con estado "en curso" (resaltado en amber).'),
  step(7, 'Cuando termine, click "Finalizar" en la fila. Se setea fin = ahora y se calcula la duración automáticamente.'),
  p(' '),
  bullet('Cada fila muestra: proceso, operario, inicio, fin, duración (Xh Ymin), cantidad.'),
  bullet('Podés borrar tickets mal cargados con el ícono papelera.'),
  bullet('Múltiples tickets por OS: si COSTURA + BORDADO + ACABADO se hicieron en distintos momentos, cargás 3 tickets.'),
  p(' '),
  ...pruebaSugerida('Crear una OS y registrar procesos', [
    'Tomá un corte completado y generá una OS.',
    'En la pantalla de Nueva OS: cargá movilidad por unidad S/ 0.10 y campaña por unidad S/ 0.05. Verificá el preview de total.',
    'Guardá. En el detalle de la OS verificá que la card "Pago al taller" desglosa: "Movilidad (S/ 0.10 × N unid) = S/ X.XX".',
    'Cambiá el estado a DESPACHADA → EN_PROCESO.',
    'En la sección Procesos: click "Iniciar proceso". Proceso COSTURA, operario X, cantidad 20. Iniciar.',
    'Esperá unos segundos y click "Finalizar". Verificá que la duración aparece en minutos.',
    'Iniciá un segundo proceso (BORDADO). Dejalo en curso (no finalices). Verificá que aparece como "en curso" con fondo amber.',
  ]),
  ...observacionesBox('Órdenes de Servicio'),
);

// 4.5 Calidad
docContent.push(
  h2('4.5 Control de Calidad'),
  p('URL: /calidad'),
  p(' '),
  h4('Para qué sirve'),
  p('Registro de inspecciones y fallas. Cada falla queda asociada a la OT, talla, motivo y operario responsable. Sirve para identificar patrones (ej. "hay muchas fallas en T8 del modelo X").'),
  bullet('Reporte de fallas por modelo, taller y operario.'),
  bullet('Motivos catalogados: COSTURA_MAL, MANCHA, TALLA_INCORRECTA, etc.'),
  ...observacionesBox('Control de Calidad'),
);

// 4.6 Trazabilidad
docContent.push(
  h2('4.6 Trazabilidad'),
  p('URL: /trazabilidad'),
  p(' '),
  h4('Para qué sirve'),
  p('Vista cronológica de todo lo que le pasó a una OT, un corte o una OS. Línea de tiempo con cambios de estado, eventos, anomalías y notas.'),
  ...observacionesBox('Trazabilidad'),
);

// ====================================================================
// MÓDULO 5: RESTO DEL SISTEMA (sin cambios en V2)
// ====================================================================

docContent.push(
  h1('Módulo 5 — RESTO DEL SISTEMA'),
  p(
    'Estos módulos no tuvieron cambios fuertes en esta versión 2 — siguen funcionando como en la primera entrega. Los listamos acá para que ' +
      'tengas el mapa completo del sistema y puedas probarlos también si querés.',
  ),
  note('Si encontrás bugs o sugerencias en estos módulos, anotalos igual en la sección de observaciones de cada uno. Toda mejora es bienvenida.'),
);

// 5.1 Inventario
docContent.push(
  h2('5.1 Inventario'),
  p(' '),
  h4('Pantallas que incluye'),
  bulletBold('Stock actual (/inventario): ', 'cuánto hay de cada material y producto terminado por almacén. Filtros por categoría y búsqueda.'),
  bulletBold('Kardex (/kardex): ', 'historial de movimientos de cada item (entradas, salidas, traslados). Útil para auditar diferencias.'),
  bulletBold('Traslados (/traslados): ', 'mover stock entre almacenes (ej. de Santa Bárbara a Tienda 1).'),
  bulletBold('Alertas stock bajo (/inventario/alertas): ', 'lista de materiales que están por debajo de su stock mínimo. Sirve para disparar órdenes de compra.'),
  ...observacionesBox('Inventario'),
);

// 5.2 Compras
docContent.push(
  h2('5.2 Compras'),
  p(' '),
  h4('Pantallas que incluye'),
  bulletBold('Órdenes de Compra (/oc): ', 'creación y gestión de OCs a proveedores. Estados: BORRADOR, ENVIADA, RECIBIDA_PARCIAL, COMPLETADA, CANCELADA.'),
  bulletBold('Recepciones (/compras): ', 'cuando el proveedor entrega, registrás la recepción. Actualiza stock automáticamente.'),
  bulletBold('Importaciones (/compras/importaciones): ', 'tracking de importaciones (con DUA, embarques, llegadas).'),
  bulletBold('Cuentas por pagar (/compras/cxp): ', 'qué le debés a cada proveedor. Registro de pagos.'),
  ...observacionesBox('Compras'),
);

// 5.3 Ventas
docContent.push(
  h2('5.3 Ventas'),
  p(' '),
  h4('Pantallas que incluye'),
  bulletBold('Ventas (/ventas): ', 'todas las ventas (POS, web, B2B) en un solo listado. Filtros por canal, cliente, fecha.'),
  bulletBold('POS / Punto de venta (/pos): ', 'pantalla de venta presencial. Buscás producto por código de barras o nombre, agregás al carrito, cobrás (efectivo, tarjeta, Yape, Plin) y emite comprobante SUNAT.'),
  bulletBold('Pedidos Web (/pedidos-web): ', 'pedidos que llegaron desde la tienda online (catálogo público). Gestión de despacho.'),
  bulletBold('Pedidos B2B (/b2b): ', 'pedidos de clientes mayoristas. Aplica precios mayorista A/B/C según el tipo de cliente.'),
  bulletBold('Comprobantes SUNAT (/comprobantes): ', 'boletas, facturas, notas de crédito emitidas. Estado de envío a SUNAT (aceptado / rechazado / pendiente).'),
  ...observacionesBox('Ventas'),
);

// 5.4 Reportes y soporte
docContent.push(
  h2('5.4 Reportes, soporte y administración'),
  p(' '),
  h4('Pantallas que incluye'),
  bulletBold('Reportes (/reportes): ', 'dashboards e informes. Incluye Pagos a talleres (/reportes/pagos-talleres) con totales por mes y proveedor.'),
  bulletBold('Reclamos INDECOPI (/reclamos): ', 'gestión del libro de reclamaciones requerido por ley. Registro y seguimiento.'),
  bulletBold('Usuarios y Roles (/usuarios, solo gerente): ', 'alta de usuarios del sistema y asignación de roles (gerente, jefe_produccion, almacenero, vendedor, cajero, contador, operario).'),
  bulletBold('Configuración SUNAT (/configuracion/sunat): ', 'series de comprobantes, certificados digitales, datos de emisión.'),
  bulletBold('Datos de empresa (/configuracion): ', 'razón social, RUC, dirección fiscal, email, teléfono, IGV %.'),
  ...observacionesBox('Reportes y administración'),
);

// CIERRE
docContent.push(
  h1('Cierre y agradecimientos'),
  p(
    'Llegaste hasta acá: gracias por dedicarle tiempo a probar el sistema. Tus observaciones son lo que hace que el ERP ' +
      'evolucione hacia algo que de verdad te sirva en el día a día.',
  ),
  p(' '),
  h3('Siguiente paso'),
  p('Devolvé este documento (con tus notas) o un email con el resumen al equipo técnico. Vamos a priorizar los puntos según impacto y avanzar.'),
  p(' '),
  h3('¿Necesitás ayuda durante la prueba?'),
  bullet('Si una pantalla no carga o tira un error técnico, anotá la URL y cualquier mensaje que veas. Captura de pantalla si podés.'),
  bullet('Si algo es confuso pero NO está roto, también valió: la usabilidad es tan importante como la funcionalidad.'),
  bullet('Si te falta una función para tu día a día, escribilo aunque sea con una línea en "Tus observaciones".'),
  p(' '),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 480, after: 240 },
    children: [new TextRun({ text: '🎭', size: 48, font: 'Calibri' })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: 'Gracias por tu tiempo y feedback.', size: 28, bold: true, color: COLOR_PRIMARY, italics: true, font: 'Calibri' })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 80 },
    children: [new TextRun({ text: 'Tu mirada hace que este ERP sea mejor.', size: 24, color: COLOR_ACCENT, italics: true, font: 'Calibri' })],
  }),
);

// ==============================
// GENERAR EL DOC
// ==============================

const doc = new Document({
  creator: 'HAPPY SAC',
  title: 'Guía de Pruebas — HAPPY SAC ERP V2',
  description:
    'Guía actualizada para que el cliente pruebe los módulos Catálogo, Personas, Configuración y Producción y deje observaciones.',
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
      properties: { page: { margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 } } },
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
