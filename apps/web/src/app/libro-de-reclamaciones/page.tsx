import { ReclamoForm } from './reclamo-form';

export const metadata = {
  title: 'Libro de Reclamaciones',
  description:
    'Libro de Reclamaciones Virtual conforme al Código de Protección y Defensa del Consumidor (Ley N° 29571).',
};

export const dynamic = 'force-dynamic';

export default function LibroReclamacionesPage() {
  return (
    <div className="container max-w-4xl px-4 py-10">
      <header className="mb-8 rounded-2xl border border-amber-200 bg-amber-50 p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-amber-200 text-amber-900">
            <span className="font-display text-lg font-bold">LR</span>
          </div>
          <div>
            <h1 className="font-display text-2xl font-semibold text-amber-900">
              Libro de Reclamaciones
            </h1>
            <p className="mt-2 text-sm text-amber-900/90">
              Conforme al Código de Protección y Defensa del Consumidor —{' '}
              <strong>Ley N° 29571</strong> y su reglamento (D.S. N° 011-2011-PCM).
              Sus datos personales serán tratados únicamente para gestionar este reclamo, en
              cumplimiento de la Ley N° 29733.
            </p>
          </div>
        </div>
      </header>

      <section className="mb-6 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border bg-white p-4">
          <p className="text-sm font-semibold text-slate-800">Reclamo</p>
          <p className="mt-1 text-xs text-slate-600">
            Disconformidad relacionada con productos o servicios adquiridos. El proveedor debe
            atenderlo en un plazo no mayor a <strong>30 días calendario</strong>.
          </p>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <p className="text-sm font-semibold text-slate-800">Queja</p>
          <p className="mt-1 text-xs text-slate-600">
            Disconformidad no relacionada con productos o servicios (ej. atención al cliente,
            tiempos de espera, trato).
          </p>
        </div>
      </section>

      <ReclamoForm />

      <div className="mt-8 rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
        <p className="font-semibold text-slate-700">Importante</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            La presentación del reclamo no impide al consumidor recurrir a otras vías de solución
            de controversias ni denunciar el caso ante la autoridad competente.
          </li>
          <li>
            El proveedor debe responder en un plazo máximo de <strong>30 días calendario</strong>{' '}
            (Art. 24° de la Ley 29571). Este plazo es improrrogable.
          </li>
          <li>
            Conserve el número de reclamo que se le entregará al finalizar el registro. Le servirá
            para futuros seguimientos y para cualquier trámite ante Indecopi.
          </li>
          <li>
            Para reportar un consumo formal puede acudir al{' '}
            <a
              href="https://www.consumidor.gob.pe"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-amber-700 underline"
            >
              portal del consumidor del Indecopi
            </a>
            .
          </li>
        </ul>
      </div>
    </div>
  );
}
