import { PageShell, ComingSoon } from '@/components/page-shell';
export const metadata = { title: 'Corte' };
export default function Page() {
  return (
    <PageShell title="Órdenes de Corte" description="Consolidación por modelo (todas las tallas en simultáneo).">
      <ComingSoon
        title="Módulo de Corte"
        description="Corte agrupa por modelo todas las tallas que se trabajan en simultáneo. Se registra trazado, tendido, corte y habilitado con tiempos por operación (tickets)."
        features={[
          'Generar orden de corte desde OT — agrupa todas las tallas del modelo',
          'Registro de capas tendidas, metros consumidos, mermas',
          'Tickets de operación por etapa (trazado, tendido, corte, habilitado) con tiempos',
          'Cantidad real cortada vs. teórica + permiso para ajustar (con audit log)',
          'Subdivisión: tallas pares a un taller, impares a otro',
          'Generación automática de Órdenes de Servicio para enviar al taller',
          'Devolución de retazos al almacén de materia prima',
        ]}
      />
    </PageShell>
  );
}
