import { PageShell, ComingSoon } from '@/components/page-shell';
export const metadata = { title: 'Pedidos B2B' };
export default function Page() {
  return (
    <PageShell title="Pedidos B2B (Mayoristas)" description="Proformas, pedidos y despachos a clientes mayoristas.">
      <ComingSoon
        title="Ventas B2B"
        description="Flujo completo: Proforma → Aprobación → Pedido → Producción (opcional) → Despacho → Factura."
        features={[
          'Listas de precios A / B / C / Industrial automáticamente aplicadas',
          'Descuentos por volumen y por campaña',
          'Despachos parciales con guía de remisión',
          'Facturación electrónica al aprobar',
          'Adelantos registrados y saldo pendiente',
        ]}
      />
    </PageShell>
  );
}
