import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Rutas sin sesión.
 *
 * `/api/impresion` la usa el AGENTE DE IMPRESIÓN, que es un programa en la
 * computadora de la caja y no un usuario: se identifica con el token de su
 * equipo, que la propia ruta valida. Si pasara por acá, el guardia lo mandaría
 * al login y ningún ticket saldría nunca.
 */
/*
 * `/api/ping` mide la red, no la sesion.
 *
 * Si pidiera login, con la sesion vencida devolveria el HTML del /login con
 * un 200 y el POS concluiria que hay internet igual. Justo al reves de lo que
 * tiene que detectar.
 */
const PUBLIC = ['/login', '/auth/callback', '/api/impresion', '/api/ping'];


/**
 * Redirige SIN PERDER los cookies que Supabase acaba de renovar.
 *
 * Cuando el token esta por vencer, la libreria lo renueva durante el middleware
 * y deja los cookies nuevos en `response`. Un `NextResponse.redirect()` es una
 * respuesta distinta y no los lleva: el token renovado se pierde, el navegador
 * se queda con el viejo —que al renovarse ya quedo invalidado— y el resultado es
 * un ida y vuelta infinito entre /login y /dashboard que termina en
 * ERR_TOO_MANY_REDIRECTS, sin forma de entrar ni de salir.
 */
function redirigirConservandoSesion(url: URL, response: NextResponse): NextResponse {
  const redireccion = NextResponse.redirect(url);
  for (const cookie of response.cookies.getAll()) redireccion.cookies.set(cookie);
  return redireccion;
}

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet: { name: string; value: string; options: CookieOptions }[]) =>
          toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options)),
      },
    },
  );
  /*
   * Se distingue "no hay sesión" de "no pude preguntar".
   *
   * `getUser()` contesta null en los dos casos, y tratarlos igual convierte un
   * tropiezo de red —o un límite de peticiones de Supabase, que se alcanza
   * facilísimo cuando alguien regulariza stock en ráfaga— en un cierre de
   * sesión definitivo. Peor todavía con la válvula de abajo, que además borra
   * las cookies: la persona queda afuera de verdad por un problema de un
   * segundo. Pasó el 19/09/2026 y dejó sin sistema a gerencia y a la tienda.
   *
   * Cuando el servidor contesta, su respuesta manda. Cuando NO se le pudo
   * preguntar, se cae al token que ya está en la cookie: puede estar revocado,
   * pero el costo de equivocarse ahí es que alguien siga adentro unos minutos
   * de más, contra el de echar a toda la tienda.
   */
  const { data: { user: userVerificado }, error: errorAuth } = await supabase.auth.getUser();
  let user = userVerificado;
  if (errorAuth) {
    const { data: { session } } = await supabase.auth.getSession();
    user = session?.user ?? null;
  }
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC.some((p) => pathname.startsWith(p));

  /*
   * En el login, una sesion que ya no sirve se tira.
   *
   * Aca se pregunta al servidor —no se decodifica el token— asi que el bucle de
   * redirecciones que sufrio el ERP no aplica. Pero si por lo que sea quedara
   * una cookie vieja trabando la entrada, el navegador no tiene forma de salir
   * solo y hay que borrar cookies a mano. En una caja con clientes esperando,
   * eso no puede pasar.
   */
  if (!user && !errorAuth && pathname === '/login') {
    for (const cookie of request.cookies.getAll()) {
      if (cookie.name.startsWith('sb-') && cookie.name.includes('auth-token')) {
        response.cookies.delete(cookie.name);
      }
    }
  }
  if (!user && !isPublic) {
    const url = request.nextUrl.clone(); url.pathname = '/login';
    return redirigirConservandoSesion(url, response);
  }
  if (user && pathname === '/login') {
    const url = request.nextUrl.clone(); url.pathname = '/venta';
    return redirigirConservandoSesion(url, response);
  }
  return response;
}

export const config = {
  /*
   * `api/ping` queda FUERA del middleware, no sólo exenta de login.
   *
   * Acá arriba se llama a `auth.getUser()` en TODA request, antes de mirar si la
   * ruta es pública. El ping sale del navegador cada tanto y lleva las cookies
   * de sesión, así que cada uno pedía una comprobación de auth y, con el token
   * por vencer, disparaba una renovación. Varias renovaciones simultáneas del
   * mismo token hacen que Supabase lo revoque por reuso: la sesión muere y el
   * POS vuelve solo al login. Pasó el 18/09/2026 — cuatro reingresos en once
   * minutos desde la misma computadora.
   *
   * Medir la red no necesita saber quién sos.
   *
   * `api/impresion` sale por la misma razón y pesa todavía más: el agente de
   * cada caja la consulta UNA VEZ POR SEGUNDO, y cada consulta gastaba una
   * comprobación de sesión que no servía para nada. Esas rutas se identifican
   * con el token del equipo y lo validan ellas mismas; nunca necesitaron pasar
   * por el guardia.
   */
  matcher: ['/((?!api/ping|api/impresion|_next/static|_next/image|favicon.ico|manifest.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff|woff2)$).*)'],
};
