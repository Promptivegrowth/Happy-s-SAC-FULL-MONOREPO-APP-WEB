'use client';

import { useState } from 'react';
import { Button } from '@happy/ui/button';
import { Printer, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { generarRecetaPdf, type RecetaPdfData } from './receta-pdf';
import type { EmpresaPDFData } from '@/server/empresa-pdf-helper';
import { formatTallaChip, ordenTalla } from '@happy/lib';

/**
 * Botón para descargar/imprimir la receta (materiales + procesos) en PDF.
 * Incluye un selector de talla: "Todas" o una talla puntual (pedido cliente
 * 2026-08-17: poder descargar la receta de una sola talla, ej. AD).
 */
export function RecetaPdfButton({
  data,
  empresa,
}: {
  data: RecetaPdfData;
  empresa: EmpresaPDFData | null;
}) {
  const [loading, setLoading] = useState(false);
  const [talla, setTalla] = useState('');

  const tallas = Array.from(new Set(data.materiales.map((m) => m.talla)))
    .sort((a, b) => ordenTalla(a) - ordenTalla(b));

  async function imprimir() {
    setLoading(true);
    try {
      await generarRecetaPdf(data, empresa, talla || undefined);
      toast.success(talla ? `PDF de la receta (talla ${formatTallaChip(talla)}) generado` : 'PDF de la receta generado');
    } catch (e) {
      toast.error(`No se pudo generar el PDF: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      <select
        value={talla}
        onChange={(e) => setTalla(e.target.value)}
        disabled={loading}
        title="Talla a incluir en el PDF"
        className="h-9 rounded-md border border-input bg-background px-2 text-sm"
      >
        <option value="">Todas las tallas</option>
        {tallas.map((t) => (
          <option key={t} value={t}>Talla {formatTallaChip(t)}</option>
        ))}
      </select>
      <Button variant="outline" className="gap-1" onClick={imprimir} disabled={loading}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
        Descargar PDF
      </Button>
    </div>
  );
}
