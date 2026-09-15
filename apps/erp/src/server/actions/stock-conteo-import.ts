'use server';

/**
 * CONTEO FÍSICO MASIVO POR EXCEL — Importación, validación y aplicación.
 *
 * Se valida TODO el archivo antes de escribir nada, y los errores se separan en
 * dos clases, porque no significan lo mismo (2026-09-15, tras un conteo de
 * 1.812 ítems cancelado entero por 3 filas):
 *
 *   · BLOQUEANTES — el archivo no es confiable: falta el identificador de
 *     almacén, se movieron las columnas, el almacén ya no existe. Acá no se
 *     puede aplicar "lo que coincida", porque no sabemos qué estamos leyendo
 *     ni cuántas filas se están ignorando en silencio: se cancela todo.
 *
 *   · DE FILA — el resto del archivo está perfecto y solo esa fila falla: el
 *     ítem fue dado de baja, la cantidad trae texto, el ítem está repetido.
 *     Estas filas SE SALTAN, el resto del conteo se aplica igual y cada una se
 *     informa en pantalla y en el PDF para corregirla a mano. Cancelar 1.809
 *     filas buenas por 3 malas obligaba a recontar de cero.
 *
 * El delta se calcula contra el stock ACTUAL al momento de importar (no contra
 * el que traía el archivo); si difieren, se emite una advertencia informativa.
 */

import ExcelJS from 'exceljs';
import { runAction, requireUser, bumpPaths, type ActionResult } from './_helpers';
import { LOTE_IDS } from '../lotes';

export type ErrorConteo = {
  hoja: string;
  fila: number;
  item: string;
  /** Qué pasó. */
  mensaje: string;
  /** Qué hacer para arreglarlo dentro del ERP, en pasos concretos. */
  solucion: string;
  /** La cantidad que venía en el Excel, para poder repetirla a mano. */
  contado: number | null;
  /**
   * true = el archivo no es confiable y no se puede aplicar nada.
   * false = solo esta fila falla; el resto del archivo se puede aplicar.
   */
  bloqueante: boolean;
};

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
  /**
   * Filas que se saltaron. El stock de estos ítems quedó como estaba: hay que
   * corregirlo a mano.
   */
  omitidas: ErrorConteo[];
  /** Cuántas filas se aplicaron efectivamente. */
  filasCorrectas: number;
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
        errores.push({ hoja: nombreHoja, fila: 2, item: '-', mensaje: 'No se encontró el identificador del almacén (celda J2).', solucion: 'Vuelve a exportar la plantilla desde el ERP (Inventario → Conteo por Excel → Descargar plantilla) y llénala sin modificar las columnas.', contado: null, bloqueante: true });
        continue;
      }
      const almacenId = token.slice(4).trim();
      const alm = almById.get(almacenId);
      if (!alm) {
        errores.push({ hoja: nombreHoja, fila: 2, item: '-', mensaje: 'El almacén de esta hoja ya no existe en el sistema.', solucion: 'Borra esa hoja del Excel, o vuelve a exportar la plantilla con los almacenes vigentes.', contado: null, bloqueante: true });
        continue;
      }
      if (!alm.activo) {
        errores.push({ hoja: nombreHoja, fila: 2, item: '-', mensaje: `El almacén ${alm.codigo} está inactivo.`, solucion: `Reactiva el almacén ${alm.codigo} en Configuración → Almacenes, o borra esa hoja del Excel.`, contado: null, bloqueante: true });
        continue;
      }
      hojasDatos++;
      const esMP = alm.tipo === 'MATERIA_PRIMA';

      // Verificar encabezado esperado (anti-archivo-manipulado).
      const h8 = textoCelda(ws.getCell(4, 8).value).toUpperCase();
      if (!h8.includes('CONTADO')) {
        errores.push({ hoja: nombreHoja, fila: 4, item: '-', mensaje: 'La estructura de columnas fue modificada (falta "STOCK CONTADO" en la columna H).', solucion: 'Vuelve a exportar la plantilla desde el ERP (Inventario → Conteo por Excel → Descargar plantilla) y llénala sin modificar las columnas.', contado: null, bloqueante: true });
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

        if (errNum) { errores.push({ hoja: nombreHoja, fila, item: etiqueta, mensaje: errNum, solucion: 'Corrige esa celda en el Excel (solo el número, sin texto ni símbolos) y vuelve a importar, o fija la cantidad a mano: Inventario → busca el ítem → botón del lápiz "Corregir cantidad".', contado: null, bloqueante: false }); continue; }
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
            errores.push({ hoja: nombreHoja, fila, item: etiqueta, mensaje: idTxt ? 'La columna ID fue modificada y el código tampoco coincide con ningún ítem activo.' : 'Falta el ID técnico (columna J) y el código no coincide con ningún ítem activo.', solucion: `Busca el ítem en el ERP por su nombre. Si existe con otro código, fija ahí la cantidad contada${contado !== null ? ` (${contado})` : ''}: Inventario → busca el ítem → botón del lápiz "Corregir cantidad".`, contado, bloqueante: false });
            continue;
          }
        }

        // Guardarraíl por tipo de almacén.
        if (esMP && tipo === 'PRODUCTO') {
          errores.push({ hoja: nombreHoja, fila, item: etiqueta, mensaje: `No se pueden contar productos terminados en el almacén de materia prima (${alm.codigo}).`, solucion: 'Cuenta esa prenda en la hoja del almacén de productos terminados que le corresponde (TDA-HU, TDA-LQ o ALM-SB).', contado, bloqueante: false });
          continue;
        }
        if (!esMP && tipo === 'MATERIAL') {
          errores.push({ hoja: nombreHoja, fila, item: etiqueta, mensaje: `No se pueden contar materiales en el almacén ${alm.codigo} (no es de materia prima).`, solucion: 'Cuenta ese material en la hoja del almacén de materia prima.', contado, bloqueante: false });
          continue;
        }

        // Productos terminados: solo cantidades enteras.
        if (tipo === 'PRODUCTO' && !Number.isInteger(contado)) {
          errores.push({ hoja: nombreHoja, fila, item: etiqueta, mensaje: `Los productos se cuentan en unidades enteras (recibido: ${contado}).`, solucion: `Pon un número entero (${Math.round(contado)}) en esa celda y vuelve a importar.`, contado, bloqueante: false });
          continue;
        }

        const clave = `${tipo}:${entidadId}`;
        if (vistosEnHoja.has(clave)) {
          errores.push({ hoja: nombreHoja, fila, item: etiqueta, mensaje: 'Este ítem aparece más de una vez en la misma hoja (se aplicó la primera fila).', solucion: 'Borra las filas repetidas del Excel. Si la cantidad buena era la de esta fila, fíjala a mano: Inventario → busca el ítem → botón del lápiz "Corregir cantidad".', contado, bloqueante: false });
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

    // --- Validar que las entidades sigan existiendo ---
    // Corre SIEMPRE, no solo cuando no hay errores: en modo parcial hay que
    // saber qué filas concretas se caen para poder saltarlas.
    const idsCaidos = new Set<string>();
    if (lecturas.length > 0) {
      const varIds = [...new Set(lecturas.filter((l) => l.tipo === 'PRODUCTO').map((l) => l.entidadId))];
      const matIds = [...new Set(lecturas.filter((l) => l.tipo === 'MATERIAL').map((l) => l.entidadId))];
      const existentes = new Set<string>();
      // Si alguna de estas consultas falla, NO se puede seguir: tomar un error
      // de red como "el ítem no existe" haría que el informe declare borrado
      // medio catálogo y que no se aplique nada.
      for (let i = 0; i < varIds.length; i += LOTE_IDS) {
        const { data, error } = await sbAny.from('productos_variantes').select('id').in('id', varIds.slice(i, i + LOTE_IDS));
        if (error) throw new Error(`No se pudo verificar el catálogo de productos (${error.message}). No se aplicó nada; vuelve a intentar.`);
        for (const v of (data ?? []) as Array<{ id: string }>) existentes.add(`PRODUCTO:${v.id}`);
      }
      for (let i = 0; i < matIds.length; i += LOTE_IDS) {
        const { data, error } = await sbAny.from('materiales').select('id').in('id', matIds.slice(i, i + LOTE_IDS));
        if (error) throw new Error(`No se pudo verificar el catálogo de materiales (${error.message}). No se aplicó nada; vuelve a intentar.`);
        for (const m of (data ?? []) as Array<{ id: string }>) existentes.add(`MATERIAL:${m.id}`);
      }
      const caidas = lecturas.filter((l) => !existentes.has(`${l.tipo}:${l.entidadId}`));

      // Cuando el usuario borra un producto duplicado, su Excel (exportado
      // antes del borrado) trae los códigos viejos. En vez de decirle solo
      // "ya no existe", se busca la prenda que SÍ quedó viva con ese mismo
      // nombre y talla, para poder indicarle el código exacto al que llevar la
      // cantidad contada. Es la diferencia entre un error y una instrucción.
      const sobrevivientes = new Map<string, { sku: string; codigoProducto: string }>();
      const nombresCaidos = [...new Set(caidas.map((l) => l.nombre).filter(Boolean))];
      if (nombresCaidos.length > 0) {
        try {
          for (let i = 0; i < nombresCaidos.length; i += 50) {
            const { data } = await sbAny
              .from('productos_variantes')
              .select('sku, talla, producto:producto_id!inner(nombre, codigo, activo)')
              .eq('activo', true)
              .in('producto.nombre', nombresCaidos.slice(i, i + 50));
            for (const v of (data ?? []) as Array<{ sku: string | null; talla: string | null; producto: { nombre: string | null; codigo: string | null; activo: boolean } | null }>) {
              if (!v.sku || !v.producto?.activo) continue;
              const k = `${(v.producto.nombre ?? '').toLowerCase()}|${(v.talla ?? '').toUpperCase()}`;
              if (!sobrevivientes.has(k)) sobrevivientes.set(k, { sku: v.sku, codigoProducto: v.producto.codigo ?? '' });
            }
          }
        } catch {
          // La búsqueda del reemplazo es un extra: si falla, el error se
          // informa igual con la instrucción genérica.
        }
      }

      for (const l of caidas) {
        idsCaidos.add(`${l.hoja}|${l.fila}`);
        const vivo = sobrevivientes.get(`${l.nombre.toLowerCase()}|${l.talla.toUpperCase()}`);
        errores.push({
          hoja: l.hoja,
          fila: l.fila,
          item: `${l.codigo} ${l.nombre}`.trim(),
          mensaje: `El código ${l.codigo || '(sin código)'} ya no existe en el sistema (se dio de baja o se borró como duplicado).`,
          solucion: vivo
            ? `La misma prenda quedó con el código ${vivo.sku}${vivo.codigoProducto ? ` (producto ${vivo.codigoProducto})` : ''}. Entra a Inventario, busca ${vivo.sku} y con el botón del lápiz "Corregir cantidad" ponle ${l.contado}.`
            : `Busca "${l.nombre}" talla ${l.talla || '-'} en Productos. Si quedó con otro código, entra a Inventario, búscalo y con el botón del lápiz "Corregir cantidad" ponle ${l.contado}. Si esa prenda ya no se vende, ignora esta fila.`,
          contado: l.contado,
          bloqueante: false,
        });
      }
    }

    const fecha = new Date().toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    // Las filas que fallaron se quitan de lo que se va a aplicar.
    const filasConError = new Set(errores.filter((e) => !e.bloqueante).map((e) => `${e.hoja}|${e.fila}`));
    const aplicables = lecturas.filter((l) => !filasConError.has(`${l.hoja}|${l.fila}`) && !idsCaidos.has(`${l.hoja}|${l.fila}`));

    const hayBloqueantes = errores.some((e) => e.bloqueante);
    const erroresDeFila = errores.filter((e) => !e.bloqueante);

    // Un archivo cuya estructura no se entiende no se aplica ni a medias:
    // "lo que coincida" sobre un archivo dudoso es peor que no hacer nada.
    if (hayBloqueantes) {
      return {
        aplicado: false,
        errores: errores.slice(0, MAX_ERRORES_REPORTADOS),
        omitidas: [],
        filasCorrectas: 0,
        advertencias: errores.length > MAX_ERRORES_REPORTADOS
          ? [`Se muestran los primeros ${MAX_ERRORES_REPORTADOS} de ${errores.length} errores.`]
          : [],
        resumen: [], totalActualizados: 0, totalSinCambio: 0, totalLeidos, fecha, usuario,
      } satisfies ResultadoConteo;
    }

    if (aplicables.length === 0) {
      throw new Error(
        erroresDeFila.length > 0
          ? 'Ninguna de las filas con cantidad se pudo aplicar. Revisa el detalle de errores.'
          : 'No escribiste ninguna cantidad en "STOCK CONTADO". Llena al menos un ítem y vuelve a importar.',
      );
    }

    const omitidas = erroresDeFila.slice(0, MAX_ERRORES_REPORTADOS);
    if (erroresDeFila.length > 0) {
      advertencias.push(
        `${erroresDeFila.length} fila(s) no se pudieron actualizar y quedaron con su stock anterior. Están listadas abajo y en el PDF: corrígelas a mano.`,
      );
    }

    // --- Stock ACTUAL (fuente de verdad para el delta) ---
    const almIds = [...new Set(aplicables.map((l) => l.almacenId))];
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

    for (const l of aplicables) {
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
      omitidas,
      filasCorrectas: aplicables.length,
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
