'use client';

import { useState } from 'react';
import { Ruler, X } from 'lucide-react';

/**
 * Botón "Tabla de medidas" que despliega un modal con las medidas del
 * producto por talla (largo, ancho, manga, etc.). Los datos vienen de la
 * ficha técnica vigente del producto — se cargan server-side en la página
 * y se pasan como prop.
 *
 * Si no hay medidas cargadas para el producto, el botón no se muestra
 * (evitamos abrir un modal vacío).
 */

export type MedidaFila = {
  descripcion: string;   // "Largo espalda", "Ancho pecho", etc.
  codigo: string | null;
  tolerancia_cm: number | null;
  valoresPorTalla: Record<string, string>;  // { T4: "45", T6: "48", ... }
};

export function TablaMedidas({
  medidas,
  tallas,
}: {
  medidas: MedidaFila[];
  /** Lista ordenada de tallas del producto (para armar las columnas) */
  tallas: string[];
}) {
  const [open, setOpen] = useState(false);

  if (medidas.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-full border border-corp-200 bg-white px-4 py-2 text-sm font-medium text-corp-800 shadow-sm transition hover:border-corp-400 hover:bg-corp-50"
      >
        <Ruler className="h-4 w-4" />
        Tabla de medidas
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-3xl rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h3 className="flex items-center gap-2 font-display text-xl font-semibold text-corp-900">
                  <Ruler className="h-5 w-5 text-corp-700" />
                  Tabla de medidas
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  Medidas aproximadas en centímetros. Puede haber variación de ± 1-2 cm por confección.
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="rounded p-1.5 text-slate-400 hover:bg-slate-100"
                aria-label="Cerrar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-corp-50/60 text-corp-900">
                  <tr>
                    <th className="border-b px-3 py-2 text-left font-semibold">Medida</th>
                    {tallas.map((t) => (
                      <th key={t} className="border-b border-l px-3 py-2 text-center font-semibold">
                        {t.replace('T', '')}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {medidas.map((m, i) => (
                    <tr key={i} className="odd:bg-white even:bg-slate-50/50">
                      <td className="border-b px-3 py-2">
                        <span className="font-medium text-corp-900">{m.descripcion}</span>
                        {m.tolerancia_cm != null && (
                          <span className="ml-1 text-[10px] text-slate-500">
                            (± {m.tolerancia_cm} cm)
                          </span>
                        )}
                      </td>
                      {tallas.map((t) => (
                        <td key={t} className="border-b border-l px-3 py-2 text-center font-mono text-slate-700">
                          {m.valoresPorTalla[t] ?? '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="mt-3 text-[11px] text-slate-500">
              Si tu talla no está en la tabla o tienes dudas, consultanos por WhatsApp — te ayudamos a elegir.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
