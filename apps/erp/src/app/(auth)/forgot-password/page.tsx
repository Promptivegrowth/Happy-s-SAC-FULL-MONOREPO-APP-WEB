import Link from 'next/link';
import { Logo } from '@happy/ui/logo';
import { ForgotPasswordForm } from './forgot-password-form';

export const metadata = { title: 'Recuperar acceso' };

/**
 * La página que el login venía prometiendo desde siempre.
 *
 * "¿Olvidaste tu contraseña? Recuperar acceso" enlazaba a /forgot-password, que
 * nunca se construyó: daba 404 en producción. El middleware incluso la tenía
 * declarada como pública, esperándola.
 *
 * Dice las dos salidas, y en ese orden a propósito. El correo depende de que el
 * servicio de envío esté configurado; pedirle a gerencia que la cambie desde
 * Usuarios funciona siempre. Mandar a alguien a esperar un correo que capaz no
 * llega es peor que no ofrecer nada.
 */
export default function ForgotPasswordPage() {
  return (
    <div className="rounded-2xl border bg-white p-8 shadow-2xl">
      <div className="mb-6 flex flex-col items-center text-center">
        <Logo height={56} priority />
        <h1 className="mt-4 font-display text-2xl font-semibold text-corp-900">Recuperar acceso</h1>
        <p className="mt-1 text-sm text-slate-500">Te mandamos un enlace para poner una contraseña nueva</p>
      </div>

      <ForgotPasswordForm />

      <div className="mt-6 space-y-3 border-t pt-4">
        <p className="text-xs leading-relaxed text-slate-600">
          <b className="text-corp-900">¿No te llega el correo?</b> Pedile a gerencia que te la cambie
          desde <b>Usuarios &amp; Roles → Contraseña</b>. Es inmediato y no depende del correo.
        </p>
        <p className="text-xs leading-relaxed text-slate-600">
          <b className="text-corp-900">¿Ya estás adentro y sólo querés cambiarla?</b> No hace falta pasar
          por acá: arriba a la derecha, en <b>Contraseña</b>.
        </p>
        <p className="text-center text-xs text-slate-500">
          <Link href="/login" className="font-medium text-corp-700 hover:underline">Volver al inicio de sesión</Link>
        </p>
      </div>
    </div>
  );
}
