/**
 * Asegura que cada variante de producto activo tenga al menos 5 unidades
 * de stock total (sumando todos los almacenes). Las variantes que ya
 * superan ese umbral no se tocan.
 *
 * El faltante se inserta como ENTRADA_AJUSTE en kardex_movimientos →
 * el trigger tg_actualizar_stock actualiza stock_actual automáticamente
 * → la vista v_stock_variante_total refleja el nuevo total → /productos
 * en el ERP y la web ven el stock real.
 *
 * Almacén destino: ALM-SB (Santa Bárbara) por ser el principal.
 */
import { sb, log } from './_env.js';

const STOCK_MINIMO = 5;
const ALMACEN_CODIGO = 'ALM-SB';

async function main() {
  // 1) Almacén destino
  const { data: alm } = await sb
    .from('almacenes')
    .select('id, codigo, nombre')
    .eq('codigo', ALMACEN_CODIGO)
    .maybeSingle();
  if (!alm) {
    throw new Error(`Almacén ${ALMACEN_CODIGO} no encontrado`);
  }
  log(`Almacén destino: ${alm.codigo} - ${alm.nombre} (${alm.id})`);

  // 2) Variantes activas (productos.activo = true)
  const variantes: { id: string; sku: string }[] = [];
  for (let off = 0; ; off += 1000) {
    const { data } = await sb
      .from('productos_variantes')
      .select('id, sku, productos!inner(activo)')
      .eq('productos.activo', true)
      .range(off, off + 999);
    if (!data || data.length === 0) break;
    variantes.push(...data.map((v) => ({ id: v.id as string, sku: v.sku as string })));
    if (data.length < 1000) break;
  }
  log(`Variantes activas: ${variantes.length}`);

  // 3) Stock total actual por variante (vista)
  const stockMap = new Map<string, number>();
  for (let off = 0; ; off += 1000) {
    const { data } = await sb
      .from('v_stock_variante_total')
      .select('variante_id, stock_total')
      .range(off, off + 999);
    if (!data || data.length === 0) break;
    for (const r of data) {
      stockMap.set(r.variante_id as string, Number(r.stock_total ?? 0));
    }
    if (data.length < 1000) break;
  }
  log(`Vista cargada: ${stockMap.size} variantes con algún registro`);

  // 4) Calcular faltante por variante
  const faltantes: { variante_id: string; cantidad: number; sku: string }[] = [];
  for (const v of variantes) {
    const actual = stockMap.get(v.id) ?? 0;
    if (actual < STOCK_MINIMO) {
      faltantes.push({
        variante_id: v.id,
        cantidad: STOCK_MINIMO - actual,
        sku: v.sku,
      });
    }
  }
  log(`Variantes a rellenar: ${faltantes.length}  (las otras ya tienen >= ${STOCK_MINIMO})`);
  if (faltantes.length === 0) {
    log('Nada que hacer.');
    return;
  }

  // 5) Insertar movimientos kardex en chunks
  const ahora = new Date().toISOString();
  const filas = faltantes.map((f) => ({
    fecha: ahora,
    tipo: 'ENTRADA_AJUSTE' as const,
    almacen_id: alm.id,
    variante_id: f.variante_id,
    cantidad: f.cantidad,
    referencia_tipo: 'AJUSTE',
    observacion: `Seed stock mínimo (${STOCK_MINIMO} u.) - ${f.sku}`,
  }));

  const CHUNK = 500;
  let insertados = 0;
  for (let i = 0; i < filas.length; i += CHUNK) {
    const chunk = filas.slice(i, i + CHUNK);
    const { error } = await sb.from('kardex_movimientos').insert(chunk);
    if (error) {
      throw new Error(`Insert chunk ${i}: ${error.message}`);
    }
    insertados += chunk.length;
    log(`  insertados ${insertados}/${filas.length}`);
  }

  // 6) Verificación post-seed
  const { count: variantesConStock } = await sb
    .from('v_stock_variante_total')
    .select('variante_id', { count: 'exact', head: true })
    .gt('stock_total', 0);
  log(`\n✓ Verificación: ${variantesConStock} variantes con stock > 0 según la vista`);

  log(`\nListo. Cada variante activa tiene ahora >= ${STOCK_MINIMO} unidades en ${alm.codigo}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
