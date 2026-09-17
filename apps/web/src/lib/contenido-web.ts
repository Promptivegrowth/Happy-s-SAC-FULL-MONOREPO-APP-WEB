import { createClient } from '@happy/db/server';
import { contenidoDesdeFilas, type ContenidoWeb } from '@happy/lib/web/contenido';

/**
 * Lee de la base el contenido que se edita desde el ERP.
 *
 * Si la consulta falla —la base caída, un problema de red— la tienda sale con
 * lo que ya estaba publicado en vez de una portada vacía. Un visitante que
 * llega a comprar no tiene por qué enterarse de que un panel interno tuvo un
 * problema.
 */
export async function obtenerContenidoWeb(): Promise<ContenidoWeb> {
  try {
    const sb = await createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sbAny = sb as unknown as { from: (t: string) => any };
    const { data } = await sbAny.from('web_config').select('clave, valor');
    return contenidoDesdeFilas(data as Array<{ clave: string; valor: unknown }> | null);
  } catch {
    return contenidoDesdeFilas(null);
  }
}
