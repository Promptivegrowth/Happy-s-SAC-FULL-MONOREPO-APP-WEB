/**
 * CI: aplica migraciones pendientes vía la Management API y las registra en
 * supabase_migrations.schema_migrations. Idempotente: si todas las migraciones
 * ya están registradas, no hace nada.
 *
 * Uso: tsx supabase/seed/ci-apply-pending.ts
 * Requiere envs: SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF
 */
import fs from 'node:fs';
import path from 'node:path';

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const REF = process.env.SUPABASE_PROJECT_REF;
if (!TOKEN || !REF) {
  console.error('❌ Falta SUPABASE_ACCESS_TOKEN o SUPABASE_PROJECT_REF');
  process.exit(1);
}

async function query<T = unknown>(sql: string): Promise<T> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

const MIG_DIR = path.resolve(process.cwd(), 'supabase/migrations');
const archivos = fs
  .readdirSync(MIG_DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => {
    const m = f.match(/^(\d+)_(.+)\.sql$/);
    if (!m) throw new Error(`Nombre de archivo inválido: ${f}`);
    return { file: f, version: m[1]!, name: m[2]! };
  });

const registradas = await query<Array<{ version: string }>>(
  `select version from supabase_migrations.schema_migrations`,
);
const yaAplicadas = new Set(registradas.map((r) => r.version));

const pendientes = archivos.filter((a) => !yaAplicadas.has(a.version));

if (pendientes.length === 0) {
  console.info(`✓ Sin migraciones pendientes (${archivos.length} ya aplicadas)`);
  process.exit(0);
}

console.info(`Aplicando ${pendientes.length} migración(es) pendiente(s)…`);
for (const m of pendientes) {
  const sql = fs.readFileSync(path.join(MIG_DIR, m.file), 'utf-8');
  console.info(`  → ${m.file} (${sql.length} chars)`);
  try {
    await query(sql);
  } catch (e) {
    console.error(`❌ Falló ${m.file}: ${(e as Error).message}`);
    process.exit(1);
  }
  // Registrar como aplicada (escapamos comillas simples por las dudas).
  const safeName = m.name.replace(/'/g, "''");
  await query(
    `insert into supabase_migrations.schema_migrations (version, name, statements)
       values ('${m.version}', '${safeName}', '{}'::text[])
     on conflict (version) do nothing`,
  );
  console.info(`     ✓ aplicada y registrada`);
}

console.info(`✓ Listo: ${pendientes.length} migración(es) aplicada(s)`);
