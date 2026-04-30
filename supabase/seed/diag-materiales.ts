/**
 * Diagnóstico: identifica materiales con nombres "basura" (puramente numéricos
 * o con formato de factor de conversión) que probablemente vienen de la
 * tabla de conversión de unidades del Excel mal mapeada.
 */
import { sb, log } from './_env.js';

async function main() {
  // Total
  const { count: total } = await sb.from('materiales').select('id', { count: 'exact', head: true });
  log(`Total materiales en BD: ${total}`);

  // Traer todos los nombres
  const all: { id: string; codigo: string; nombre: string; categoria: string; precio_unitario: number | null }[] = [];
  for (let off = 0; ; off += 1000) {
    const { data } = await sb
      .from('materiales')
      .select('id, codigo, nombre, categoria, precio_unitario')
      .range(off, off + 999);
    if (!data || data.length === 0) break;
    all.push(...data as typeof all);
    if (data.length < 1000) break;
  }
  log(`Cargados: ${all.length}`);

  // Clasificar
  const soloNumero = all.filter((m) => /^[0-9]+(\.[0-9]+)?$/.test(m.nombre.trim()));
  const conLetras = all.filter((m) => /[a-zA-Z]/.test(m.nombre));
  const otros = all.filter((m) => !soloNumero.includes(m) && !conLetras.includes(m));

  log(`\n=== CLASIFICACIÓN ===`);
  log(`  ✅ Con nombre real (letras):  ${conLetras.length}`);
  log(`  🚮 Solo números (basura):     ${soloNumero.length}`);
  log(`  ❓ Otros (símbolos/vacíos):   ${otros.length}`);

  log(`\n=== MUESTRA "SOLO NÚMEROS" (primeros 20) ===`);
  for (const m of soloNumero.slice(0, 20)) {
    log(`  ${m.codigo.padEnd(15)} → "${m.nombre}" [${m.categoria}] · S/${m.precio_unitario ?? 0}`);
  }

  // Verificar si están en uso (referenciados en recetas, kardex, etc.)
  if (soloNumero.length > 0) {
    const ids = soloNumero.map((m) => m.id);
    const { count: enRecetas } = await sb
      .from('recetas_lineas')
      .select('id', { count: 'exact', head: true })
      .in('material_id', ids);
    const { count: enKardex } = await sb
      .from('kardex_movimientos')
      .select('id', { count: 'exact', head: true })
      .in('material_id', ids);
    log(`\n=== USO DE LOS "BASURA" ===`);
    log(`  En recetas_lineas:    ${enRecetas ?? 0} referencias`);
    log(`  En kardex_movimientos: ${enKardex ?? 0} referencias`);

    if ((enRecetas ?? 0) === 0 && (enKardex ?? 0) === 0) {
      log(`\n  ✅ Los ${soloNumero.length} materiales basura NO tienen referencias.`);
      log(`     Se pueden eliminar de forma segura con --apply.`);
    } else {
      log(`\n  ⚠️  ALGUNOS están en uso. Hay que investigar antes de borrar.`);
    }
  }

  if (process.argv.includes('--apply')) {
    if (soloNumero.length === 0) {
      log('Nada que borrar.');
      return;
    }
    log(`\n🗑️  Borrando ${soloNumero.length} materiales basura...`);
    // Borrar en lotes de 100 para no saturar la query
    let borrados = 0;
    for (let i = 0; i < soloNumero.length; i += 100) {
      const ids = soloNumero.slice(i, i + 100).map((m) => m.id);
      const { error, count } = await sb.from('materiales').delete({ count: 'exact' }).in('id', ids);
      if (error) {
        log(`  ❌ Lote ${i}: ${error.message}`);
        if (error.code === '23503') {
          log(`     (algunos están referenciados — abortado)`);
          break;
        }
      } else {
        borrados += count ?? 0;
      }
    }
    log(`✅ Eliminados: ${borrados}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
