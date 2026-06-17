'use client';

/**
 * Botones de exportación cliente — llaman a una server action que devuelve
 * { base64, filename, mime } y disparan el download local sin pasar por
 * Storage (más simple, sin permisos extra). Para reportes muy grandes,
 * convendría firmar URL a Storage; queda como mejora futura.
 */

import { useState, useTransition } from 'react';
import { Download, FileSpreadsheet, FileText, FileType2 } from 'lucide-react';
import { generarExcelBrandeado, generarPDFBrandeado, generarCSV } from '@/server/actions/exportar';
import type { ColExport } from '@/server/actions/reportes-helpers';

type Payload = {
  titulo: string;
  subtitulo?: string;
  filtros?: string[];
  cols: ColExport[];
  rows: Record<string, unknown>[];
  totales?: Record<string, number>;
};

function downloadBase64(base64: string, filename: string, mime: string) {
  const bin = atob(base64);
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function ExportButtons({ payload }: { payload: Payload }) {
  const [isPending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function handle(fmt: 'xlsx' | 'pdf' | 'csv') {
    setErr(null);
    startTransition(async () => {
      try {
        const res =
          fmt === 'xlsx'
            ? await generarExcelBrandeado(payload)
            : fmt === 'pdf'
              ? await generarPDFBrandeado(payload)
              : await generarCSV(payload);
        downloadBase64(res.base64, res.filename, res.mime);
      } catch (e) {
        setErr((e as Error).message ?? 'Error generando archivo');
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={isPending}
        onClick={() => handle('xlsx')}
        className="inline-flex h-9 items-center gap-1.5 rounded-md bg-emerald-600 px-3 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        title="Excel brandeado"
      >
        <FileSpreadsheet className="h-3.5 w-3.5" />
        Excel
      </button>
      <button
        type="button"
        disabled={isPending}
        onClick={() => handle('pdf')}
        className="inline-flex h-9 items-center gap-1.5 rounded-md bg-red-600 px-3 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
        title="PDF brandeado"
      >
        <FileType2 className="h-3.5 w-3.5" />
        PDF
      </button>
      <button
        type="button"
        disabled={isPending}
        onClick={() => handle('csv')}
        className="inline-flex h-9 items-center gap-1.5 rounded-md bg-slate-700 px-3 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        title="CSV (UTF-8 BOM)"
      >
        <FileText className="h-3.5 w-3.5" />
        CSV
      </button>
      {isPending && (
        <span className="inline-flex items-center gap-1 text-xs text-slate-500">
          <Download className="h-3 w-3 animate-pulse" />
          Generando…
        </span>
      )}
      {err && <span className="text-xs text-red-600">{err}</span>}
    </div>
  );
}
