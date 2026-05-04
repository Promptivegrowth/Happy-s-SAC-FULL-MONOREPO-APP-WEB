/**
 * Registra en supabase_migrations.schema_migrations las migraciones que
 * fueron aplicadas vía Management API (en vez de via CLI). Sin esto el
 * workflow CI "DB migrate" intenta reaplicarlas y falla porque los objetos
 * ya existen.
 */
import dotenv from 'dotenv';
import path from 'node:path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const REF = process.env.SUPABASE_PROJECT_REF;

const VERSIONS = [
  { version: '20260101003100', name: '31_productos_categorias_extra' },
  { version: '20260101003200', name: '32_atomic_close_funcs' },
  { version: '20260101003300', name: '33_pagos_talleres' },
];

async function main() {
  if (!TOKEN || !REF) {
    console.error('Falta SUPABASE_ACCESS_TOKEN o SUPABASE_PROJECT_REF');
    process.exit(1);
  }

  // Asegurar que el schema y la tabla existen (la CLI los crea cuando hace
  // su primer push; si nunca corrió, los creamos nosotros).
  const setupSql = `
    create schema if not exists supabase_migrations;
    create table if not exists supabase_migrations.schema_migrations (
      version text primary key,
      name text,
      statements text[]
    );
  `;
  await runSql(setupSql);

  // Insertar cada versión (idempotente con ON CONFLICT)
  for (const m of VERSIONS) {
    const sql = `
      insert into supabase_migrations.schema_migrations (version, name, statements)
      values ('${m.version}', '${m.name}', '{}'::text[])
      on conflict (version) do nothing;
    `;
    await runSql(sql);
    console.info(`✓ Registrada: ${m.version} - ${m.name}`);
  }

  // Verificar
  const checkResp = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: 'select version, name from supabase_migrations.schema_migrations order by version desc limit 10;',
    }),
  });
  const rows = (await checkResp.json()) as { version: string; name: string }[];
  console.info(`\nÚltimas 10 migraciones registradas:`);
  for (const r of rows) console.info(`  ${r.version} · ${r.name}`);
}

async function runSql(query: string) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) {
    console.error(`HTTP ${res.status}:`, await res.text());
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
