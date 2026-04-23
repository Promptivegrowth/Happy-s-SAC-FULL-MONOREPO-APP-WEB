'use client';

import Link from 'next/link';
import { ShoppingBag, Search, User, Menu, Sparkles } from 'lucide-react';
import { Button } from '@happy/ui/button';
import { Badge } from '@happy/ui/badge';
import { Logo } from '@happy/ui/logo';
import { useCart } from '@/store/cart';
import { useState } from 'react';

const NAV = [
  { href: '/categoria/halloween',           label: 'Halloween',       hot: true },
  { href: '/categoria/fiestas-patrias',     label: 'Fiestas Patrias' },
  { href: '/categoria/danzas-tipicas',      label: 'Danzas Típicas' },
  { href: '/categoria/navidad',             label: 'Navidad' },
  { href: '/categoria/superheroes',         label: 'Superhéroes' },
  { href: '/categoria/princesas',           label: 'Princesas' },
  { href: '/productos',                     label: 'Catálogo' },
];

export function SiteHeader() {
  const items = useCart((s) => s.items);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b bg-white/95 backdrop-blur-md">
      {/* Promo bar */}
      <div className="bg-corp-gradient text-white">
        <div className="container flex h-8 items-center justify-center gap-2 px-4 text-xs font-medium">
          <Sparkles className="h-3 w-3 animate-float text-happy-300" />
          <span>Envío GRATIS en compras desde S/ 199 · Yape · Plin · Tarjeta · WhatsApp</span>
          <Sparkles className="h-3 w-3 animate-float text-happy-300" />
        </div>
      </div>

      <div className="container flex h-20 items-center gap-4 px-4">
        <Link href="/" className="flex items-center" aria-label="Inicio">
          <Logo height={48} priority />
        </Link>

        <nav className="hidden flex-1 items-center justify-center gap-1 lg:flex">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="relative rounded-md px-3 py-1.5 text-sm font-medium text-corp-900 transition hover:bg-happy-50 hover:text-happy-600"
            >
              {n.label}
              {n.hot && (
                <Badge variant="default" className="absolute -right-1 -top-1 h-4 px-1 text-[8px]">
                  HOT
                </Badge>
              )}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="icon" aria-label="Buscar">
            <Search className="h-5 w-5" />
          </Button>
          <Link href="/cuenta">
            <Button variant="ghost" size="icon" aria-label="Mi cuenta">
              <User className="h-5 w-5" />
            </Button>
          </Link>
          <Link href="/carrito" aria-label="Carrito" className="relative">
            <Button variant="ghost" size="icon">
              <ShoppingBag className="h-5 w-5" />
              {items.length > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-happy-500 px-1 text-[10px] font-bold text-white">
                  {items.length}
                </span>
              )}
            </Button>
          </Link>
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(!mobileOpen)} aria-label="Menú">
            <Menu className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {mobileOpen && (
        <nav className="border-t bg-white p-4 lg:hidden">
          <ul className="space-y-2">
            {NAV.map((n) => (
              <li key={n.href}>
                <Link href={n.href} className="block rounded-md px-3 py-2 text-sm hover:bg-happy-50" onClick={() => setMobileOpen(false)}>
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </header>
  );
}
