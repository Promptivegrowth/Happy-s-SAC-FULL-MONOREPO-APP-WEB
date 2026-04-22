import { PageShell, ComingSoon } from '@/components/page-shell';
export const metadata = { title: 'Reportes' };
export default function Page() {
  return (
    <PageShell title="Reportes y KPIs" description="Reportes exportables a Excel/PDF y dashboards ejecutivos.">
      <ComingSoon
        title="Reportes Gerenciales"
        description="Vistas precompiladas en SQL (v_kpi_ventas_dia, v_top_productos, v_ots_pendientes, v_cuentas_pagar) listas para graficar con Recharts o exportar."
        features={[
          'Ventas por período / canal / tienda / vendedor',
          'Productos más vendidos por temporada (Halloween, Navidad, FP)',
          'Rentabilidad por modelo (precio venta − costo producción)',
          'Productividad por operario y por taller (minutos producidos)',
          'OTs abiertas, cerradas, atrasadas',
          'Flujo de caja: ingresos POS + Web + B2B vs. egresos compras + servicios',
          'Exportes: Excel, PDF, CSV para el contador',
          'SIRE / PLE para SUNAT (Registro de Ventas y Compras)',
        ]}
      />
    </PageShell>
  );
}
