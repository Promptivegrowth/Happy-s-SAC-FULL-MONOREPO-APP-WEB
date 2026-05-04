import { sb, log } from './_env.js';

async function main() {
  // Buscar el taller "BRISALINA ALTAMIRANO"
  const { data: t } = await sb
    .from('talleres')
    .select('id, codigo, nombre, activo')
    .eq('codigo', 'TAL-012')
    .maybeSingle();
  log(`Taller TAL-012 antes: ${JSON.stringify(t)}`);
  if (!t) return;

  // Intentar update via service role (sin RLS)
  const { error, data } = await sb
    .from('talleres')
    .update({ activo: false })
    .eq('id', t.id)
    .select();
  log(`UPDATE result error: ${error ? JSON.stringify(error) : 'NONE'}`);
  log(`UPDATE rows: ${(data ?? []).length}`);

  // Re-leer
  const { data: t2 } = await sb
    .from('talleres')
    .select('id, codigo, nombre, activo')
    .eq('codigo', 'TAL-012')
    .maybeSingle();
  log(`Taller TAL-012 después: ${JSON.stringify(t2)}`);

  // Restaurar para no romper nada
  if (t.activo === true) {
    await sb.from('talleres').update({ activo: true }).eq('id', t.id);
    log('Restaurado a activo=true');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
