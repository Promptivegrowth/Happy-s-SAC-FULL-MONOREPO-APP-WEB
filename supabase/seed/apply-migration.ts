/**
 * Aplica un archivo .sql vía la Supabase Management API (no requiere CLI).
 *
 * Uso: npx tsx supabase/seed/apply-migration.ts <ruta-al-sql>
 * Requiere SUPABASE_ACCESS_TOKEN y SUPABASE_PROJECT_REF en .env.
 */
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env'), override: true });

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const REF = process.env.SUPABASE_PROJECT_REF;

async function main() {
  if (!TOKEN || !REF) {
    console.error('❌ Falta SUPABASE_ACCESS_TOKEN o SUPABASE_PROJECT_REF en .env');
    process.exit(1);
  }
  const sqlPath = process.argv[2];
  if (!sqlPath) {
    console.error('❌ Uso: npx tsx supabase/seed/apply-migration.ts <ruta-al-sql>');
    process.exit(1);
  }
  const fullPath = path.resolve(sqlPath);
  if (!fs.existsSync(fullPath)) {
    console.error(`❌ No existe: ${fullPath}`);
    process.exit(1);
  }
  const sql = fs.readFileSync(fullPath, 'utf-8');
  console.info(`[apply] ${path.basename(fullPath)} (${sql.length} chars)...`);

  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error(`❌ HTTP ${res.status}: ${text}`);
    process.exit(1);
  }
  const result = await res.json();
  console.info('[apply] ✓ aplicado');
  console.info(JSON.stringify(result, null, 2).slice(0, 500));

  // Si el archivo es una migración formal (NNNNN_nombre.sql) bajo
  // supabase/migrations/, registrarla en supabase_migrations.schema_migrations
  // para que el CI (ci-apply-pending.ts) no la vea como pendiente y reintente
  // aplicarla rompiendo el job.
  const fileBase = path.basename(fullPath);
  const migMatch = fileBase.match(/^(\d+)_(.+)\.sql$/);
  const esMigracion = migMatch && fullPath.includes(`migrations${path.sep}`);
  if (esMigracion && migMatch) {
    const version = migMatch[1]!;
    const name = migMatch[2]!.replace(/'/g, "''");
    try {
      const regRes = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `insert into supabase_migrations.schema_migrations (version, name, statements)
                  values ('${version}', '${name}', '{}'::text[])
                  on conflict (version) do nothing`,
        }),
      });
      if (regRes.ok) console.info(`[apply] ✓ registrada en schema_migrations (versión ${version})`);
      else console.warn(`[apply] ⚠ no se pudo registrar versión ${version}: HTTP ${regRes.status}`);
    } catch (e) {
      console.warn(`[apply] ⚠ no se pudo registrar versión: ${(e as Error).message}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
