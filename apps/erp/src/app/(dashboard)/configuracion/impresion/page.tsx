import { createClient } from '@happy/db/server';
import { PageShell } from '@/components/page-shell';
import { requireRol } from '@/server/session';
import { listarEquiposImpresion } from '@/server/actions/impresion';
import { EquiposImpresionClient } from './equipos-client';

export const metadata = { title: 'Impresión de tickets' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  await requireRol('gerente');

  const sb = await createClient();
  const [equipos, { data: almacenes }] = await Promise.all([
    listarEquiposImpresion(),
    sb.from('almacenes').select('id, codigo, nombre').eq('activo', true).eq('es_tienda', true).order('codigo'),
  ]);

  // La URL del POS viaja dentro del código de instalación: es el sistema al que
  // el agente le va a preguntar por los tickets.
  const urlPos = (process.env.NEXT_PUBLIC_POS_URL ?? 'http://localhost:3002').replace(/\/$/, '');

  return (
    <PageShell
      title="Impresión de tickets"
      description="Las computadoras con ticketera. En cada una se instala una vez el agente de impresión, y desde acá se controla por qué impresora sale el ticket y dónde corta el papel."
    >
      <EquiposImpresionClient
        equiposIniciales={equipos}
        almacenes={(almacenes ?? []) as { id: string; codigo: string; nombre: string }[]}
        urlPos={urlPos}
      />
    </PageShell>
  );
}
