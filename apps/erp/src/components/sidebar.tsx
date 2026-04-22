'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@happy/ui/cn';
import { NAV } from './nav-config';
import type { Rol } from '@happy/db/enums';

export function Sidebar({ roles }: { roles: Rol[] }) {
  const pathname = usePathname();
  const isAdmin = roles.includes('gerente');

  return (
    <aside className="hidden w-64 shrink-0 border-r bg-white lg:block">
      <div className="flex h-16 items-center gap-3 border-b px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-happy-500 to-carnival-purple text-white shadow-glow">
          <span className="font-display text-sm font-bold">H</span>
        </div>
        <div>
          <p className="font-display text-sm font-semibold">HAPPY ERP</p>
          <p className="text-[10px] uppercase tracking-wider text-slate-400">Disfraces Happys</p>
        </div>
      </div>

      <nav className="scrollbar-thin h-[calc(100vh-4rem)] overflow-y-auto px-2 py-4">
        {NAV.map((group) => {
          const items = group.items.filter(
            (item) => !item.roles || isAdmin || item.roles.some((r) => roles.includes(r)),
          );
          if (items.length === 0) return null;
          return (
            <div key={group.label} className="mb-5">
              <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
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
                            ? 'bg-happy-50 font-medium text-happy-700'
                            : 'text-slate-600 hover:bg-slate-50',
                        )}
                      >
                        <Icon className={cn('h-4 w-4 shrink-0', active && 'text-happy-600')} />
                        <span className="flex-1">{item.label}</span>
                        {item.badge && (
                          <span className="rounded-full bg-happy-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
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
      </nav>
    </aside>
  );
}
