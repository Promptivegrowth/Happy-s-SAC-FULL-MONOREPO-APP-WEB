'use client';

import { useState } from 'react';
import { Button } from '@happy/ui/button';
import { Printer, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { generarRecetaPdf, type RecetaPdfData } from './receta-pdf';
import type { EmpresaPDFData } from '@/server/empresa-pdf-helper';
import { formatTallaChip } from '@happy/lib';

/**
 * Botón para descargar/imprimir la receta (materiales + procesos) en PDF.
 * Respeta el filtro de talla del editor: si `tallaFiltro` tiene valor, el PDF
 * incluye solo esa talla (materiales de esa talla + procesos de esa talla y los
 * que aplican a todas). Pedido cliente 2026-08-23.
 */
export function RecetaPdfButton({
  data,
  empresa,
  tallaFiltro = '',
}: {
  data: RecetaPdfData;
  empresa: EmpresaPDFData | null;
  tallaFiltro?: string;
}) {
  const [loading, setLoading] = useState(false);

  async function imprimir() {
    setLoading(true);
    try {
      await generarRecetaPdf(data, empresa, tallaFiltro || undefined);
      toast.success(tallaFiltro ? `PDF de la receta (talla ${formatTallaChip(tallaFiltro)}) generado` : 'PDF de la receta generado');
    } catch (e) {
      toast.error(`No se pudo generar el PDF: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      variant="outline"
      className="gap-1"
      onClick={imprimir}
      disabled={loading}
      title={tallaFiltro ? `Descargar PDF solo de la talla ${formatTallaChip(tallaFiltro)} (según el filtro)` : 'Descargar PDF de todas las tallas'}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
      {tallaFiltro ? `PDF talla ${formatTallaChip(tallaFiltro)}` : 'Descargar PDF'}
    </Button>
  );
}
