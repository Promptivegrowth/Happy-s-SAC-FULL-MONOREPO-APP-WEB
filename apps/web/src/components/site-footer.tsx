import Link from 'next/link';
import { Facebook, Instagram, MessageCircle } from 'lucide-react';

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t bg-slate-900 text-slate-300">
      <div className="container grid gap-10 px-4 py-14 md:grid-cols-4">
        <div>
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-happy-500 to-carnival-purple text-white">
              <span className="font-display text-xl font-bold">H</span>
            </div>
            <span className="font-display text-lg font-semibold text-white">Disfraces Happys</span>
          </Link>
          <p className="mt-3 text-sm text-slate-400">
            Fabricamos los mejores disfraces para niños y adultos en Perú desde 1995. Calidad, color y alegría en cada detalle.
          </p>
          <div className="mt-4 flex gap-2">
            <a href="https://facebook.com/disfraceshappys" className="rounded-full bg-slate-800 p-2 text-slate-300 transition hover:bg-happy-500 hover:text-white" aria-label="Facebook">
              <Facebook className="h-4 w-4" />
            </a>
            <a href="https://instagram.com/disfraceshappys" className="rounded-full bg-slate-800 p-2 text-slate-300 transition hover:bg-happy-500 hover:text-white" aria-label="Instagram">
              <Instagram className="h-4 w-4" />
            </a>
            <a href="https://wa.me/51916856842" className="rounded-full bg-slate-800 p-2 text-slate-300 transition hover:bg-happy-500 hover:text-white" aria-label="WhatsApp">
              <MessageCircle className="h-4 w-4" />
            </a>
          </div>
        </div>

        <div>
          <h4 className="mb-3 font-semibold text-white">Categorías</h4>
          <ul className="space-y-2 text-sm">
            <li><Link href="/categoria/halloween" className="hover:text-happy-400">Halloween</Link></li>
            <li><Link href="/categoria/fiestas-patrias" className="hover:text-happy-400">Fiestas Patrias</Link></li>
            <li><Link href="/categoria/danzas-tipicas" className="hover:text-happy-400">Danzas Típicas</Link></li>
            <li><Link href="/categoria/superheroes" className="hover:text-happy-400">Superhéroes</Link></li>
            <li><Link href="/categoria/navidad" className="hover:text-happy-400">Navidad</Link></li>
          </ul>
        </div>

        <div>
          <h4 className="mb-3 font-semibold text-white">Información</h4>
          <ul className="space-y-2 text-sm">
            <li><Link href="/nosotros" className="hover:text-happy-400">Nosotros</Link></li>
            <li><Link href="/contacto" className="hover:text-happy-400">Contacto</Link></li>
            <li><Link href="/terminos-y-condiciones" className="hover:text-happy-400">Términos y condiciones</Link></li>
            <li><Link href="/politica-de-privacidad" className="hover:text-happy-400">Política de privacidad</Link></li>
            <li>
              <Link href="/libro-de-reclamaciones" className="inline-flex items-center gap-2 text-slate-100 hover:text-happy-400">
                <span className="rounded border border-slate-600 px-1.5 py-0.5 text-[10px] font-bold">📕</span>
                Libro de reclamaciones
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <h4 className="mb-3 font-semibold text-white">Atención al cliente</h4>
          <p className="text-sm">WhatsApp: <a href="https://wa.me/51916856842" className="text-happy-400">+51 916 856 842</a></p>
          <p className="mt-2 text-sm">Email: <a href="mailto:ventas@disfraceshappys.com" className="text-happy-400">ventas@disfraceshappys.com</a></p>
          <p className="mt-4 text-xs text-slate-500">
            Tiendas físicas: Huallaga · La Quinta (Lima)
          </p>
        </div>
      </div>

      <div className="border-t border-slate-800">
        <div className="container px-4 py-6 text-center text-xs text-slate-500">
          © {new Date().getFullYear()} HAPPY SAC. RUC 20609213770. Todos los derechos reservados.
        </div>
      </div>
    </footer>
  );
}
