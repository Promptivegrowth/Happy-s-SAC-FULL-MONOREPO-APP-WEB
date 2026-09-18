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
   * A dónde apunta el botón de "abrir la tienda", y de dónde salen las
   * miniaturas de las imágenes que vinieron con el sitio.
   *
   * Sale de la variable de entorno para que en pruebas lleve al sitio de
   * pruebas y no al que están mirando los clientes.
   *
   * Con una excepción: si esa variable quedó apuntando a localhost —es lo que
   * pasa cuando se copia el archivo de configuración de la máquina de
   * desarrollo al servidor— no sirve para nadie que abra el ERP desde otra
   * computadora. En ese caso se usa la tienda de verdad.
   */
  const configurada = process.env.NEXT_PUBLIC_WEB_URL ?? '';
  const esLocal = /localhost|127\.0\.0\.1/i.test(configurada);
  const urlWeb = configurada && !esLocal ? configurada : 'https://www.disfraceshappys.com.pe';

  return (
    <PageShell
      title="Contenido de la web"
      description="El carrusel de la portada, el banner mayorista, los teléfonos y las redes. Lo que se guarda acá sale publicado en la tienda."
    >
      <WebConfigClient inicial={contenido} urlWeb={urlWeb} />
    </PageShell>
  );
}
