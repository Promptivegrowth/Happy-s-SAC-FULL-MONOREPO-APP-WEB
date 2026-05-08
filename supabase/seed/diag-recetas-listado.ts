import { sb, log } from './_env.js';

async function main() {
  // Misma query que /recetas/page.tsx
  const { data, error, count } = await sb
    .from('recetas')
    .select(
      'id, version, activa, fecha_vigencia_desde, productos!inner(id, codigo, nombre), recetas_lineas(id)',
      { count: 'exact' },
    )
    .order('updated_at', { ascending: false })
    .limit(200);
  log(`Listado /recetas devuelve: count=${count} filas=${data?.length} error=${error ? JSON.stringify(error) : 'NONE'}`);

  // Buscar específicamente por TSTM0001 (Elefante)
  const { data: search } = await sb
    .from('recetas')
    .select('id, version, activa, productos!inner(codigo, nombre)')
    .or('nombre.ilike.%elefante%,codigo.ilike.%TSTM%', { foreignTable: 'productos' });
  log(`\nBúsqueda por elefante o TSTM: ${search?.length ?? 0} resultados`);
  for (const r of search ?? []) {
    log(`  ${(r as { productos: { codigo: string; nombre: string } }).productos.codigo} - ${(r as { productos: { codigo: string; nombre: string } }).productos.nombre}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
