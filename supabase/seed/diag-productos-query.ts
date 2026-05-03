/**
 * Replica EXACTAMENTE la query del listado /productos del ERP
 * para descubrir si está fallando silenciosamente.
 */
import { sb, log } from './_env.js';

async function main() {
  log('Probando query exacta del listado /productos...');
  const { data, error, count } = await sb
    .from('productos')
    .select(
      'id, codigo, nombre, activo, destacado, categorias!productos_categoria_id_fkey(id, codigo, nombre), campanas(id, nombre), productos_variantes(id, sku, talla, precio_publico), productos_publicacion(publicado, destacado_web)',
      { count: 'exact' },
    )
    .order('nombre')
    .limit(500);

  log(`error: ${error ? JSON.stringify(error) : 'NONE'}`);
  log(`count exacto: ${count}`);
  log(`data filas devueltas: ${(data ?? []).length}`);

  if (data && data.length > 0) {
    log(`\nPrimera fila (sample):`);
    log(JSON.stringify(data[0], null, 2).slice(0, 800));
  }

  // Inspeccionar formato de productos_publicacion
  if (data && data.length > 0) {
    const conPub = data.filter((p) => p.productos_publicacion).length;
    const sinPub = data.filter((p) => !p.productos_publicacion).length;
    log(`\nproductos_publicacion: ${conPub} con valor, ${sinPub} sin valor`);

    // Ver si es objeto o array
    const ejemploCon = data.find((p) => p.productos_publicacion);
    if (ejemploCon) {
      const pub = ejemploCon.productos_publicacion;
      log(`Tipo de productos_publicacion: ${Array.isArray(pub) ? 'ARRAY' : typeof pub}`);
      log(`Valor: ${JSON.stringify(pub)}`);
    }
  }

  // Probar query simple sin joins
  log(`\n--- Probando query SIMPLE sin joins ---`);
  const { data: simple, error: errSimple, count: countSimple } = await sb
    .from('productos')
    .select('id, codigo, nombre', { count: 'exact' })
    .order('nombre')
    .limit(10);
  log(`error: ${errSimple ? JSON.stringify(errSimple) : 'NONE'}`);
  log(`count: ${countSimple}`);
  log(`filas: ${(simple ?? []).length}`);
  if (simple && simple.length > 0) {
    log(`Primer producto: ${simple[0]!.codigo} - ${simple[0]!.nombre}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
