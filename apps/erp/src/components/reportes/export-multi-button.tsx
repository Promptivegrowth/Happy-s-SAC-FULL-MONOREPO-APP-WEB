'use client';

/**
 * Botón de descarga de un Excel de VARIAS hojas (un solo archivo). Mismo
 * mecanismo que ExportButtons: la server action devuelve base64 y acá se
 * arma el blob para disparar la descarga local.
 */

import { useState, useTransition } from 'react';
import { FileSpreadsheet } from 'lucide-react';
import { generarExcelMultiHoja } from '@/server/actions/exportar';
import type { ColExport } from '@/server/actions/reportes-helpers';

type Hoja = {
  nombre: string;
  titulo: string;
  subtitulo?: string;
  filtros?: string[];
  cols: ColExport[];
  rows: Record<string, unknown>[];
  totales?: Record<string, number>;
};

function downloadBase64(base64: string, filename: string, mime: string) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
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

export function ExportMultiButton({
  titulo,
  hojas,
  label = 'Descargar Excel',
}: {
  titulo: string;
  hojas: Hoja[];
  label?: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function handle() {
    setErr(null);
    startTransition(async () => {
      try {
        const res = await generarExcelMultiHoja({ titulo, hojas });
        downloadBase64(res.base64, res.filename, res.mime);
      } catch (e) {
        setErr((e as Error).message ?? 'Error generando el Excel');
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handle}
        disabled={isPending}
        className="inline-flex h-9 items-center gap-2 rounded-md bg-emerald-600 px-3 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
      >
        <FileSpreadsheet className="h-4 w-4" />
        {isPending ? 'Generando…' : label}
      </button>
      {err && <span className="text-[11px] text-red-600">{err}</span>}
    </div>
  );
}
