import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_PATHS = [
  '/login',
  '/auth/callback',
  '/forgot-password',
  '/reset-password',
  // Endpoint de catálogo INEI — data pública sin riesgo. Si requiriera auth,
  // una sesión expirada lo hace devolver HTML del /login en vez de JSON y
  // los dropdowns de ubigeo quedan mudos en el cliente.
  '/api/ubigeo',
  // El envío automático a SUNAT lo invoca Vercel Cron, que no trae cookie de
  // sesión: la ruta se protege con su propio secreto (CRON_SECRET).
  '/api/cron',
];


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
  /*
   * La ruta viaja en una cabecera para que el layout la pueda leer.
   *
   * El control de permisos vive en el layout del dashboard —que es el único
   * lugar por el que pasan las 118 pantallas y que además ya tiene los roles
   * cargados—, pero un layout de Next no recibe el pathname. Resolverlo acá
   * cuesta nada; hacerlo en el middleware costaría una consulta de roles a la
   * base en cada request, porque el JWT no los trae.
   */
  const headers = new Headers(request.headers);
  headers.set('x-pathname', request.nextUrl.pathname);
  const response = NextResponse.next({ request: { headers } });

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
   * Se le PREGUNTA al servidor si la sesión sirve. Antes se decodificaba el JWT.
   *
   * `getSession()` sólo lee el token del cookie y comprueba que no haya vencido;
   * no sabe si lo revocaron. Y cambiar la contraseña revoca las sesiones al
   * instante, mientras el JWT sigue pareciendo bueno hasta una hora más.
   *
   * Con eso las dos capas se contradecían y el navegador quedaba rebotando:
   * acá se veía "sesión válida" y se mandaba de /login a /dashboard; el layout
   * del dashboard sí preguntaba de verdad, fallaba, y devolvía a /login. Otra
   * vuelta, y otra, hasta ERR_TOO_MANY_REDIRECTS. Le pasó a Luigi el 19/09/2026
   * justo después de cambiar su contraseña, que es exactamente cuando este
   * desacuerdo aparece.
   *
   * `getUser()` cuesta una consulta al servidor de auth, pero es la única
   * respuesta que coincide con la que va a dar el layout.
   */
  const { data: { user } } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  /*
   * Válvula de escape: en el login, una sesión que ya no sirve se tira.
   *
   * Si igual quedara alguna cookie vieja dando vueltas, sin esto el navegador
   * no tiene forma de salir solo: hay que entrar a borrar cookies a mano, que
   * es lo que Edge terminó sugiriendo. Limpiarlas acá hace que el bucle no
   * pueda ni empezar.
   */
  if (!user && pathname === '/login') {
    for (const cookie of request.cookies.getAll()) {
      if (cookie.name.startsWith('sb-') && cookie.name.includes('auth-token')) {
        response.cookies.delete(cookie.name);
      }
    }
  }

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return redirigirConservandoSesion(url, response);
  }
  if (user && (pathname === '/login' || pathname === '/')) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return redirigirConservandoSesion(url, response);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/public|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff|woff2)$).*)'],
};
