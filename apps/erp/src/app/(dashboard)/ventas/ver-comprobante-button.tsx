'use client';

import { useState } from 'react';
import { Button } from '@happy/ui/button';
import { Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { firmarUrlComprobante } from '@/server/actions/comprobante-pdf';

/**
 * Abre el PDF del comprobante (guardado en el bucket privado `comprobantes`)
 * generando una URL firmada al momento. Accesible desde cualquier PC.
 */
export function VerComprobanteButton({
  path,
  label = 'Comprobante',
  size = 'sm',
  variant = 'outline',
}: {
  path: string | null | undefined;
  label?: string;
  size?: 'sm' | 'default';
  variant?: 'outline' | 'default' | 'ghost';
}) {
  const [cargando, setCargando] = useState(false);
  if (!path) return <span className="text-xs text-slate-400">—</span>;

  async function abrir() {
    setCargando(true);
    try {
      const r = await firmarUrlComprobante(path as string);
      if (r.ok && r.data?.url) {
        window.open(r.data.url, '_blank', 'noopener,noreferrer');
      } else {
        toast.error(r.error ?? 'No se pudo abrir el comprobante');
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCargando(false);
    }
  }

  return (
    <Button variant={variant} size={size} onClick={abrir} disabled={cargando}>
      {cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      {label}
    </Button>
  );
}
