'use server';

/**
 * CONTEO FÍSICO MASIVO POR EXCEL — Importación, validación y aplicación.
 *
 * Política ANTI-ERRORES (pedido cliente 2026-09-03): se valida TODO el archivo
 * primero. Si hay aunque sea UN error, NO se escribe nada en la base y se
 * devuelve la lista completa de errores (hoja + fila + motivo) para que el
 * usuario corrija y reimporte. Solo si el archivo está 100% limpio se aplican
 * los ajustes de stock (kardex ENTRADA_AJUSTE / SALIDA_AJUSTE).
 *
 * El delta se calcula contra el stock ACTUAL al momento de importar (no contra
 * el que traía el archivo); si difieren, se emite una advertencia informativa.
 */

import ExcelJS from 'exceljs';
import { runAction, requireUser, bumpPaths, type ActionResult } from './_helpers';

export type ErrorConteo = { hoja: string; fila: number; item: string; mensaje: string };

export type ItemActualizado = {
  tipo: 'PRODUCTO' | 'MATERIAL';
  codigo: string;
  nombre: string;
  talla: string;
  antes: number;
  contado: number;
  delta: number;
};

export type ResumenAlmacen = {
  almacen: string;
  codigo: string;
  esMateriaPrima: boolean;
  items: ItemActualizado[];
  entradas: number;
  salidas: number;
  sinCambio: number;
};

export type ResultadoConteo = {
  aplicado: boolean;
  errores: ErrorConteo[];
  advertencias: string[];
  resumen: ResumenAlmacen[];
  totalActualizados: number;
  totalSinCambio: number;
  totalLeidos: number;
  fecha: string;
  usuario: string;
};

const MAX_ERRORES_REPORTADOS = 200;

/** Convierte el valor de una celda de conteo a número, o devuelve null/motivo. */
function parseConteo(raw: unknown): { valor: number | null; error?: string } {
  if (raw === null || raw === undefined || raw === '') return { valor: null };
  let v: unknown = raw;
  // Celda con fórmula: usar el resultado calculado.
  if (typeof v === 'object' && v !== null && 'result' in (v as Record<string, unknown>)) {
    v = (v as { result: unknown }).result;
  }
  if (typeof v === 'object' && v !== null && 'richText' in (v as Record<string, unknown>)) {
    v = ((v as { richText: Array<{ text: string }> }).richText ?? []).map((t) => t.text).join('');
  }
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return { valor: null, error: 'La cantidad no es un número válido.' };
    if (v < 0) return { valor: null, error: 'La cantidad no puede ser negativa.' };
    return { valor: v };
  }
  if (typeof v === 'string') {
    const s = v.trim();
    if (s === '') return { valor: null };
    // Aceptamos coma como separador decimal, pero nada más.
    const norm = s.replace(',', '.');
    if (!/^\d+(\.\d+)?$/.test(norm)) {
      return { valor: null, error: `"${s}" no es una cantidad válida. Escribe solo un número (ej. 12 o 12.5), sin texto ni símbolos.` };
    }
    const n = Number(norm);
    if (!Number.isFinite(n)) return { valor: null, error: `"${s}" no es una cantidad válida.` };
    if (n < 0) return { valor: null, error: 'La cantidad no puede ser negativa.' };
    return { valor: n };
  }
  return { valor: null, error: 'La celda de "STOCK CONTADO" tiene un contenido no soportado. Escribe solo un número.' };
}

function textoCelda(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object' && v !== null && 'result' in (v as Record<string, unknown>)) {
    return String((v as { result: unknown }).result ?? '');
  }
  if (typeof v === 'object' && v !== null && 'richText' in (v as Record<string, unknown>)) {
    return ((v as { richText: Array<{ text: string }> }).richText ?? []).map((t) => t.text).join('').trim();
  }
  return String(v).trim();
}

export async function importarConteoExcel(base64: string): Promise<ActionResult<ResultadoConteo>> {
  const r = await runAction(async () => {
    const { sb, userId } = await requireUser();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sbAny = sb as unknown as { from: (t: string) => any };

    // --- Solo gerencia (el conteo es un ajuste de inventario) ---
    const { data: roles } = await sb.from('usuarios_roles').select('rol').eq('usuario_id', userId);
    const esGerente = (roles ?? []).some((x) => (x as { rol: string }).rol === 'gerente');
    if (!esGerente) throw new Error('Solo gerencia puede aplicar un conteo físico de inventario.');

    const { data: perfil } = await sb.from('perfiles').select('nombre_completo').eq('id', userId).maybeSingle();
    const usuario = (perfil as { nombre_completo?: string } | null)?.nombre_completo ?? 'Gerencia';

    // --- Cargar libro ---
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(Buffer.from(base64, 'base64') as unknown as ArrayBuffer);
    } catch {
      throw new Error('No se pudo leer el archivo. Asegúrate de subir el mismo Excel (.xlsx) que exportaste, sin convertirlo a otro formato.');
    }

    // --- Almacenes válidos ---
    const { data: almacenes } = await sb.from('almacenes').select('id, codigo, nombre, tipo, activo');
    const almById = new Map<string, { id: string; codigo: string; nombre: string; tipo: string; activo: boolean }>();
    for (const a of (almacenes ?? []) as Array<{ id: string; codigo: string; nombre: string; tipo: string; activo: boolean }>) {
      almById.set(a.id, a);
    }

    const errores: ErrorConteo[] = [];
    const advertencias: string[] = [];
    type Lectura = {
      hoja: string; fila: number; almacenId: string;
      tipo: 'PRODUCTO' | 'MATERIAL'; entidadId: string;
      codigo: string; nombre: string; talla: string;
      contado: number; stockArchivo: number;
    };
    const lecturas: Lectura[] = [];
    let hojasDatos = 0;
    let totalLeidos = 0;

    // Mapas de respaldo (si borraron la columna ID) - se llenan bajo demanda.
    type Mapas = { sku: Map<string, string>; mat: Map<string, string> };
    let mapas: Mapas | null = null;
    const cargarMapas = async (): Promise<Mapas> => {
      if (mapas) return mapas;
      const [{ data: vs }, { data: ms }] = await Promise.all([
        sbAny.from('productos_variantes').select('id, sku').eq('activo', true).limit(20000),
        sbAny.from('materiales').select('id, codigo').eq('activo', true).limit(20000),
      ]);
      mapas = {
        sku: new Map(((vs ?? []) as Array<{ id: string; sku: string | null }>).filter((v) => v.sku).map((v) => [String(v.sku).toUpperCase(), v.id] as const)),
        mat: new Map(((ms ?? []) as Array<{ id: string; codigo: string | null }>).filter((m) => m.codigo).map((m) => [String(m.codigo).toUpperCase(), m.id] as const)),
      };
      return mapas;
    };

    for (const ws of wb.worksheets) {
      const nombreHoja = ws.name;
      if (/instruccion/i.test(nombreHoja)) continue;

      const token = textoCelda(ws.getCell(2, 10).value);
      if (!token.startsWith('ALM:')) {
        errores.push({ hoja: nombreHoja, fila: 2, item: '-', mensaje: 'No se encontró el identificador del almacén (celda J2). No uses una hoja creada a mano: exporta la plantilla desde el ERP.' });
        continue;
      }
      const almacenId = token.slice(4).trim();
      const alm = almById.get(almacenId);
      if (!alm) {
        errores.push({ hoja: nombreHoja, fila: 2, item: '-', mensaje: 'El almacén de esta hoja ya no existe en el sistema.' });
        continue;
      }
      if (!alm.activo) {
        errores.push({ hoja: nombreHoja, fila: 2, item: '-', mensaje: `El almacén ${alm.codigo} está inactivo.` });
        continue;
      }
      hojasDatos++;
      const esMP = alm.tipo === 'MATERIA_PRIMA';

      // Verificar encabezado esperado (anti-archivo-manipulado).
      const h8 = textoCelda(ws.getCell(4, 8).value).toUpperCase();
      if (!h8.includes('CONTADO')) {
        errores.push({ hoja: nombreHoja, fila: 4, item: '-', mensaje: 'La estructura de columnas fue modificada (falta "STOCK CONTADO" en la columna H). Vuelve a exportar la plantilla.' });
        continue;
      }

      const vistosEnHoja = new Set<string>();
      const ultima = ws.rowCount;
      for (let fila = 5; fila <= ultima; fila++) {
        const row = ws.getRow(fila);
        const idTxt = textoCelda(row.getCell(10).value);
        const codigo = textoCelda(row.getCell(2).value);
        const nombre = textoCelda(row.getCell(3).value);
        const talla = textoCelda(row.getCell(4).value);
        const rawConteo = row.getCell(8).value;

        // Fila vacía de verdad → fin/salto.
        if (!idTxt && !codigo && (rawConteo === null || rawConteo === undefined || rawConteo === '')) continue;

        const { valor: contado, error: errNum } = parseConteo(rawConteo);
        // Sin conteo → no se toca (regla explicada en INSTRUCCIONES).
        if (contado === null && !errNum) continue;

        totalLeidos++;
        const etiqueta = `${codigo || '(sin código)'}${talla ? ` T${talla}` : ''} ${nombre}`.trim();

        if (errNum) { errores.push({ hoja: nombreHoja, fila, item: etiqueta, mensaje: errNum }); continue; }
        if (contado === null) continue;

        // --- Resolver la entidad ---
        let tipo: 'PRODUCTO' | 'MATERIAL' | null = null;
        let entidadId = '';
        if (/^V:[0-9a-f-]{36}$/i.test(idTxt)) { tipo = 'PRODUCTO'; entidadId = idTxt.slice(2); }
        else if (/^M:[0-9a-f-]{36}$/i.test(idTxt)) { tipo = 'MATERIAL'; entidadId = idTxt.slice(2); }
        else {
          // Respaldo: match por codigo.
          const mp = await cargarMapas();
          const cu = codigo.toUpperCase();
          if (!esMP && mp.sku.has(cu)) { tipo = 'PRODUCTO'; entidadId = mp.sku.get(cu)!; }
          else if (esMP && mp.mat.has(cu)) { tipo = 'MATERIAL'; entidadId = mp.mat.get(cu)!; }
          else {
            errores.push({ hoja: nombreHoja, fila, item: etiqueta, mensaje: idTxt ? 'La columna ID fue modificada y el código tampoco coincide con ningún ítem activo.' : 'Falta el ID técnico (columna J) y el código no coincide con ningún ítem activo. Vuelve a exportar la plantilla.' });
            continue;
          }
        }

        // Guardarraíl por tipo de almacén.
        if (esMP && tipo === 'PRODUCTO') {
          errores.push({ hoja: nombreHoja, fila, item: etiqueta, mensaje: `No se pueden contar productos terminados en el almacén de materia prima (${alm.codigo}).` });
          continue;
        }
        if (!esMP && tipo === 'MATERIAL') {
          errores.push({ hoja: nombreHoja, fila, item: etiqueta, mensaje: `No se pueden contar materiales en el almacén ${alm.codigo} (no es de materia prima).` });
          continue;
        }

        // Productos terminados: solo cantidades enteras.
        if (tipo === 'PRODUCTO' && !Number.isInteger(contado)) {
          errores.push({ hoja: nombreHoja, fila, item: etiqueta, mensaje: `Los productos se cuentan en unidades enteras (recibido: ${contado}).` });
          continue;
        }

        const clave = `${tipo}:${entidadId}`;
        if (vistosEnHoja.has(clave)) {
          errores.push({ hoja: nombreHoja, fila, item: etiqueta, mensaje: 'Este ítem aparece más de una vez en la misma hoja. Deja una sola fila por ítem.' });
          continue;
        }
        vistosEnHoja.add(clave);

        const stockArchivoRaw = parseConteo(row.getCell(7).value);
        lecturas.push({
          hoja: nombreHoja, fila, almacenId, tipo, entidadId,
          codigo, nombre, talla, contado,
          stockArchivo: stockArchivoRaw.valor ?? 0,
        });
      }
    }

    if (hojasDatos === 0 && errores.length === 0) {
      throw new Error('El archivo no tiene hojas de almacén válidas. Exporta la plantilla desde el ERP y vuelve a intentar.');
    }

    // --- Validar que las entidades existan ---
    if (errores.length === 0 && lecturas.length > 0) {
      const varIds = [...new Set(lecturas.filter((l) => l.tipo === 'PRODUCTO').map((l) => l.entidadId))];
      const matIds = [...new Set(lecturas.filter((l) => l.tipo === 'MATERIAL').map((l) => l.entidadId))];
      const existentes = new Set<string>();
      for (let i = 0; i < varIds.length; i += 500) {
        const { data } = await sbAny.from('productos_variantes').select('id').in('id', varIds.slice(i, i + 500));
        for (const v of (data ?? []) as Array<{ id: string }>) existentes.add(`PRODUCTO:${v.id}`);
      }
      for (let i = 0; i < matIds.length; i += 500) {
        const { data } = await sbAny.from('materiales').select('id').in('id', matIds.slice(i, i + 500));
        for (const m of (data ?? []) as Array<{ id: string }>) existentes.add(`MATERIAL:${m.id}`);
      }
      for (const l of lecturas) {
        if (!existentes.has(`${l.tipo}:${l.entidadId}`)) {
          errores.push({ hoja: l.hoja, fila: l.fila, item: `${l.codigo} ${l.nombre}`.trim(), mensaje: 'El ítem ya no existe o fue desactivado en el sistema.' });
        }
      }
    }

    const fecha = new Date().toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    // --- SI HAY ERRORES: cancelar TODO ---
    if (errores.length > 0) {
      return {
        aplicado: false,
        errores: errores.slice(0, MAX_ERRORES_REPORTADOS),
        advertencias: errores.length > MAX_ERRORES_REPORTADOS ? [`Se muestran los primeros ${MAX_ERRORES_REPORTADOS} de ${errores.length} errores.`] : [],
        resumen: [], totalActualizados: 0, totalSinCambio: 0, totalLeidos, fecha, usuario,
      } satisfies ResultadoConteo;
    }

    if (lecturas.length === 0) {
      throw new Error('No escribiste ninguna cantidad en "STOCK CONTADO". Llena al menos un ítem y vuelve a importar.');
    }

    // --- Stock ACTUAL (fuente de verdad para el delta) ---
    const almIds = [...new Set(lecturas.map((l) => l.almacenId))];
    const stockActual = new Map<string, number>();
    const { data: stockRows } = await sbAny
      .from('stock_actual')
      .select('almacen_id, variante_id, material_id, cantidad')
      .in('almacen_id', almIds)
      .is('material_lote_id', null)
      .limit(100000);
    for (const s of (stockRows ?? []) as Array<{ almacen_id: string; variante_id: string | null; material_id: string | null; cantidad: number | null }>) {
      const ent = s.variante_id ? `PRODUCTO:${s.variante_id}` : s.material_id ? `MATERIAL:${s.material_id}` : null;
      if (!ent) continue;
      stockActual.set(`${s.almacen_id}|${ent}`, Number(s.cantidad ?? 0));
    }

    // --- Construir kardex + resumen ---
    const filasKardex: Array<Record<string, unknown>> = [];
    const porAlmacen = new Map<string, ResumenAlmacen>();
    let totalSinCambio = 0;
    let desincronizados = 0;

    for (const l of lecturas) {
      const alm = almById.get(l.almacenId)!;
      const antes = stockActual.get(`${l.almacenId}|${l.tipo}:${l.entidadId}`) ?? 0;
      if (Math.abs(antes - l.stockArchivo) > 0.0001) desincronizados++;
      const delta = +(l.contado - antes).toFixed(4);

      let res = porAlmacen.get(l.almacenId);
      if (!res) {
        res = { almacen: alm.nombre, codigo: alm.codigo, esMateriaPrima: alm.tipo === 'MATERIA_PRIMA', items: [], entradas: 0, salidas: 0, sinCambio: 0 };
        porAlmacen.set(l.almacenId, res);
      }
      if (delta === 0) { res.sinCambio++; totalSinCambio++; continue; }

      res.items.push({ tipo: l.tipo, codigo: l.codigo, nombre: l.nombre, talla: l.talla, antes, contado: l.contado, delta });
      if (delta > 0) res.entradas++; else res.salidas++;

      filasKardex.push({
        tipo: delta > 0 ? 'ENTRADA_AJUSTE' : 'SALIDA_AJUSTE',
        almacen_id: l.almacenId,
        variante_id: l.tipo === 'PRODUCTO' ? l.entidadId : null,
        material_id: l.tipo === 'MATERIAL' ? l.entidadId : null,
        cantidad: Math.abs(delta),
        referencia_tipo: 'AJUSTE',
        usuario_id: userId,
        observacion: `Conteo físico por Excel (${antes} -> ${l.contado})`,
      });
    }

    if (desincronizados > 0) {
      advertencias.push(`${desincronizados} ítem(s) tenían un stock distinto al del archivo (alguien movió stock mientras contabas). El ajuste se calculó contra el stock actual del sistema, que es lo correcto.`);
    }

    // --- Aplicar (en lotes) ---
    for (let i = 0; i < filasKardex.length; i += 500) {
      const lote = filasKardex.slice(i, i + 500);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (sbAny.from('kardex_movimientos') as any).insert(lote);
      if (error) throw new Error(`Se aplicaron ${i} de ${filasKardex.length} ajustes y ocurrió un error: ${error.message}`);
    }

    const resumen = [...porAlmacen.values()].sort((a, b) => a.codigo.localeCompare(b.codigo, 'es'));
    for (const rz of resumen) {
      rz.items.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es') || a.talla.localeCompare(b.talla, 'es'));
    }

    return {
      aplicado: true,
      errores: [],
      advertencias,
      resumen,
      totalActualizados: filasKardex.length,
      totalSinCambio,
      totalLeidos,
      fecha,
      usuario,
    } satisfies ResultadoConteo;
  });

  if (r.ok && r.data?.aplicado) await bumpPaths('/inventario', '/productos', '/materiales', '/inventario/alertas', '/kardex');
  return r;
}
