'use client';

import { useState } from 'react';
import { Ruler, X } from 'lucide-react';

/**
 * Botón "¿Cómo medirme?" que abre un modal con la guía visual de medidas
 * corporales (dónde tomar cada medida: hombro, contorno pecho, cintura,
 * entrepierna, largo total, etc.). La imagen es genérica para todos los
 * productos y vive en /public/como-medirme.png.
 *
 * Pedido del cliente (2026-08-13): junto a la tabla de medidas del producto,
 * un botón que muestre esta guía de referencia.
 */
export function ComoMedirme() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-full border border-corp-200 bg-white px-4 py-2 text-sm font-medium text-corp-800 shadow-sm transition hover:border-corp-400 hover:bg-corp-50"
      >
        <Ruler className="h-4 w-4" />
        ¿Cómo medirme?
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-4">
              <h3 className="flex items-center gap-2 font-display text-xl font-semibold text-corp-900">
                <Ruler className="h-5 w-5 text-corp-700" />
                ¿Cómo debo medirme?
              </h3>
              <button
                onClick={() => setOpen(false)}
                className="rounded p-1.5 text-slate-400 hover:bg-slate-100"
                aria-label="Cerrar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/como-medirme.png"
              alt="Guía de cómo tomar tus medidas: hombro, contorno de pecho, contorno de cintura, entrepierna, largo total, largo de falda/pantalón y tobillo."
              className="mx-auto w-full max-w-sm rounded-lg"
            />

            <p className="mt-3 text-center text-[11px] text-slate-500">
              Utiliza una cinta métrica para mejores resultados.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
