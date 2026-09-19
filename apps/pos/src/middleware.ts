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
  const { data: { user } } = await supabase.auth.getUser();
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC.some((p) => pathname.startsWith(p));
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
