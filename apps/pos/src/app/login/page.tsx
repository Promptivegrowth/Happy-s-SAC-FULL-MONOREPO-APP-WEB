'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@happy/db/browser';
import { Button } from '@happy/ui/button';
import { Input } from '@happy/ui/input';
import { Label } from '@happy/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@happy/ui/card';
import { toast } from 'sonner';
import { Store, Loader2 } from 'lucide-react';

export default function PosLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [pwd, setPwd] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const sb = createClient();
    const { error } = await sb.auth.signInWithPassword({ email, password: pwd });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success('¡Bienvenido!');
    router.push('/venta');
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-happy-500 to-carnival-purple p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-happy-500 to-carnival-purple text-white shadow-glow">
            <Store className="h-7 w-7" />
          </div>
          <CardTitle className="font-display text-2xl">POS HAPPY</CardTitle>
          <p className="text-sm text-slate-500">Punto de venta · Tiendas</p>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>
    </main>
  );
}
