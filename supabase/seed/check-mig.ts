/** Inspecciona las migraciones registradas vs los archivos en disco. */
import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN!;
const REF = process.env.SUPABASE_PROJECT_REF!;

const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: `select version, name, coalesce(array_length(statements, 1), 0) as n_statements from supabase_migrations.schema_migrations where version >= '20260101003000' order by version`,
  }),
});
const remoto = await r.json() as Array<{ version: string; name: string; n_statements: number }>;
console.log('Remoto:');
console.table(remoto);

const dir = path.resolve(process.cwd(), 'supabase/migrations');
const archivos = fs.readdirSync(dir)
  .filter((f) => f.endsWith('.sql') && f >= '20260101003000')
  .map((f) => {
    const m = f.match(/^(\d+)_(.+)\.sql$/);
    return m ? { version: m[1], name: m[2] } : null;
  })
  .filter(Boolean);
console.log('Archivos:');
console.table(archivos);
