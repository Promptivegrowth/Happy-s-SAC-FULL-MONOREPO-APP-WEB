import { Loader2 } from 'lucide-react';

/** Mientras se trae el mes: que se vea que está cargando y no que se trabó. */
export default function Cargando() {
  return (
    <div className="flex items-center justify-center gap-2 py-24 text-sm text-slate-500">
      <Loader2 className="h-5 w-5 animate-spin text-happy-600" /> Cargando los comprobantes del mes…
    </div>
  );
}
