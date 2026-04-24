'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Input } from '@happy/ui/input';
import { Search, X } from 'lucide-react';

export type AutocompleteItem = {
  id: string;
  label: string;
  sublabel?: string;
  href?: string;
};

export function SearchAutocomplete({
  items,
  placeholder,
  paramName = 'q',
}: {
  items: AutocompleteItem[];
  placeholder?: string;
  paramName?: string;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const initial = sp.get(paramName) ?? '';
  const [text, setText] = useState(initial);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const sugerencias = useMemo(() => {
    const q = text.trim().toLowerCase();
    if (q.length < 1) return [];
    const norm = (s: string) =>
      s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const qn = norm(q);
    return items
      .filter((it) => norm(it.label).includes(qn) || (it.sublabel && norm(it.sublabel).includes(qn)))
      .slice(0, 10);
  }, [items, text]);

  function aplicar(qStr: string) {
    const params = new URLSearchParams(sp.toString());
    if (qStr.trim()) params.set(paramName, qStr.trim());
    else params.delete(paramName);
    router.push(`?${params.toString()}`);
    setOpen(false);
  }

  function elegir(it: AutocompleteItem) {
    if (it.href) {
      router.push(it.href);
      setOpen(false);
      return;
    }
    setText(it.label);
    aplicar(it.label);
  }

  function limpiar() {
    setText('');
    aplicar('');
  }

  return (
    <div ref={wrapRef} className="relative max-w-md flex-1">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <Input
        type="search"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          setHighlight(-1);
        }}
        onFocus={() => text && setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlight((h) => Math.min(h + 1, sugerencias.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlight((h) => Math.max(h - 1, -1));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            if (highlight >= 0 && sugerencias[highlight]) elegir(sugerencias[highlight]);
            else aplicar(text);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
        placeholder={placeholder ?? 'Buscar…'}
        className="h-10 pl-9 pr-9"
      />
      {text && (
        <button
          type="button"
          onClick={limpiar}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          aria-label="Limpiar"
        >
          <X className="h-4 w-4" />
        </button>
      )}

      {open && sugerencias.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-80 overflow-auto rounded-md border bg-white shadow-lg">
          {sugerencias.map((it, i) => (
            <button
              type="button"
              key={it.id}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => elegir(it)}
              className={`flex w-full items-start gap-2 border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-happy-50 ${
                i === highlight ? 'bg-happy-50' : ''
              }`}
            >
              <Search className="mt-0.5 h-3.5 w-3.5 flex-none text-slate-400" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-corp-900">{it.label}</div>
                {it.sublabel && <div className="truncate text-xs text-slate-500">{it.sublabel}</div>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
