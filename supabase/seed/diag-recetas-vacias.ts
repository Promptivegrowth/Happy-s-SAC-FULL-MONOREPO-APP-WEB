import { sb, log } from './_env.js';

async function main() {
  const { count: total } = await sb.from('recetas').select('id', { count: 'exact', head: true });
  const { count: activas } = await sb.from('recetas').select('id', { count: 'exact', head: true }).eq('activa', true);
  log(`Total recetas: ${total} | activas: ${activas}`);

  const { data } = await sb
    .from('recetas')
    .select('id, version, productos(codigo, nombre, created_at), recetas_lineas(id)')
    .eq('activa', true)
    .limit(2000);

  type R = {
    id: string;
    version: string;
    productos: { codigo: string; nombre: string; created_at: string } | null;
    recetas_lineas: { id: string }[];
  };
  const all = (data ?? []) as unknown as R[];
  const sinLineas = all.filter((r) => (r.recetas_lineas ?? []).length === 0);
  const conLineas = all.filter((r) => (r.recetas_lineas ?? []).length > 0);
  log(`Activas con líneas:    ${conLineas.length}`);
  log(`Activas sin líneas:    ${sinLineas.length}`);

  log(`\nLas 10 más recientes sin líneas:`);
  const recientes = sinLineas
    .filter((r) => r.productos)
    .sort((a, b) => (b.productos!.created_at ?? '').localeCompare(a.productos!.created_at ?? ''))
    .slice(0, 10);
  for (const r of recientes) {
    log(`  ${r.productos!.codigo.padEnd(20)} ${r.productos!.nombre.padEnd(40)} (${r.productos!.created_at?.slice(0, 10)})`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
