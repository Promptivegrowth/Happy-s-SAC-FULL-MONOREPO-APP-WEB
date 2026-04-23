'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@happy/db/browser';
import { Button } from '@happy/ui/button';
import { Input } from '@happy/ui/input';
import { Label } from '@happy/ui/label';
import { Badge } from '@happy/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@happy/ui/card';
import { Logo } from '@happy/ui/logo';
import { DEMO_USERS, DEMO_PASSWORD } from '@happy/lib/demo-users';
import { toast } from 'sonner';
import { Loader2, Sparkles } from 'lucide-react';

export default function PosLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [pwd, setPwd] = useState('');
  const [loading, setLoading] = useState(false);

  async function login(emailToUse: string, passwordToUse: string) {
    setLoading(true);
    const sb = createClient();
    const { error } = await sb.auth.signInWithPassword({ email: emailToUse, password: passwordToUse });
    setLoading(false);
    if (error) return toast.error(error.message === 'Invalid login credentials' ? 'Credenciales inválidas' : error.message);
    toast.success('¡Bienvenido!');
    router.push('/venta');
    router.refresh();
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    await login(email, pwd);
  }

  function quickLogin(demoEmail: string) {
    setEmail(demoEmail);
    setPwd(DEMO_PASSWORD);
    void login(demoEmail, DEMO_PASSWORD);
  }

  // Solo cajeros + gerente (gerente puede entrar a todo)
  const posUsers = DEMO_USERS.filter((u) => u.acceso !== 'erp');

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-corp-900 p-4 py-8">
      <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-happy-500/30 blur-3xl" />
      <div className="absolute -right-40 bottom-0 h-[28rem] w-[28rem] rounded-full bg-corp-700/40 blur-3xl" />
      <Card className="relative w-full max-w-sm shadow-2xl">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex justify-center">
            <Logo height={48} priority />
          </div>
          <CardTitle className="font-display text-2xl text-corp-900">Punto de Venta</CardTitle>
          <p className="text-sm text-slate-500">Disfraces Happys · Tiendas</p>
        </CardHeader>
        <CardContent className="space-y-5">
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <Label>Correo</Label>
              <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </div>
            <div>
              <Label>Contraseña</Label>
              <Input type="password" required value={pwd} onChange={(e) => setPwd(e.target.value)} autoComplete="current-password" />
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
              Password común: <code className="rounded bg-amber-100 px-1 font-mono">{DEMO_PASSWORD}</code>
            </p>
            <div className="grid grid-cols-1 gap-1.5">
              {posUsers.map((u) => (
                <button
                  key={u.email}
                  onClick={() => quickLogin(u.email)}
                  disabled={loading}
                  className="flex items-center gap-2.5 rounded-md border bg-white p-2 text-left transition hover:border-happy-400 hover:bg-happy-50 disabled:opacity-50"
                >
                  <span className="text-lg">{u.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-tight">{u.label}</p>
                    <p className="truncate text-[10px] text-slate-500">{u.scope ?? u.email}</p>
                  </div>
                  <Badge variant="secondary" className="shrink-0 text-[9px] uppercase tracking-wide">
                    {u.badge}
                  </Badge>
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
