/**
 * Inserta el área COSTURA (que faltaba) y mapea su valor_minuto al
 * mismo del taller (0.183 S/min) ya que la costura mayormente se
 * terceriza pero el área debe existir para asignarla en la receta.
 */
import { sb, log } from './_env.js';

async function main() {
  const { data: existente } = await sb
    .from('areas_produccion')
    .select('id')
    .eq('codigo', 'COSTURA')
    .maybeSingle();
  if (existente) {
    log('Ya existe área COSTURA. No se inserta.');
    return;
  }
  const { data, error } = await sb
    .from('areas_produccion')
    .insert({ codigo: 'COSTURA', nombre: 'Costura', valor_minuto: 0.183, activa: true })
    .select('id, codigo, nombre, valor_minuto')
    .single();
  if (error) {
    log(`ERROR: ${error.message}`);
    return;
  }
  log(`✓ Área COSTURA creada: ${JSON.stringify(data)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
