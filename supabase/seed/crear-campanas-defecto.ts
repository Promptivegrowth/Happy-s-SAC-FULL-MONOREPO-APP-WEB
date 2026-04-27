/**
 * crear-campanas-defecto.ts
 * Crea campañas "default" del calendario peruano si no existen.
 * Idempotente: ejecutar varias veces es seguro (upsert por código).
 */
import { sb, log } from './_env.js';

type CampanaDef = {
  codigo: string;
  nombre: string;
  descripcion: string;
  fecha_inicio: string;
  fecha_fin: string;
  destacada_web?: boolean;
};

const CAMPANAS: CampanaDef[] = [
  {
    codigo: 'DIA-MADRE-2026',
    nombre: 'Día de la Madre 2026',
    descripcion: 'Sorprende a mamá con un disfraz único: bailarinas, princesas, personajes y más. Envíos en Lima en 2-3 días.',
    fecha_inicio: '2026-04-01',
    fecha_fin: '2026-05-15',
    destacada_web: true,
  },
  {
    codigo: 'FIESTAS-PATRIAS-2026',
    nombre: 'Fiestas Patrias 2026',
    descripcion: 'Celebra el Perú con disfraces típicos: Marinera, Festejo, Negroide, Huaylas y más.',
    fecha_inicio: '2026-07-01',
    fecha_fin: '2026-08-15',
    destacada_web: true,
  },
  {
    codigo: 'HALLOWEEN-2026',
    nombre: 'Halloween 2026',
    descripcion: 'Los disfraces más terroríficos para pequeños y grandes. Stock garantizado para octubre.',
    fecha_inicio: '2026-09-15',
    fecha_fin: '2026-11-05',
    destacada_web: true,
  },
  {
    codigo: 'NAVIDAD-2026',
    nombre: 'Navidad 2026',
    descripcion: 'Papá Noel, duendes, renos, pesebre completo. Para shows escolares y eventos familiares.',
    fecha_inicio: '2026-11-15',
    fecha_fin: '2026-12-31',
    destacada_web: true,
  },
];

async function main() {
  log(`Asegurando ${CAMPANAS.length} campañas en BD...`);
  let creadas = 0;
  let actualizadas = 0;

  for (const def of CAMPANAS) {
    const { data: existing } = await sb
      .from('campanas')
      .select('id, slug, activa')
      .eq('codigo', def.codigo)
      .maybeSingle();

    if (existing) {
      // Reactivar si está apagada y asegurar campos básicos
      const { error } = await sb
        .from('campanas')
        .update({
          nombre: def.nombre,
          descripcion: def.descripcion,
          fecha_inicio: def.fecha_inicio,
          fecha_fin: def.fecha_fin,
          activa: true,
          destacada_web: def.destacada_web ?? false,
        })
        .eq('codigo', def.codigo);
      if (error) {
        console.error(`update ${def.codigo}:`, error.message);
        continue;
      }
      actualizadas++;
      log(`  ↻ ${def.codigo.padEnd(25)} actualizada (slug=${existing.slug ?? 'auto'})`);
    } else {
      const { data, error } = await sb
        .from('campanas')
        .insert({
          codigo: def.codigo,
          nombre: def.nombre,
          descripcion: def.descripcion,
          fecha_inicio: def.fecha_inicio,
          fecha_fin: def.fecha_fin,
          activa: true,
          destacada_web: def.destacada_web ?? false,
        })
        .select('slug')
        .single();
      if (error) {
        console.error(`insert ${def.codigo}:`, error.message);
        continue;
      }
      creadas++;
      log(`  ✨ ${def.codigo.padEnd(25)} creada (slug=${data.slug ?? 'auto'})`);
    }
  }

  log(`\n✅ Listo: ${creadas} creadas, ${actualizadas} actualizadas`);

  // Mostrar URLs finales
  log(`\nURLs disponibles en la web:`);
  for (const def of CAMPANAS) {
    const { data } = await sb.from('campanas').select('slug').eq('codigo', def.codigo).maybeSingle();
    log(`  /campanias/${data?.slug ?? '(sin slug)'}`);
  }
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
