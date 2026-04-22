'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@happy/ui/button';
import { Input } from '@happy/ui/input';
import { Label } from '@happy/ui/label';
import { Badge } from '@happy/ui/badge';
import { createClient } from '@happy/db/browser';
import { DEMO_USERS, DEMO_PASSWORD } from '@happy/lib/demo-users';
import { toast } from 'sonner';
import { Loader2, Sparkles } from 'lucide-react';

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function login(emailToUse: string, passwordToUse: string) {
    setLoading(true);
    const sb = createClient();
    const { error } = await sb.auth.signInWithPassword({ email: emailToUse, password: passwordToUse });
    setLoading(false);
    if (error) {
      toast.error(error.message === 'Invalid login credentials' ? 'Credenciales inválidas' : error.message);
      return;
    }
    toast.success('¡Bienvenido!');
    router.push(params.get('next') ?? '/dashboard');
    router.refresh();
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    await login(email, password);
  }

  function quickLogin(demoEmail: string) {
    setEmail(demoEmail);
    setPassword(DEMO_PASSWORD);
    void login(demoEmail, DEMO_PASSWORD);
  }

  // Solo los usuarios que tienen acceso al ERP
  const erpUsers = DEMO_USERS.filter((u) => u.acceso !== 'pos');

  return (
    <div className="space-y-5">
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">Correo</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@email.com"
            disabled={loading}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Contraseña</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
          />
        </div>
        <Button type="submit" variant="premium" size="lg" className="w-full" disabled={loading}>
          {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Ingresando…</> : 'Ingresar'}
        </Button>
      </form>

      {/* === DEMO USERS — REMOVER ANTES DE PRODUCCIÓN === */}
      <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50/60 p-3">
        <div className="mb-2 flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-amber-600" />
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-800">
            Cuentas demo · click para entrar
          </p>
        </div>
        <p className="mb-3 text-[11px] text-amber-700">
          Modo pruebas. Password común: <code className="rounded bg-amber-100 px-1 font-mono">{DEMO_PASSWORD}</code>
        </p>
        <div className="grid grid-cols-1 gap-1.5">
          {erpUsers.map((u) => (
            <button
              key={u.email}
              onClick={() => quickLogin(u.email)}
              disabled={loading}
              className="group flex items-center gap-2.5 rounded-md border bg-white p-2 text-left transition hover:border-happy-400 hover:bg-happy-50 disabled:opacity-50"
            >
              <span className="text-lg">{u.emoji}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium leading-tight">{u.label}</p>
                <p className="truncate text-[10px] text-slate-500">{u.email}</p>
              </div>
              <Badge variant="secondary" className="shrink-0 text-[9px] uppercase tracking-wide">
                {u.badge}
              </Badge>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
