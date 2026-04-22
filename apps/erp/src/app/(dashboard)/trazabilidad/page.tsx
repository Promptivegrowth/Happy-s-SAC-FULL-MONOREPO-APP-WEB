import { PageShell, ComingSoon } from '@/components/page-shell';
export const metadata = { title: 'Trazabilidad' };
export default function Page() {
  return (
    <PageShell title="Trazabilidad de Disfraces" description="De fábrica a venta: timeline completo de cada lote.">
      <ComingSoon
        title="Trazabilidad End-to-End"
        description="Cada disfraz terminado pertenece a un lote PT con código de seguimiento. El timeline muestra producción, traslados, ventas y devoluciones."
        features={[
          'Buscar lote por código QR / SKU / OT',
          'Timeline visual: PRODUCCION → INGRESO PT → TRASLADO TIENDA → VENTA',
          'Quién vendió, a qué cliente, en qué fecha, con qué descuento',
          'Devoluciones y mermas registradas en la línea de tiempo',
          'Función SQL: SELECT * FROM timeline_lote(lote_id) — ya disponible',
        ]}
      />
    </PageShell>
  );
}
