import { PageShell, ComingSoon } from '@/components/page-shell';
export const metadata = { title: 'Traslados' };
export default function Page() {
  return (
    <PageShell title="Traslados entre almacenes" description="Movimientos entre Santa Bárbara, Huallaga y La Quinta. Trazables 100%.">
      <ComingSoon
        title="Traslados Multi-Almacén"
        description="Cada traslado tiene origen, destino, despachado por, recibido por, fechas y guía de remisión. El stock cuadra automáticamente."
        features={[
          'Crear traslado con borrador → despachado → recibido',
          'Cada línea identifica producto/talla y cantidad',
          'Cuando se despacha: SALIDA_TRASLADO en origen',
          'Cuando se recibe: ENTRADA_TRASLADO en destino',
          'Generar guía de remisión electrónica desde aquí',
          'Reportes de stock en tránsito por tienda',
        ]}
      />
    </PageShell>
  );
}
