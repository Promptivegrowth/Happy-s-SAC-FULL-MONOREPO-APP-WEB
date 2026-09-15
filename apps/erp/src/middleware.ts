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

  // getSession() solo decodifica el JWT del cookie (sin round-trip al server de auth).
  // Se usa para gating de rutas en el edge — la validación real ocurre en server components
  // vía getSession() de @/server/session que sí llama auth.getUser().
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

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
