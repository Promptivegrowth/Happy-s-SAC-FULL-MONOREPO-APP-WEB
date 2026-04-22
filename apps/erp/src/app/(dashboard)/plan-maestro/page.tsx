import { PageShell, ComingSoon } from '@/components/page-shell';

export const metadata = { title: 'Plan Maestro' };

export default function Page() {
  return (
    <PageShell title="Plan Maestro Semanal" description="Lista de modelos y cantidades a producir cada semana.">
      <ComingSoon
        title="Plan Maestro de Producción"
        description="El plan maestro semanal define qué modelos cortar y producir en la semana. De ahí se genera la explosión de materiales para crear órdenes de compra automáticas."
        features={[
          'Crear plan semanal con código (PM-2026-S14)',
          'Cargar líneas (producto + talla + cantidad) desde una OC pendiente, una proforma o manual',
          'Ejecutar explosión de materiales: SELECT * FROM explosion_materiales_plan(plan_id)',
          'Generar OCs automáticas a proveedores preferidos por material faltante',
          'Generar OTs y órdenes de corte priorizadas',
          'Ver avance vs. lo planificado en tiempo real',
        ]}
      />
    </PageShell>
  );
}
