import Link from 'next/link';
import { Facebook, Instagram, MessageCircle, MapPin, Mail } from 'lucide-react';
import { Logo } from '@happy/ui/logo';

export function SiteFooter() {
  return (
    <footer className="bg-corp-900 text-corp-100/80">
      <div className="container grid gap-10 px-4 py-14 md:grid-cols-4">
        <div>
          <Link href="/" className="inline-flex items-center" aria-label="Inicio">
            <Logo height={48} />
          </Link>
          <p className="mt-3 text-sm">
            Fabricamos los mejores disfraces para niños y adultos en Perú desde 1995. Calidad, color y alegría en cada detalle.
          </p>
          <div className="mt-4 flex gap-2">
            <a href="https://facebook.com/disfraceshappys" className="rounded-full bg-white/5 p-2 transition hover:bg-happy-500 hover:text-white" aria-label="Facebook">
              <Facebook className="h-4 w-4" />
            </a>
            <a href="https://instagram.com/disfraceshappys" className="rounded-full bg-white/5 p-2 transition hover:bg-happy-500 hover:text-white" aria-label="Instagram">
              <Instagram className="h-4 w-4" />
            </a>
            <a href="https://wa.me/51916856842" className="rounded-full bg-white/5 p-2 transition hover:bg-happy-500 hover:text-white" aria-label="WhatsApp">
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
              <Link href="/libro-de-reclamaciones" className="inline-flex items-center gap-2 font-semibold text-happy-300 hover:text-happy-400">
                <span className="rounded border border-happy-400/50 px-1.5 py-0.5 text-[10px]">📕 LIBRO</span>
                de Reclamaciones
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <h4 className="mb-3 font-semibold text-white">Atención al cliente</h4>
          <p className="flex items-center gap-2 text-sm">
            <MessageCircle className="h-4 w-4 text-happy-400" />
            <a href="https://wa.me/51916856842" className="hover:text-happy-400">+51 916 856 842</a>
          </p>
          <p className="mt-2 flex items-center gap-2 text-sm">
            <Mail className="h-4 w-4 text-happy-400" />
            <a href="mailto:ventas@disfraceshappys.com" className="hover:text-happy-400">ventas@disfraceshappys.com</a>
          </p>
          <p className="mt-4 flex items-start gap-2 text-xs">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-happy-400" />
            <span>Tiendas físicas: Huallaga · La Quinta (Lima)</span>
          </p>
        </div>
      </div>

      <div className="border-t border-white/5">
        <div className="container px-4 py-6 text-center text-xs text-corp-100/60">
          © {new Date().getFullYear()} HAPPY SAC. RUC 20609213770. Todos los derechos reservados.
        </div>
      </div>
    </footer>
  );
}
