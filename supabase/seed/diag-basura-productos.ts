/**
 * Detecta productos basura creados desde nombres de archivos de imagen
 * mal mapeados. Reporta candidatos a eliminar pero NO los borra.
 *
 * Patrón 1 — filename garbage: nombres que contienen palabras propias
 * de archivos de fotos (Gpt, Gpj, Jpg, Atras, Costado, Adelante, Delante)
 * o sufijos de 4 letras aleatorias en el código (Mhrq, Jfme, Plcz, etc.).
 *
 * Patrón 2 — color en nombre: el catálogo real no usa colores en el
 * nombre del producto (esos van como variante/atributo). Detecta
 * "Ballet Fucsia", "Pastor Crema y Marron", etc. EXCLUYE Accesorios
 * (cat ACC) porque los accesorios sí pueden tener color (Faja Roja).
 */
import { sb, log } from './_env.js';

// Palabras que delatan que el nombre vino de un nombre de archivo
const FILENAME_WORDS = ['gpt', 'gpj', 'jpg', 'atras', 'costado', 'adelante', 'delante'];

// Códigos terminados en sufijos aleatorios de 3-4 letras (ej. -MHRQ, -JFME, -PLCZ)
const RANDOM_SUFFIX = /-[A-Z]{3,5}$/;

const COLORES = [
  'fucsia', 'lila', 'negro', 'rosado', 'rosa', 'turquesa', 'rojo', 'azul',
  'verde', 'amarillo', 'blanco', 'crema', 'marron', 'naranja', 'celeste',
  'morado', 'plomo', 'mostaza', 'aqua', 'beige', 'dorado', 'plata',
  'azulino', 'guinda', 'oro', 'bordo',
];

async function main() {
  const { data: cats } = await sb.from('categorias').select('id, codigo, nombre');
  const accesoriosId = (cats ?? []).find((c) => c.codigo === 'ACC')?.id;
  log(`Categoría Accesorios id: ${accesoriosId}`);

  const productos: { id: string; codigo: string; nombre: string; categoria_id: string | null }[] = [];
  for (let off = 0; ; off += 1000) {
    const { data } = await sb
      .from('productos')
      .select('id, codigo, nombre, categoria_id')
      .order('codigo')
      .range(off, off + 999);
    if (!data || data.length === 0) break;
    productos.push(...(data as typeof productos));
    if (data.length < 1000) break;
  }
  log(`Total productos en BD: ${productos.length}`);

  // ---- Patrón 1: filename garbage ----
  // Estricto: el NOMBRE debe contener explícitamente alguna palabra de filename.
  // No usamos heurísticas sobre códigos porque generan falsos positivos.
  const filenameTrash = productos.filter((p) => {
    const palabras = p.nombre.toLowerCase().split(/\s+/);
    return palabras.some((w) => FILENAME_WORDS.includes(w.replace(/[,.\/]/g, '')));
  });

  log(`\n=== PATRÓN 1: filename garbage (${filenameTrash.length}) ===`);
  for (const p of filenameTrash) {
    log(`  ${p.codigo.padEnd(40)} · ${p.nombre}`);
  }

  // ---- Patrón 2: color en nombre (excluyendo accesorios) ----
  const colorTrash = productos.filter((p) => {
    if (p.categoria_id === accesoriosId) return false; // Accesorios pueden tener color
    if (filenameTrash.some((f) => f.id === p.id)) return false; // ya en patrón 1
    const palabras = p.nombre.toLowerCase().split(/\s+/);
    return palabras.some((w) => COLORES.includes(w.replace(/[,.\/]/g, '')));
  });

  log(`\n=== PATRÓN 2: color en nombre, NO accesorios (${colorTrash.length}) ===`);
  for (const p of colorTrash) {
    log(`  ${p.codigo.padEnd(40)} · ${p.nombre}`);
  }

  // ---- Guardar listado completo de IDs a eliminar (para el script de borrado) ----
  const todosIds = [...new Set([...filenameTrash.map((p) => p.id), ...colorTrash.map((p) => p.id)])];
  log(`\n=== TOTAL CANDIDATOS A ELIMINAR: ${todosIds.length} ===`);

  // Verificar referencias activas que podrían bloquear el delete
  const { count: ventasRef } = await sb
    .from('kardex_movimientos')
    .select('id', { count: 'exact', head: true })
    .in('variante_id',
      (await sb.from('productos_variantes').select('id').in('producto_id', todosIds)).data?.map((v) => v.id) ?? ['00000000-0000-0000-0000-000000000000']);
  log(`Movimientos kardex referenciando variantes a eliminar: ${ventasRef ?? 0}`);

  // Escribir el JSON con los IDs para el script de borrado
  const fs = await import('node:fs');
  const path = await import('node:path');
  const out = path.resolve('./supabase/seed/_basura-productos-ids.json');
  fs.writeFileSync(out, JSON.stringify({ generadoEn: new Date().toISOString(), ids: todosIds, total: todosIds.length }, null, 2));
  log(`\nArchivo de IDs guardado en: ${out}`);
  log(`Para borrar, revisá la lista y luego corré: pnpm tsx supabase/seed/del-basura-productos.ts`);
}

main().catch((e) => { console.error(e); process.exit(1); });
