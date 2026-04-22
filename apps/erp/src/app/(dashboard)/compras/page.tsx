import { PageShell, ComingSoon } from '@/components/page-shell';
export const metadata = { title: 'Recepciones de compras' };
export default function Page() {
  return (
    <PageShell title="Recepciones de Mercadería" description="Ingreso físico de compras con lote y fecha de vencimiento.">
      <ComingSoon
        title="Recepción de Mercadería"
        description="Registra lo que llega contra una OC. Permite recepciones parciales y captura de factura del proveedor."
        features={[
          'Recibir total o parcial de una OC',
          'Capturar número de lote y fecha de vencimiento para insumos',
          'Generar ENTRADA_COMPRA en kardex',
          'Actualizar precio promedio ponderado del material',
          'Adjuntar PDF de la factura del proveedor',
        ]}
      />
    </PageShell>
  );
}
