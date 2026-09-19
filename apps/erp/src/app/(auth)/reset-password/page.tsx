import { Logo } from '@happy/ui/logo';
import { ResetPasswordForm } from './reset-password-form';

export const metadata = { title: 'Nueva contraseña' };

/**
 * Donde aterriza el enlace del correo de recuperación.
 *
 * Supabase deja la sesión abierta al abrir ese enlace, así que acá sólo hay que
 * pedir la contraseña nueva. Si alguien entra de frente, sin venir del correo,
 * el formulario se lo dice en lugar de fallar al guardar.
 */
export default function ResetPasswordPage() {
  return (
    <div className="rounded-2xl border bg-white p-8 shadow-2xl">
      <div className="mb-6 flex flex-col items-center text-center">
        <Logo height={56} priority />
        <h1 className="mt-4 font-display text-2xl font-semibold text-corp-900">Nueva contraseña</h1>
        <p className="mt-1 text-sm text-slate-500">Elegí la que vas a usar de ahora en adelante</p>
      </div>
      <ResetPasswordForm />
    </div>
  );
}
