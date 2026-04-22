import Link from 'next/link';
import { LoginForm } from './login-form';

export const metadata = { title: 'Iniciar sesión' };

export default function LoginPage() {
  return (
    <div className="rounded-2xl border bg-white/95 p-8 shadow-xl backdrop-blur">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-happy-500 to-carnival-purple text-white shadow-glow">
          <span className="font-display text-xl font-bold">H</span>
        </div>
        <h1 className="font-display text-2xl font-semibold">HAPPY ERP</h1>
        <p className="mt-1 text-sm text-slate-500">Ingresa a tu panel</p>
      </div>
      <LoginForm />
      <p className="mt-6 text-center text-xs text-slate-500">
        ¿Olvidaste tu contraseña?{' '}
        <Link href="/forgot-password" className="font-medium text-happy-600 hover:underline">
          Recuperar acceso
        </Link>
      </p>
    </div>
  );
}
