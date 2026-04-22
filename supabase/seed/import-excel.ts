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

import path from 'node:path';
import xlsx from 'xlsx';
import { sb, log, error, EXCEL_DIR, upsert } from './_env';

// ============================================================
// Helpers de lectura
// ============================================================

function readSheet(file: string, sheet: string, range = 0): Record<string, unknown>[] {
  const full = path.resolve(EXCEL_DIR, file);
  const wb = xlsx.readFile(full, { cellDates: true });
  const ws = wb.Sheets[sheet];
  if (!ws) {
    error(`Hoja ${sheet} no existe en ${file}`);
    return [];
  }
  return xlsx.utils.sheet_to_json(ws, { defval: null, raw: true, range });
}

function firstSheetName(file: string): string {
  const full = path.resolve(EXCEL_DIR, file);
  const wb = xlsx.readFile(full);
  return wb.SheetNames[0]!;
}

const tallaMap: Record<string, string> = {
  '0': 'T0','2': 'T2','4': 'T4','6': 'T6','8': 'T8',
  '10':'T10','12':'T12','14':'T14','16':'T16',
  'S':'TS','SMALL':'TS','AD':'TAD','ADULTO':'TAD',
};

function extractModeloYTalla(descripcion: string): { modelo: string; talla: string | null } {
  const raw = (descripcion ?? '').toString().trim();
  const m = raw.match(/^(.+?)\s*#\s*([0-9]+|AD|S|SMALL|ADULTO)\s*$/i);
  if (m) {
    return { modelo: m[1]!.trim(), talla: tallaMap[m[2]!.toUpperCase()] ?? null };
  }
  return { modelo: raw, talla: null };
}

/** Convierte celda numérica que puede venir como " " o "" o número. */
function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).trim();
  if (s === '' || s === '-') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

// ============================================================
// 1) Proveedores
// ============================================================
async function importProveedores() {
  log('==> Importando PROVEEDORES.xlsx');
  const rows = readSheet('PROVEEDORES.xlsx', 'Hoja1', 2)
    .filter((r) => r['NOMBRE DE LA EMPRESA '] && r['RUC']);
  log(`  • ${rows.length} proveedores parseados`);

  const data = rows.map((r) => {
    const ruc = String(r['RUC']).replace(/\D/g, '');
    return {
      tipo_documento: ruc.length === 11 ? 'RUC' : 'DNI',
      numero_documento: ruc,
      razon_social: String(r['NOMBRE DE LA EMPRESA ']).trim(),
      direccion: r['DIRECCION'] ? String(r['DIRECCION']).trim() : null,
      tipo_suministro: ['TELA','AVIOS','INSUMO'],
      activo: true,
    };
  });
  await upsert('proveedores', data, 'tipo_documento,numero_documento');
}

// ============================================================
// 2) Talleres
// ============================================================
async function importTalleres() {
  log('==> Importando TALLERES DE CONFECCIÓN.xlsx');
  const rows = readSheet('TALLERES DE CONFECCIÓN.xlsx', 'Hoja1', 3)
    .filter((r) => r['NOMBRE']);
  log(`  • ${rows.length} talleres parseados`);

  const data = rows.map((r, i) => ({
    codigo: `TAL-${String(i + 1).padStart(3, '0')}`,
    nombre: String(r['NOMBRE']).trim(),
    direccion: r['DIRECCION'] ? String(r['DIRECCION']).trim() : null,
    telefono: r['CONTACTO'] ? String(r['CONTACTO']).trim() : null,
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

  const matsSheet = readSheet('PLANTILLA_RECETAS.xlsx', 'MATERIALES', 1);
  const codesSheet = readSheet('PLANTILLA_RECETAS.xlsx', 'CODIGO MAT', 0);

  log(`  • MATERIALES rows: ${matsSheet.length}, CODIGO MAT rows: ${codesSheet.length}`);

  const descToCode = new Map<string, string>();
  for (const r of codesSheet) {
    const desc = str(r['DES_PROD'])?.toUpperCase();
    const cdg = str(r['CDG_PROD']);
    if (desc && cdg) descToCode.set(desc, cdg);
  }

  const { data: unidades } = await sb.from('unidades_medida').select('id, codigo');
  const unidadByCodigo = new Map((unidades ?? []).map((u) => [u.codigo, u.id]));

  const data = matsSheet
    .filter((r) => r['MATERIALES'] && r['CATEGORIA'])
    .map((r) => {
      const desc = String(r['MATERIALES']).trim();
      const cat = String(r['CATEGORIA']).trim().toUpperCase();
      const categoria =
        cat === 'TELA' ? 'TELA' :
        cat === 'AVIOS' || cat === 'AVÍOS' || cat === 'AVIO' ? 'AVIO' :
        cat === 'EMPAQUE' ? 'EMPAQUE' :
        'INSUMO';
      const unidadCompra = (str(r['UNIDAD DE COMPRA']) ?? 'unid').toLowerCase();
      const unidadNorm = normalizeUnidad(unidadCompra);
      const codigoMatch = descToCode.get(desc.toUpperCase()) ?? generarCodigoMaterial(categoria, desc);

      return {
        codigo: codigoMatch,
        nombre: desc,
        categoria,
        unidad_compra_id: unidadByCodigo.get(unidadNorm) ?? null,
        unidad_consumo_id: unidadByCodigo.get(unidadNorm) ?? null,
        precio_unitario: num(r['PRECIO']) ?? 0,
        activo: true,
      };
    });

  const unique = Array.from(new Map(data.map((d) => [d.codigo, d])).values());
  await upsert('materiales', unique, 'codigo');
}

function normalizeUnidad(u: string): string {
  const x = u.toLowerCase().trim();
  if (x.includes('kg') || x === 'k') return 'kg';
  if (x.includes('roll')) return 'rollo';
  if (x.includes('mill')) return 'millar';
  if (x.includes('mazo')) return 'mazo';
  if (x.includes('madeja')) return 'madeja';
  if (x.includes('cono')) return 'cono';
  if (x.includes('disco')) return 'disco';
  if (x.includes('hilo')) return 'hilo';
  if (x.includes('litro')) return 'litro';
  if (x.includes('pieza')) return 'pieza';
  if (x === 'm' || x === 'mt' || x === 'mts' || x === 'metro' || x === 'metros') return 'm';
  return 'unid';
}

function generarCodigoMaterial(cat: string, desc: string): string {
  const prefix = cat === 'TELA' ? 'TEL' : cat === 'AVIO' ? 'AVI' : 'INS';
  let h = 0;
  for (let i = 0; i < desc.length; i++) h = (h * 31 + desc.charCodeAt(i)) & 0xffffff;
  return `${prefix}${String(h).padStart(7, '0').slice(-7)}`;
}

// ============================================================
// 4) Recetas (productos + variantes + BOM)
// ============================================================
async function importRecetas() {
  log('==> Importando RECETAS (PLANTILLA_RECETAS.xlsx)');
  const rows = readSheet('PLANTILLA_RECETAS.xlsx', 'RECETAS', 20);
  log(`  • ${rows.length} filas BOM crudas`);

  const { data: cats } = await sb.from('categorias').select('id, codigo, nombre');
  const catByCodigo = new Map((cats ?? []).map((c) => [c.codigo, c.id]));

  const { data: mats } = await sb.from('materiales').select('id, codigo, nombre');
  const matByCodigo = new Map((mats ?? []).map((m) => [m.codigo, m.id]));
  const matByNombre = new Map((mats ?? []).map((m) => [m.nombre.toUpperCase(), m.id]));

  type BomLineaTmp = {
    material_id: string;
    cantidad: number;
    sale_a_servicio: boolean;
    cantidad_almacen: number;
    categoria_clas: 'TELA' | 'AVIO' | 'INSUMO';
  };
  const productos = new Map<string, {
    nombre: string;
    categoria_legacy: string;
    tallas: Map<string, BomLineaTmp[]>;
  }>();

  for (const r of rows) {
    const codigoPT = str(r['CODIGO PRODUCTO TERMINADO']);
    const descPT = str(r[' PRODUCTO TERMINADO']) ?? str(r['PRODUCTO TERMINADO']);
    const descMat = str(r['DESCRIPCION MATERIAL']);
    const cantidad = num(r['CANTIDAD MATERIAL (M)']) ?? num(r['CANTIDAD (M)']);
    const catLegacy = str(r['CATEGORIA']);
    const matCode = str(r['Columna2']);
    const saleAServicio = num(r['SI SALE A SERVICIO']) === 1;
    const cantAlmacen = num(r['CANTIDAD QUE SE QUEDA EN ALMACEN']) ?? num(r['CANTIDAD QUE SE QUEDA EN ALMACEN ']) ?? 0;
    const clasificacion = str(r['CLASIFICACIÓN'])?.toUpperCase();

    if (!codigoPT || !descPT || !descMat || cantidad === null) continue;

    const { modelo, talla } = extractModeloYTalla(descPT);
    if (!talla) continue;

    const key = modelo.toUpperCase().replace(/\s+/g, ' ').trim();
    if (!productos.has(key)) {
      productos.set(key, {
        nombre: modelo.replace(/\s+/g, ' ').trim(),
        categoria_legacy: catLegacy ?? '',
        tallas: new Map(),
      });
    }
    const prod = productos.get(key)!;
    if (!prod.tallas.has(talla)) prod.tallas.set(talla, []);

    const materialId = matCode ? matByCodigo.get(matCode) : matByNombre.get(descMat.toUpperCase());
    if (!materialId) continue;

    prod.tallas.get(talla)!.push({
      material_id: materialId,
      cantidad,
      sale_a_servicio: saleAServicio,
      cantidad_almacen: cantAlmacen,
      categoria_clas: clasificacion === 'TELA' ? 'TELA' : clasificacion === 'AVIO' ? 'AVIO' : 'INSUMO',
    });
  }

  log(`  • ${productos.size} productos base parseados`);

  // 1. Insertar productos base
  const prodRows: Record<string, unknown>[] = [];
  for (const [, p] of productos) {
    const catKey = p.categoria_legacy.toUpperCase();
    const categoria_id =
      catKey.includes('FIESTAS') ? catByCodigo.get('FP') :
      catKey.includes('DANZA') ? catByCodigo.get('DANZAS') :
      catKey.includes('HALLOWEEN') ? catByCodigo.get('HALLOWEEN') :
      catKey.includes('NAVIDAD') ? catByCodigo.get('NAVIDAD') :
      catKey.includes('SUPER') ? catByCodigo.get('SUPER') :
      catKey.includes('PRINCESA') ? catByCodigo.get('PRINCESAS') :
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
      // SKU temporal: codigo_producto + talla (será reemplazado por SKU legacy desde kardex)
      const codigoP = (prodsCreados ?? []).find((x) => x.id === productoId)?.codigo ?? p.nombre.replace(/[^A-Z0-9]/gi,'').slice(0,10).toUpperCase();
      varRows.push({
        producto_id: productoId,
        sku: `${codigoP}-${talla}`,
        talla,
        activo: true,
      });
    }
  }
  // Dedup por SKU
  const varUniq = Array.from(new Map(varRows.map((v) => [v.sku, v])).values());
  await upsert('productos_variantes', varUniq, 'sku');

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
      // Dedup por material+talla dentro de la receta
      const seen = new Set<string>();
      for (const l of lineas) {
        const key2 = `${l.material_id}|${talla}`;
        if (seen.has(key2)) continue;
        seen.add(key2);
        lineaRows.push({
          receta_id: recetaId,
          material_id: l.material_id,
          talla,
          cantidad: l.cantidad,
          unidad_id: l.categoria_clas === 'TELA' ? unidM : unidU,
          sale_a_servicio: l.sale_a_servicio,
          cantidad_almacen: l.cantidad_almacen,
        });
      }
    }
  }
  log(`  • ${lineaRows.length} líneas BOM a insertar`);

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
  const rows = readSheet('PLANTILLA_RECETAS.xlsx', 'COSTOS DE CONFECCION', 2)
    .filter((r) => r['DESCRIPCION']);

  const { data: prods } = await sb.from('productos').select('id, nombre');
  const prodByNombre = new Map((prods ?? []).map((p) => [p.nombre.trim().toUpperCase(), p.id]));

  const data = rows.map((r) => {
    const desc = String(r['DESCRIPCION']).trim();
    const productoId = prodByNombre.get(desc.toUpperCase()) ?? null;
    return {
      producto_id: productoId,
      descripcion_ref: desc,
      categoria_legacy: str(r['CATEGORIA']),
      t0: num(r['T0']),
      t2: num(r['T2']),
      t4: num(r['T4']),
      t6: num(r['T6']),
      t8: num(r['T8']),
      t10: num(r['T10']),
      t12: num(r['T12']),
      t14: num(r['T14']),
      t16: num(r['T16']),
      ts: num(r['TS']),
      tad: num(r['TAD']),
      ojal_y_boton: num(r['OJAL Y BOTON']) ?? 0,
    };
  });

  // Insert sin upsert porque no hay clave única natural
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
    const sheetName = firstSheetName(cfg.file);
    // Headers están en la fila 3 (range=2)
    const rows = readSheet(cfg.file, sheetName, 2)
      .filter((r) => r['PRODUCTO'] && r['DESCRIPCION']);
    log(`  • ${rows.length} filas kardex`);

    const almacenId = almById.get(cfg.almacenCodigo);
    if (!almacenId) { error(`Almacén ${cfg.almacenCodigo} no encontrado`); continue; }

    // 1. Alta de productos y variantes desde kardex (si no existen)
    const productosMap = new Map<string, true>();
    const variantesACrear: Array<{ modelo: string; sku: string; talla: string; precio: number }> = [];

    for (const r of rows) {
      const sku = str(r['PRODUCTO']);
      const desc = String(r['DESCRIPCION']).trim();
      const precio = num(r['P.UNIT. S/']) ?? num(r['P.UNIT. S/  ']) ?? 0;
      const { modelo, talla } = extractModeloYTalla(desc);
      if (!talla || !sku) continue;
      productosMap.set(modelo.toUpperCase(), true);
      variantesACrear.push({ modelo, sku, talla, precio });
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
      if (err) error('productos (kardex):', err.message);
      log(`  • ${uniqNuevos.length} productos nuevos creados`);
    }

    const { data: prodsAll } = await sb.from('productos').select('id, nombre');
    const prodByNombre2 = new Map((prodsAll ?? []).map((p) => [p.nombre.toUpperCase(), p.id]));

    // Crear variantes con SKU legacy del cliente
    const varRows = variantesACrear
      .map((v) => ({
        producto_id: prodByNombre2.get(v.modelo.toUpperCase()),
        sku: v.sku,
        talla: v.talla,
        precio_publico: v.precio,
        precio_costo_estandar: v.precio * 0.6,   // estimación 60% del precio público
        activo: true,
      }))
      .filter((v) => v.producto_id);
    if (varRows.length) {
      const { error: err } = await sb.from('productos_variantes').upsert(varRows, { onConflict: 'sku' });
      if (err) error('variantes (kardex):', err.message);
    }

    // 2. Movimiento inicial de kardex (ENTRADA_AJUSTE con la cantidad actual)
    const { data: variantes } = await sb.from('productos_variantes').select('id, sku');
    const varBySku = new Map((variantes ?? []).map((v) => [v.sku, v.id]));

    const movs = rows.map((r) => {
      const sku = str(r['PRODUCTO']);
      const cantidad = num(r[cfg.columnaStock]) ?? num(r['T.STOCK']) ?? 0;
      const costo = num(r['P.UNIT. S/']) ?? num(r['P.UNIT. S/  ']) ?? 0;
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
      if (err) error('kardex_movimientos:', err.message);
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
