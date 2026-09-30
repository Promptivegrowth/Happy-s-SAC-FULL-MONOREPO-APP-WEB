'use client';

import { useState, useTransition } from 'react';
import { FileSpreadsheet, FileType2, Loader2 } from 'lucide-react';
import { generarExcelMultiHoja, generarPDFBrandeado } from '@/server/actions/exportar';
import type { ColExport } from '@/server/actions/reportes-helpers';

export type HojaPayload = {
  nombre: string;
  titulo: string;
  subtitulo?: string;
  filtros?: string[];
  cols: ColExport[];
  rows: Record<string, unknown>[];
  totales?: Record<string, number>;
  etiquetaFiltros?: string;
};

function descargar(base64: string, filename: string, mime: string) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/**
 * Excel con tres hojas (Resumen, Por día, Detalle) y PDF con el detalle y el
 * resumen arriba. Los dos con el logo y los colores de la empresa.
 */
export function ExportarComprobantes({ titulo, hojas, detalle }: { titulo: string; hojas: HojaPayload[]; detalle: HojaPayload }) {
  const [pending, start] = useTransition();
  const [cual, setCual] = useState<'xlsx' | 'pdf' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const exportar = (fmt: 'xlsx' | 'pdf') => {
    setError(null); setCual(fmt);
    start(async () => {
      try {
        const r = fmt === 'xlsx' ? await generarExcelMultiHoja({ titulo, hojas }) : await generarPDFBrandeado(detalle);
        descargar(r.base64, r.filename, r.mime);
      } catch (e) {
        setError((e as Error).message ?? 'No se pudo generar el archivo');
      }
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" disabled={pending} onClick={() => exportar('xlsx')}
        className="inline-flex h-9 items-center gap-1.5 rounded-md bg-emerald-600 px-3 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
        {pending && cual === 'xlsx' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5" />} Excel
      </button>
      <button type="button" disabled={pending} onClick={() => exportar('pdf')}
        className="inline-flex h-9 items-center gap-1.5 rounded-md bg-red-600 px-3 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50">
        {pending && cual === 'pdf' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileType2 className="h-3.5 w-3.5" />} PDF
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
