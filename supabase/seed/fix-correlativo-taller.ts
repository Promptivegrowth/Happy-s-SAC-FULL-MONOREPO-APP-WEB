/** Fix one-time: sincronizar el contador TALLER al max real existente. */
import dotenv from 'dotenv';
import path from 'node:path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN!;
const REF = process.env.SUPABASE_PROJECT_REF!;

const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: `
      with maxv as (
        select coalesce(max(cast(substring(codigo from 'TAL-([0-9]+)') as int)), 0) as m
        from public.talleres
        where codigo ~ '^TAL-[0-9]+$'
      )
      insert into public.correlativos(clave, ultimo)
      select 'TALLER', m from maxv
      on conflict (clave) do update
        set ultimo = greatest(public.correlativos.ultimo, excluded.ultimo),
            actualizado_en = now()
      returning clave, ultimo;
    `,
  }),
});
console.log('Status:', r.status);
console.log(await r.text());
