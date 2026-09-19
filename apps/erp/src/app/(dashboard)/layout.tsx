import { headers } from 'next/headers';
import { Sidebar } from '@/components/sidebar';
import { Topbar } from '@/components/topbar';
import { getSession } from '@/server/session';
import { redirect } from 'next/navigation';
import { puedeVer, primeraRutaPara } from '@/server/permisos';
import { SinPermiso } from '@/components/sin-permiso';
import { listarMisNotificaciones, contarNotificacionesNoLeidas } from '@/server/actions/notificaciones';

// El layout hace queries vía getSession(), por lo tanto debe ser dinámico.
// Sin este flag, las pages hijas sin force-dynamic propio intentan prerrenderizarse
// en build y fallan porque no tienen las env vars de Supabase.
export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const sesion = await getSession();
  const [notificaciones, noLeidas, cabeceras] = await Promise.all([
    listarMisNotificaciones(15),
    contarNotificacionesNoLeidas(),
    headers(),
  ]);

  /*
   * El control de permisos, en el único lugar por el que pasan todas las
   * pantallas.
   *
   * Antes esto no se comprobaba en ninguna parte: el middleware sólo miraba que
   * la persona hubiera iniciado sesión, y de 118 pantallas apenas 13 se defendían
   * solas. Esconder la entrada del menú no alcanzaba, porque la dirección escrita
   * a mano entraba igual.
   *
   * Se muestra un cartel en lugar de redirigir. Un rebote silencioso al
   * dashboard deja a la persona sin entender qué pasó y llamando a soporte; acá
   * se le dice que existe, que no es para su rol y a quién pedírselo.
   */
  const pathname = cabeceras.get('x-pathname') ?? '';
  const permitido = pathname === '' || puedeVer(sesion.roles, pathname);

  /*
   * Si cae en el tablero y no le corresponde, se lo lleva a lo suyo.
   *
   * /dashboard es donde aterriza todo el mundo al iniciar sesión, y desde el
   * 19/09/2026 es sólo de gerencia y contabilidad. Mostrar el cartel de "no es
   * para tu rol" justo al entrar seria dejar a media empresa creyendo que el
   * sistema no la deja pasar. Al resto de las pantallas sí se les muestra el
   * cartel: ahí la persona fue a buscarlas y merece una explicación, no un
   * rebote silencioso.
   */
  if (!permitido && pathname === '/dashboard') redirect(primeraRutaPara(sesion.roles));

  return (
    <div className="flex min-h-screen">
      <Sidebar roles={sesion.roles} />
      <div className="flex w-full flex-col">
        <Topbar nombre={sesion.nombre} email={sesion.email} roles={sesion.roles} notificaciones={notificaciones} noLeidas={noLeidas} />
        <main className="flex-1 overflow-x-hidden p-6">
          {permitido ? children : <SinPermiso roles={sesion.roles} />}
        </main>
      </div>
    </div>
  );
}
