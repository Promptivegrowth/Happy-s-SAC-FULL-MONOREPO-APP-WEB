import { sb, log } from './_env.js';

async function main() {
  const { data } = await sb
    .from('unidades_medida')
    .select('id, codigo, nombre, simbolo, tipo, factor_conversion, unidad_base, activo')
    .order('codigo');

  log(`Total unidades en BD: ${(data ?? []).length}\n`);
  log(
    `${'CÓDIGO'.padEnd(10)} ${'NOMBRE'.padEnd(20)} ${'SÍMBOLO'.padEnd(10)} ${'TIPO'.padEnd(12)} ${'FACTOR'.padEnd(12)} ${'BASE'.padEnd(10)} ACTIVO`,
  );
  log('─'.repeat(100));
  for (const u of data ?? []) {
    log(
      `${(u.codigo ?? '').padEnd(10)} ${(u.nombre ?? '').padEnd(20)} ${(u.simbolo ?? '—').padEnd(10)} ${(u.tipo ?? '—').padEnd(12)} ${String(u.factor_conversion ?? '—').padEnd(12)} ${(u.unidad_base ?? '—').padEnd(10)} ${u.activo}`,
    );
  }

  // Contar uso real
  log(`\nUso de cada unidad (en materiales):`);
  for (const u of data ?? []) {
    const { count: c1 } = await sb
      .from('materiales')
      .select('id', { count: 'exact', head: true })
      .eq('unidad_compra_id', u.id);
    const { count: c2 } = await sb
      .from('materiales')
      .select('id', { count: 'exact', head: true })
      .eq('unidad_consumo_id', u.id);
    if ((c1 ?? 0) + (c2 ?? 0) > 0) {
      log(`  ${u.codigo.padEnd(10)} → compra: ${c1 ?? 0} · consumo: ${c2 ?? 0}`);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
