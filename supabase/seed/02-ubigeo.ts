/**
 * Carga el dataset INEI completo de ubigeos Perú.
 *
 * NOTA: El archivo supabase/seed/ubigeo-peru.json debe contener el dataset oficial INEI.
 * Descargar desde: https://datosabiertos.gob.pe (INEI — Ubigeo Nacional)
 * o repositorios públicos: https://github.com/joseluisq/ubigeos-peru
 *
 * Formato esperado:
 *   [
 *     { "codigo":"010101","departamento":"AMAZONAS","provincia":"CHACHAPOYAS","distrito":"CHACHAPOYAS" },
 *     ...
 *   ]
 */

import fs from 'node:fs';
import path from 'node:path';
import { sb, log, error, __dirname } from './_env';

type UbigeoRow = {
  codigo: string;
  departamento: string;
  provincia: string;
  distrito: string;
  codigo_reniec?: string;
  region_geografica?: string;
};

async function main() {
  const file = path.resolve(__dirname, 'ubigeo-peru.json');
  if (!fs.existsSync(file)) {
    error('Falta supabase/seed/ubigeo-peru.json. Descargar el dataset INEI.');
    process.exit(1);
  }
  const data: UbigeoRow[] = JSON.parse(fs.readFileSync(file, 'utf-8'));
  log(`Ubigeo: ${data.length} distritos a cargar`);

  const rows = data.map((r) => ({
    codigo: r.codigo.padStart(6, '0'),
    codigo_reniec: r.codigo_reniec ?? null,
    departamento_codigo: r.codigo.slice(0, 2),
    departamento: r.departamento,
    provincia_codigo: r.codigo.slice(0, 4),
    provincia: r.provincia,
    distrito: r.distrito,
    region_geografica: r.region_geografica ?? null,
  }));

  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const { error: err } = await sb.from('ubigeo').upsert(chunk, { onConflict: 'codigo' });
    if (err) throw err;
    log(`  • ${i + chunk.length}/${rows.length}`);
  }
  log('✅ Ubigeo cargado');
}

main().catch((e) => { console.error(e); process.exit(1); });
