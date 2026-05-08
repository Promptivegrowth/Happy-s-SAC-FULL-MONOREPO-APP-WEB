/** Marca una migración como aplicada en supabase_migrations.schema_migrations
 *  para que la CLI del CI no intente reaplicarla. Uso: tsx _register-mig.ts <version> <name> */
import dotenv from 'dotenv';
import path from 'node:path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN!;
const REF = process.env.SUPABASE_PROJECT_REF!;
const [version, name] = process.argv.slice(2);
if (!version || !name) { console.error('uso: tsx _register-mig.ts <version> <name>'); process.exit(1); }
const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: `insert into supabase_migrations.schema_migrations (version, name, statements) values ('${version}', '${name}', '{}'::text[]) on conflict (version) do nothing;`,
  }),
});
console.log('Status:', res.status);
