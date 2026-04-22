import { PageShell, ComingSoon } from '@/components/page-shell';
export const metadata = { title: 'Control de Calidad' };
export default function Page() {
  return (
    <PageShell title="Control de Calidad" description="Inspección al regreso del taller y al ingreso de PT.">
      <ComingSoon
        title="Inspección y Calidad"
        description="Registro de defectos, clasificación (reproceso/segunda/merma), responsable (operario o taller) y descuento aplicado en el pago."
        features={[
          'Checklist por modelo (configurable)',
          'Defectos catalogados (costura suelta, mancha, medida mal, etc.)',
          'Acciones: reproceso, segunda calidad, merma, devolver al taller',
          'Reportes de tasa de defectos por taller / operario / modelo / período',
          'Descuentos automáticos al pago del taller cuando aplica',
        ]}
      />
    </PageShell>
  );
}
