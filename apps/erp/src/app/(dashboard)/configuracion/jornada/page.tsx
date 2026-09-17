import { PageShell } from '@/components/page-shell';
import { requireRol } from '@/server/session';
import { getJornadaEstandar } from '../../operarios/_jornada';
import { JornadaClient } from './client';
import type { DiaJornada } from '@/server/actions/jornada';

export const metadata = { title: 'Jornada de planta' };
export const dynamic = 'force-dynamic';

const ORDEN: DiaJornada['dia'][] = ['LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB', 'DOM'];

export default async function JornadaPage() {
  await requireRol('gerente');
  const jornada = await getJornadaEstandar();

  /*
   * Los siete días, no solo los laborables.
   *
   * Un día que hoy no se trabaja tiene que estar en la tabla igual, con su
   * casilla sin marcar: si solo se listaran los laborables, no habría manera de
   * agregar el domingo cuando entre una campaña.
   */
  const dias: DiaJornada[] = ORDEN.map((dia) => {
    const h = jornada.horarios[dia];
    const laborable = jornada.dias.includes(dia);
    return {
      dia,
      laborable,
      inicio: h?.inicio ?? '08:00',
      fin: h?.fin ?? '18:00',
      refrigerio_inicio: h?.refrigerio_inicio ?? '13:00',
      refrigerio_min: h?.refrigerio_min ?? 0,
    };
  });

  return (
    <PageShell
      title="Jornada de planta"
      description="Horario de trabajo y refrigerio por día. Define cuánto tiempo se le cobra a cada operación y los minutos disponibles de cada área."
    >
      <JornadaClient inicial={dias} />
    </PageShell>
  );
}
