'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@happy/ui/cn';
import { Logo } from '@happy/ui/logo';
import { NAV } from './nav-config';
import type { Rol } from '@happy/db/enums';

export function Sidebar({ roles }: { roles: Rol[] }) {
  const pathname = usePathname();
  const isAdmin = roles.includes('gerente');

  return (
    <aside className="hidden w-64 shrink-0 border-r bg-corp-900 text-white lg:block">
      <div className="flex h-16 items-center gap-3 border-b border-white/10 px-5">
        <Link href="/dashboard" className="flex items-center gap-2">
          <Logo height={28} />
          <div className="leading-tight">
            <p className="font-display text-sm font-semibold">ERP</p>
            <p className="text-[9px] uppercase tracking-wider text-happy-300/80">Disfraces Happys</p>
          </div>
        </Link>
      </div>

      <nav className="scrollbar-thin h-[calc(100vh-4rem)] overflow-y-auto px-2 py-4">
        {NAV.map((group) => {
          const items = group.items.filter(
            (item) => !item.roles || isAdmin || item.roles.some((r) => roles.includes(r)),
          );
          if (items.length === 0) return null;
          return (
            <div key={group.label} className="mb-5">
              <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-corp-300/60">
                {group.label}
              </p>
              <ul>
                {items.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(item.href + '/');
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={cn(
                          'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors',
                          active
                            ? 'bg-happy-500 font-medium text-white shadow-glow'
                            : 'text-corp-100/80 hover:bg-white/5 hover:text-white',
                        )}
                      >
                        <Icon className={cn('h-4 w-4 shrink-0', active && 'text-white')} />
                        <span className="flex-1">{item.label}</span>
                        {item.badge && (
                          <span className="rounded-full bg-danger px-1.5 py-0.5 text-[10px] font-semibold text-white">
                            {item.badge}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}

        <div className="mt-6 rounded-lg border border-white/5 bg-white/5 p-3 text-[11px] text-corp-100/80">
          <p className="font-semibold text-happy-300">¿Necesitas ayuda?</p>
          <p className="mt-1">WhatsApp soporte:<br/><span className="font-mono text-white">+51 916 856 842</span></p>
        </div>
      </nav>
    </aside>
  );
}
