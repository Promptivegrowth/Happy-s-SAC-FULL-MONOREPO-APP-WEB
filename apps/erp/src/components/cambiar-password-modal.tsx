'use client';

/**
 * Cambiarse la propia contraseña, sin depender de nadie.
 *
 * No existía. Gerencia podía cambiarle la clave a cualquiera desde Usuarios,
 * pero nadie —ni el propio gerente— tenía dónde cambiarse la suya: el único
 * enlace que hablaba del tema era "¿Olvidaste tu contraseña?" en el login, y
 * apuntaba a una página que nunca se construyó. Javier quiso cambiar la
 * contraseña provisional el 19/09/2026 y no encontró por dónde, porque no había
 * por dónde.
 *
 * Importa más de lo que parece: hasta que cada persona pueda tener su propia
 * clave y cambiarla, la tienda entera sigue entrando con la cuenta de gerencia.
 */

import { useState } from 'react';
import { createClient } from '@happy/db/browser';
import { Button } from '@happy/ui/button';
import { Input } from '@happy/ui/input';
import { Label } from '@happy/ui/label';
import { Card } from '@happy/ui/card';
import { X, KeyRound, Loader2, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';

/** Lo mínimo que se le pide a una contraseña nueva. */
const MINIMO = 8;

export function CambiarPasswordModal({ email, onClose }: { email: string; onClose: () => void }) {
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [repetir, setRepetir] = useState('');
  const [verClaves, setVerClaves] = useState(false);
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    if (nueva.length < MINIMO) {
      toast.error(`La contraseña nueva tiene que tener al menos ${MINIMO} caracteres`);
      return;
    }
    if (nueva !== repetir) {
      toast.error('La contraseña nueva y su repetición no coinciden');
      return;
    }
    if (nueva === actual) {
      toast.error('La contraseña nueva tiene que ser distinta de la actual');
      return;
    }

    setGuardando(true);
    try {
      const sb = createClient();

      /*
       * Se pide la contraseña actual y se comprueba de verdad.
       *
       * Supabase deja cambiarla con sólo estar logueado, pero en una tienda la
       * pantalla queda abierta sobre el mostrador: sin este paso, cualquiera
       * que pase le cambia la clave a la caja y deja a todos afuera.
       */
      const { error: errAuth } = await sb.auth.signInWithPassword({ email, password: actual });
      if (errAuth) {
        toast.error('La contraseña actual no es correcta');
        return;
      }

      const { error } = await sb.auth.updateUser({ password: nueva });
      if (error) {
        toast.error(`No se pudo cambiar: ${error.message}`);
        return;
      }

      toast.success(
        'Contraseña cambiada. Las demás sesiones de esta cuenta se cerraron: donde esté abierta '
        + '—la caja de la tienda, otra computadora— hay que volver a entrar con la nueva.',
        { duration: 15000 },
      );
      onClose();
    } catch (e) {
      toast.error((e as Error)?.message ?? 'No se pudo cambiar la contraseña');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-corp-900/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <Card className="w-full max-w-md p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="flex items-start gap-2.5">
            <div className="mt-0.5 rounded-full bg-happy-50 p-2">
              <KeyRound className="h-4 w-4 text-happy-600" />
            </div>
            <div>
              <h2 className="font-display text-lg font-semibold text-corp-900">Cambiar mi contraseña</h2>
              <p className="text-xs text-slate-500">{email}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Cerrar">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <Label htmlFor="actual">Contraseña actual</Label>
            <Input
              id="actual"
              type={verClaves ? 'text' : 'password'}
              value={actual}
              onChange={(e) => setActual(e.target.value)}
              autoComplete="current-password"
              placeholder="La que usás hoy"
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="nueva">Contraseña nueva</Label>
            <Input
              id="nueva"
              type={verClaves ? 'text' : 'password'}
              value={nueva}
              onChange={(e) => setNueva(e.target.value)}
              autoComplete="new-password"
              placeholder={`Mínimo ${MINIMO} caracteres`}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="repetir">Repetir la nueva</Label>
            <Input
              id="repetir"
              type={verClaves ? 'text' : 'password'}
              value={repetir}
              onChange={(e) => setRepetir(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !guardando) void guardar(); }}
              autoComplete="new-password"
              placeholder="Otra vez, para no equivocarse"
              className="mt-1"
            />
          </div>

          <button
            type="button"
            onClick={() => setVerClaves((v) => !v)}
            className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700"
          >
            {verClaves ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {verClaves ? 'Ocultar' : 'Ver lo que escribo'}
          </button>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={guardando}>Cancelar</Button>
          <Button variant="premium" onClick={guardar} disabled={guardando || !actual || !nueva || !repetir}>
            {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            Cambiar contraseña
          </Button>
        </div>

        <p className="mt-3 border-t pt-3 text-[11px] leading-relaxed text-slate-500">
          Al cambiarla se <b>cierran las demás sesiones</b> de esta cuenta: donde esté abierta hay que
          volver a entrar con la nueva. Si no recordás la actual, pedile a gerencia que te la cambie
          desde <b>Usuarios &amp; Roles → Contraseña</b>.
        </p>
      </Card>
    </div>
  );
}
