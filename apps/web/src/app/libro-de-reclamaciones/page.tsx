import { ReclamoForm } from './reclamo-form';

export const metadata = {
  title: 'Libro de Reclamaciones',
  description: 'Libro de Reclamaciones Virtual conforme al Código de Protección y Defensa del Consumidor (Ley N° 29571).',
};

export default function LibroReclamacionesPage() {
  return (
    <div className="container max-w-4xl px-4 py-10">
      <header className="mb-8 rounded-2xl border bg-amber-50 p-6">
        <div className="flex items-center gap-3">
          <span className="text-3xl">📕</span>
          <div>
            <h1 className="font-display text-2xl font-semibold text-amber-900">Libro de Reclamaciones</h1>
            <p className="mt-1 text-sm text-amber-800">
              Conforme al Código de Protección y Defensa del Consumidor (Ley N° 29571).
              Gracias por ayudarnos a mejorar.
            </p>
          </div>
        </div>
      </header>

      <ReclamoForm />

      <div className="mt-8 rounded-lg border bg-slate-50 p-4 text-xs text-slate-600">
        <p><strong>Importante:</strong></p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Reclamo: disconformidad con productos / servicios</li>
          <li>Queja: disconformidad no relacionada con productos (ej: atención)</li>
          <li>El proveedor debe responder en un plazo máximo de 30 días calendario</li>
          <li>Conserve el número de reclamo para futuros seguimientos</li>
        </ul>
      </div>
    </div>
  );
}
