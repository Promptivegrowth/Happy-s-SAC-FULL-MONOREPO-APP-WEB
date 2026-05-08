/**
 * Aplica un archivo .sql vía la Supabase Management API (no requiere CLI).
 *
 * Uso: npx tsx supabase/seed/apply-migration.ts <ruta-al-sql>
 * Requiere SUPABASE_ACCESS_TOKEN y SUPABASE_PROJECT_REF en .env.
 */
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

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
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
