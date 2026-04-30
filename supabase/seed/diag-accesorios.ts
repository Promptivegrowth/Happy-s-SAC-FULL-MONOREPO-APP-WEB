import { sb, log } from './_env.js';

async function main() {
  const { data: cats } = await sb.from('categorias').select('id, codigo, nombre, slug').order('nombre');
  log(`Categorías:`);
  for (const c of cats ?? []) log(`  ${c.codigo.padEnd(15)} · ${c.nombre.padEnd(35)} · /${c.slug}`);

  const acc = (cats ?? []).find((c) =>
    c.nombre.toLowerCase().includes('acceso') || (c.slug ?? '').includes('acceso')
  );
  log(`\nCategoría accesorios: ${acc ? `${acc.codigo} (${acc.id})` : 'NO ENCONTRADA'}`);

  if (acc) {
    const { count } = await sb
      .from('productos')
      .select('id', { count: 'exact', head: true })
      .eq('categoria_id', acc.id);
    log(`Total productos: ${count}`);

    const { count: sinVar } = await sb
      .from('productos')
      .select('id, productos_variantes!left(id)', { count: 'exact', head: true })
      .eq('categoria_id', acc.id)
      .is('productos_variantes.id', null);
    log(`Sin variantes: ${sinVar}`);

    const { data: muestra } = await sb
      .from('productos')
      .select('codigo, nombre, productos_variantes(id)')
      .eq('categoria_id', acc.id)
      .order('nombre')
      .limit(15);
    log(`\nMuestra:`);
    for (const p of muestra ?? []) {
      const v = ((p as { productos_variantes?: { id: string }[] }).productos_variantes ?? []).length;
      log(`  ${p.codigo.padEnd(15)} · ${p.nombre.padEnd(40)} · ${v}v`);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
