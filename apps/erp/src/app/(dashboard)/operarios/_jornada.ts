import { createClient } from '@happy/db/server';

export type JornadaEstandar = { inicio: string; fin: string; dias: string[] };

const DEFAULT: JornadaEstandar = {
  inicio: '08:00',
  fin: '17:00',
  dias: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB'],
};

/** Lee la jornada estándar de la tabla configuracion. Cae en defaults si no está. */
export async function getJornadaEstandar(): Promise<JornadaEstandar> {
  const sb = await createClient();
  const { data } = await sb
    .from('configuracion')
    .select('clave, valor')
    .in('clave', ['jornada_estandar_inicio', 'jornada_estandar_fin', 'jornada_estandar_dias']);
  const map = new Map((data ?? []).map((r) => [r.clave as string, r.valor as unknown]));
  return {
    inicio: (map.get('jornada_estandar_inicio') as string) || DEFAULT.inicio,
    fin: (map.get('jornada_estandar_fin') as string) || DEFAULT.fin,
    dias: (map.get('jornada_estandar_dias') as string[]) ?? DEFAULT.dias,
  };
}
