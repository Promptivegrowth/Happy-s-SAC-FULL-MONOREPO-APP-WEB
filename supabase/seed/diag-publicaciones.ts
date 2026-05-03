import { sb, log } from './_env.js';

async function main() {
  // Total productos activos
  const { count: totalProds } = await sb
    .from('productos')
    .select('id', { count: 'exact', head: true })
    .eq('activo', true);
  log(`Productos activos:                       ${totalProds}`);

  // Total productos en cualquier estado
  const { count: totalAll } = await sb
    .from('productos')
    .select('id', { count: 'exact', head: true });
  log(`Productos totales (incluye inactivos):   ${totalAll}`);

  // Cuántos tienen registro en productos_publicacion
  const { count: conPub } = await sb
    .from('productos_publicacion')
    .select('producto_id', { count: 'exact', head: true });
  log(`Filas en productos_publicacion:          ${conPub}`);

  // Publicado=true
  const { count: publicados } = await sb
    .from('productos_publicacion')
    .select('producto_id', { count: 'exact', head: true })
    .eq('publicado', true);
  log(`  publicado=true:                        ${publicados}`);

  // Publicado=false
  const { count: noPublicados } = await sb
    .from('productos_publicacion')
    .select('producto_id', { count: 'exact', head: true })
    .eq('publicado', false);
  log(`  publicado=false:                       ${noPublicados}`);

  // Productos sin fila en productos_publicacion
  const { data: prods } = await sb.from('productos').select('id').limit(2000);
  const allIds = new Set((prods ?? []).map((p) => p.id as string));
  const { data: pubs } = await sb.from('productos_publicacion').select('producto_id').limit(2000);
  const conPubSet = new Set((pubs ?? []).map((p) => p.producto_id as string));
  const sinFila = [...allIds].filter((id) => !conPubSet.has(id));
  log(`Productos SIN ninguna fila en publicacion: ${sinFila.length}`);

  log(`\nResumen para el filtro web=no del listado /productos:`);
  log(`  Deberían aparecer: ${(noPublicados ?? 0) + sinFila.length} (publicado=false + sin fila)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
