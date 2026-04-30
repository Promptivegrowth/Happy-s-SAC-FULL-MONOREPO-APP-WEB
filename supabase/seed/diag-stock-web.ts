/**
 * Diagnóstico específico para la web/POS: explica por qué algunos productos
 * publicados aparecen "AGOTADO" después del seed-stock-min.
 *
 * El frontend calcula `agotado = stockTotal <= 0` donde stockTotal es la suma
 * del stock por cada variante del producto. Si el producto no tiene variantes
 * o si las variantes no tienen registros en stock_actual, se ve agotado.
 */
import { sb, log } from './_env.js';

async function main() {
  // 1) Productos publicados (los que aparecen en la web)
  const publicados: { producto_id: string }[] = [];
  for (let off = 0; ; off += 1000) {
    const { data } = await sb
      .from('productos_publicacion')
      .select('producto_id')
      .eq('publicado', true)
      .range(off, off + 999);
    if (!data || data.length === 0) break;
    publicados.push(...(data as typeof publicados));
    if (data.length < 1000) break;
  }
  log(`Productos publicados (publicado=true): ${publicados.length}`);

  // 2) Para cada uno, traer producto + variantes
  const idsPub = publicados.map((p) => p.producto_id);
  type ProdVar = {
    id: string;
    nombre: string;
    activo: boolean;
    productos_variantes: { id: string; talla: string }[];
  };
  const prods: ProdVar[] = [];
  for (let i = 0; i < idsPub.length; i += 200) {
    const chunk = idsPub.slice(i, i + 200);
    const { data } = await sb
      .from('productos')
      .select('id, nombre, activo, productos_variantes(id, talla)')
      .in('id', chunk);
    if (data) prods.push(...(data as unknown as ProdVar[]));
  }
  log(`Productos cargados:                      ${prods.length}`);

  const sinVariantes = prods.filter((p) => (p.productos_variantes ?? []).length === 0);
  log(`  → publicados pero SIN variantes:       ${sinVariantes.length} (siempre AGOTADO)`);
  if (sinVariantes.length > 0) {
    log(`    muestra: ${sinVariantes.slice(0, 10).map((p) => p.nombre).join(', ')}`);
  }

  const inactivos = prods.filter((p) => !p.activo);
  log(`  → publicados pero producto INACTIVO:   ${inactivos.length} (no se les agregó stock)`);
  if (inactivos.length > 0) {
    log(`    muestra: ${inactivos.slice(0, 10).map((p) => p.nombre).join(', ')}`);
  }

  // 3) Stock por variante (vista)
  const stockMap = new Map<string, number>();
  for (let off = 0; ; off += 1000) {
    const { data } = await sb
      .from('v_stock_variante_total')
      .select('variante_id, stock_total')
      .order('variante_id')
      .range(off, off + 999);
    if (!data || data.length === 0) break;
    for (const r of data) {
      stockMap.set(r.variante_id as string, Number(r.stock_total ?? 0));
    }
    if (data.length < 1000) break;
  }
  log(`\nVariantes con registro en la vista:      ${stockMap.size}`);

  // 4) Calcular stockTotal por producto publicado (igual que la web)
  const conVariantes = prods.filter((p) => (p.productos_variantes ?? []).length > 0);
  let agotados = 0;
  let conStock = 0;
  const muestraAgotados: string[] = [];
  for (const p of conVariantes) {
    const stockTotal = (p.productos_variantes ?? []).reduce(
      (s, v) => s + (stockMap.get(v.id) ?? 0),
      0,
    );
    if (stockTotal <= 0) {
      agotados++;
      if (muestraAgotados.length < 15) muestraAgotados.push(`${p.nombre} [${(p.productos_variantes ?? []).length}v]`);
    } else {
      conStock++;
    }
  }
  log(`\n=== PUBLICADOS CON VARIANTES (${conVariantes.length}) ===`);
  log(`  con stock > 0 (NO agotado en web):     ${conStock}`);
  log(`  con stock <= 0 (AGOTADO en web):       ${agotados}`);
  if (muestraAgotados.length > 0) {
    log(`\nMuestra agotados (nombre [N° variantes]):`);
    for (const m of muestraAgotados) log(`  - ${m}`);
  }

  // 5) Resumen final
  log(`\n=== RESUMEN ===`);
  log(`Publicados en web/POS:                   ${prods.length}`);
  log(`  Sin variantes (auto-agotado):          ${sinVariantes.length}`);
  log(`  Inactivos (sin stock seedeado):        ${inactivos.length}`);
  log(`  Con stock > 0:                         ${conStock}`);
  log(`  Con stock <= 0 a pesar de tener var:   ${agotados}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
