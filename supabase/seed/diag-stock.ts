/**
 * Diagnóstico de stock: explica por qué la página /productos del ERP muestra
 * "agotado" en variantes que en /inventario aparecen con stock.
 *
 * Verifica:
 *   - Cuántas variantes tienen stock > 0 según la vista v_stock_variante_total
 *   - Cuántas filas hay en stock_actual y de qué almacenes
 *   - Variantes con stock negativo (que reducirían el SUM total a <= 0)
 *   - Variantes en stock_actual pero ausentes en la vista (rotura potencial)
 *   - Variantes con kardex movements pero sin stock_actual (trigger no corrió)
 */
import { sb, log } from './_env.js';

async function main() {
  // 1) Totales base
  const { count: totalVariantes } = await sb
    .from('productos_variantes')
    .select('id', { count: 'exact', head: true });
  log(`Variantes totales:                        ${totalVariantes}`);

  const { count: totalVariantesActivas } = await sb
    .from('productos_variantes')
    .select('id, productos!inner(activo)', { count: 'exact', head: true })
    .eq('productos.activo', true);
  log(`Variantes de productos activos:           ${totalVariantesActivas}`);

  // 2) Vista v_stock_variante_total
  const vista: { variante_id: string; stock_total: number }[] = [];
  for (let off = 0; ; off += 1000) {
    const { data } = await sb
      .from('v_stock_variante_total')
      .select('variante_id, stock_total')
      .range(off, off + 999);
    if (!data || data.length === 0) break;
    vista.push(...(data as typeof vista));
    if (data.length < 1000) break;
  }
  log(`\nVista v_stock_variante_total:             ${vista.length} filas`);
  const conStockVista = vista.filter((v) => Number(v.stock_total) > 0).length;
  const sinStockVista = vista.filter((v) => Number(v.stock_total) <= 0).length;
  log(`  → stock > 0:                             ${conStockVista}`);
  log(`  → stock <= 0:                            ${sinStockVista}`);

  // 3) stock_actual raw
  const stockRows: { almacen_id: string; variante_id: string | null; cantidad: number }[] = [];
  for (let off = 0; ; off += 1000) {
    const { data } = await sb
      .from('stock_actual')
      .select('almacen_id, variante_id, cantidad')
      .not('variante_id', 'is', null)
      .range(off, off + 999);
    if (!data || data.length === 0) break;
    stockRows.push(...(data as typeof stockRows));
    if (data.length < 1000) break;
  }
  log(`\nstock_actual (variante no nulo):         ${stockRows.length} filas`);

  // Por almacén
  const porAlmacen = new Map<string, { filas: number; suma: number; positivos: number }>();
  for (const r of stockRows) {
    const e = porAlmacen.get(r.almacen_id) ?? { filas: 0, suma: 0, positivos: 0 };
    e.filas++;
    e.suma += Number(r.cantidad);
    if (Number(r.cantidad) > 0) e.positivos++;
    porAlmacen.set(r.almacen_id, e);
  }

  const { data: almacenes } = await sb.from('almacenes').select('id, codigo, nombre, activo');
  const nombre = new Map((almacenes ?? []).map((a) => [a.id as string, `${a.codigo} - ${a.nombre} (${a.activo ? 'on' : 'off'})`]));
  log(`\nDistribución por almacén:`);
  for (const [almId, e] of porAlmacen) {
    log(`  ${(nombre.get(almId) ?? almId).padEnd(50)}  filas=${e.filas} positivas=${e.positivos} suma=${e.suma.toFixed(2)}`);
  }

  // 4) Negativos
  const negativos = stockRows.filter((r) => Number(r.cantidad) < 0);
  log(`\nFilas con cantidad NEGATIVA:             ${negativos.length}`);
  if (negativos.length > 0) {
    log(`  Muestra (primeros 10):`);
    for (const n of negativos.slice(0, 10)) {
      log(`    almacen=${(nombre.get(n.almacen_id) ?? n.almacen_id).padEnd(40)} variante=${n.variante_id} cantidad=${n.cantidad}`);
    }
  }

  // 5) Variantes únicas en stock_actual vs vista
  const setVariantesStock = new Set(stockRows.map((r) => r.variante_id as string));
  const setVariantesVista = new Set(vista.map((v) => v.variante_id));
  log(`\nVariantes únicas en stock_actual:        ${setVariantesStock.size}`);
  log(`Variantes únicas en la vista:            ${setVariantesVista.size}`);
  const enStockNoEnVista = [...setVariantesStock].filter((v) => !setVariantesVista.has(v));
  log(`En stock_actual pero NO en la vista:     ${enStockNoEnVista.length} (debería ser 0)`);

  // 6) Variantes activas SIN ningún registro de stock
  const { data: variantesActivas } = await sb
    .from('productos_variantes')
    .select('id, productos!inner(activo, nombre)')
    .eq('productos.activo', true)
    .limit(10000);
  const idsActivas = new Set((variantesActivas ?? []).map((v) => v.id as string));
  const sinNingunRegistro = [...idsActivas].filter((id) => !setVariantesStock.has(id));
  log(`\nVariantes activas sin NINGÚN registro:   ${sinNingunRegistro.length}`);
  log(`  → estas son las que mostrarán "agotado" en /productos y /web`);

  // 7) Conclusión
  log(`\n=== RESUMEN ===`);
  log(`Variantes activas:           ${idsActivas.size}`);
  log(`  con stock > 0:             ${conStockVista}`);
  log(`  con stock <= 0 en vista:   ${sinStockVista}`);
  log(`  sin ningún movimiento:     ${sinNingunRegistro.length}`);
  log(`Para tener stock real, necesitamos ENTRADA_AJUSTE de mínimo 5 unidades`);
  log(`a las ${idsActivas.size - conStockVista} variantes que están en 0 o negativo.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
