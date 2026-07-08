'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useRef, useState } from 'react';
import { ShoppingBag, Search, User, Menu, Sparkles, Phone, Facebook, Instagram, MessageCircle } from 'lucide-react';
import { Button } from '@happy/ui/button';
import { Logo } from '@happy/ui/logo';
import { useCart } from '@/store/cart';
import { MegaMenu, MegaMenuMobile } from './mega-menu';
import type { CampanaVigente, ProductoBusqueda } from '@/server/queries/header-data';

export function SiteHeader({
  campanaVigente = null,
  productosParaBusqueda = [],
}: {
  campanaVigente?: CampanaVigente | null;
  productosParaBusqueda?: ProductoBusqueda[];
}) {
  const router = useRouter();
  const items = useCart((s) => s.items);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [autoOpen, setAutoOpen] = useState(false);
  const busquedaRef = useRef<HTMLDivElement>(null);

  // Filtro client-side sobre el índice precargado (500 productos máx). Al
  // escribir 2+ letras se muestra un dropdown con hasta 8 coincidencias.
  const sugerencias = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (q.length < 2) return [];
    // Sin acentos para matchear "policia" con "Policía"
    const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const qn = norm(q);
    return productosParaBusqueda
      .filter((p) => norm(p.nombre).includes(qn))
      .slice(0, 8);
  }, [busqueda, productosParaBusqueda]);

  function buscar(e: React.FormEvent) {
    e.preventDefault();
    const q = busqueda.trim();
    if (!q) return;
    setAutoOpen(false);
    router.push(`/productos?q=${encodeURIComponent(q)}`);
  }

  function irAProducto(slug: string) {
    setAutoOpen(false);
    setBusqueda('');
    router.push(`/productos/${slug}`);
  }

  return (
    <header className="sticky top-0 z-40 bg-white shadow-sm">
      {/* Promo bar */}
      <div className="bg-corp-gradient text-white">
        <div className="container flex h-9 items-center justify-between gap-2 px-4 text-xs font-medium">
          <div className="hidden items-center gap-3 sm:flex">
            <a href="https://wa.me/51903064120" className="flex items-center gap-1 hover:text-happy-300">
              <MessageCircle className="h-3 w-3" /> 903 064 120
            </a>
            <a href="mailto:ventas@disfraceshappys.com.pe" className="hidden items-center gap-1 hover:text-happy-300 md:flex">
              ventas@disfraceshappys.com.pe
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
            <a href="https://wa.me/51903064120" target="_blank" rel="noopener noreferrer" aria-label="WhatsApp" className="hover:text-happy-300">
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

          <div ref={busquedaRef} className="relative hidden flex-1 sm:block">
            <form onSubmit={buscar}>
              <div className="relative mx-auto flex max-w-xl items-center overflow-hidden rounded-full border border-slate-200 bg-white shadow-sm focus-within:border-happy-400 focus-within:ring-2 focus-within:ring-happy-100">
                <input
                  type="search"
                  value={busqueda}
                  onChange={(e) => { setBusqueda(e.target.value); setAutoOpen(true); }}
                  onFocus={() => setAutoOpen(true)}
                  onBlur={() => setTimeout(() => setAutoOpen(false), 200)}
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

            {/* Dropdown de autocomplete — desktop */}
            {autoOpen && sugerencias.length > 0 && (
              <div className="absolute left-0 right-0 top-full z-50 mx-auto mt-1 max-h-96 max-w-xl overflow-auto rounded-xl border border-slate-200 bg-white shadow-xl">
                {sugerencias.map((s) => (
                  <button
                    key={s.slug}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => irAProducto(s.slug)}
                    className="flex w-full items-center gap-2 border-b border-slate-100 px-4 py-2 text-left text-sm hover:bg-happy-50 last:border-0"
                  >
                    <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <span className="flex-1 truncate text-corp-900">{s.nombre}</span>
                  </button>
                ))}
                <div className="border-t bg-slate-50 px-4 py-1.5 text-center text-[11px] text-slate-500">
                  Presioná Enter para ver todos los resultados
                </div>
              </div>
            )}
          </div>

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
        <div className="relative border-t bg-slate-50 px-4 py-2 sm:hidden">
          <form onSubmit={buscar}>
            <div className="relative flex items-center">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={busqueda}
                onChange={(e) => { setBusqueda(e.target.value); setAutoOpen(true); }}
                onFocus={() => setAutoOpen(true)}
                onBlur={() => setTimeout(() => setAutoOpen(false), 200)}
                placeholder="Buscar disfraces"
                className="h-10 w-full rounded-full border border-slate-200 bg-white pl-9 pr-4 text-sm focus:border-happy-400 focus:outline-none"
              />
            </div>
          </form>
          {autoOpen && sugerencias.length > 0 && (
            <div className="absolute left-4 right-4 top-full z-50 mt-1 max-h-80 overflow-auto rounded-xl border border-slate-200 bg-white shadow-xl">
              {sugerencias.map((s) => (
                <button
                  key={s.slug}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => irAProducto(s.slug)}
                  className="flex w-full items-center gap-2 border-b border-slate-100 px-4 py-2 text-left text-sm hover:bg-happy-50 last:border-0"
                >
                  <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  <span className="flex-1 truncate text-corp-900">{s.nombre}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* MegaMenu (barra azul) */}
      <MegaMenu campanaVigente={campanaVigente} />

      {/* Menú mobile */}
      {mobileOpen && <MegaMenuMobile onClose={() => setMobileOpen(false)} campanaVigente={campanaVigente} />}
    </header>
  );
}
