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
const PUBLIC = ['/login', '/auth/callback', '/api/impresion'];


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
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff|woff2)$).*)'],
};
