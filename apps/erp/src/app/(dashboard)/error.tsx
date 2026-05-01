'use client';

/**
 * Error boundary del dashboard. Cubre cualquier error no capturado en
 * páginas/server-components hijos. Antes, sin esto, los Suspense quedaban
 * con el skeleton para siempre cuando una query fallaba silenciosamente.
 */
import { useEffect } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@happy/ui/button';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log a la consola del server (Next captura este console.error)
    console.error('[dashboard/error]', error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-red-600">
        <AlertTriangle className="h-7 w-7" />
      </div>
      <h2 className="mt-6 font-display text-2xl font-semibold text-corp-900">
        Algo salió mal en esta pantalla
      </h2>
      <p className="mt-2 max-w-lg text-sm text-slate-600">
        {error.message ||
          'Ocurrió un error al cargar los datos. Esto puede ser un problema temporal de red o un permiso faltante.'}
      </p>
      {error.digest && (
        <p className="mt-1 font-mono text-[10px] text-slate-400">id: {error.digest}</p>
      )}
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Button onClick={() => reset()} variant="premium" className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Reintentar
        </Button>
        <Link href="/">
          <Button variant="outline" className="gap-2">
            <Home className="h-4 w-4" />
            Ir al inicio
          </Button>
        </Link>
      </div>
      <p className="mt-8 max-w-md text-xs text-slate-400">
        Si el error se repite, tomá una captura junto al id de arriba y reportalo. El equipo
        técnico podrá rastrearlo en los logs.
      </p>
    </div>
  );
}
