/**
 * Verifica que la integración multi-provider de RUC/DNI funcione.
 * Lee DECOLECTA_TOKEN o APIS_NET_PE_TOKEN del .env.
 */
import dotenv from 'dotenv';
import path from 'node:path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { consultaRUC } from '../../packages/lib/src/sunat/index.js';

async function main() {
  const provider = process.env.DECOLECTA_TOKEN ? 'decolecta' : process.env.APIS_NET_PE_TOKEN ? 'apisnetpe' : 'NONE';
  console.info(`Provider activo: ${provider}`);

  console.info(`\nProbando RUC 20100070970...`);
  const ruc = await consultaRUC('20100070970');
  console.info(`  numero:       ${ruc.numero}`);
  console.info(`  razonSocial:  ${ruc.razonSocial}`);
  console.info(`  estado:       ${ruc.estado} · ${ruc.condicion}`);
  console.info(`  direccion:    ${ruc.direccion}`);
  console.info(`  ubigeo:       ${ruc.ubigeo} (${ruc.distrito})`);
}

main().catch((e) => { console.error(e); process.exit(1); });
