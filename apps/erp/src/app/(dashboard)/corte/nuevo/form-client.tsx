'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X, Check } from 'lucide-react';

type Option = { id: string; label: string; sublabel?: string };

/**
 * Combobox con búsqueda. Dos modos de uso:
 *  - Uncontrolled (form action): pasar `name` y opcional `defaultId`.
 *    Escribe el id seleccionado en un input hidden con ese `name`.
 *  - Controlled (cliente): pasar `value` + `onChange`. El input hidden no
 *    se renderiza (o se renderiza solo si también se pasa `name`).
 */
export function ComboboxBusqueda({
  name,
  options,
  defaultId = '',
  placeholder = 'Escribí para buscar…',
  required = false,
  value,
  onChange,
}: {
  name?: string;
  options: Option[];
  defaultId?: string;
  placeholder?: string;
  required?: boolean;
  value?: string;
  onChange?: (id: string) => void;
}) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const isControlled = value !== undefined && onChange !== undefined;
  const [internalSel, setInternalSel] = useState<Option | null>(
    () => options.find((o) => o.id === defaultId) ?? null,
  );
  const seleccionado = isControlled
    ? options.find((o) => o.id === value) ?? null
    : internalSel;
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const filtrados = useMemo(() => {
    const q = text.trim().toLowerCase();
    if (!q && seleccionado) return [];
    if (!q) return options.slice(0, 50);
    const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const qn = norm(q);
    return options
      .filter((o) => norm(o.label).includes(qn) || (o.sublabel && norm(o.sublabel).includes(qn)))
      .slice(0, 50);
  }, [options, text, seleccionado]);

  function elegir(o: Option) {
    if (isControlled) onChange!(o.id);
    else setInternalSel(o);
    setText('');
    setOpen(false);
    setHighlight(0);
  }

  function limpiar() {
    if (isControlled) onChange!('');
    else setInternalSel(null);
    setText('');
    setOpen(true);
  }

  return (
    <div ref={wrapRef} className="relative">
      {name && (
        <input type="hidden" name={name} value={seleccionado?.id ?? ''} required={required} />
      )}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={seleccionado ? seleccionado.label : text}
          onChange={(e) => {
            setText(e.target.value);
            if (isControlled) onChange!('');
            else setInternalSel(null);
            setOpen(true);
            setHighlight(0);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setHighlight((h) => Math.min(h + 1, filtrados.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setHighlight((h) => Math.max(h - 1, 0));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              if (filtrados[highlight]) elegir(filtrados[highlight]);
            } else if (e.key === 'Escape') {
              setOpen(false);
            }
          }}
          placeholder={placeholder}
          className={`h-10 w-full rounded-md border border-input bg-background pl-9 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-happy-200 ${
            seleccionado ? 'border-happy-400 bg-happy-50/40 font-medium' : ''
          }`}
        />
        {seleccionado && (
          <button
            type="button"
            onClick={limpiar}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            tabIndex={-1}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {open && filtrados.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-auto rounded-md border bg-white shadow-lg">
          {filtrados.map((o, i) => (
            <button
              type="button"
              key={o.id}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => elegir(o)}
              className={`flex w-full items-start gap-2 border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-happy-50 ${
                i === highlight ? 'bg-happy-50' : ''
              }`}
            >
              <span className="flex-1">
                <span className="font-medium text-corp-900">{o.label}</span>
                {o.sublabel && (
                  <span className="ml-2 font-mono text-[10px] text-slate-500">{o.sublabel}</span>
                )}
              </span>
              {seleccionado?.id === o.id && <Check className="h-4 w-4 text-happy-500" />}
            </button>
          ))}
        </div>
      )}
      {open && filtrados.length === 0 && text.trim() && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 rounded-md border bg-white p-3 text-center text-xs text-slate-500 shadow-lg">
          Sin coincidencias para &quot;{text}&quot;
        </div>
      )}
    </div>
  );
}
