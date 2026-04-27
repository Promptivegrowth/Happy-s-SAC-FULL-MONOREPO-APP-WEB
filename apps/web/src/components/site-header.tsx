'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ShoppingBag, Search, User, Menu, Sparkles, Phone, Facebook, Instagram, MessageCircle } from 'lucide-react';
import { Button } from '@happy/ui/button';
import { Logo } from '@happy/ui/logo';
import { useCart } from '@/store/cart';
import { MegaMenu, MegaMenuMobile } from './mega-menu';

export function SiteHeader() {
  const router = useRouter();
  const items = useCart((s) => s.items);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [busqueda, setBusqueda] = useState('');

  function buscar(e: React.FormEvent) {
    e.preventDefault();
    const q = busqueda.trim();
    if (!q) return;
    router.push(`/productos?q=${encodeURIComponent(q)}`);
  }

  return (
    <header className="sticky top-0 z-40 bg-white shadow-sm">
      {/* Promo bar */}
      <div className="bg-corp-gradient text-white">
        <div className="container flex h-9 items-center justify-between gap-2 px-4 text-xs font-medium">
          <div className="hidden items-center gap-3 sm:flex">
            <a href="https://wa.me/51916856842" className="flex items-center gap-1 hover:text-happy-300">
              <MessageCircle className="h-3 w-3" /> 982 110 595
            </a>
            <a href="mailto:ventas@disfraceshappys.com" className="hidden items-center gap-1 hover:text-happy-300 md:flex">
              ventas@disfraceshappys.com
            </a>
          </div>
          <div className="flex flex-1 items-center justify-center gap-2 sm:flex-none">
            <Sparkles className="h-3 w-3 animate-float text-happy-300" />
            <span>Envío GRATIS desde S/ 199 · Yape · Plin · Tarjeta · WhatsApp</span>
            <Sparkles className="h-3 w-3 animate-float text-happy-300" />
          </div>
          <div className="hidden items-center gap-2 sm:flex">
            <a href="https://facebook.com" target="_blank" rel="noopener noreferrer" aria-label="Facebook" className="hover:text-happy-300">
              <Facebook className="h-3.5 w-3.5" />
            </a>
            <a href="https://instagram.com" target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="hover:text-happy-300">
              <Instagram className="h-3.5 w-3.5" />
            </a>
            <a href="https://wa.me/51916856842" target="_blank" rel="noopener noreferrer" aria-label="WhatsApp" className="hover:text-happy-300">
              <MessageCircle className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </div>

      {/* Logo + buscador + acciones */}
      <div className="border-b">
        <div className="container flex h-20 items-center gap-6 px-4">
          <Link href="/" className="flex items-center" aria-label="Inicio">
            <Logo height={56} priority />
          </Link>

          <form onSubmit={buscar} className="hidden flex-1 sm:block">
            <div className="relative mx-auto flex max-w-xl items-center overflow-hidden rounded-full border border-slate-200 bg-white shadow-sm focus-within:border-happy-400 focus-within:ring-2 focus-within:ring-happy-100">
              <input
                type="search"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar disfraces"
                className="h-11 flex-1 bg-transparent px-5 text-sm text-corp-900 placeholder:text-slate-400 focus:outline-none"
              />
              <button
                type="submit"
                className="m-1 flex h-9 items-center gap-1.5 rounded-full bg-happy-500 px-5 text-sm font-bold text-white transition hover:bg-happy-600"
              >
                <Search className="h-4 w-4" />
                Buscar
              </button>
            </div>
          </form>

          <div className="ml-auto flex items-center gap-1">
            <Link href="/cuenta" className="hidden items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-corp-900 hover:bg-happy-50 sm:flex">
              <User className="h-5 w-5" />
              <span className="hidden lg:inline">Mi Cuenta</span>
            </Link>
            <Link href="/carrito" aria-label="Carrito" className="relative">
              <Button variant="ghost" size="icon">
                <ShoppingBag className="h-5 w-5" />
                {items.length > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-happy-500 px-1 text-[10px] font-bold text-white">
                    {items.length}
                  </span>
                )}
              </Button>
            </Link>
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label="Menú"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Buscador mobile (debajo del logo) */}
        <div className="border-t bg-slate-50 px-4 py-2 sm:hidden">
          <form onSubmit={buscar}>
            <div className="relative flex items-center">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar disfraces"
                className="h-10 w-full rounded-full border border-slate-200 bg-white pl-9 pr-4 text-sm focus:border-happy-400 focus:outline-none"
              />
            </div>
          </form>
        </div>
      </div>

      {/* MegaMenu (barra azul) */}
      <MegaMenu />

      {/* Menú mobile */}
      {mobileOpen && <MegaMenuMobile onClose={() => setMobileOpen(false)} />}
    </header>
  );
}
