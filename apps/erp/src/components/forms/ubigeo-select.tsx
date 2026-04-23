'use client';

import { useEffect, useState } from 'react';
import { Input } from '@happy/ui/input';
import { Loader2, MapPin, X } from 'lucide-react';

type UbigeoRow = { codigo: string; ruta: string };
type Dep = { departamento_codigo: string; departamento: string };
type Prov = { provincia_codigo: string; provincia: string };
type Dist = { codigo: string; distrito: string };

type Props = {
  value?: string | null;
  defaultLabel?: string;
  name?: string;
  required?: boolean;
};

export function UbigeoSelect({ value, defaultLabel, name, required }: Props) {
  const [codigo, setCodigo] = useState<string | null>(value ?? null);
  const [label, setLabel] = useState<string>(defaultLabel ?? '');
  const [open, setOpen] = useState(false);
  const [busca, setBusca] = useState('');
  const [resultados, setResultados] = useState<UbigeoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [deps, setDeps] = useState<Dep[]>([]);
  const [provs, setProvs] = useState<Prov[]>([]);
  const [dists, setDists] = useState<Dist[]>([]);
  const [depSel, setDepSel] = useState<string>('');
  const [provSel, setProvSel] = useState<string>('');

  useEffect(() => {
    void cargarDeps();
    // Auto-resolver label si viene codigo sin label
    if (value && !defaultLabel) {
      void fetch(`/api/ubigeo?q=${value}`).then(async (r) => {
        if (r.ok) {
          const list: UbigeoRow[] = await r.json();
          const m = list.find((x) => x.codigo === value);
          if (m) setLabel(m.ruta);
        }
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function cargarDeps() {
    const r = await fetch('/api/ubigeo');
    if (r.ok) setDeps(await r.json());
  }
  async function cargarProvs(dep: string) {
    setDepSel(dep); setProvSel(''); setDists([]);
    const r = await fetch(`/api/ubigeo?dep=${dep}`);
    if (r.ok) setProvs(await r.json());
  }
  async function cargarDists(prov: string) {
    setProvSel(prov);
    const r = await fetch(`/api/ubigeo?prov=${prov}`);
    if (r.ok) setDists(await r.json());
  }

  // Búsqueda libre (debounced)
  useEffect(() => {
    if (busca.length < 3) { setResultados([]); return; }
    const t = setTimeout(async () => {
      setLoading(true);
      const r = await fetch(`/api/ubigeo?q=${encodeURIComponent(busca)}`);
      if (r.ok) setResultados(await r.json());
      setLoading(false);
    }, 250);
    return () => clearTimeout(t);
  }, [busca]);

  function pick(c: string, ruta: string) {
    setCodigo(c); setLabel(ruta); setOpen(false); setBusca('');
  }

  function clear() {
    setCodigo(null); setLabel(''); setOpen(false);
    setDepSel(''); setProvSel(''); setProvs([]); setDists([]);
  }

  return (
    <div className="relative">
      {name && <input type="hidden" name={name} value={codigo ?? ''} required={required} />}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-10 w-full items-center gap-2 rounded-md border border-input bg-background px-3 text-left text-sm hover:bg-accent"
      >
        <MapPin className="h-4 w-4 text-corp-700" />
        <span className={codigo ? 'font-medium' : 'text-muted-foreground'}>
          {label || 'Seleccionar departamento / provincia / distrito'}
        </span>
        {codigo && (
          <span className="ml-auto rounded-full bg-corp-100 px-2 py-0.5 font-mono text-[10px] text-corp-700">{codigo}</span>
        )}
        {codigo && (
          <button type="button" onClick={(e) => { e.stopPropagation(); clear(); }} className="rounded p-1 hover:bg-slate-100">
            <X className="h-3 w-3" />
          </button>
        )}
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border bg-white p-3 shadow-xl">
          {/* Buscador libre */}
          <div className="relative mb-3">
            <Input
              autoFocus
              placeholder="Buscar… (ej. Miraflores)"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
            {loading && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" />}
          </div>

          {busca.length >= 3 ? (
            <div className="max-h-60 overflow-auto rounded border">
              {resultados.length === 0 ? (
                <p className="p-3 text-center text-xs text-slate-400">Sin resultados</p>
              ) : resultados.map((r) => (
                <button
                  key={r.codigo}
                  type="button"
                  onClick={() => pick(r.codigo, r.ruta)}
                  className="block w-full border-b px-3 py-2 text-left text-sm hover:bg-happy-50 last:border-0"
                >
                  <span className="font-mono text-[10px] text-slate-400">{r.codigo}</span>
                  <span className="ml-2">{r.ruta}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-3">
              {/* Departamentos */}
              <div className="max-h-56 overflow-auto rounded border">
                <p className="sticky top-0 bg-corp-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-corp-700">Departamento</p>
                {deps.map((d) => (
                  <button
                    key={d.departamento_codigo}
                    type="button"
                    onClick={() => cargarProvs(d.departamento_codigo)}
                    className={`block w-full border-b px-2 py-1.5 text-left text-xs hover:bg-happy-50 last:border-0 ${depSel === d.departamento_codigo ? 'bg-happy-100 font-medium text-happy-800' : ''}`}
                  >
                    {d.departamento}
                  </button>
                ))}
              </div>
              {/* Provincias */}
              <div className="max-h-56 overflow-auto rounded border">
                <p className="sticky top-0 bg-corp-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-corp-700">Provincia</p>
                {provs.length === 0 ? (
                  <p className="p-2 text-xs text-slate-400">←</p>
                ) : provs.map((p) => (
                  <button
                    key={p.provincia_codigo}
                    type="button"
                    onClick={() => cargarDists(p.provincia_codigo)}
                    className={`block w-full border-b px-2 py-1.5 text-left text-xs hover:bg-happy-50 last:border-0 ${provSel === p.provincia_codigo ? 'bg-happy-100 font-medium text-happy-800' : ''}`}
                  >
                    {p.provincia}
                  </button>
                ))}
              </div>
              {/* Distritos */}
              <div className="max-h-56 overflow-auto rounded border">
                <p className="sticky top-0 bg-corp-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-corp-700">Distrito</p>
                {dists.length === 0 ? (
                  <p className="p-2 text-xs text-slate-400">←</p>
                ) : dists.map((d) => {
                  const dep = deps.find((x) => x.departamento_codigo === depSel)?.departamento ?? '';
                  const prov = provs.find((x) => x.provincia_codigo === provSel)?.provincia ?? '';
                  return (
                    <button
                      key={d.codigo}
                      type="button"
                      onClick={() => pick(d.codigo, `${dep} / ${prov} / ${d.distrito}`)}
                      className="block w-full border-b px-2 py-1.5 text-left text-xs hover:bg-happy-50 last:border-0"
                    >
                      {d.distrito}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
