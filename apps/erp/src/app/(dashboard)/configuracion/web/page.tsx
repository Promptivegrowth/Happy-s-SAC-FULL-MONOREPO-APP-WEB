import { PageShell } from '@/components/page-shell';
import { requireRol } from '@/server/session';
import { obtenerContenido } from '@/server/actions/web-config';
import { WebConfigClient } from './client';

export const metadata = { title: 'Contenido de la web' };
export const dynamic = 'force-dynamic';

export default async function WebConfigPage() {
  await requireRol('gerente');
  const contenido = await obtenerContenido();

  /*
   * A dónde apunta el botón de "abrir la tienda".
   *
   * Sale de la variable de entorno para que en pruebas lleve al sitio de
   * pruebas y no al que están mirando los clientes.
   */
  const urlWeb = process.env.NEXT_PUBLIC_WEB_URL || 'https://www.disfraceshappys.com.pe';

  return (
    <PageShell
      title="Contenido de la web"
      description="El carrusel de la portada, el banner mayorista, los teléfonos y las redes. Lo que se guarda acá sale publicado en la tienda."
    >
      <WebConfigClient inicial={contenido} urlWeb={urlWeb} />
    </PageShell>
  );
}
