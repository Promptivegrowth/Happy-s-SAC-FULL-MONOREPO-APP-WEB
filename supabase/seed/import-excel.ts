/**
 * Importador oficial de Excels HAPPY SAC.
 * Procesa los 7 archivos en /documentos excels/ y los sube a Supabase.
 *
 * Orden:
 *  1) PROVEEDORES.xlsx                      → proveedores
 *  2) TALLERES DE CONFECCIÓN.xlsx           → talleres
 *  3) PLANTILLA_RECETAS.xlsx (MATERIALES)   → materiales
 *  4) PLANTILLA_RECETAS.xlsx (RECETAS)      → productos + variantes + recetas + recetas_lineas
 *  5) PLANTILLA_RECETAS.xlsx (COSTOS CONF)  → costos_confeccion
 *  6) KARDEX * .xlsx                        → productos_variantes (stock inicial por almacén)
 *
 * Uso:
 *   pnpm tsx supabase/seed/import-excel.ts
 *
 * Seguro para re-ejecutar (upserts por clave única).
 */

import fs from 'node:fs';
import path from 'node:path';
import xlsx from 'xlsx';
import { sb, log, error, EXCEL_DIR, upsert } from './_env';

// ============================================================
// Helpers de lectura
// ============================================================

function readSheet(file: string, sheet?: string): Record<string, unknown>[] {
  const full = path.resolve(EXCEL_DIR, file);
  if (!fs.existsSync(full)) {
    error(`No existe: ${full}`);
    return [];
  }
  const wb = xlsx.readFile(full, { cellDates: true });
  const name = sheet ?? wb.SheetNames[0]!;
  const ws = wb.Sheets[name];
  if (!ws) {
    error(`Hoja ${name} no existe en ${file}`);
    return [];
  }
  return xlsx.utils.sheet_to_json(ws, { defval: null, raw: true });
}

function readSheetHeader(file: string, sheet: string, headerRow: number): Record<string, unknown>[] {
  const full = path.resolve(EXCEL_DIR, file);
  const wb = xlsx.readFile(full, { cellDates: true });
  const ws = wb.Sheets[sheet];
  if (!ws) return [];
  return xlsx.utils.sheet_to_json(ws, { defval: null, raw: true, range: headerRow });
}

const tallaMap: Record<string, string> = {
  '0': 'T0','2': 'T2','4': 'T4','6': 'T6','8': 'T8',
  '10':'T10','12':'T12','14':'T14','16':'T16',
  'S':'TS','SMALL':'TS','AD':'TAD','ADULTO':'TAD',
};

function parseTalla(raw: string): string | null {
  // viene como "#4", "#AD", "#6", "#14"
  const m = raw?.toString().match(/#?([0-9]+|AD|S|SMALL|ADULTO)\s*$/i);
  if (!m) return null;
  const key = m[1]!.toUpperCase();
  return tallaMap[key] ?? null;
}

function extractModeloYTalla(descripcion: string): { modelo: string; talla: string | null } {
  // ej: "MOANA #6", "BOLIVAR #AD", "PLIN PLINA #4", "ANGELITOS (TÚNICA) #AD"
  const raw = (descripcion ?? '').toString().trim();
  const m = raw.match(/^(.+?)\s*#\s*([0-9]+|AD|S|SMALL|ADULTO)\s*$/i);
  if (m) {
    return { modelo: m[1]!.trim(), talla: tallaMap[m[2]!.toUpperCase()] ?? null };
  }
  return { modelo: raw, talla: null };
}

// ============================================================
// 1) Proveedores
// ============================================================
async function importProveedores() {
  log('==> Importando PROVEEDORES.xlsx');
  const rows = readSheet('PROVEEDORES.xlsx').filter(
    (r) => r['NOMBRE DE LA EMPRESA'] && r['RUC'],
  );

  const data = rows.map((r) => ({
    tipo_documento: (r['RUC'] as string).toString().length === 11 ? 'RUC' : 'DNI',
    numero_documento: (r['RUC'] as string).toString().trim(),
    razon_social: (r['NOMBRE DE LA EMPRESA'] as string).toString().trim(),
    direccion: (r['DIRECCION'] as string)?.toString().trim() ?? null,
    tipo_suministro: ['TELA','AVIOS','INSUMO'],
    activo: true,
  }));
  await upsert('proveedores', data, 'tipo_documento,numero_documento');
}

// ============================================================
// 2) Talleres
// ============================================================
async function importTalleres() {
  log('==> Importando TALLERES DE CONFECCIÓN.xlsx');
  const rows = readSheet('TALLERES DE CONFECCIÓN.xlsx').filter((r) => r['NOMBRE']);

  const data = rows.map((r, i) => ({
    codigo: `TAL-${String(i + 1).padStart(3, '0')}`,
    nombre: (r['NOMBRE'] as string).toString().trim(),
    direccion: (r['DIRECCION'] as string)?.toString().trim() ?? null,
    telefono: (r['CONTACTO'] as string)?.toString().trim() ?? null,
    especialidades: ['COSTURA'],
    emite_comprobante: false,
    activo: true,
  }));
  await upsert('talleres', data, 'codigo');
}

// ============================================================
// 3) Materiales
// ============================================================
async function importMateriales() {
  log('==> Importando materiales (PLANTILLA_RECETAS.xlsx → MATERIALES + CODIGO MAT)');

  // Hoja MATERIALES (tiene CATEGORIA | MATERIALES | UNIDAD DE COMPRA | PRECIO | ...)
  const matsSheet = readSheetHeader('PLANTILLA_RECETAS.xlsx', 'MATERIALES', 2);
  // Hoja CODIGO MAT (CDG_PROD | CDG_LINP | DES_PROD | CDG_PROD)
  const codesSheet = readSheet('PLANTILLA_RECETAS.xlsx', 'CODIGO MAT');

  // Índice: descripción → código
  const descToCode = new Map<string, string>();
  for (const r of codesSheet) {
    const desc = (r['DES_PROD'] as string)?.toString().trim().toUpperCase();
    const cdg = (r['CDG_PROD'] as string)?.toString().trim();
    if (desc && cdg) descToCode.set(desc, cdg);
  }

  const { data: unidades } = await sb.from('unidades_medida').select('id, codigo');
  const unidadByCodigo = new Map((unidades ?? []).map((u) => [u.codigo, u.id]));

  const data = matsSheet
    .filter((r) => r['MATERIALES'] && r['CATEGORIA'])
    .map((r) => {
      const desc = (r['MATERIALES'] as string).toString().trim();
      const cat = (r['CATEGORIA'] as string).toString().trim().toUpperCase();
      const categoria =
        cat === 'TELA' ? 'TELA' :
        cat === 'AVIOS' || cat === 'AVÍOS' ? 'AVIO' :
        cat === 'INSUMOS' ? 'INSUMO' : 'INSUMO';
      const unidadCompra = (r['UNIDAD DE COMPRA'] as string)?.toString().trim().toLowerCase() ?? 'unid';
      const unidadNorm = normalizeUnidad(unidadCompra);

      // Intenta matchear con CODIGO MAT por nombre
      const codigoMatch = descToCode.get(desc.toUpperCase()) ?? generarCodigoMaterial(categoria, desc);

      return {
        codigo: codigoMatch,
        nombre: desc,
        categoria,
        unidad_compra_id: unidadByCodigo.get(unidadNorm) ?? null,
        unidad_consumo_id: unidadByCodigo.get(unidadNorm) ?? null,
        precio_unitario: Number(r['PRECIO'] ?? 0),
        activo: true,
      };
    });

  // Dedup por código (si el Excel tiene duplicados)
  const unique = Array.from(new Map(data.map((d) => [d.codigo, d])).values());
  await upsert('materiales', unique, 'codigo');
}

function normalizeUnidad(u: string): string {
  const x = u.toLowerCase().trim();
  if (x.includes('kg') || x === 'k') return 'kg';
  if (x.startsWith('m') && !x.includes('mill') && !x.includes('maz') && !x.includes('mad')) return 'm';
  if (x.includes('roll')) return 'rollo';
  if (x.includes('mill')) return 'millar';
  if (x.includes('mazo')) return 'mazo';
  if (x.includes('madeja')) return 'madeja';
  if (x.includes('cono')) return 'cono';
  if (x.includes('disco')) return 'disco';
  if (x.includes('hilo')) return 'hilo';
  if (x.includes('litro')) return 'litro';
  if (x.includes('pieza')) return 'pieza';
  return 'unid';
}

let _autoCode = 1;
function generarCodigoMaterial(cat: string, desc: string): string {
  const prefix = cat === 'TELA' ? 'TEL' : cat === 'AVIO' ? 'AVI' : 'INS';
  // Hash simple del nombre para mantener determinismo
  let h = 0;
  for (let i = 0; i < desc.length; i++) h = (h * 31 + desc.charCodeAt(i)) & 0xffffff;
  return `${prefix}${String(h).padStart(7, '0').slice(-7)}`;
}

// ============================================================
// 4) Recetas (productos + variantes + BOM)
// Excel: CODIGO PRODUCTO TERMINADO | CATEGORIA | PRODUCTO TERMINADO |
//        CLASIFICACIÓN | DESCRIPCION MATERIAL | CANTIDAD (M) | UNIDAD |
//        Columna2 (CDG_MAT) | Columna3 | SI SALE A SERVICIO | CANTIDAD QUE SE QUEDA EN ALMACEN
// ============================================================
async function importRecetas() {
  log('==> Importando RECETAS (PLANTILLA_RECETAS.xlsx)');
  // Encabezado real está en fila 22 (índice 21)
  const rows = readSheetHeader('PLANTILLA_RECETAS.xlsx', 'RECETAS', 21);

  const { data: cats } = await sb.from('categorias').select('id, codigo, nombre');
  const catByCodigo = new Map((cats ?? []).map((c) => [c.codigo, c.id]));
  const catByNombre = new Map((cats ?? []).map((c) => [c.nombre.toUpperCase(), c.id]));

  const { data: mats } = await sb.from('materiales').select('id, codigo, nombre');
  const matByCodigo = new Map((mats ?? []).map((m) => [m.codigo, m.id]));
  const matByNombre = new Map((mats ?? []).map((m) => [m.nombre.toUpperCase(), m.id]));

  // Acumulador: producto base → { variantes: {talla: [lineas_bom]} }
  type BomLineaTmp = {
    material_id: string; material_codigo: string; descripcion: string;
    categoria: string; cantidad: number; sale_a_servicio: boolean;
    cantidad_almacen: number;
  };
  const productos = new Map<string, {
    codigo_base: string; nombre: string; categoria_legacy: string;
    tallas: Map<string, BomLineaTmp[]>;
  }>();

  let countRows = 0;
  for (const r of rows) {
    const codigoPT = (r['CODIGO PRODUCTO TERMINADO'] as string)?.toString().trim();
    const descPT = (r['PRODUCTO TERMINADO'] as string)?.toString().trim();
    const descMat = (r['DESCRIPCION MATERIAL'] as string)?.toString().trim();
    const cantidad = Number(r['CANTIDAD MATERIAL (M)'] ?? r['CANTIDAD (M)'] ?? 0);
    const catLegacy = (r['CATEGORIA'] as string)?.toString().trim();
    const matCode = (r['Columna2'] as string)?.toString().trim();
    const saleAServicio = Number(r['SI SALE A SERVICIO'] ?? 0) === 1;
    const cantAlmacen = Number(r['CANTIDAD QUE SE QUEDA EN ALMACEN'] ?? r['CANTIDAD QUE SE QUEDA EN ALMACEN '] ?? 0);
    const clasificacion = (r['CLASIFICACIÓN'] as string)?.toString().trim().toUpperCase();

    if (!codigoPT || !descPT || !descMat) continue;

    const { modelo, talla } = extractModeloYTalla(descPT);
    if (!talla) continue;

    // CODIGO PRODUCTO TERMINADO del Excel suele ser 'FP02' o similar → lo usamos como código del producto base
    // pero viene con talla incluida por fila. Para agruparlo: usamos el "modelo" como key natural.
    const key = modelo.toUpperCase().replace(/\s+/g, ' ').trim();

    if (!productos.has(key)) {
      productos.set(key, {
        codigo_base: codigoPT.replace(/\d+$/, '') || key.slice(0,6), // "FP" desde "FP02"
        nombre: modelo,
        categoria_legacy: catLegacy ?? '',
        tallas: new Map(),
      });
    }
    const prod = productos.get(key)!;
    if (!prod.tallas.has(talla)) prod.tallas.set(talla, []);

    // Resolver material
    const materialId = matCode ? matByCodigo.get(matCode) : matByNombre.get(descMat.toUpperCase());
    if (!materialId) continue;

    prod.tallas.get(talla)!.push({
      material_id: materialId,
      material_codigo: matCode ?? '',
      descripcion: descMat,
      categoria: clasificacion === 'TELA' ? 'TELA' : clasificacion === 'AVIO' ? 'AVIO' : 'INSUMO',
      cantidad,
      sale_a_servicio: saleAServicio,
      cantidad_almacen: cantAlmacen,
    });
    countRows++;
  }

  log(`  • ${productos.size} productos base con ${countRows} líneas BOM`);

  // 1. Insertar productos base
  const prodRows: Record<string, unknown>[] = [];
  for (const [, p] of productos) {
    const catKey = p.categoria_legacy.toUpperCase();
    const categoria_id =
      catByCodigo.get('FP') && catKey.includes('FIESTAS') ? catByCodigo.get('FP') :
      catByCodigo.get('DANZAS') && catKey.includes('DANZA') ? catByCodigo.get('DANZAS') :
      catByCodigo.get('HALLOWEEN') && catKey.includes('HALLOWEEN') ? catByCodigo.get('HALLOWEEN') :
      catByCodigo.get('NAVIDAD') && catKey.includes('NAVIDAD') ? catByCodigo.get('NAVIDAD') :
      catByCodigo.get('SUPER') && catKey.includes('SUPER') ? catByCodigo.get('SUPER') :
      catByCodigo.get('PERSONAJES') ?? null;

    prodRows.push({
      codigo: p.nombre.replace(/[^A-Z0-9]/gi, '').slice(0, 20).toUpperCase(),
      nombre: p.nombre,
      categoria_id,
      es_conjunto: true,
      version_ficha: 'v1.0',
      activo: true,
    });
  }
  // Dedup por código
  const prodUnique = Array.from(new Map(prodRows.map((p) => [p.codigo, p])).values());
  await upsert('productos', prodUnique, 'codigo');

  const { data: prodsCreados } = await sb.from('productos').select('id, codigo, nombre');
  const prodIdByNombre = new Map((prodsCreados ?? []).map((p) => [p.nombre.toUpperCase(), p.id]));

  // 2. Crear variantes por talla (sin SKU legacy aún; SKU se linkea en importKardex)
  const varRows: Record<string, unknown>[] = [];
  for (const [key, p] of productos) {
    const productoId = prodIdByNombre.get(key);
    if (!productoId) continue;
    for (const [talla] of p.tallas) {
      varRows.push({
        producto_id: productoId,
        sku: `${p.nombre.replace(/[^A-Z0-9]/gi,'').slice(0,10).toUpperCase()}-${talla}`,
        talla,
        activo: true,
      });
    }
  }
  await upsert('productos_variantes', varRows, 'sku');

  // 3. Crear recetas (una por producto v1.0)
  const recRows = (prodsCreados ?? []).map((p) => ({
    producto_id: p.id,
    version: 'v1.0',
    activa: true,
  }));
  await upsert('recetas', recRows, 'producto_id,version');

  const { data: recetasCreadas } = await sb.from('recetas').select('id, producto_id').eq('version', 'v1.0');
  const recByProd = new Map((recetasCreadas ?? []).map((r) => [r.producto_id, r.id]));

  // 4. Insertar líneas de receta
  const { data: unidades } = await sb.from('unidades_medida').select('id, codigo');
  const unidM = unidades?.find((u) => u.codigo === 'm')?.id;
  const unidU = unidades?.find((u) => u.codigo === 'unid')?.id;

  const lineaRows: Record<string, unknown>[] = [];
  for (const [key, p] of productos) {
    const productoId = prodIdByNombre.get(key);
    if (!productoId) continue;
    const recetaId = recByProd.get(productoId);
    if (!recetaId) continue;
    for (const [talla, lineas] of p.tallas) {
      for (const l of lineas) {
        lineaRows.push({
          receta_id: recetaId,
          material_id: l.material_id,
          talla,
          cantidad: l.cantidad,
          unidad_id: l.categoria === 'TELA' ? unidM : unidU,
          sale_a_servicio: l.sale_a_servicio,
          cantidad_almacen: l.cantidad_almacen,
        });
      }
    }
  }
  log(`  • ${lineaRows.length} líneas BOM a insertar`);

  // Upsert por lotes (receta_id, material_id, talla)
  const BATCH = 500;
  for (let i = 0; i < lineaRows.length; i += BATCH) {
    const chunk = lineaRows.slice(i, i + BATCH);
    const { error: err } = await sb.from('recetas_lineas').upsert(chunk, { onConflict: 'receta_id,material_id,talla' });
    if (err) { error('recetas_lineas:', err.message); throw err; }
  }
  log(`  • recetas_lineas: ${lineaRows.length} filas ✔`);
}

// ============================================================
// 5) Costos de confección
// ============================================================
async function importCostosConfeccion() {
  log('==> Importando COSTOS DE CONFECCION');
  const rows = readSheetHeader('PLANTILLA_RECETAS.xlsx', 'COSTOS DE CONFECCION', 2)
    .filter((r) => r['DESCRIPCION']);

  const { data: prods } = await sb.from('productos').select('id, nombre');
  const prodByNombre = new Map((prods ?? []).map((p) => [p.nombre.trim().toUpperCase(), p.id]));

  const data = rows.map((r) => {
    const desc = (r['DESCRIPCION'] as string).toString().trim().toUpperCase();
    const productoId = prodByNombre.get(desc) ?? null;
    return {
      producto_id: productoId,
      descripcion_ref: r['DESCRIPCION'] as string,
      categoria_legacy: (r['CATEGORIA'] as string)?.toString() ?? null,
      t0: r['T0'] ?? null,
      t2: r['T2'] ?? null,
      t4: r['T4'] ?? null,
      t6: r['T6'] ?? null,
      t8: r['T8'] ?? null,
      t10: r['T10'] ?? null,
      t12: r['T12'] ?? null,
      t14: r['T14'] ?? null,
      t16: r['T16'] ?? null,
      ts: r['TS'] ?? null,
      tad: r['TAD'] ?? null,
      ojal_y_boton: r['OJAL Y BOTON'] ?? 0,
    };
  });

  const { error: err } = await sb.from('costos_confeccion').insert(data);
  if (err) { error('costos_confeccion:', err.message); throw err; }
  log(`  • costos_confeccion: ${data.length} filas ✔`);
}

// ============================================================
// 6) Kardex (stock inicial por almacén + alta de variantes con SKU legacy)
// ============================================================
async function importKardex() {
  const archivos = [
    { file: 'KARDEX ALMACEN SANTA BARBARA.xlsx', almacenCodigo: 'ALM-SB', columnaStock: 'ALMACEN SANTA BARBARA' },
    { file: 'KARDEX TIENDA HUALLAGA.xlsx',       almacenCodigo: 'TDA-HU', columnaStock: 'TIENDA HUALLAGA' },
    { file: 'KARDEX  TIENDA LA QUINTA.xlsx',     almacenCodigo: 'TDA-LQ', columnaStock: 'ALMACEN LA QUINTA' },
  ];

  const { data: almacenes } = await sb.from('almacenes').select('id, codigo');
  const almById = new Map((almacenes ?? []).map((a) => [a.codigo, a.id]));

  for (const cfg of archivos) {
    log(`==> Importando kardex ${cfg.almacenCodigo} desde ${cfg.file}`);
    const rows = readSheetHeader(cfg.file, (xlsx.readFile(path.resolve(EXCEL_DIR, cfg.file))).SheetNames[0]!, 2)
      .filter((r) => r['PRODUCTO'] && r['DESCRIPCION']);

    const almacenId = almById.get(cfg.almacenCodigo);
    if (!almacenId) continue;

    // 1. Alta de productos y variantes desde kardex (si no existen)
    const productosMap = new Map<string, string>(); // nombre → id
    const variantesACrear: Record<string, unknown>[] = [];

    for (const r of rows) {
      const sku = (r['PRODUCTO'] as string)?.toString().trim();
      const desc = (r['DESCRIPCION'] as string).toString().trim();
      const precio = Number(r['P.UNIT. S/'] ?? r['P.UNIT. S/  '] ?? 0);
      const { modelo, talla } = extractModeloYTalla(desc);
      if (!talla || !sku) continue;
      if (!productosMap.has(modelo.toUpperCase())) {
        productosMap.set(modelo.toUpperCase(), ''); // placeholder
      }
      variantesACrear.push({
        _modelo: modelo,
        sku,
        talla,
        precio_costo_estandar: precio,
        precio_publico: precio,
      });
    }

    // Crear productos faltantes
    const { data: prodsExistentes } = await sb.from('productos').select('id, nombre');
    const prodByNombre = new Map((prodsExistentes ?? []).map((p) => [p.nombre.toUpperCase(), p.id]));

    const nuevosProd = Array.from(productosMap.keys())
      .filter((n) => !prodByNombre.has(n))
      .map((n) => ({
        codigo: n.replace(/[^A-Z0-9]/gi, '').slice(0, 20).toUpperCase(),
        nombre: n,
        es_conjunto: true,
        activo: true,
      }));
    const uniqNuevos = Array.from(new Map(nuevosProd.map((p) => [p.codigo, p])).values());
    if (uniqNuevos.length) {
      const { error: err } = await sb.from('productos').upsert(uniqNuevos, { onConflict: 'codigo' });
      if (err) { error('productos (kardex):', err.message); }
    }

    const { data: prodsAll } = await sb.from('productos').select('id, nombre');
    const prodByNombre2 = new Map((prodsAll ?? []).map((p) => [p.nombre.toUpperCase(), p.id]));

    // Crear variantes
    const varRows = variantesACrear
      .map((v) => ({
        producto_id: prodByNombre2.get((v._modelo as string).toUpperCase()),
        sku: v.sku,
        talla: v.talla,
        precio_publico: v.precio_publico,
        precio_costo_estandar: v.precio_costo_estandar,
        activo: true,
      }))
      .filter((v) => v.producto_id);
    if (varRows.length) {
      const { error: err } = await sb.from('productos_variantes').upsert(varRows, { onConflict: 'sku' });
      if (err) { error('variantes (kardex):', err.message); }
    }

    // 2. Movimiento inicial de kardex (ENTRADA_AJUSTE con la cantidad actual)
    const { data: variantes } = await sb.from('productos_variantes').select('id, sku');
    const varBySku = new Map((variantes ?? []).map((v) => [v.sku, v.id]));

    const movs = rows.map((r) => {
      const sku = (r['PRODUCTO'] as string)?.toString().trim();
      const cantidad = Number(r[cfg.columnaStock] ?? r['T.STOCK'] ?? 0);
      const costo = Number(r['P.UNIT. S/'] ?? r['P.UNIT. S/  '] ?? 0);
      const vid = sku ? varBySku.get(sku) : undefined;
      if (!vid || cantidad <= 0) return null;
      return {
        tipo: 'ENTRADA_AJUSTE',
        almacen_id: almacenId,
        variante_id: vid,
        cantidad,
        costo_unitario: costo,
        costo_total: cantidad * costo,
        observacion: `Carga inicial desde ${cfg.file}`,
        referencia_tipo: 'SEED_INICIAL',
      };
    }).filter(Boolean) as Record<string, unknown>[];

    const BATCH = 500;
    for (let i = 0; i < movs.length; i += BATCH) {
      const chunk = movs.slice(i, i + BATCH);
      const { error: err } = await sb.from('kardex_movimientos').insert(chunk);
      if (err) { error('kardex_movimientos:', err.message); }
    }
    log(`  • kardex ${cfg.almacenCodigo}: ${movs.length} movimientos ✔`);
  }
}

// ============================================================
// MAIN
// ============================================================
async function main() {
  log('============================');
  log('  IMPORT EXCEL → SUPABASE');
  log('============================');
  await importProveedores();
  await importTalleres();
  await importMateriales();
  await importRecetas();
  await importCostosConfeccion();
  await importKardex();
  log('\n✅ IMPORTACIÓN COMPLETADA');
}

main().catch((e) => { console.error(e); process.exit(1); });
