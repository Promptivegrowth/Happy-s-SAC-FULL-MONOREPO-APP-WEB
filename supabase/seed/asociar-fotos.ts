/**
 * asociar-fotos.ts
 * Recorre `FOTOS -PRODUCTOS- ERP 4-26/<categoria>/PRODUCTOS WEB/*.jpg`,
 * busca cada producto en BD por nombre normalizado, sube las imágenes a
 * Supabase Storage (bucket `disfraces-fotos`) y asocia:
 *   - Una imagen como productos.imagen_principal_url (preferentemente "delante" o "cuadrado")
 *   - Las demás como filas en productos_imagenes (galería ordenada)
 *
 * Uso:
 *   pnpm tsx asociar-fotos.ts --analyze        (solo reporta, no toca BD ni Storage)
 *   pnpm tsx asociar-fotos.ts --apply          (sube y asocia de verdad)
 *   pnpm tsx asociar-fotos.ts --apply --only "halloween"   (filtra por carpeta)
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { sb, log, ROOT } from './_env.js';

const FOTOS_DIR = path.resolve(ROOT, 'FOTOS -PRODUCTOS- ERP 4-26');
const BUCKET = 'disfraces-fotos';
const STORAGE_PREFIX = 'productos'; // se sube a disfraces-fotos/productos/<slug>.jpg

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const ANALYZE = args.includes('--analyze') || !APPLY;
const CREATE_MISSING = args.includes('--create-missing');
const ONLY = (() => {
  const i = args.indexOf('--only');
  return i >= 0 ? args[i + 1] : null;
})();

// Mapeo carpeta → nombre de categoría en BD (los que tengamos).
// Las que no matchean creo aquí los códigos esperados; el script intenta
// matchear por nombre o por código.
const CATEGORIA_MAP: Record<string, { nombre: string; codigo: string; icono: string }> = {
  'accesorios':                       { nombre: 'Accesorios',                codigo: 'ACC', icono: '🎀' },
  'danzas típicas':                   { nombre: 'Danzas Típicas',            codigo: 'DAN', icono: '💃' },
  'fiestas patrias':                  { nombre: 'Fiestas Patrias',           codigo: 'FIP', icono: '🇵🇪' },
  'hallowen':                         { nombre: 'Halloween',                 codigo: 'HAL', icono: '🎃' },
  'navidad':                          { nombre: 'Navidad',                   codigo: 'NAV', icono: '🎅' },
  'personajes varios':                { nombre: 'Personajes Varios',         codigo: 'PER', icono: '🎭' },
  'primavera':                        { nombre: 'Primavera',                 codigo: 'PRI', icono: '🌸' },
  'princesas especiales':             { nombre: 'Princesas Especiales',      codigo: 'PRC', icono: '👸' },
  'profesiones':                      { nombre: 'Profesiones',               codigo: 'PRO', icono: '👷' },
  'super héroes niños especilales':   { nombre: 'Superhéroes',               codigo: 'SUP', icono: '🦸' },
  'superheroes niñas':                { nombre: 'Superheroínas',             codigo: 'SUH', icono: '🦸‍♀️' },
  'tallertes de verano':              { nombre: 'Talleres de Verano',        codigo: 'VER', icono: '☀️' },
};

/** Quitar tildes, lowercase, espacios → "-". */
function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Distancia de Levenshtein (para matching aproximado). */
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(dp[i - 1]![j]! + 1, dp[i]![j - 1]! + 1, dp[i - 1]![j - 1]! + cost);
    }
  }
  return dp[m]![n]!;
}

const ANGULOS = ['delante', 'atras', 'costado', 'cuadrado', 'frontal', 'lateral', 'frente'];
const SUFIJOS_RUIDO = ['ia', 'ai', 'cuadrado', 'cuadrada'];

/** Extrae nombre base + ángulo de un filename.
 * Quita TODOS los tokens que sean ángulos o sufijos de ruido (en cualquier
 * posición al final), no solo el último. Ej: "chalan-atras-cuadrado" → "chalan".
 */
function parseFilename(filename: string): { base: string; angulo: string | null; raw: string } {
  const sinExt = filename.replace(/\.(jpe?g|png|webp)$/i, '');
  const norm = normalizar(sinExt);
  const tokens = norm.split('-');
  let primerAngulo: string | null = null;

  // Recorrer de atrás hacia adelante quitando ángulos / ruido / dígitos sueltos.
  while (tokens.length > 0) {
    const last = tokens[tokens.length - 1]!;
    if (ANGULOS.includes(last)) {
      if (!primerAngulo) primerAngulo = last;
      tokens.pop();
    } else if (SUFIJOS_RUIDO.includes(last)) {
      tokens.pop();
    } else if (/^\d+$/.test(last) && tokens.length >= 2) {
      // dígitos sueltos al final tipo "santiago-hombre-1" → quitar
      tokens.pop();
    } else {
      break;
    }
  }
  return { base: tokens.join('-'), angulo: primerAngulo, raw: norm };
}

type ProductoBD = {
  id: string;
  codigo: string;
  nombre: string;
  imagen_principal_url: string | null;
  categoria_id: string | null;
};

type CategoriaBD = { id: string; codigo: string; nombre: string };

async function loadProductos(): Promise<ProductoBD[]> {
  const all: ProductoBD[] = [];
  const PAGE = 1000;
  for (let off = 0; ; off += PAGE) {
    const { data, error } = await sb
      .from('productos')
      .select('id, codigo, nombre, imagen_principal_url, categoria_id')
      .range(off, off + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...(data as ProductoBD[]));
    if (data.length < PAGE) break;
  }
  return all;
}

async function loadCategorias(): Promise<CategoriaBD[]> {
  const { data, error } = await sb.from('categorias').select('id, codigo, nombre');
  if (error) throw error;
  return (data ?? []) as CategoriaBD[];
}

/** Asegura que las categorías de las carpetas existan. En --apply las crea.
 * En --analyze también las crea para poder ver el reporte completo (es safe,
 * crear categorías vacías no afecta nada). */
async function ensureCategorias(existentes: CategoriaBD[]): Promise<Map<string, CategoriaBD>> {
  const porCarpeta = new Map<string, CategoriaBD>();
  for (const [carpeta, def] of Object.entries(CATEGORIA_MAP)) {
    const normNombre = normalizar(def.nombre);
    let cat = existentes.find(
      (c) => normalizar(c.nombre) === normNombre || c.codigo.toLowerCase() === def.codigo.toLowerCase(),
    );
    if (!cat) {
      const { data, error } = await sb
        .from('categorias')
        .insert({
          codigo: def.codigo,
          nombre: def.nombre,
          icono: def.icono,
          slug: normNombre,
          activo: true,
          publicar_en_web: true,
        })
        .select('id, codigo, nombre')
        .single();
      if (error) {
        log(`⚠️  No se pudo crear categoría "${def.nombre}": ${error.message}`);
        continue;
      }
      cat = data as CategoriaBD;
      log(`📁 Categoría creada: ${def.nombre} (${def.codigo})`);
    }
    porCarpeta.set(carpeta, cat!);
  }
  return porCarpeta;
}

/** Crea un producto mínimo para una imagen que no matchea con ningún producto existente. */
async function crearProductoFaltante(
  base: string,
  categoriaId: string,
  carpeta: string,
): Promise<ProductoBD | null> {
  // Construir nombre legible desde el slug normalizado
  const nombre = base
    .split('-')
    .filter((w) => w.length > 0)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
    .trim();

  // Código corto basado en el primer token + sufijo numérico aleatorio
  const baseCode = base
    .split('-')
    .filter((w) => w.length >= 2)
    .slice(0, 3)
    .join('-')
    .toUpperCase()
    .slice(0, 30);
  const codigo = baseCode || `AUTO-${Date.now()}`;

  const { data, error } = await sb
    .from('productos')
    .insert({
      codigo,
      nombre: nombre || `Sin nombre (${carpeta})`,
      categoria_id: categoriaId,
      es_conjunto: true,
      activo: true,
      version_ficha: 'v1.0',
      genero: 'UNISEX',
    })
    .select('id, codigo, nombre, imagen_principal_url, categoria_id')
    .single();

  if (error) {
    // Posible colisión de código. Reintentar con sufijo random.
    if (error.code === '23505') {
      const codigo2 = `${codigo}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      const { data: data2, error: error2 } = await sb
        .from('productos')
        .insert({
          codigo: codigo2,
          nombre: nombre || `Sin nombre (${carpeta})`,
          categoria_id: categoriaId,
          es_conjunto: true,
          activo: true,
          version_ficha: 'v1.0',
          genero: 'UNISEX',
        })
        .select('id, codigo, nombre, imagen_principal_url, categoria_id')
        .single();
      if (error2) {
        console.error(`crear ${codigo2}:`, error2.message);
        return null;
      }
      return data2 as ProductoBD;
    }
    console.error(`crear ${codigo}:`, error.message);
    return null;
  }
  return data as ProductoBD;
}

/** Encuentra mejor match en `productos` para un nombre normalizado. */
function bestMatch(target: string, candidatos: ProductoBD[], categoriaId: string | null) {
  let mejor: { p: ProductoBD; dist: number; score: number } | null = null;
  const targetTokens = new Set(target.split('-').filter((t) => t.length >= 3));
  for (const p of candidatos) {
    const candidato = normalizar(p.nombre);
    const codigo = normalizar(p.codigo);

    // Score por tokens compartidos (más significativos que substring)
    const candTokens = new Set(candidato.split('-').filter((t) => t.length >= 3));
    let comunes = 0;
    for (const t of targetTokens) if (candTokens.has(t)) comunes++;
    const score = comunes / Math.max(targetTokens.size, candTokens.size);

    // Distancia ortográfica
    const dist = Math.min(levenshtein(target, candidato), levenshtein(target, codigo));

    // Bonus si ya está en la categoría que esperamos
    const bonusCat = categoriaId && p.categoria_id === categoriaId ? 0.15 : 0;
    const finalScore = score + bonusCat - dist / Math.max(target.length, 50) / 4;

    if (!mejor || finalScore > mejor.score) {
      mejor = { p, dist, score: finalScore };
    }
  }
  return mejor;
}

type Match = {
  carpeta: string;
  filename: string;
  base: string;
  angulo: string | null;
  producto: ProductoBD | null;
  score: number;
  matchType: 'exact' | 'fuzzy' | 'none';
};

/** Sanitiza el slug a algo seguro para storage path. */
function sanitizeForStorage(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'img';
}

async function uploadImagen(filepath: string, slug: string, idx: number): Promise<string | null> {
  let buf: Buffer;
  try {
    buf = await fs.readFile(filepath);
  } catch (e) {
    console.error(`read ${filepath}:`, (e as Error).message);
    return null;
  }
  const ext = path.extname(filepath).toLowerCase().replace('.', '') || 'jpg';
  const safeSlug = sanitizeForStorage(slug);
  const objectPath = `${STORAGE_PREFIX}/${safeSlug}-${idx}.${ext}`;

  // Reintentos: 3 intentos con backoff (Supabase Storage devuelve a veces HTML 500).
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const { error } = await sb.storage.from(BUCKET).upload(objectPath, buf, {
        contentType: ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg',
        upsert: true,
      });
      if (!error) {
        const { data } = sb.storage.from(BUCKET).getPublicUrl(objectPath);
        return data.publicUrl;
      }
      if (attempt === 3) {
        console.error(`upload ${objectPath} (intento ${attempt}):`, error.message);
        return null;
      }
      await new Promise((r) => setTimeout(r, attempt * 500));
    } catch (e) {
      // Server devolvió HTML / 500 / network error
      if (attempt === 3) {
        console.error(`upload ${objectPath} (excepción intento ${attempt}):`, (e as Error).message);
        return null;
      }
      await new Promise((r) => setTimeout(r, attempt * 1000));
    }
  }
  return null;
}

async function main() {
  log(`Modo: ${APPLY ? '⚙️  APPLY (sube y asocia)' : '🔍 ANALYZE (solo reporta)'}`);
  if (ONLY) log(`Filtro carpeta: ${ONLY}`);

  const [productos, categorias] = await Promise.all([loadProductos(), loadCategorias()]);
  log(`Productos en BD: ${productos.length}, Categorías existentes: ${categorias.length}`);

  const catMap = await ensureCategorias(categorias);

  // Cargar archivos por carpeta
  const carpetas = await fs.readdir(FOTOS_DIR, { withFileTypes: true });
  const matches: Match[] = [];
  const sinMatch: Match[] = [];

  for (const cd of carpetas) {
    if (!cd.isDirectory()) continue;
    if (ONLY && !cd.name.toLowerCase().includes(ONLY.toLowerCase())) continue;

    const carpeta = cd.name;
    const cat = catMap.get(carpeta) ?? null;
    if (!cat) {
      log(`⚠️  Sin categoría mapeada para "${carpeta}", skip`);
      continue;
    }

    // Subcarpeta PRODUCTOS WEB / PRODUCTOS-WEB
    const sub = await fs.readdir(path.join(FOTOS_DIR, carpeta), { withFileTypes: true });
    const subDir = sub.find((s) => s.isDirectory() && /productos[ -]web/i.test(s.name));
    if (!subDir) continue;
    const subPath = path.join(FOTOS_DIR, carpeta, subDir.name);
    const files = (await fs.readdir(subPath)).filter((f) => /\.(jpe?g|png|webp)$/i.test(f));

    // Filtrar candidatos por categoría primero (más rápido y preciso)
    const candidatos = productos.filter((p) => p.categoria_id === cat.id || p.categoria_id == null);

    for (const f of files) {
      const parsed = parseFilename(f);
      // Match exacto primero por código o nombre normalizado
      const exact = candidatos.find(
        (p) => normalizar(p.nombre) === parsed.base || normalizar(p.codigo) === parsed.base,
      );
      if (exact) {
        matches.push({ carpeta, filename: f, base: parsed.base, angulo: parsed.angulo, producto: exact, score: 1, matchType: 'exact' });
        continue;
      }
      const fuzzy = bestMatch(parsed.base, candidatos.length ? candidatos : productos, cat.id);
      if (fuzzy && fuzzy.score >= 0.6) {
        matches.push({ carpeta, filename: f, base: parsed.base, angulo: parsed.angulo, producto: fuzzy.p, score: fuzzy.score, matchType: 'fuzzy' });
      } else {
        sinMatch.push({ carpeta, filename: f, base: parsed.base, angulo: parsed.angulo, producto: null, score: fuzzy?.score ?? 0, matchType: 'none' });
      }
    }
  }

  // Reporte
  log(`\n=== REPORTE DE MATCHING ===`);
  log(`✅ Matches: ${matches.length}`);
  log(`   ├─ Exactos: ${matches.filter((m) => m.matchType === 'exact').length}`);
  log(`   └─ Fuzzy:   ${matches.filter((m) => m.matchType === 'fuzzy').length}`);
  log(`❌ Sin match: ${sinMatch.length}`);

  // Productos únicos con foto
  const productosConFoto = new Set(matches.map((m) => m.producto!.id));
  log(`\nProductos únicos asociados: ${productosConFoto.size} de ${productos.length}`);

  // Productos faltantes (en fotos pero no en BD): agrupar sinMatch por base
  const faltantesPorNombre = new Map<string, { carpeta: string; archivos: string[] }>();
  for (const m of sinMatch) {
    const k = `${m.carpeta}::${m.base}`;
    const cur = faltantesPorNombre.get(k);
    if (cur) cur.archivos.push(m.filename);
    else faltantesPorNombre.set(k, { carpeta: m.carpeta, archivos: [m.filename] });
  }
  log(`\nProductos faltantes (necesitan crearse): ${faltantesPorNombre.size}`);
  if (faltantesPorNombre.size > 0 && faltantesPorNombre.size <= 80) {
    for (const [k, v] of faltantesPorNombre) {
      const [carpeta, base] = k.split('::');
      log(`  • [${carpeta}] ${base} (${v.archivos.length} archivos)`);
    }
  }

  // Mostrar algunos fuzzy con score bajo (para revisar)
  const fuzzyDudosos = matches.filter((m) => m.matchType === 'fuzzy' && m.score < 0.75).slice(0, 20);
  if (fuzzyDudosos.length > 0) {
    log(`\n⚠️  Matches fuzzy con score bajo (revisar):`);
    for (const m of fuzzyDudosos) {
      log(`  • [${m.carpeta}] "${m.base}" → "${normalizar(m.producto!.nombre)}" (score=${m.score.toFixed(2)})`);
    }
  }

  if (!APPLY) {
    log(`\n💡 Para aplicar (subir matches existentes): pnpm tsx asociar-fotos.ts --apply`);
    log(`💡 Para crear los productos faltantes y subir TODO: pnpm tsx asociar-fotos.ts --apply --create-missing`);
    return;
  }

  // ============================================================================
  // APPLY: subir + asociar
  // ============================================================================

  // Si --create-missing: crear los productos faltantes y agregarlos a matches.
  if (CREATE_MISSING && faltantesPorNombre.size > 0) {
    log(`\n🆕 Creando ${faltantesPorNombre.size} productos faltantes...`);
    let creados = 0;
    for (const [k, v] of faltantesPorNombre) {
      const [carpeta, base] = k.split('::');
      if (!carpeta || !base) continue;
      const cat = catMap.get(carpeta);
      if (!cat) continue;
      const nuevo = await crearProductoFaltante(base, cat.id, carpeta);
      if (nuevo) {
        creados++;
        // Agregar matches "exact" para sus archivos
        for (const file of v.archivos) {
          const parsed = parseFilename(file);
          matches.push({
            carpeta,
            filename: file,
            base: parsed.base,
            angulo: parsed.angulo,
            producto: nuevo,
            score: 1,
            matchType: 'exact',
          });
        }
      }
    }
    log(`   ├─ Productos creados: ${creados}`);
    log(`   └─ Total matches ahora: ${matches.length}`);
  }

  log(`\n⚙️  Subiendo ${matches.length} imágenes a Storage...`);

  // Agrupar por producto
  const porProducto = new Map<string, Match[]>();
  for (const m of matches) {
    const arr = porProducto.get(m.producto!.id) ?? [];
    arr.push(m);
    porProducto.set(m.producto!.id, arr);
  }

  let subidas = 0;
  let asociadas = 0;
  let principalUpdates = 0;
  let errores = 0;

  for (const [productoId, ms] of porProducto) {
    const producto = ms[0]!.producto!;
    const slug = normalizar(producto.codigo || producto.nombre);

    // Ordenar: primero las "delante" o "cuadrado", después el resto
    const orden = (a: Match, b: Match) => {
      const pa = a.angulo === 'delante' ? 0 : a.angulo === 'cuadrado' ? 1 : a.angulo === 'frontal' ? 2 : 3;
      const pb = b.angulo === 'delante' ? 0 : b.angulo === 'cuadrado' ? 1 : b.angulo === 'frontal' ? 2 : 3;
      return pa - pb;
    };
    ms.sort(orden);

    const urls: string[] = [];
    for (let i = 0; i < ms.length; i++) {
      const m = ms[i]!;
      const sub = (await fs.readdir(path.join(FOTOS_DIR, m.carpeta), { withFileTypes: true })).find(
        (s) => s.isDirectory() && /productos[ -]web/i.test(s.name),
      );
      if (!sub) continue;
      const filepath = path.join(FOTOS_DIR, m.carpeta, sub.name, m.filename);
      const url = await uploadImagen(filepath, slug, i);
      if (url) {
        urls.push(url);
        subidas++;
      } else {
        errores++;
      }
    }

    if (urls.length === 0) continue;

    // Actualizar imagen principal si está vacía
    if (!producto.imagen_principal_url) {
      const { error } = await sb
        .from('productos')
        .update({ imagen_principal_url: urls[0] })
        .eq('id', productoId);
      if (!error) principalUpdates++;
    }

    // Insertar resto en productos_imagenes (galería)
    if (urls.length > 1) {
      // Eliminar fotos previas del mismo producto para evitar duplicados al re-correr
      await sb.from('productos_imagenes').delete().eq('producto_id', productoId);
      const filas = urls.slice(1).map((u, idx) => ({
        producto_id: productoId,
        url: u,
        orden: idx + 1,
        tipo: 'FOTO',
        es_portada: false,
      }));
      const { error } = await sb.from('productos_imagenes').insert(filas);
      if (!error) asociadas += filas.length;
    }
  }

  log(`\n✅ Listo:`);
  log(`   ├─ Imágenes subidas:        ${subidas}`);
  log(`   ├─ Imagen principal seteada: ${principalUpdates}`);
  log(`   ├─ Galería asociada:        ${asociadas}`);
  log(`   └─ Errores:                 ${errores}`);
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
