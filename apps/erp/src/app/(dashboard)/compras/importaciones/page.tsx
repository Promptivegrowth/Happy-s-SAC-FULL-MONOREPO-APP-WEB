import { PageShell, ComingSoon } from '@/components/page-shell';
export const metadata = { title: 'Importaciones' };
export default function Page() {
  return (
    <PageShell title="Importaciones" description="Compras del exterior con flete, aduanas y adelantos.">
      <ComingSoon
        title="Gestión de Importaciones"
        description="Agrupa varias OCs bajo una misma importación. Distribuye costos adicionales (flete, seguro, aduanas) proporcionalmente sobre los materiales."
        features={[
          'Crear importación con pagos adelantados',
          'Estados: PREPARACION → EN_TRANSITO → EN_ADUANAS → LIBERADA → RECIBIDA',
          'Captura de gastos aduaneros, flete, seguro',
          'Distribución automática del costo total adicional sobre los items',
          'Recálculo del costo real del material en destino',
        ]}
      />
    </PageShell>
  );
}
