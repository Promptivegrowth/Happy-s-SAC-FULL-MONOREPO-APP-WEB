'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Badge } from '@happy/ui/badge';
import { MEGA_MENU } from '@/lib/megamenu';

export function MegaMenu() {
  const [open, setOpen] = useState<string | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  function openItem(label: string) {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(label);
  }
  function scheduleClose() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(null), 150);
  }

  // Cerrar con click afuera
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(null);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  return (
    <div ref={wrapRef} className="relative w-full bg-corp-700 text-white">
      <nav className="container hidden h-12 items-center gap-1 px-4 lg:flex">
        {MEGA_MENU.map((item) => {
          const isOpen = open === item.label;
          const hasFlyout = item.kind === 'mega' || item.kind === 'dropdown';

          return (
            <div
              key={item.label}
              className="relative"
              onMouseEnter={() => hasFlyout && openItem(item.label)}
              onMouseLeave={() => hasFlyout && scheduleClose()}
            >
              <Link
                href={item.href}
                className={`inline-flex h-12 items-center gap-1 px-4 text-sm font-bold uppercase tracking-wide transition ${
                  isOpen ? 'bg-corp-800 text-happy-300' : 'text-white hover:text-happy-300'
                } ${item.label === 'Home' ? 'pr-3' : ''}`}
              >
                <span className={item.hot ? 'text-happy-300' : ''}>{item.label}</span>
                {hasFlyout && <ChevronDown className="h-3 w-3 opacity-70" />}
                {item.hot && (
                  <Badge className="ml-1 h-4 bg-danger px-1 text-[8px] hover:bg-danger">HOT</Badge>
                )}
              </Link>

              {/* Dropdown chico (Accesorios) */}
              {item.kind === 'dropdown' && isOpen && (
                <div
                  onMouseEnter={() => openItem(item.label)}
                  onMouseLeave={scheduleClose}
                  className="absolute left-0 top-full z-50 min-w-48 overflow-hidden rounded-md border bg-white text-corp-900 shadow-2xl"
                >
                  {item.links.map((l) => (
                    <Link
                      key={l.href}
                      href={l.href}
                      className="block border-b px-5 py-2.5 text-sm font-medium transition last:border-0 hover:bg-happy-50 hover:text-happy-700"
                    >
                      {l.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Mega-flyout: ocupa todo el ancho del header debajo del nav */}
      {MEGA_MENU.map((item) => {
        if (item.kind !== 'mega') return null;
        const isOpen = open === item.label;
        if (!isOpen) return null;
        return (
          <div
            key={`flyout-${item.label}`}
            onMouseEnter={() => openItem(item.label)}
            onMouseLeave={scheduleClose}
            className="absolute left-0 right-0 top-full z-50 hidden border-t bg-white text-corp-900 shadow-2xl lg:block"
          >
            <div className="container grid gap-x-8 gap-y-6 px-6 py-7 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {item.columns.map((col) => (
                <div key={col.titulo} className="space-y-2">
                  <Link
                    href={col.href}
                    className="group flex items-start gap-2.5 text-sm font-bold text-corp-900 transition hover:text-happy-600"
                  >
                    <span className="text-lg leading-none text-happy-500 transition group-hover:scale-110">
                      {col.icono}
                    </span>
                    <span className="leading-tight">{col.titulo}</span>
                  </Link>
                  <p className="line-clamp-3 pl-7 text-xs leading-relaxed text-slate-500">
                    {col.examples.slice(0, 8).join(', ')}…
                  </p>
                </div>
              ))}
            </div>
            {/* CTA al final del mega */}
            <div className="border-t bg-corp-50/40">
              <div className="container flex items-center justify-between px-6 py-3 text-xs">
                <span className="text-slate-600">¿No encuentras lo que buscas?</span>
                <Link
                  href={item.href}
                  className="font-semibold uppercase tracking-wide text-happy-600 hover:underline"
                >
                  Ver todos los {item.label.toLowerCase()} →
                </Link>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Versión mobile del menú: lista accordion simple en lugar de hover.
 */
export function MegaMenuMobile({ onClose }: { onClose: () => void }) {
  const [openSection, setOpenSection] = useState<string | null>(null);

  return (
    <nav className="border-t bg-white p-4 lg:hidden">
      <ul className="space-y-1">
        {MEGA_MENU.map((item) => {
          const isOpen = openSection === item.label;
          if (item.kind === 'link') {
            return (
              <li key={item.label}>
                <Link
                  href={item.href}
                  onClick={onClose}
                  className="block rounded-md px-3 py-2.5 text-sm font-semibold text-corp-900 hover:bg-happy-50"
                >
                  {item.label}
                  {item.hot && (
                    <Badge className="ml-2 h-4 bg-danger px-1 text-[8px] hover:bg-danger">HOT</Badge>
                  )}
                </Link>
              </li>
            );
          }
          return (
            <li key={item.label}>
              <button
                type="button"
                onClick={() => setOpenSection(isOpen ? null : item.label)}
                className="flex w-full items-center justify-between rounded-md px-3 py-2.5 text-sm font-semibold text-corp-900 hover:bg-happy-50"
              >
                <span>
                  {item.label}
                  {item.hot && (
                    <Badge className="ml-2 h-4 bg-danger px-1 text-[8px] hover:bg-danger">HOT</Badge>
                  )}
                </span>
                <ChevronDown className={`h-4 w-4 transition ${isOpen ? 'rotate-180' : ''}`} />
              </button>
              {isOpen && (
                <ul className="ml-4 mt-1 space-y-0.5 border-l border-happy-200 pl-3">
                  <li>
                    <Link
                      href={item.href}
                      onClick={onClose}
                      className="block rounded-md px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-happy-600 hover:bg-happy-50"
                    >
                      → Ver todos los {item.label.toLowerCase()}
                    </Link>
                  </li>
                  {item.kind === 'mega' &&
                    item.columns.map((col) => (
                      <li key={col.titulo}>
                        <Link
                          href={col.href}
                          onClick={onClose}
                          className="block rounded-md px-3 py-1.5 text-xs text-slate-700 hover:bg-happy-50 hover:text-happy-700"
                        >
                          {col.icono} {col.titulo}
                        </Link>
                      </li>
                    ))}
                  {item.kind === 'dropdown' &&
                    item.links.map((l) => (
                      <li key={l.href}>
                        <Link
                          href={l.href}
                          onClick={onClose}
                          className="block rounded-md px-3 py-1.5 text-xs text-slate-700 hover:bg-happy-50 hover:text-happy-700"
                        >
                          {l.label}
                        </Link>
                      </li>
                    ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
