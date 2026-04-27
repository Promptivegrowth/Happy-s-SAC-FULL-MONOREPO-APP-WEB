/**
 * clasificar-genero.ts
 * Auto-clasifica productos en MUJER / HOMBRE / UNISEX / NINO / NINA
 * usando palabras clave en el nombre + fallback por categoría.
 *
 * Reglas (en orden de prioridad):
 *   1. Match explícito de palabra clave en el nombre del producto
 *   2. Por categoría (default razonable según el rubro)
 *   3. UNISEX como fallback
 *
 * Uso:
 *   pnpm tsx clasificar-genero.ts            (analyze, default)
 *   pnpm tsx clasificar-genero.ts --apply
 *   pnpm tsx clasificar-genero.ts --apply --force   (sobreescribe productos que ya tienen género)
 */
import { sb, log } from './_env.js';

const APPLY = process.argv.includes('--apply');
const FORCE = process.argv.includes('--force');

type Genero = 'MUJER' | 'HOMBRE' | 'UNISEX' | 'NINO' | 'NINA';

type ProductoRow = {
  id: string;
  codigo: string;
  nombre: string;
  genero: string | null;
  categoria_id: string | null;
};

type CategoriaRow = { id: string; codigo: string; nombre: string };

/** Quitar tildes y lowercase. */
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

// =================== REGLAS POR PALABRA CLAVE ===================

// Patterns ordenados por especificidad (los más específicos primero).
// Si un producto matchea varias reglas, gana la primera.
type Regla = { genero: Genero; patrones: RegExp[]; razon: string };

const REGLAS: Regla[] = [
  // 1) NIÑA — keywords explícitos
  {
    genero: 'NINA',
    razon: 'palabra-niña',
    patrones: [
      /\bnina\b/, /\bninas\b/,
      /\bnena\b/, /\bnenas\b/,
      /\bgirl\b/, /\bgirls\b/,
      /\bprincesa\b/, /\bprincesas\b/,
      /\bbailarina\b/,
      /\bhada\b/, /\bhadas\b/,
      /\bmariposa\b/, /\bmariposita\b/,
      /\bmariquita\b/,
      /\babejita\b/,
      /\bflorista\b/,
    ],
  },
  // 2) NIÑA — personajes específicos femeninos infantiles
  {
    genero: 'NINA',
    razon: 'personaje-femenino',
    patrones: [
      /\bminnie\b/, /\bminie\b/, /\bmini mouse\b/,
      /\bbarbie\b/,
      /\brapunzel\b/, /\belsa\b/, /\bana\b(?!stasia)/, /\bfrozen\b/, /\bmoana\b/,
      /\bbella\b/, /\baurora\b/, /\bcenicienta\b/, /\bsirenita\b/, /\bblanca\s?nieves\b/,
      /\bjazmin\b/, /\bjasmin\b/, /\btiana\b/, /\bmerida\b/, /\bmulan\b/, /\bpocahontas\b/,
      /\bdora\b/, /\bpeppa\b/,
      /\bpitufina\b/, /\bchilindrina\b/, /\blulu\b/,
      /\bharley\s?quinn\b/, /\bcatwoman\b/, /\bgata\b/,
      /\bmaleficabuela\b/, /\bmalefica\b/, /\bmavis\b/, /\btifany\b/, /\bmerlina\b/, /\bhuerfana\b/,
      /\bnusta\b/, /\bsantita\b/,
      /\bbeli\b/, /\bbely\b/, /\bbubuja\b/, /\bburbuja\b/,
      /\bblipi\b/,
      /\barequipena\b/, /\bnegrita\b/, /\bcholita\b/,
    ],
  },
  // 3) NIÑO — keywords explícitos
  {
    genero: 'NINO',
    razon: 'palabra-niño',
    patrones: [
      /\bnino\b/, /\bninos\b/, /\bvaron\b/,
      /\bboy\b/, /\bboys\b/,
      /\bbailarin\b/,
      /\bsuperheroes?\b/, /\bsuperheroe\b/,
    ],
  },
  // 4) NIÑO — personajes específicos masculinos infantiles
  {
    genero: 'NINO',
    razon: 'personaje-masculino',
    patrones: [
      /\bspiderman\b/, /\bspider man\b/, /\bspider-man\b/,
      /\bironman\b/, /\biron man\b/,
      /\bsuperman\b/, /\bbatman\b/, /\bcapitan america\b/, /\bvenom\b/, /\bflash\b/,
      /\bhulk\b/, /\bthor\b/, /\bblack panther\b/, /\bdeadpool\b/,
      /\bmario\b/, /\bluigi\b/, /\bsonic\b/, /\bgoku\b/,
      /\bash\b/, /\bpikachu\b/, /\bblipi varon\b/,
      /\bchavo\b/, /\bquico\b/, /\bchapulin\b/, /\bchapulín\b/,
      /\bbatfly\b/, /\bsupermanito\b/,
      /\bmickey\b/, /\bdonald\b/, /\bgoofy\b/, /\bpluto\b/,
      /\bchucky\b/, /\bchuky\b/, /\bcalamar\b/, /\bjuego del calamar\b/,
      /\bblipi\b/, // base
      /\bmariposo\b/, /\babejorro\b/, // contraparte masculina de mariposa/abejita
      /\bpayaso\b/, /\bclown\b/,
      /\bbombero\b/, /\bpolicia nino\b/,
      /\bcomandante\b/, /\bcomando\b/, /\bsoldado\b/,
      /\barequipeño\b/, /\barequipeno\b/,
      /\bchalan\b/, /\bcharro\b/, /\bcholito\b/, /\bnegro\b/,
      /\balfonso ugarte\b/, /\balfonso hugarte\b/, /\bbolognesi\b/, /\bgrau\b/,
      /\bconquistado\b/, /\bconquistador\b/, /\bgaribaldino\b/,
      /\bcapuchon\b/, /\bcaperucito\b/,
    ],
  },
  // 5) MUJER — adulta explícita
  {
    genero: 'MUJER',
    razon: 'mujer-adulta',
    patrones: [
      /\bmujer\b/, /\bdama\b/, /\bsenora\b/, /\bsenorita\b/, /\bfemenina\b/, /\bfemenino\b/,
      /\bmama\b/, /\bmaman?oel?a\b/, /\bmaman?oela\b/,
      /\babuela\b/, /\btia\b/,
      /\bmaria\b/, /\bnegroide mujer\b/,
      /\benfermera\b/, /\bdoctora\b/, /\bobstetra\b/, /\bbombera\b/, /\bpolicia mujer\b/,
      /\banimadora\b/, /\bbailarina adulta\b/,
      /\bmujer maravilla\b/, /\bcatwoman adulta\b/,
    ],
  },
  // 6) HOMBRE — adulto explícito
  {
    genero: 'HOMBRE',
    razon: 'hombre-adulto',
    patrones: [
      /\bhombre\b/, /\bsenor\b/, /\bcaballero\b/, /\bvaron adulto\b/, /\bmasculino\b/,
      /\bpapa noel\b/, /\bsanta claus\b/,
      /\babuelo\b/, /\btio\b/,
      /\bjose\b/, /\bjesus\b/, /\bnoe\b/,
      /\benfermero\b/, /\bdoctor\b/, /\bbombero adulto\b/, /\bpolicia hombre\b/,
      /\bcura\b/, /\bsacerdote\b/, /\brey\b/, /\brey mago\b/, /\breyes magos\b/,
    ],
  },
];

// =================== REGLAS POR CATEGORÍA (fallback) ===================

const CATEGORIA_DEFAULT: Record<string, Genero> = {
  'PRC': 'NINA',  // Princesas Especiales
  'SUH': 'NINA',  // Superheroínas
  'SUP': 'NINO',  // Superhéroes (default niño)
  'PRI': 'UNISEX', // Primavera
  'PRO': 'UNISEX', // Profesiones
  'HAL': 'UNISEX', // Halloween
  'NAV': 'UNISEX', // Navidad
  'FIP': 'UNISEX', // Fiestas Patrias
  'DAN': 'UNISEX', // Danzas Típicas
  'PER': 'UNISEX', // Personajes Varios
  'VER': 'UNISEX', // Talleres de Verano
  'ACC': 'UNISEX', // Accesorios
};

// =================== CLASIFICADOR ===================

function clasificar(p: ProductoRow, catCodigo: string | null): { genero: Genero; razon: string } {
  const nombre = norm(p.nombre);

  for (const r of REGLAS) {
    for (const pat of r.patrones) {
      if (pat.test(nombre)) {
        return { genero: r.genero, razon: r.razon };
      }
    }
  }

  if (catCodigo && CATEGORIA_DEFAULT[catCodigo]) {
    return { genero: CATEGORIA_DEFAULT[catCodigo]!, razon: `categoria-${catCodigo}` };
  }

  return { genero: 'UNISEX', razon: 'fallback' };
}

// =================== MAIN ===================

async function loadAll<T>(table: string, select: string): Promise<T[]> {
  const all: T[] = [];
  const PAGE = 1000;
  for (let off = 0; ; off += PAGE) {
    const { data, error } = await sb.from(table).select(select).range(off, off + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...(data as unknown as T[]));
    if (data.length < PAGE) break;
  }
  return all;
}

async function main() {
  log(`Modo: ${APPLY ? '⚙️  APPLY' : '🔍 ANALYZE'}${FORCE ? ' (--force: sobreescribe existentes)' : ''}`);

  const [productos, categorias] = await Promise.all([
    loadAll<ProductoRow>('productos', 'id, codigo, nombre, genero, categoria_id'),
    loadAll<CategoriaRow>('categorias', 'id, codigo, nombre'),
  ]);
  const catById = new Map(categorias.map((c) => [c.id, c]));
  log(`Productos: ${productos.length}, Categorías: ${categorias.length}`);

  type Plan = { producto: ProductoRow; nuevo: Genero; razon: string; cambia: boolean };
  const planes: Plan[] = productos.map((p) => {
    const cat = p.categoria_id ? catById.get(p.categoria_id) : null;
    const r = clasificar(p, cat?.codigo ?? null);
    return {
      producto: p,
      nuevo: r.genero,
      razon: r.razon,
      cambia: p.genero !== r.genero && (FORCE || !p.genero),
    };
  });

  // Stats
  const ya = planes.filter((p) => p.producto.genero != null).length;
  const sinAsignar = productos.length - ya;
  const aCambiar = planes.filter((p) => p.cambia);

  log(`\n=== RESUMEN ACTUAL ===`);
  log(`Con género asignado:   ${ya}`);
  log(`Sin género asignado:   ${sinAsignar}`);
  log(`A cambiar (este run):  ${aCambiar.length}`);

  // Distribución target
  const dist: Record<Genero, number> = { MUJER: 0, HOMBRE: 0, UNISEX: 0, NINO: 0, NINA: 0 };
  for (const p of planes) dist[p.nuevo]++;
  log(`\n=== DISTRIBUCIÓN OBJETIVO (todos los productos) ===`);
  for (const [g, n] of Object.entries(dist)) {
    log(`  ${g.padEnd(8)}: ${n}`);
  }

  // Distribución por razón
  const porRazon = new Map<string, number>();
  for (const p of aCambiar) {
    porRazon.set(p.razon, (porRazon.get(p.razon) ?? 0) + 1);
  }
  log(`\n=== POR REGLA APLICADA (solo cambios) ===`);
  for (const [r, n] of Array.from(porRazon.entries()).sort((a, b) => b[1] - a[1])) {
    log(`  ${r.padEnd(25)}: ${n}`);
  }

  // Sample por género (10 primeros de cada uno)
  log(`\n=== EJEMPLOS (primeros 5 de cada categoría target) ===`);
  for (const g of ['NINO', 'NINA', 'MUJER', 'HOMBRE', 'UNISEX'] as Genero[]) {
    const ejemplos = aCambiar.filter((p) => p.nuevo === g).slice(0, 5);
    if (ejemplos.length === 0) continue;
    log(`\n  → ${g}:`);
    for (const e of ejemplos) {
      log(`     • ${e.producto.nombre.padEnd(45)} (razón: ${e.razon})`);
    }
  }

  if (!APPLY) {
    log(`\n💡 Para aplicar: pnpm tsx clasificar-genero.ts --apply`);
    log(`💡 Para sobreescribir todos (incluso los que ya tienen): --apply --force`);
    return;
  }

  if (aCambiar.length === 0) {
    log(`\n✅ Nada que cambiar.`);
    return;
  }

  log(`\n⚙️  Actualizando ${aCambiar.length} productos en lotes de 100...`);
  let actualizados = 0;
  let errores = 0;

  // Agrupar por género destino para hacer updates más eficientes (1 update por género).
  for (const g of ['MUJER', 'HOMBRE', 'UNISEX', 'NINO', 'NINA'] as Genero[]) {
    const ids = aCambiar.filter((p) => p.nuevo === g).map((p) => p.producto.id);
    if (ids.length === 0) continue;
    // Lotes de 100 IDs
    for (let i = 0; i < ids.length; i += 100) {
      const lote = ids.slice(i, i + 100);
      const { error } = await sb.from('productos').update({ genero: g }).in('id', lote);
      if (error) {
        console.error(`update lote ${g}:`, error.message);
        errores += lote.length;
      } else {
        actualizados += lote.length;
      }
    }
    log(`   · ${g.padEnd(8)}: ${ids.length} productos`);
  }

  log(`\n✅ Listo:`);
  log(`   ├─ Actualizados: ${actualizados}`);
  log(`   └─ Errores:      ${errores}`);
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
