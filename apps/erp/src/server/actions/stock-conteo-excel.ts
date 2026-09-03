'use server';

/**
 * CONTEO FÍSICO MASIVO POR EXCEL — Exportación de la plantilla.
 *
 * Flujo completo (pedido cliente 2026-09-03):
 *   1) El usuario EXPORTA un Excel brandeado con TODOS los productos y
 *      materiales, una hoja por almacén, con su stock actual.
 *   2) Llena únicamente la columna "STOCK CONTADO" (el resto está bloqueado).
 *   3) VUELVE A IMPORTAR el archivo: el sistema valida todo; si hay errores
 *      cancela la actualización completa y los reporta; si está OK, ajusta el
 *      stock y emite un PDF de resumen.
 *
 * El match al reimportar se hace por la columna técnica ID (`V:<uuid>` para
 * variantes, `M:<uuid>` para materiales) y, como respaldo, por código.
 * El almacén de cada hoja viaja en la celda J2 como `ALM:<uuid>`.
 */

import ExcelJS from 'exceljs';
import { requireUser } from './_helpers';

const AZUL = 'FF1E3A5F';
const NARANJA = 'FFFF4D0D';
const BLANCO = 'FFFFFFFF';
const GRIS = 'FF64748B';
const VERDE_SUAVE = 'FFEAF7EF';

/** Marca que identifica un archivo generado por este módulo. */
const MARCA_PLANTILLA = 'HAPPYSAC-CONTEO-V1';

export type OpcionesExportConteo = {
  /** Si se indica, solo ese almacén. Si no, todos los almacenes activos. */
  almacen_id?: string;
  /** true = solo ítems con stock > 0 (más corto). false = TODOS los productos. */
  solo_con_stock?: boolean;
};

type FilaItem = {
  tipo: 'PRODUCTO' | 'MATERIAL';
  id: string;
  codigo: string;
  nombre: string;
  talla: string;
  categoria: string;
  unidad: string;
  stock: number;
};

export async function exportarPlantillaConteo(
  opts: OpcionesExportConteo = {},
): Promise<{ base64: string; filename: string; mime: string; filas: number }> {
  const { sb } = await requireUser();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sbAny = sb as unknown as { from: (t: string) => any };

  // ---- Almacenes ----
  let almQ = sb.from('almacenes').select('id, codigo, nombre, tipo').eq('activo', true).order('codigo');
  if (opts.almacen_id) almQ = almQ.eq('id', opts.almacen_id);
  const { data: almacenes } = await almQ;
  const alms = (almacenes ?? []) as Array<{ id: string; codigo: string; nombre: string; tipo: string }>;
  if (alms.length === 0) throw new Error('No hay almacenes activos para exportar.');

  // ---- Catálogo de variantes (productos terminados) ----
  const { data: varsRaw } = await sbAny
    .from('productos_variantes')
    .select('id, sku, talla, producto:producto_id(codigo, nombre, activo, categorias:categoria_id(nombre))')
    .eq('activo', true)
    .limit(20000);
  type VarRaw = {
    id: string; sku: string | null; talla: string | null;
    producto: { codigo: string | null; nombre: string | null; activo: boolean; categorias: { nombre: string | null } | null } | null;
  };
  const variantes = ((varsRaw ?? []) as VarRaw[])
    .filter((v) => v.producto?.activo !== false)
    .map((v) => ({
      tipo: 'PRODUCTO' as const,
      id: v.id,
      codigo: v.sku ?? '',
      nombre: v.producto?.nombre ?? '-',
      talla: v.talla ?? '',
      categoria: v.producto?.categorias?.nombre ?? '',
      unidad: 'UND',
    }));

  // ---- Catálogo de materiales ----
  const { data: matsRaw } = await sbAny
    .from('materiales')
    .select('id, codigo, nombre, categoria, unidad_consumo:unidades_medida!unidad_consumo_id(codigo)')
    .eq('activo', true)
    .limit(20000);
  type MatRaw = { id: string; codigo: string | null; nombre: string | null; categoria: string | null; unidad_consumo: { codigo: string | null } | null };
  const materiales = ((matsRaw ?? []) as MatRaw[]).map((m) => ({
    tipo: 'MATERIAL' as const,
    id: m.id,
    codigo: m.codigo ?? '',
    nombre: m.nombre ?? '-',
    talla: '',
    categoria: m.categoria ?? '',
    unidad: m.unidad_consumo?.codigo ?? '',
  }));

  // ---- Stock actual (todos los almacenes de golpe) ----
  const { data: stockRaw } = await sbAny
    .from('stock_actual')
    .select('almacen_id, variante_id, material_id, cantidad')
    .is('material_lote_id', null)
    .limit(100000);
  const stockMap = new Map<string, number>();
  for (const s of (stockRaw ?? []) as Array<{ almacen_id: string; variante_id: string | null; material_id: string | null; cantidad: number | null }>) {
    const ent = s.variante_id ? `V:${s.variante_id}` : s.material_id ? `M:${s.material_id}` : null;
    if (!ent) continue;
    stockMap.set(`${s.almacen_id}|${ent}`, Number(s.cantidad ?? 0));
  }

  // ---- Libro ----
  const wb = new ExcelJS.Workbook();
  wb.creator = 'HAPPY SAC ERP';
  wb.created = new Date();

  let logoImgId: number | null = null;
  let empresaNombre = 'DISFRACES HAPPYS';
  try {
    const { data: emp } = await sb.from('empresa').select('logo_url, razon_social, nombre_comercial').single();
    empresaNombre = (emp?.nombre_comercial || emp?.razon_social || empresaNombre).toUpperCase();
    if (emp?.logo_url) {
      const resp = await fetch(emp.logo_url);
      if (resp.ok) {
        const ab = await resp.arrayBuffer();
        const ext = (emp.logo_url.split('.').pop() ?? 'png').toLowerCase();
        const extension = ext === 'jpg' || ext === 'jpeg' ? 'jpeg' : 'png';
        logoImgId = wb.addImage({ buffer: Buffer.from(ab) as unknown as Parameters<typeof wb.addImage>[0]['buffer'], extension });
      }
    }
  } catch { /* logo opcional */ }

  const fechaGen = new Date().toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  // ===================== HOJA DE INSTRUCCIONES =====================
  const wsI = wb.addWorksheet('INSTRUCCIONES', { views: [{ showGridLines: false }] });
  wsI.columns = [{ width: 4 }, { width: 105 }];
  if (logoImgId != null) {
    wsI.addImage(logoImgId, { tl: { col: 0, row: 0 } as unknown as ExcelJS.Anchor, br: { col: 1, row: 3 } as unknown as ExcelJS.Anchor });
  }
  const putI = (row: number, texto: string, opt: { size?: number; bold?: boolean; color?: string; fill?: string } = {}) => {
    const c = wsI.getCell(row, 2);
    c.value = texto;
    c.font = { name: 'Calibri', size: opt.size ?? 11, bold: opt.bold ?? false, color: { argb: opt.color ?? 'FF0F172A' } };
    c.alignment = { vertical: 'middle', wrapText: true };
    if (opt.fill) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: opt.fill } };
  };
  putI(1, `${empresaNombre} - CONTEO FISICO DE INVENTARIO`, { size: 18, bold: true, color: NARANJA });
  putI(2, `Plantilla generada el ${fechaGen}`, { size: 10, color: GRIS });
  putI(4, 'COMO USAR ESTE ARCHIVO', { size: 13, bold: true, color: BLANCO, fill: AZUL });
  const pasos = [
    '1) Este archivo tiene UNA HOJA POR ALMACEN (mira las pestanas de abajo). El almacen de materia prima trae los MATERIALES; los demas traen los PRODUCTOS.',
    '2) Recorre tu almacen y escribe la cantidad real que cuentas en la columna "STOCK CONTADO" (la unica columna editable; esta resaltada en verde).',
    '3) La columna "DIFERENCIA" se calcula sola: te muestra cuanto va a subir (+) o bajar (-) cada item.',
    '4) Si NO cuentas un item, DEJALO EN BLANCO. Los items en blanco no se tocan (su stock queda igual). Escribir 0 SI pone el stock en cero.',
    '5) Guarda el archivo y vuelve al ERP: Inventario -> "Conteo por Excel" -> Importar. El sistema validara todo antes de aplicar nada.',
    '6) Al terminar se descarga automaticamente un PDF de RESUMEN con todo lo que se actualizo, almacen por almacen.',
  ];
  let r = 5;
  for (const p of pasos) { putI(r, p); wsI.getRow(r).height = 30; r++; }
  r++;
  putI(r++, 'REGLAS Y VALIDACIONES (el sistema cancela TODO si hay errores)', { size: 13, bold: true, color: BLANCO, fill: AZUL });
  const reglas = [
    'NO cambies, borres ni reordenes las columnas, ni el nombre de las hojas. La columna "ID" es tecnica: si la borras, no se puede identificar el item.',
    'NO agregues filas nuevas ni pegues productos que no esten en la lista.',
    '"STOCK CONTADO" debe ser un NUMERO mayor o igual a 0. No uses texto ni simbolos (nada de "10 und", "S/", "-").',
    'Para decimales usa PUNTO (ej. 12.5), no coma. Los materiales admiten decimales; los productos, cantidades enteras.',
    'Si el archivo tiene aunque sea UN error, NO se actualiza NADA: veras la lista de errores con la hoja y la fila exacta para corregir y volver a importar.',
    'Solo GERENCIA puede aplicar el conteo (es un ajuste de inventario).',
    'El ajuste se calcula contra el stock del momento de importar. Si alguien movio stock mientras contabas, el resumen te lo advierte.',
  ];
  for (const p of reglas) { putI(r, `- ${p}`); wsI.getRow(r).height = 30; r++; }
  r++;
  putI(r++, 'EJEMPLO', { size: 13, bold: true, color: BLANCO, fill: AZUL });
  putI(r++, 'Si el sistema dice que hay 80 y al contar encuentras 20 -> escribe 20 en "STOCK CONTADO". Se registrara una salida de 60 y el stock quedara en 20.');
  putI(r++, 'Si el sistema dice 0 y encuentras 15 -> escribe 15. Se registrara una entrada de 15.');
  r++;
  putI(r, `Marca del archivo: ${MARCA_PLANTILLA}`, { size: 9, color: GRIS });

  // ===================== HOJAS POR ALMACEN =====================
  const COLS = [
    { h: 'TIPO', w: 12 }, { h: 'CODIGO', w: 18 }, { h: 'PRODUCTO / MATERIAL', w: 46 },
    { h: 'TALLA', w: 10 }, { h: 'CATEGORIA', w: 18 }, { h: 'UNIDAD', w: 10 },
    { h: 'STOCK ACTUAL', w: 14 }, { h: 'STOCK CONTADO', w: 16 }, { h: 'DIFERENCIA', w: 13 },
    { h: 'ID (no modificar)', w: 40 },
  ];
  const usados = new Set<string>();
  const hojaSegura = (base: string) => {
    const n = (base || 'Hoja').replace(/[:\\/?*[\]]/g, ' ').trim().slice(0, 28) || 'Hoja';
    let f = n;
    let i = 2;
    while (usados.has(f.toLowerCase())) f = `${n.slice(0, 25)} ${i++}`;
    usados.add(f.toLowerCase());
    return f;
  };

  let totalFilas = 0;
  for (const alm of alms) {
    const esMP = alm.tipo === 'MATERIA_PRIMA';
    const catalogo = esMP ? materiales : variantes;
    const items: FilaItem[] = catalogo
      .map((c) => ({ ...c, stock: stockMap.get(`${alm.id}|${c.tipo === 'PRODUCTO' ? 'V' : 'M'}:${c.id}`) ?? 0 }))
      .filter((c) => (opts.solo_con_stock ? c.stock > 0 : true))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es') || a.talla.localeCompare(b.talla, 'es'));

    const ws = wb.addWorksheet(hojaSegura(`${alm.codigo} ${alm.nombre}`), { views: [{ state: 'frozen', ySplit: 4 }] });
    ws.columns = COLS.map((c) => ({ width: c.w }));

    if (logoImgId != null) {
      ws.addImage(logoImgId, { tl: { col: 0, row: 0 } as unknown as ExcelJS.Anchor, br: { col: 2, row: 3 } as unknown as ExcelJS.Anchor });
    }
    ws.mergeCells(1, 3, 1, 9);
    const t = ws.getCell(1, 3);
    t.value = `CONTEO FISICO - ${alm.codigo} · ${alm.nombre}`;
    t.font = { name: 'Calibri', size: 15, bold: true, color: { argb: NARANJA } };
    ws.mergeCells(2, 3, 2, 9);
    const sub = ws.getCell(2, 3);
    sub.value = `${empresaNombre} · Generado ${fechaGen} · ${esMP ? 'MATERIALES' : 'PRODUCTOS TERMINADOS'} · Escribe solo en "STOCK CONTADO"`;
    sub.font = { name: 'Calibri', size: 10, color: { argb: GRIS } };
    // Token tecnico del almacen (no tocar).
    const tok = ws.getCell(2, 10);
    tok.value = `ALM:${alm.id}`;
    tok.font = { size: 8, color: { argb: GRIS } };
    ws.getRow(1).height = 22; ws.getRow(2).height = 16; ws.getRow(3).height = 8;

    const hr = ws.getRow(4);
    COLS.forEach((c, i) => {
      const cell = hr.getCell(i + 1);
      cell.value = c.h;
      cell.font = { bold: true, color: { argb: BLANCO } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: i === 7 ? NARANJA : AZUL } };
      cell.alignment = { vertical: 'middle', horizontal: i >= 6 && i <= 8 ? 'center' : 'left', wrapText: true };
    });
    hr.height = 26;

    let idx = 5;
    for (const it of items) {
      const row = ws.getRow(idx);
      row.getCell(1).value = it.tipo === 'PRODUCTO' ? 'Producto' : 'Material';
      row.getCell(2).value = it.codigo;
      row.getCell(3).value = it.nombre;
      row.getCell(4).value = it.talla;
      row.getCell(5).value = it.categoria;
      row.getCell(6).value = it.unidad;
      const cStock = row.getCell(7);
      cStock.value = it.stock; cStock.numFmt = '#,##0.####'; cStock.alignment = { horizontal: 'center' };
      const cConteo = row.getCell(8);
      cConteo.numFmt = '#,##0.####';
      cConteo.alignment = { horizontal: 'center' };
      cConteo.protection = { locked: false };
      cConteo.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE_SUAVE } };
      cConteo.dataValidation = {
        type: 'decimal', operator: 'greaterThanOrEqual', formulae: [0], allowBlank: true,
        showErrorMessage: true, errorStyle: 'error', errorTitle: 'Cantidad invalida',
        error: 'Escribe un numero mayor o igual a 0 (usa punto para decimales). Dejalo en blanco si no cuentas este item.',
      };
      const cDif = row.getCell(9);
      cDif.value = { formula: `IF(H${idx}="","",H${idx}-G${idx})` } as unknown as ExcelJS.CellValue;
      cDif.numFmt = '+#,##0.####;-#,##0.####;0';
      cDif.alignment = { horizontal: 'center' };
      cDif.font = { color: { argb: GRIS } };
      const cId = row.getCell(10);
      cId.value = `${it.tipo === 'PRODUCTO' ? 'V' : 'M'}:${it.id}`;
      cId.font = { size: 8, color: { argb: 'FFB0B7C3' } };
      if (idx % 2 === 0) {
        for (const col of [1, 2, 3, 4, 5, 6, 7]) {
          row.getCell(col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
        }
      }
      idx++;
    }
    totalFilas += items.length;

    ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: COLS.length } };
    // Bloquear todo menos "STOCK CONTADO" (anti-errores).
    ws.protect('', {
      selectLockedCells: true, selectUnlockedCells: true, autoFilter: true, sort: true,
      formatCells: false, formatColumns: false, formatRows: false,
      insertRows: false, insertColumns: false, deleteRows: false, deleteColumns: false,
    });
  }

  const buf = await wb.xlsx.writeBuffer();
  const stamp = new Date().toISOString().slice(0, 10);
  return {
    base64: Buffer.from(buf as ArrayBuffer).toString('base64'),
    filename: `Conteo-Inventario-HAPPYSAC-${stamp}.xlsx`,
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    filas: totalFilas,
  };
}
