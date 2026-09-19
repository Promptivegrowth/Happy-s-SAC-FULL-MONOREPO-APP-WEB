'use client';

import { useState } from 'react';
import { createClient } from '@happy/db/browser';
import { Button } from '@happy/ui/button';
import { Input } from '@happy/ui/input';
import { Label } from '@happy/ui/label';
import { Loader2, Mail, CheckCircle2 } from 'lucide-react';

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enviar() {
    setError(null);
    setEnviando(true);
    try {
      const sb = createClient();
      const { error: err } = await sb.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (err) {
        setError(err.message);
        return;
      }
      setEnviado(true);
    } catch (e) {
      setError((e as Error)?.message ?? 'No se pudo enviar el correo');
    } finally {
      setEnviando(false);
    }
  }

  if (enviado) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
        <div className="flex items-start gap-2">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <div>
            <p className="text-sm font-semibold text-emerald-900">Listo, revisá tu correo</p>
            <p className="mt-0.5 text-xs leading-relaxed text-emerald-800">
              Si <b>{email}</b> está registrado, le llega un enlace para poner una contraseña nueva.
              Fijate también en la carpeta de correo no deseado.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor="email">Tu correo</Label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && email && !enviando) void enviar(); }}
          placeholder="usuario@happys.pe"
          autoComplete="email"
          className="mt-1"
        />
      </div>

      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-800">{error}</p>
      )}

      <Button variant="premium" className="w-full" onClick={enviar} disabled={enviando || !email.trim()}>
        {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
        Enviarme el enlace
      </Button>
    </div>
  );
}
