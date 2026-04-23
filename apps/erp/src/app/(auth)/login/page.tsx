import { Suspense } from 'react';
import Link from 'next/link';
import { Logo } from '@happy/ui/logo';
import { LoginForm } from './login-form';

export const metadata = { title: 'Iniciar sesión' };

export default function LoginPage() {
  return (
    <div className="rounded-2xl border bg-white p-8 shadow-2xl">
      <div className="mb-6 flex flex-col items-center text-center">
        <Logo height={56} priority />
        <h1 className="mt-4 font-display text-2xl font-semibold text-corp-900">Panel administrativo</h1>
        <p className="mt-1 text-sm text-slate-500">Ingresa con tus credenciales</p>
      </div>
      <Suspense fallback={<div className="h-72 animate-pulse rounded-md bg-slate-100" />}>
        <LoginForm />
      </Suspense>
      <p className="mt-6 text-center text-xs text-slate-500">
        ¿Olvidaste tu contraseña?{' '}
        <Link href="/forgot-password" className="font-medium text-corp-700 hover:underline">
          Recuperar acceso
        </Link>
      </p>
    </div>
  );
}
