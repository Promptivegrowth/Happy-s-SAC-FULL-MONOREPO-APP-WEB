'use client';

import { Bell, LogOut, User } from 'lucide-react';
import { Button } from '@happy/ui/button';
import { Badge } from '@happy/ui/badge';
import { Logo } from '@happy/ui/logo';
import { createClient } from '@happy/db/browser';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';

export function Topbar({ nombre, email, roles }: { nombre: string; email: string; roles: string[] }) {
  const router = useRouter();
  async function logout() {
    const sb = createClient();
    await sb.auth.signOut();
    toast.info('Sesión cerrada');
    router.replace('/login');
    router.refresh();
  }
  return (
    <header className="flex h-16 items-center justify-between border-b bg-white px-4 lg:px-6">
      <div className="flex items-center gap-3">
        <Link href="/dashboard" className="flex items-center lg:hidden">
          <Logo height={28} />
        </Link>
        <div className="hidden text-sm text-slate-500 lg:block">
          Hola, <span className="font-medium text-corp-900">{nombre}</span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="hidden items-center gap-1 md:flex">
          {roles.slice(0, 2).map((r) => (
            <Badge key={r} variant="secondary" className="text-[10px] uppercase">{r.replace('_', ' ')}</Badge>
          ))}
        </div>
        <Button variant="ghost" size="icon" title="Notificaciones">
          <Bell className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2 border-l pl-3 text-sm">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-corp-100 text-corp-700">
            <User className="h-4 w-4" />
          </div>
          <div className="hidden md:block">
            <p className="text-xs font-medium text-corp-900">{nombre}</p>
            <p className="text-[11px] text-slate-500">{email}</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={logout}>
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Salir</span>
        </Button>
      </div>
    </header>
  );
}
