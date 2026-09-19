'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@happy/db/browser';
import { Button } from '@happy/ui/button';
import { Input } from '@happy/ui/input';
import { Label } from '@happy/ui/label';
import { Loader2, KeyRound, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

const MINIMO = 8;

export function ResetPasswordForm() {
  const router = useRouter();
  const [nueva, setNueva] = useState('');
  const [repetir, setRepetir] = useState('');
  const [guardando, setGuardando] = useState(false);
  /** null mientras se averigua si el enlace del correo abrió sesión. */
  const [conSesion, setConSesion] = useState<boolean | null>(null);

  useEffect(() => {
    const sb = createClient();
    /*
     * El enlace del correo deja la sesión abierta antes de llegar acá.
     *
     * Se comprueba para poder avisar ANTES de que la persona escriba dos veces
     * una contraseña que no se va a poder guardar. Entrar de frente a esta
     * dirección, sin venir del correo, es el caso típico.
     */
    void sb.auth.getSession().then(({ data }) => setConSesion(Boolean(data.session)));
  }, []);

  async function guardar() {
    if (nueva.length < MINIMO) {
      toast.error(`La contraseña tiene que tener al menos ${MINIMO} caracteres`);
      return;
    }
    if (nueva !== repetir) {
      toast.error('Las dos contraseñas no coinciden');
      return;
    }
    setGuardando(true);
    try {
      const sb = createClient();
      const { error } = await sb.auth.updateUser({ password: nueva });
      if (error) {
        toast.error(`No se pudo guardar: ${error.message}`);
        return;
      }
      toast.success('Contraseña actualizada. Ya podés entrar con la nueva.', { duration: 8000 });
      router.replace('/dashboard');
      router.refresh();
    } finally {
      setGuardando(false);
    }
  }

  if (conSesion === false) {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div>
            <p className="text-sm font-semibold text-amber-900">Este enlace ya no sirve</p>
            <p className="mt-0.5 text-xs leading-relaxed text-amber-800">
              Los enlaces de recuperación duran poco y se usan una sola vez. Pedí uno nuevo, o
              pedile a gerencia que te cambie la contraseña desde Usuarios &amp; Roles.
            </p>
          </div>
        </div>
        <Link
          href="/forgot-password"
          className="flex h-10 w-full items-center justify-center rounded-md bg-happy-500 text-sm font-semibold text-white hover:bg-happy-600"
        >
          Pedir un enlace nuevo
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor="nueva">Contraseña nueva</Label>
        <Input
          id="nueva" type="password" value={nueva}
          onChange={(e) => setNueva(e.target.value)}
          autoComplete="new-password" placeholder={`Mínimo ${MINIMO} caracteres`} className="mt-1"
        />
      </div>
      <div>
        <Label htmlFor="repetir">Repetirla</Label>
        <Input
          id="repetir" type="password" value={repetir}
          onChange={(e) => setRepetir(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !guardando) void guardar(); }}
          autoComplete="new-password" placeholder="Otra vez, para no equivocarse" className="mt-1"
        />
      </div>
      <Button
        variant="premium" className="w-full" onClick={guardar}
        disabled={guardando || conSesion === null || !nueva || !repetir}
      >
        {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
        Guardar contraseña
      </Button>
    </div>
  );
}
