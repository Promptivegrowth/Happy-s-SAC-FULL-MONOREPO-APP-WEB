import { headers } from 'next/headers';
import { Sidebar } from '@/components/sidebar';
import { Topbar } from '@/components/topbar';
import { getSession } from '@/server/session';
import { puedeVer } from '@/server/permisos';
import { SinPermiso } from '@/components/sin-permiso';
import { listarMisNotificaciones, contarNotificacionesNoLeidas } from '@/server/actions/notificaciones';

// El layout hace queries vía getSession(), por lo tanto debe ser dinámico.
// Sin este flag, las pages hijas sin force-dynamic propio intentan prerrenderizarse
// en build y fallan porque no tienen las env vars de Supabase.
export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const sesion = await getSession();

  /*
   * La campanita no puede tumbar el ERP.
   *
   * Si cualquiera de estas dos consultas falla, el layout entero revienta — y
   * un layout que revienta no tiene error boundary que lo atrape: se ve una
   * PANTALLA EN BLANCO y hay que recargar a mano. Eso es lo que reportó Luigi
   * el 19/09/2026. Por unas notificaciones no vale la pena perder el sistema:
   * si no llegan, la campanita sale vacía y todo lo demás sigue funcionando.
   */
  const [notificaciones, noLeidas, cabeceras] = await Promise.all([
    listarMisNotificaciones(15).catch(() => []),
    contarNotificacionesNoLeidas().catch(() => 0),
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

  /*
   * El tablero se deja pasar SIEMPRE, y lo resuelve su propia página.
   *
   * Todo el mundo cae en /dashboard al iniciar sesión, pero el tablero es sólo
   * de gerencia y contabilidad. Si acá se le pone el cartel a quien no lo
   * tiene, la página nunca llega a correr — y es la página la que sabe desviar
   * a cada uno a lo suyo. El 20/09/2026 eso dejó a Harold plantado en "esta
   * sección no es para tu rol" nada más entrar, sin poder hacer nada.
   *
   * Que pase por acá no lo abre a nadie: la página comprueba el permiso igual,
   * y si no hay a dónde desviar, muestra el mismo cartel.
   */
  const permitido =
    pathname === '' || pathname === '/dashboard' || puedeVer(sesion.roles, pathname);

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
