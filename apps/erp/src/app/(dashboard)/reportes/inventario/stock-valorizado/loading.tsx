import { Loader2 } from 'lucide-react';

/** Al hacer clic se ve en el acto que está cargando, y no que no pasó nada. */
export default function Cargando() {
  return (
    <div className="flex items-center justify-center gap-2 py-24 text-sm text-slate-500">
      <Loader2 className="h-5 w-5 animate-spin text-happy-600" /> Calculando el stock valorizado…
    </div>
  );
}
