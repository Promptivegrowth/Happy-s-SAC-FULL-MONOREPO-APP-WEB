/**
 * Borra los productos basura identificados por diag-basura-productos.ts.
 * Lee los IDs desde supabase/seed/_basura-productos-ids.json (lo genera
 * el diag, ya validado por el usuario).
 *
 * Borrado en orden defensivo (hijos primero) porque las FK no tienen
 * CASCADE en todos lados:
 *   1. kardex_movimientos (referencias a variante_id)
 *   2. stock_actual       (referencias a variante_id)
 *   3. lotes_pt           (referencias a variante_id)
 *   4. ingresos_pt_lineas (referencias a variante_id)
 *   5. ot_lineas          (referencias directas a producto_id)
 *   6. productos_variantes (FK a productos)
 *   7. productos_publicacion, productos_imagenes, productos_procesos
 *   8. recetas_lineas + recetas
 *   9. productos (la fila padre)
 *
 * El script reporta por producto cuántas filas hijas se borraron y
 * si el delete final fue exitoso.
 */
import { sb, log, error } from './_env.js';
import fs from 'node:fs';
import path from 'node:path';

const IDS_FILE = path.resolve('./supabase/seed/_basura-productos-ids.json');

async function main() {
  if (!fs.existsSync(IDS_FILE)) {
    error(`No se encontró ${IDS_FILE}. Corré primero diag-basura-productos.ts`);
    process.exit(1);
  }
  const { ids } = JSON.parse(fs.readFileSync(IDS_FILE, 'utf-8')) as { ids: string[] };
  log(`IDs a eliminar: ${ids.length}`);
  if (ids.length === 0) {
    log('Nada que hacer.');
    return;
  }

  // 1) Cargar variantes de esos productos para limpiar referencias por variante_id
  const { data: variantes } = await sb
    .from('productos_variantes')
    .select('id')
    .in('producto_id', ids);
  const varIds = (variantes ?? []).map((v) => v.id as string);
  log(`Variantes asociadas: ${varIds.length}`);

  if (varIds.length > 0) {
    // En chunks para no exceder URL máxima
    async function deleteByVariante(table: string, col = 'variante_id') {
      let total = 0;
      for (let i = 0; i < varIds.length; i += 200) {
        const chunk = varIds.slice(i, i + 200);
        const { error: errDel, count } = await sb
          .from(table)
          .delete({ count: 'exact' })
          .in(col, chunk);
        if (errDel) throw new Error(`del ${table}.${col}: ${errDel.message}`);
        total += count ?? 0;
      }
      log(`  → ${table}: ${total} filas eliminadas`);
    }

    await deleteByVariante('kardex_movimientos');
    await deleteByVariante('stock_actual');
    await deleteByVariante('ingresos_pt_lineas');
    await deleteByVariante('lotes_pt');
  }

  // 2) Tablas que referencian directamente producto_id
  async function deleteByProducto(table: string, col = 'producto_id') {
    let total = 0;
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      const { error: errDel, count } = await sb
        .from(table)
        .delete({ count: 'exact' })
        .in(col, chunk);
      if (errDel) throw new Error(`del ${table}.${col}: ${errDel.message}`);
      total += count ?? 0;
    }
    log(`  → ${table}: ${total} filas eliminadas`);
  }

  await deleteByProducto('ot_lineas');
  await deleteByProducto('productos_publicacion');
  await deleteByProducto('productos_imagenes');
  await deleteByProducto('productos_procesos');

  // 3) Recetas + sus líneas (las líneas referencian receta_id)
  const { data: recetas } = await sb
    .from('recetas')
    .select('id')
    .in('producto_id', ids);
  const recetaIds = (recetas ?? []).map((r) => r.id as string);
  if (recetaIds.length > 0) {
    for (let i = 0; i < recetaIds.length; i += 200) {
      const chunk = recetaIds.slice(i, i + 200);
      const { error: e1, count: c1 } = await sb
        .from('recetas_lineas')
        .delete({ count: 'exact' })
        .in('receta_id', chunk);
      if (e1) throw new Error(`del recetas_lineas: ${e1.message}`);
      log(`  → recetas_lineas: ${c1 ?? 0} filas eliminadas`);
    }
    const { error: e2, count: c2 } = await sb
      .from('recetas')
      .delete({ count: 'exact' })
      .in('id', recetaIds);
    if (e2) throw new Error(`del recetas: ${e2.message}`);
    log(`  → recetas: ${c2 ?? 0} filas eliminadas`);
  }

  // 4) Variantes
  await deleteByProducto('productos_variantes');

  // 5) Productos (el padre)
  let totalProds = 0;
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const { error: errDel, count } = await sb
      .from('productos')
      .delete({ count: 'exact' })
      .in('id', chunk);
    if (errDel) throw new Error(`del productos: ${errDel.message}`);
    totalProds += count ?? 0;
  }
  log(`\n✓ Productos eliminados: ${totalProds} / ${ids.length}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
